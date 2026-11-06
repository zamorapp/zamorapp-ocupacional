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
-- Exige: citas del portal, aún «solicitada», pedidas por el mismo usuario, visibles para él y sin orden previa.
create or replace function public.crear_orden_evaluacion(p_citas uuid[])
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
      from public.citas c where c.id = any (v_ids) group by c.org_id, c.empresa_id order by c.org_id, c.empresa_id
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
revoke execute on function public.crear_orden_evaluacion(uuid[]) from public, anon;
grant execute on function public.crear_orden_evaluacion(uuid[]) to authenticated;

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
   order by c.fecha, 3
$$;
revoke execute on function public.relacion_mensual(uuid, date, date) from public, anon;
grant execute on function public.relacion_mensual(uuid, date, date) to authenticated;
