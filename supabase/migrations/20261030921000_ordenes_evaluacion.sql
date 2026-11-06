-- zamorApp Ocupacional · Orden de evaluación de RR. HH. y relación mensual (pedido de Cesar, 06-nov-2026)
-- 1) Cada «Solicitar cita» del portal deja una orden numerada (Nº por servicio) con sus trabajadores: RR. HH. la ve,
--    la imprime y el servicio la recibe. Solo se crea por crear_orden_evaluacion(): nadie la escribe a mano.
-- 2) relacion_mensual(): lo realizado en un período para una empresa, con su Nº de orden y su nota de cobro/factura,
--    para cotejar con la facturación. Sin datos clínicos: ni diagnósticos, ni aptitud, ni grupo sanguíneo.

create table if not exists public.ordenes_evaluacion (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  numero integer not null,
  citas uuid[] not null check (cardinality(citas) between 1 and 200),
  solicitada_por uuid references auth.users (id) on delete set null,
  solicitante text not null,                   -- nombre de quien la pidió, tal como salió impresa
  creado_en timestamptz not null default public.ahora(),
  unique (org_id, numero)
);
create index if not exists ordenes_evaluacion_empresa on public.ordenes_evaluacion (org_id, empresa_id, creado_en desc);
create index if not exists ordenes_evaluacion_citas on public.ordenes_evaluacion using gin (citas);

alter table public.ordenes_evaluacion enable row level security;
drop policy if exists ordenes_evaluacion_leer on public.ordenes_evaluacion;
-- = puede_ver_empresa(org_id, empresa_id) sin el trabajador, en la forma rápida (una sola llamada por consulta, C14)
create policy ordenes_evaluacion_leer on public.ordenes_evaluacion for select using (
  (org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[])
   or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{gerente_empresa,supervisor,delegado_prevencion,auditor,administrador,gerente_medico,medico,enfermeria,recepcion,coordinador_sst}'))::text[])));
-- Solo lectura para todos: se crea por la función y nunca se edita (el número es el respaldo de lo pedido)
revoke all on public.ordenes_evaluacion from anon, authenticated;
grant select on public.ordenes_evaluacion to authenticated;

drop trigger if exists bit_ordenes_evaluacion on public.ordenes_evaluacion;
create trigger bit_ordenes_evaluacion after insert or update or delete on public.ordenes_evaluacion
  for each row execute function public.registrar_bitacora();

-- Escritorio: baja a la copia de la PC (solo bajada: se crea en la nube desde el portal)
insert into sync.tablas (nombre, clinica, subible) values ('public.ordenes_evaluacion', false, false)
  on conflict (nombre) do update set subible = false;
alter table public.ordenes_evaluacion add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.ordenes_evaluacion;
create trigger sync_version before insert or update on public.ordenes_evaluacion for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.ordenes_evaluacion;
create trigger sync_anotar after insert or update or delete on public.ordenes_evaluacion for each row execute function sync.anotar();

-- Crea la orden de las citas recién pedidas por quien llama (una por empresa si el lote mezcla empresas).
-- p_por_trabajador: una orden por cada trabajador (pedido de Cesar, 06-nov) en vez de una para todo el lote.
-- Exige: citas del portal, aún «solicitada», pedidas por el mismo usuario, visibles para él y sin orden previa.
-- Sin la firma vieja de una sola entrada (si alguna vez se aplicó, quedaría abierta y la llamada sería ambigua)
drop function if exists public.crear_orden_evaluacion(uuid[]);
create or replace function public.crear_orden_evaluacion(p_citas uuid[], p_por_trabajador boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_citas, '{}'::uuid[])) x where x is not null);
  v_validas int;
  v_nombre text;
  v_grupo record;
  v_numero int;
  v_id uuid;
  v_salida jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para pedir la orden' using errcode = '42501'; end if;
  if cardinality(v_ids) = 0 then raise exception 'La orden no tiene citas' using errcode = '22023'; end if;
  if cardinality(v_ids) > 200 then raise exception 'Máximo 200 trabajadores por orden' using errcode = '22023'; end if;

  select count(*) into v_validas
    from public.citas c
   where c.id = any (v_ids) and c.origen = 'portal' and c.estado = 'solicitada'
     and c.solicitada_por = auth.uid() and public.puede_ver_empresa(c.org_id, c.empresa_id)
     and not exists (select 1 from public.ordenes_evaluacion o where o.citas @> array[c.id]);
  if v_validas <> cardinality(v_ids) then
    raise exception 'Esas citas no son tuyas, ya no están pendientes o ya tienen orden' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(p.nombre_completo), ''), u.email, 'RR. HH.') into v_nombre
    from auth.users u left join public.perfiles p on p.id = u.id where u.id = auth.uid();

  for v_grupo in
    select c.org_id, c.empresa_id, array_agg(c.id order by c.hora nulls last, c.id) as ids
      from public.citas c where c.id = any (v_ids)
     group by c.org_id, c.empresa_id, case when coalesce(p_por_trabajador, false) then c.id end
     order by c.org_id, c.empresa_id, min(c.hora) nulls last, min(c.id::text)
  loop
    -- Número correlativo por servicio, sin huecos por carreras entre dos RR. HH. a la vez
    perform pg_advisory_xact_lock(hashtextextended('ordenes_evaluacion:' || v_grupo.org_id::text, 0));
    select coalesce(max(numero), 0) + 1 into v_numero from public.ordenes_evaluacion where org_id = v_grupo.org_id;
    insert into public.ordenes_evaluacion (org_id, empresa_id, numero, citas, solicitada_por, solicitante)
    values (v_grupo.org_id, v_grupo.empresa_id, v_numero, v_grupo.ids, auth.uid(), coalesce(v_nombre, 'RR. HH.'))
    returning id into v_id;
    v_salida := v_salida || jsonb_build_object('id', v_id, 'numero', v_numero, 'empresa_id', v_grupo.empresa_id);
  end loop;
  return v_salida;
end $$;
revoke execute on function public.crear_orden_evaluacion(uuid[], boolean) from public, anon;
grant execute on function public.crear_orden_evaluacion(uuid[], boolean) to authenticated;

-- ─── Permisos por persona de RR. HH. (pedido de Cesar, 06-nov-2026) ─────────────────────────────────────────────
-- El administrador elige qué puede hacer cada persona del portal: «citas» (solicitar consultas, y con ellas las
-- órdenes), «relacion» (ver los atendidos del mes) y «descargas» (bajar documentos). Las solicitudes de informes o
-- copias siempre quedan. null = todo (así siguen quienes ya están y todo el personal del servicio).
alter table public.miembros add column if not exists permisos_portal text[];
alter table public.miembros drop constraint if exists miembros_permisos_portal_validos;
alter table public.miembros add constraint miembros_permisos_portal_validos
  check (permisos_portal is null or permisos_portal <@ array['citas', 'relacion', 'descargas']::text[]);
alter table public.invitaciones add column if not exists permisos_portal text[];
alter table public.invitaciones drop constraint if exists invitaciones_permisos_portal_validos;
alter table public.invitaciones add constraint invitaciones_permisos_portal_validos
  check (permisos_portal is null or permisos_portal <@ array['citas', 'relacion', 'descargas']::text[]);

create or replace function public.permiso_portal(p_org uuid, p_permiso text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select m.permisos_portal is null or p_permiso = any (m.permisos_portal)
                     from public.miembros m where m.usuario_id = auth.uid() and m.org_id = p_org and m.activo), false)
$$;
revoke execute on function public.permiso_portal(uuid, text) from public, anon;
grant execute on function public.permiso_portal(uuid, text) to authenticated;

-- Relación de lo realizado en un período (máx. 92 días) para una empresa: RR. HH. y auditor de esa empresa, y el
-- servicio. Solo datos administrativos: fecha, trabajador, cargo, tipo de evaluación, orden, nota de cobro y factura.
create or replace function public.relacion_mensual(p_empresa uuid, p_desde date, p_hasta date)
returns table (
  consulta_id uuid, fecha date, trabajador text, cedula text, cargo text, evaluacion text,
  orden_id uuid, orden integer, nota_cobro integer, estado_cobro text, factura text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.fecha, t.nombres || ' ' || t.apellidos, t.cedula, p.nombre, m.nombre,
         o.id, o.numero, cb.numero, cb.estado, cb.numero_factura_fiscal
    from clinico.consultas c
    join public.trabajadores t on t.id = c.trabajador_id
    left join public.lista_items m on m.id = c.motivo_id
    left join public.puestos p on p.id = c.puesto_id
    left join lateral (
      select o.id, o.numero from public.citas ct join public.ordenes_evaluacion o on o.citas @> array[ct.id]
       where ct.consulta_id = c.id order by o.numero limit 1
    ) o on true
    -- Solo notas ya entregadas a la empresa (emitida o pagada): un borrador o una anulada no cuentan
    left join lateral (
      select cb.numero, cb.estado, cb.numero_factura_fiscal from public.cobro_items ci join public.cobros cb on cb.id = ci.cobro_id
       where ci.consulta_id = c.id and cb.estado in ('emitida', 'pagada') order by cb.numero limit 1
    ) cb on true
   where c.empresa_id = p_empresa
     and c.estado <> 'borrador'
     and c.fecha between p_desde and p_hasta
     and p_hasta - p_desde between 0 and 92
     and public.puede_ver_empresa(c.org_id, c.empresa_id)
     and coalesce(public.mi_rol(c.org_id) in ('gerente_empresa', 'auditor', 'administrador', 'gerente_medico', 'medico',
                                              'enfermeria', 'recepcion', 'coordinador_sst'), false)
     -- RR. HH. sin el permiso «relacion» no ve los atendidos del mes (permiso_portal, arriba)
     and public.permiso_portal(c.org_id, 'relacion')
   order by c.fecha, 3
$$;
revoke execute on function public.relacion_mensual(uuid, date, date) from public, anon;
grant execute on function public.relacion_mensual(uuid, date, date) to authenticated;



-- Solicitar consultas
drop policy if exists citas_empresa_solicitar on public.citas;
create policy citas_empresa_solicitar on public.citas for insert
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id) and estado = 'solicitada' and origen = 'portal'
              and public.permiso_portal(org_id, 'citas'));

-- Descargar documentos de las solicitudes (archivo subido o constancia lista)
create or replace function public.ruta_solicitud_visible(p_ruta text, p_servicio boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_partes text[] := string_to_array(p_ruta, '/'); v_org uuid; v_emp uuid; v_sol uuid;
begin
  if cardinality(v_partes) <> 4 then return false; end if;
  begin
    v_org := v_partes[1]::uuid; v_emp := v_partes[2]::uuid; v_sol := v_partes[3]::uuid;
  exception when others then return false;
  end;
  if not exists (select 1 from public.solicitudes where id = v_sol and org_id = v_org and empresa_id = v_emp) then return false; end if;
  if not public.puede_ver_empresa(v_org, v_emp) then return false; end if;
  -- Documento solo_salud: solo clínico o administrador (ni recepción ni RR. HH.)
  if exists (select 1 from public.solicitudes where id = v_sol and solo_salud) then
    return public.es_clinico(v_org) or public.mi_rol(v_org) = 'administrador';
  end if;
  if public.es_servicio(v_org) then return true; end if;
  return not p_servicio and public.es_empresa(v_org) and public.permiso_portal(v_org, 'descargas')
     and exists (select 1 from public.solicitudes where id = v_sol and documento_ruta = p_ruta);
end $$;

create or replace function public.constancia_de_solicitud(p_solicitud uuid)
returns table (nombre text, contenido_base64 text)
language plpgsql stable security definer set search_path = public as $$
declare v_s record;
begin
  select s.org_id, s.empresa_id, s.constancia_consulta_id, s.solo_salud into v_s from public.solicitudes s where s.id = p_solicitud;
  if v_s.constancia_consulta_id is null or v_s.solo_salud then return; end if;
  if not ((public.es_servicio(v_s.org_id) or (public.es_empresa(v_s.org_id) and public.permiso_portal(v_s.org_id, 'descargas')))
          and public.puede_ver_empresa(v_s.org_id, v_s.empresa_id)) then
    return;
  end if;
  return query select l.nombre, encode(l.contenido, 'base64') from public.constancias_listas l
                where l.consulta_id = v_s.constancia_consulta_id and l.empresa_id = v_s.empresa_id;
end $$;
revoke execute on function public.constancia_de_solicitud(uuid) from public, anon;
grant execute on function public.constancia_de_solicitud(uuid) to authenticated;

-- La invitación lleva los permisos que eligió el administrador; quien ya era RR. HH. conserva los suyos
create or replace function public.aceptar_invitacion(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.invitaciones; m public.miembros;
begin
  if auth.uid() is null then raise exception 'Ingresa con tu cuenta para aceptar la invitación'; end if;
  select * into i from public.invitaciones
  where token_hash = sha256(convert_to(p_token, 'UTF8')) for update;
  if i.id is null then raise exception 'El enlace no es válido'; end if;
  if i.revocada_en is not null then raise exception 'Esta invitación fue anulada. Pide un enlace nuevo.'; end if;
  if i.usada_en is not null then
    if i.usada_por = auth.uid() then return i.empresa_id; end if;
    raise exception 'Esta invitación ya se usó. Pide un enlace nuevo.';
  end if;
  if i.vence < now() then raise exception 'Esta invitación venció. Pide un enlace nuevo.'; end if;

  select * into m from public.miembros where org_id = i.org_id and usuario_id = auth.uid();
  if m.id is null then
    insert into public.miembros (org_id, usuario_id, rol, empresas_permitidas, permisos_portal)
    values (i.org_id, auth.uid(), 'gerente_empresa', array[i.empresa_id], i.permisos_portal);
  elsif m.rol = 'gerente_empresa' then
    -- Un RR. HH. desactivado por el administrador no se reactiva con un enlace
    if not m.activo then raise exception 'Tu cuenta está desactivada. Pide al administrador que la reactive.'; end if;
    update public.miembros
    set empresas_permitidas = (select array_agg(distinct x) from unnest(coalesce(m.empresas_permitidas, '{}') || i.empresa_id) x)
    where id = m.id;
  else
    -- Nunca cambia el rol de alguien del servicio médico ni de otro rol de empresa
    raise exception 'Tu cuenta ya tiene otro rol en este servicio médico. Pide al administrador que te agregue la empresa.';
  end if;

  perform set_config('zamorapp.aceptando_invitacion', i.id::text, true);
  update public.invitaciones set usada_por = auth.uid(), usada_en = now() where id = i.id;
  perform set_config('zamorapp.aceptando_invitacion', '', true);
  perform public.notificar(i.org_id, i.empresa_id, 'servicio', 'RR. HH. aceptó la invitación',
    coalesce(i.nombre, 'Una persona') || ' ya entra al portal de la empresa.', '/configuracion/usuarios');
  return i.empresa_id;
end $$;
revoke execute on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;

select public.vistas_al_dia();
