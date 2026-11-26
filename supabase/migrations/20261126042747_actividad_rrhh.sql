-- Historial mínimo por empresa. La campana existente distribuye los avisos a web, móvil y Escritorio.
create schema if not exists actividad_privada;
revoke all on schema actividad_privada from public, anon, authenticated;
grant usage on schema actividad_privada to authenticated;

create table public.actividad_rrhh (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  actor_id uuid,
  actor_nombre text,
  tipo text not null check (tipo in ('ingreso', 'solicitud', 'cita', 'estudio', 'altas', 'nomina_abierta',
    'nomina_enviada', 'documento_entregado', 'relacion_entregada', 'evaluacion_firmada', 'constancia_lista',
    'constancia_entregada')),
  clave text not null,
  cantidad integer not null default 1 check (cantidad > 0),
  fecha timestamptz not null default public.ahora(),
  unique (org_id, empresa_id, tipo, clave)
);
create index actividad_rrhh_empresa_fecha on public.actividad_rrhh (empresa_id, fecha desc);
create index actividad_rrhh_org_fecha on public.actividad_rrhh (org_id, fecha desc);
alter table public.actividad_rrhh enable row level security;
revoke all on public.actividad_rrhh from public, anon, authenticated;
grant select (id, org_id, empresa_id, actor_nombre, tipo, cantidad, fecha) on public.actividad_rrhh to authenticated;
create policy actividad_rrhh_leer on public.actividad_rrhh for select to authenticated
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any (
           (select public.pares_limitados('{administrador,gerente_medico}'))::text[]
         ));

create function actividad_privada.rrhh_empresa(p_org uuid, p_empresa uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.miembros m where m.usuario_id = auth.uid()
    and m.org_id = p_org and m.activo and m.rol = 'gerente_empresa' and p_empresa = any(m.empresas_permitidas))
$$;
revoke all on function actividad_privada.rrhh_empresa(uuid, uuid) from public, anon, authenticated;

create function actividad_privada.anotar(p_org uuid, p_empresa uuid, p_actor uuid, p_tipo text, p_clave text, p_cantidad int default 1)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if public.es_base_local() or p_empresa is null then return false; end if;
  insert into public.actividad_rrhh (org_id, empresa_id, actor_id, actor_nombre, tipo, clave, cantidad)
  select e.org_id, e.id, p_actor,
         (select left(p.nombre_completo, 120) from public.perfiles p where p.id = p_actor),
         p_tipo, p_clave, p_cantidad
    from public.empresas e where e.id = p_empresa and e.org_id = p_org
  on conflict (org_id, empresa_id, tipo, clave) do nothing;
  return found;
end $$;
revoke all on function actividad_privada.anotar(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;

create function actividad_privada.aviso_servicio(p_org uuid, p_empresa uuid, p_titulo text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
  select e.org_id, m.usuario_id, e.id, p_titulo, e.razon_social, '/actividad-rrhh'
    from public.empresas e join public.miembros m on m.org_id = e.org_id
   where e.id = p_empresa and e.org_id = p_org and m.activo
     and m.rol in ('administrador', 'gerente_medico')
     and (m.empresas_permitidas is null or e.id = any(m.empresas_permitidas))
$$;
revoke all on function actividad_privada.aviso_servicio(uuid, uuid, text) from public, anon, authenticated;

-- Las solicitudes, citas, estudios y enlaces ya tienen avisos. Sus transacciones añaden solo el historial.
create function actividad_privada.anotar_operacion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_empresa uuid; v_actor uuid := auth.uid();
begin
  if v_actor is null or public.es_base_local() or public.mi_rol(new.org_id) is distinct from 'gerente_empresa' then
    return null;
  end if;
  if tg_argv[0] = 'cita' then
    if new.estado is distinct from 'solicitada' or new.origen is distinct from 'portal' then return null; end if;
  end if;
  if tg_argv[0] = 'estudio' then
    if new.subido_por is distinct from v_actor then return null; end if;
    select t.empresa_id into v_empresa from public.trabajadores t where t.id = new.trabajador_id and t.org_id = new.org_id;
  else
    v_empresa := new.empresa_id;
  end if;
  if actividad_privada.rrhh_empresa(new.org_id, v_empresa) then
    perform actividad_privada.anotar(new.org_id, v_empresa, v_actor, tg_argv[0], new.id::text);
  end if;
  return null;
end $$;
revoke all on function actividad_privada.anotar_operacion() from public, anon, authenticated;
create trigger actividad_rrhh_solicitud after insert on public.solicitudes
  for each row execute function actividad_privada.anotar_operacion('solicitud');
create trigger actividad_rrhh_cita after insert on public.citas
  for each row execute function actividad_privada.anotar_operacion('cita');
create trigger actividad_rrhh_estudio after insert on clinico.adjuntos
  for each row execute function actividad_privada.anotar_operacion('estudio');

create function actividad_privada.anotar_altas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_actor uuid := auth.uid();
begin
  if v_actor is null or public.es_base_local() then return null; end if;
  for r in select n.org_id, n.empresa_id, count(*)::int as cantidad, min(n.id::text) as clave
             from nuevas_rrhh n where n.empresa_id is not null
            group by n.org_id,n.empresa_id
  loop
    if actividad_privada.rrhh_empresa(r.org_id, r.empresa_id)
       and actividad_privada.anotar(r.org_id, r.empresa_id, v_actor, 'altas', r.clave, r.cantidad) then
      perform actividad_privada.aviso_servicio(r.org_id, r.empresa_id, 'RR. HH. registró trabajadores');
    end if;
  end loop;
  return null;
end $$;
revoke all on function actividad_privada.anotar_altas() from public, anon, authenticated;
create trigger actividad_rrhh_altas after insert on public.trabajadores
  referencing new table as nuevas_rrhh for each statement execute function actividad_privada.anotar_altas();

create function actividad_privada.anotar_nomina()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.dispositivo_en is null and new.dispositivo_en is not null then
    perform actividad_privada.anotar(new.org_id, new.empresa_id, null, 'nomina_abierta', new.id::text);
  end if;
  if new.enviado_en is not null and (old.enviado_en is null or old.enviado_en <= new.enviado_en - interval '30 minutes') then
    perform actividad_privada.anotar(new.org_id, new.empresa_id, null, 'nomina_enviada',
      new.id::text || '/' || extract(epoch from new.enviado_en)::text);
  end if;
  return null;
end $$;
revoke all on function actividad_privada.anotar_nomina() from public, anon, authenticated;
create trigger actividad_rrhh_nomina after update of dispositivo_en, enviado_en on public.depuraciones_nomina
  for each row execute function actividad_privada.anotar_nomina();

-- Solo operaciones solicitadas desde rutas autenticadas. La clave y el ámbito salen de datos de la base.
create function actividad_privada.anotar_portal(p_tipo text, p_objeto uuid, p_mes text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_empresa uuid; v_actor uuid := auth.uid(); v_clave text; v_titulo text;
  v_sesion text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
begin
  if v_actor is null or public.es_base_local() then return false; end if;
  if p_tipo = 'ingreso' and v_sesion ~ '^[a-f0-9-]{36}$' then
    select e.org_id,e.id into v_org,v_empresa from public.empresas e where e.id = p_objeto;
    v_clave := v_actor::text || '/' || v_sesion;
    v_titulo := 'RR. HH. ingresó al portal';
  elsif p_tipo = 'documento_entregado' then
    select s.org_id,s.empresa_id into v_org,v_empresa from public.solicitudes s
      where s.id = p_objeto and not s.solo_salud and s.estado = 'respondida'
        and (s.documento_ruta is not null or exists (
          select 1 from public.constancias_listas l where l.consulta_id = s.constancia_consulta_id and l.empresa_id = s.empresa_id
        ));
    if not coalesce(public.permiso_portal(v_org, 'descargas'), false) then return false; end if;
    v_clave := p_objeto::text;
    v_titulo := 'RR. HH. solicitó una descarga';
  elsif p_tipo = 'relacion_entregada' and p_mes ~ '^\d{4}-(0[1-9]|1[0-2])$' then
    select e.org_id,e.id into v_org,v_empresa from public.empresas e where e.id = p_objeto;
    if not coalesce(public.permiso_portal(v_org, 'relacion'), false) then return false; end if;
    v_clave := p_mes;
    v_titulo := 'RR. HH. solicitó el Excel de evaluaciones';
  else
    return false;
  end if;
  if not actividad_privada.rrhh_empresa(v_org, v_empresa) then return false; end if;
  if p_tipo <> 'ingreso' then
    v_clave := v_actor::text || '/' || v_clave || '/' || public.hoy_caracas()::text;
  end if;
  if not actividad_privada.anotar(v_org, v_empresa, v_actor, p_tipo, v_clave) then return false; end if;
  perform actividad_privada.aviso_servicio(v_org, v_empresa, v_titulo);
  return true;
end $$;
revoke all on function actividad_privada.anotar_portal(text, uuid, text) from public, anon, authenticated;
grant execute on function actividad_privada.anotar_portal(text, uuid, text) to authenticated;
create function public.registrar_actividad_rrhh(p_tipo text, p_objeto uuid, p_mes text default null)
returns boolean language sql security invoker set search_path = '' as $$
  select actividad_privada.anotar_portal(p_tipo,p_objeto,p_mes)
$$;
revoke all on function public.registrar_actividad_rrhh(text, uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_actividad_rrhh(text, uuid, text) to authenticated;

-- Una firma y la disponibilidad del PDF tienen momentos distintos. Solo el segundo aviso ofrece descargar.
create function actividad_privada.avisar_evaluacion(p_consulta uuid, p_pdf boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_empresa uuid; v_tipo text;
begin
  if public.es_base_local() then return; end if;
  select c.org_id, c.empresa_id into v_org,v_empresa from clinico.consultas c
    join public.trabajadores t on t.id = c.trabajador_id and t.org_id = c.org_id and t.empresa_id = c.empresa_id
    where c.id = p_consulta and c.estado = 'firmada';
  if v_empresa is null then return; end if;
  if p_pdf then
    if not exists (select 1 from clinico.aptitudes a where a.consulta_id = p_consulta) then return; end if;
    v_tipo := 'constancia_lista';
  else
    v_tipo := 'evaluacion_firmada';
  end if;
  if not actividad_privada.anotar(v_org, v_empresa, auth.uid(), v_tipo, p_consulta::text) then return; end if;
  insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
  select v_org, m.usuario_id, v_empresa,
    case when p_pdf then 'Constancia de aptitud disponible' else 'Evaluación atendida y firmada' end,
    case when p_pdf then 'El documento ya está disponible en tu portal.' else 'Consulta el estado y los documentos disponibles en tu portal.' end,
    '/portal#evaluaciones-firmadas'
    from public.miembros m
   where m.org_id = v_org and m.activo and m.rol = 'gerente_empresa'
     and v_empresa = any(m.empresas_permitidas)
     and (not p_pdf or m.permisos_portal is null or 'descargas' = any(m.permisos_portal));
end $$;
revoke all on function actividad_privada.avisar_evaluacion(uuid, boolean) from public, anon, authenticated;

create function actividad_privada.al_firmar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.estado = 'firmada' then return null; end if;
  perform actividad_privada.avisar_evaluacion(new.id, false);
  return null;
end $$;
revoke all on function actividad_privada.al_firmar() from public, anon, authenticated;
create trigger actividad_rrhh_firma after insert or update of estado on clinico.consultas
  for each row when (new.estado = 'firmada') execute function actividad_privada.al_firmar();

create function actividad_privada.al_guardar_constancia()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform actividad_privada.avisar_evaluacion(new.consulta_id, true);
  return null;
end $$;
revoke all on function actividad_privada.al_guardar_constancia() from public, anon, authenticated;
create trigger actividad_rrhh_constancia after insert or update of contenido on public.constancias_listas
  for each row execute function actividad_privada.al_guardar_constancia();

create function actividad_privada.evaluaciones(p_org uuid, p_empresa uuid)
returns table (consulta_id uuid, trabajador text, fecha date, constancia_lista boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, concat_ws(' ', t.nombres, t.apellidos), c.fecha,
    coalesce(public.permiso_portal(c.org_id, 'descargas'), false) and exists (
      select 1 from public.constancias_listas l join clinico.aptitudes a on a.consulta_id = l.consulta_id
       where l.consulta_id = c.id and l.empresa_id = c.empresa_id and l.org_id = c.org_id)
    from clinico.consultas c join public.trabajadores t
      on t.id = c.trabajador_id and t.org_id = c.org_id and t.empresa_id = c.empresa_id
   where auth.uid() is not null and c.org_id = p_org and c.estado = 'firmada' and c.fecha >= public.hoy_caracas() - 30
     and (p_empresa is null or c.empresa_id = p_empresa)
     and actividad_privada.rrhh_empresa(c.org_id, c.empresa_id)
   order by c.fecha desc, c.hora_inicio desc, c.id
   limit 30
$$;
revoke all on function actividad_privada.evaluaciones(uuid, uuid) from public, anon, authenticated;
grant execute on function actividad_privada.evaluaciones(uuid, uuid) to authenticated;
create function public.evaluaciones_firmadas_rrhh(p_org uuid, p_empresa uuid default null)
returns table (consulta_id uuid, trabajador text, fecha date, constancia_lista boolean)
language sql stable security invoker set search_path = '' as $$
  select * from actividad_privada.evaluaciones(p_org, p_empresa)
$$;
revoke all on function public.evaluaciones_firmadas_rrhh(uuid, uuid) from public, anon, authenticated;
grant execute on function public.evaluaciones_firmadas_rrhh(uuid, uuid) to authenticated;

create function actividad_privada.entregar_constancia(p_consulta uuid)
returns table (nombre text, contenido_base64 text)
language plpgsql security definer set search_path = '' as $$
declare v record; v_actor uuid := auth.uid();
begin
  if v_actor is null or public.es_base_local() then return; end if;
  select l.org_id, l.empresa_id, l.nombre, l.contenido into v
    from public.constancias_listas l
    join clinico.consultas c on c.id = l.consulta_id and c.org_id = l.org_id and c.empresa_id = l.empresa_id
      and c.trabajador_id = l.trabajador_id
    join clinico.aptitudes a on a.consulta_id = c.id
    join public.trabajadores t on t.id = c.trabajador_id and t.empresa_id = c.empresa_id and t.org_id = c.org_id
   where c.id = p_consulta and c.estado = 'firmada'
     and actividad_privada.rrhh_empresa(c.org_id,c.empresa_id)
     and public.permiso_portal(c.org_id, 'descargas');
  if not found then return; end if;
  if actividad_privada.anotar(v.org_id, v.empresa_id, v_actor, 'constancia_entregada',
       v_actor::text || '/' || p_consulta::text || '/' || public.hoy_caracas()::text) then
    perform actividad_privada.aviso_servicio(v.org_id, v.empresa_id, 'RR. HH. solicitó una constancia de aptitud');
  end if;
  return query select v.nombre::text, encode(v.contenido, 'base64');
end $$;
revoke all on function actividad_privada.entregar_constancia(uuid) from public, anon, authenticated;
grant execute on function actividad_privada.entregar_constancia(uuid) to authenticated;
create function public.entregar_constancia_rrhh(p_consulta uuid)
returns table (nombre text, contenido_base64 text)
language sql security invoker set search_path = '' as $$
  select * from actividad_privada.entregar_constancia(p_consulta)
$$;
revoke all on function public.entregar_constancia_rrhh(uuid) from public, anon, authenticated;
grant execute on function public.entregar_constancia_rrhh(uuid) to authenticated;
