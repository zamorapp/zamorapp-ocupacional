-- Una constancia del agente apunta a una sola revisión firmada. La cuenta dueña de la llave decide su emisión.
alter table clinico.agentes_borradores
  add column aprobador_id uuid,
  add column consulta_revision integer,
  drop constraint agentes_borradores_tipo_check,
  add constraint agentes_borradores_tipo_check check (tipo in ('recipe', 'examenes', 'constancia')),
  add constraint agentes_borradores_constancia_check check (
    tipo <> 'constancia' or (aprobador_id is not null and consulta_revision is not null and
      consulta_revision > 0 and adjuntar = 'consulta' and envio = 'imprimir' and correo is null));

create policy agentes_borradores_constancia_dueno on clinico.agentes_borradores
  as restrictive for all to authenticated
  using (tipo <> 'constancia' or aprobador_id = (select auth.uid()))
  with check (tipo <> 'constancia' or aprobador_id = (select auth.uid()));

create unique index agentes_borradores_constancia_pendiente
  on clinico.agentes_borradores (org_id, consulta_id, consulta_revision, aprobador_id)
  where tipo = 'constancia' and estado = 'por_revisar';

-- Complementa la protección existente y conserva las reglas de indicaciones y sincronía.
do $$
declare
  definicion text := replace(pg_get_functiondef('public.proteger_agente_borrador()'::regprocedure), chr(13), '');
  cambios text[][] := array[
    array['    new.estado := ''por_revisar'';', $sql$
    if new.tipo = 'constancia' then
      select c.empresa_id into new.empresa_id from clinico.consultas c
       where c.id = new.consulta_id and c.org_id = new.org_id and c.trabajador_id = new.trabajador_id
         and c.estado = 'firmada' and c.revision = new.consulta_revision
         and exists (select 1 from clinico.aptitudes a where a.consulta_id = c.id and a.org_id = c.org_id);
      if not found or new.aprobador_id is distinct from v_uid then
        raise exception 'La constancia requiere una consulta firmada con aptitud y un aprobador válido.';
      end if;
    end if;
    new.estado := 'por_revisar';$sql$],
    array['  new.actualizado_en := public.ahora();', $sql$  new.aprobador_id := old.aprobador_id;
  new.consulta_revision := old.consulta_revision;
  new.actualizado_en := public.ahora();$sql$],
    array['  if new.estado = ''emitido'' then', $sql$
  if old.tipo = 'constancia' and v_uid is distinct from old.aprobador_id then
    raise exception 'La constancia la revisa quien creó la llave.' using errcode = '42501';
  end if;
  if new.estado = 'emitido' and old.tipo = 'constancia' then
    if not exists (select 1 from clinico.consultas c
        where c.id = old.consulta_id and c.org_id = old.org_id and c.trabajador_id = old.trabajador_id
          and c.empresa_id is not distinct from old.empresa_id and c.estado = 'firmada'
          and c.revision = old.consulta_revision
          and exists (select 1 from clinico.aptitudes a where a.consulta_id = c.id and a.org_id = c.org_id)
        for share) then
      raise exception 'La consulta cambió. Pide otro borrador.' using errcode = 'ZA409';
    end if;
    new.indicacion_id := null;
  elsif new.estado = 'emitido' then$sql$]
  ];
  i int;
begin
  for i in 1 .. array_length(cambios, 1) loop
    if (length(definicion) - length(replace(definicion, cambios[i][1], ''))) / length(cambios[i][1]) <> 1 then
      raise exception 'Cambió proteger_agente_borrador (paso %)', i;
    end if;
    definicion := replace(definicion, cambios[i][1], cambios[i][2]);
  end loop;
  execute definicion;
end $$;

create function public.agente_preparar_constancia(p_org uuid, d jsonb, p_ensayo boolean, p_llave uuid, p_nombre text)
returns jsonb language plpgsql set search_path = public as $$
declare
  trabajador uuid := public.agente_uuid(d, 'trabajador_id');
  dia date := public.agente_fecha(d, 'consulta_fecha');
  consulta clinico.consultas;
  borrador uuid;
  dueno uuid := auth.uid();
begin
  if not public.es_clinico(p_org) then
    perform public.agente_no('La cuenta responsable necesita acceso clínico para revisar constancias.');
  end if;
  if trabajador is null or dia is null then
    perform public.agente_no('Indica el trabajador y el día de la consulta firmada.');
  end if;
  with candidatas as (
    select c.* from clinico.consultas c
    where c.org_id = p_org and c.trabajador_id = trabajador and c.fecha = dia and c.estado = 'firmada'
      and exists (select 1 from clinico.aptitudes a where a.consulta_id = c.id and a.org_id = c.org_id)
    limit 2
  )
  select c.* into consulta from candidatas c where (select count(*) from candidatas) = 1;
  if not found then
    perform public.agente_no('No se pudo identificar una sola consulta firmada con aptitud. Confirma el trabajador y la fecha con el doctor.');
  end if;
  if p_ensayo then
    return jsonb_build_object('se_crearia', 'Constancia de aptitud en borrador', '_resumen', 'Ensayo de constancia');
  end if;
  -- Serializa repeticiones del mismo pedido y permite volver a preparar tras descartar o corregir.
  perform pg_advisory_xact_lock(hashtextextended('constancia:' || consulta.id || ':' || dueno, 0));
  select b.id into borrador from clinico.agentes_borradores b
   where b.org_id = p_org and b.consulta_id = consulta.id and b.consulta_revision = consulta.revision
     and b.aprobador_id = dueno and b.tipo = 'constancia' and b.estado = 'por_revisar';
  if found then
    return jsonb_build_object('borrador_id', borrador, 'ya_existia', true, 'ruta', '/borradores', '_resumen', 'Constancia ya preparada');
  end if;
  perform set_config('zamorapp.agente_borrador', '1', true);
  insert into clinico.agentes_borradores
    (org_id, trabajador_id, tipo, adjuntar, consulta_id, consulta_revision, aprobador_id, llave_id, llave_nombre)
  values (p_org, trabajador, 'constancia', 'consulta', consulta.id, consulta.revision, dueno, p_llave, p_nombre)
  returning id into borrador;
  perform set_config('zamorapp.agente_borrador', '', true);
  return jsonb_build_object('borrador_id', borrador, 'ya_existia', false, 'ruta', '/borradores',
    'nota', 'Pendiente de aprobación del doctor.', '_resumen', 'Constancia en borrador');
end $$;
revoke execute on function public.agente_preparar_constancia(uuid, jsonb, boolean, uuid, text) from public, anon, authenticated;

-- Amplía el despachador cerrado de la puerta y el permiso de documentos. La aprobación no es una acción de la puerta.
do $$
declare
  definicion text := replace(pg_get_functiondef('public.agente(text,text,jsonb,boolean)'::regprocedure), chr(13), '');
  cambios text[][] := array[
    array['when v_acc in (''preparar_documento'', ', 'when v_acc in (''preparar_constancia'', ''preparar_documento'', '],
    array['Acción desconocida. Las que hay: preparar_documento, ', 'Acción desconocida. Las que hay: preparar_constancia, preparar_documento, '],
    array['elsif v_acc in (''preparar_documento'', ''ver_preparados'') and not k.documentos then',
           'elsif v_acc in (''preparar_constancia'', ''preparar_documento'', ''ver_preparados'') and not k.documentos then'],
    array['when ''preparar_documento'' then',
           'when ''preparar_constancia'' then public.agente_preparar_constancia(k.org_id, d, v_ensayo, k.id, k.nombre)
        when ''preparar_documento'' then']
  ];
  i int;
begin
  for i in 1 .. array_length(cambios, 1) loop
    if (length(definicion) - length(replace(definicion, cambios[i][1], ''))) / length(cambios[i][1]) <> 1 then
      raise exception 'Cambió la puerta para agentes (paso %)', i;
    end if;
    definicion := replace(definicion, cambios[i][1], cambios[i][2]);
  end loop;
  execute definicion;
  definicion := pg_get_functiondef('public.agente_ver_preparados(uuid,jsonb)'::regprocedure);
  if position('case b.tipo when ''recipe'' then' in definicion) = 0
     or position('where x.org_id = o and' in definicion) = 0 then
    raise exception 'Cambió ver_preparados';
  end if;
  definicion := replace(definicion, 'case b.tipo when ''recipe'' then',
    'case b.tipo when ''constancia'' then ''Constancia de aptitud'' when ''recipe'' then');
  execute replace(definicion, 'where x.org_id = o and',
    'where x.org_id = o and (x.tipo <> ''constancia'' or (x.aprobador_id = auth.uid() and public.es_clinico(o))) and');
end $$;

select public.vistas_al_dia();

-- Propuestas de agenda: una cita y una versión por propuesta. La decisión y la agenda cambian juntas.
create table public.agentes_cambios_citas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones(id) on delete cascade,
  cita_id uuid not null references public.citas(id) on delete cascade,
  aprobador_id uuid not null,
  cita_version bigint not null,
  trabajador text not null,
  empresa text not null,
  operacion text not null check (operacion in ('reprogramar', 'cancelar')),
  fecha_anterior date not null,
  hora_anterior time,
  estado_anterior text not null check (estado_anterior in ('citado', 'solicitada')),
  fecha_nueva date,
  hora_nueva time,
  agente text not null,
  creado_en timestamptz not null default public.ahora(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'descartada')),
  decidido_en timestamptz,
  check ((operacion = 'reprogramar' and fecha_nueva is not null)
      or (operacion = 'cancelar' and fecha_nueva is null and hora_nueva is null)),
  check ((estado = 'pendiente') = (decidido_en is null))
);
create unique index agentes_cambio_cita_pendiente
  on public.agentes_cambios_citas(cita_id, aprobador_id) where estado = 'pendiente';
create index agentes_cambios_citas_por_revisar
  on public.agentes_cambios_citas(org_id, aprobador_id, creado_en desc) where estado = 'pendiente';
alter table public.agentes_cambios_citas enable row level security;
revoke all on public.agentes_cambios_citas from public, anon, authenticated;
grant select on public.agentes_cambios_citas to authenticated;
create policy agentes_cambios_citas_leer on public.agentes_cambios_citas for select to authenticated
  using (aprobador_id = (select auth.uid()) and
    org_id = any ((select public.orgs_con('{administrador}', p_sin_limite => true))::uuid[]));

create function public.agente_preparar_cambio_cita(p_org uuid, d jsonb, p_ensayo boolean, p_agente text)
returns jsonb language plpgsql set search_path = public as $$
declare
  cita uuid := public.agente_uuid(d, 'cita_id');
  operacion text := d ->> 'operacion';
  fecha date;
  hora time;
  actual public.citas;
  propuesta public.agentes_cambios_citas;
  titular uuid := auth.uid();
begin
  if cita is null or operacion is null or operacion not in ('reprogramar', 'cancelar')
     or d - array['cita_id', 'operacion', 'fecha', 'hora'] <> '{}'::jsonb then
    perform public.agente_no('Indica una sola cita y elige reprogramar o cancelar.');
  end if;
  if operacion = 'reprogramar' then
    fecha := public.agente_fecha(d, 'fecha');
    if fecha is null or fecha < public.hoy_caracas() then
      perform public.agente_no('Indica una fecha de hoy en adelante (hora de Caracas).');
    end if;
    if not (d ? 'hora') or (d -> 'hora' <> 'null'::jsonb and
      (jsonb_typeof(d -> 'hora') <> 'string' or (d ->> 'hora') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')) then
      perform public.agente_no('Indica la hora HH:MM de Caracas o envía hora nula si es sin hora.');
    end if;
    hora := (d ->> 'hora')::time;
  elsif d ?| array['fecha', 'hora'] then
    perform public.agente_no('La cancelación solo lleva la cita y la operación.');
  end if;
  select * into actual from public.citas c
   where c.id = cita and c.org_id = p_org and c.estado in ('citado', 'solicitada');
  if not found then perform public.agente_no('No se encontró una cita pendiente que se pueda cambiar.'); end if;
  if operacion = 'reprogramar' then
    if actual.propuesta_fecha is not null then
      perform public.agente_no('La cita tiene una propuesta de hora para la empresa. Revísala primero en la agenda.');
    end if;
    if (fecha, hora) is not distinct from (actual.fecha, actual.hora) then
      perform public.agente_no('La fecha y hora propuestas son iguales a las actuales.');
    end if;
  end if;
  if p_ensayo then
    return jsonb_build_object('operacion', operacion, 'fecha_actual', actual.fecha, 'hora_actual', to_char(actual.hora, 'HH24:MI'),
      'fecha_nueva', fecha, 'hora_nueva', to_char(hora, 'HH24:MI'), '_resumen', 'Ensayo de cambio de cita');
  end if;
  insert into public.agentes_cambios_citas
    (org_id, cita_id, aprobador_id, cita_version, trabajador, empresa, operacion, fecha_anterior, hora_anterior, estado_anterior, fecha_nueva, hora_nueva, agente)
  select p_org, actual.id, titular, actual.version, trim(w.nombres || ' ' || w.apellidos),
    e.razon_social, operacion, actual.fecha, actual.hora, actual.estado, fecha, hora, p_agente
  from public.trabajadores w cross join public.empresas e
  where w.id = actual.trabajador_id and w.org_id = p_org and e.id = actual.empresa_id and e.org_id = p_org
  on conflict (cita_id, aprobador_id) where estado = 'pendiente' do nothing
  returning * into propuesta;
  if not found then
    select * into propuesta from public.agentes_cambios_citas p
    where p.cita_id = actual.id and p.org_id = p_org and p.aprobador_id = titular and p.estado = 'pendiente';
    if not found or (propuesta.cita_version, propuesta.operacion, propuesta.fecha_nueva, propuesta.hora_nueva)
       is distinct from (actual.version, operacion, fecha, hora) then
      perform public.agente_no('Revisa o descarta la propuesta pendiente de esta cita antes de preparar otra.');
    end if;
  end if;
  return jsonb_build_object('propuesta_id', propuesta.id, 'operacion', propuesta.operacion, 'estado', 'pendiente',
    'ruta', '/borradores', 'nota', 'La cita se mantiene hasta que el titular apruebe.', '_resumen', 'Cambio de cita pendiente');
end $$;
revoke execute on function public.agente_preparar_cambio_cita(uuid,jsonb,boolean,text) from public, anon, authenticated;

-- La sesión humana solo puede decidir sobre el ID de una propuesta propia. Los campos a aplicar vienen de la fila.
create function public.decidir_cambio_cita_agente(p_id uuid, p_aprobar boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  titular uuid := auth.uid();
  propuesta public.agentes_cambios_citas;
  actual public.citas;
begin
  if public.es_base_local() or titular is null or p_aprobar is null then
    raise exception 'Revisa los cambios de agenda con tu sesión y conexión a internet.' using errcode = '42501';
  end if;
  select * into propuesta from public.agentes_cambios_citas
   where id = p_id and aprobador_id = titular and estado = 'pendiente' for update;
  if not found or not public.agentes_soy_admin(propuesta.org_id) then
    raise exception 'La propuesta ya fue revisada o no está disponible para tu cuenta.' using errcode = '42501';
  end if;
  if not p_aprobar then
    update public.agentes_cambios_citas set estado = 'descartada', decidido_en = public.ahora() where id = propuesta.id;
    return 'descartada';
  end if;
  select * into actual from public.citas c
   where c.id = propuesta.cita_id and c.org_id = propuesta.org_id for update;
  if not found or actual.version <> propuesta.cita_version
     or (actual.fecha, actual.hora, actual.estado) is distinct from (propuesta.fecha_anterior, propuesta.hora_anterior, propuesta.estado_anterior) then
    raise exception 'La cita cambió. Descarta esta propuesta y pide otra.' using errcode = 'ZA409';
  end if;
  if propuesta.operacion = 'reprogramar' then
    if propuesta.fecha_nueva < public.hoy_caracas() then
      raise exception 'La fecha propuesta ya pasó. Descarta esta propuesta y pide otra.' using errcode = 'ZA410';
    end if;
    update public.citas set fecha = propuesta.fecha_nueva, hora = propuesta.hora_nueva where id = actual.id;
  else
    update public.citas set estado = 'cancelada', propuesta_fecha = null where id = actual.id;
  end if;
  update public.agentes_cambios_citas set estado = 'aplicada', decidido_en = public.ahora() where id = propuesta.id;
  return propuesta.operacion;
end $$;
revoke execute on function public.decidir_cambio_cita_agente(uuid,boolean) from public, anon;
grant execute on function public.decidir_cambio_cita_agente(uuid,boolean) to authenticated;

do $$
declare
  definicion text := replace(pg_get_functiondef('public.agente(text,text,jsonb,boolean)'::regprocedure), chr(13), '');
  cambios text[][] := array[
    array['when v_acc in (''preparar_constancia'', ', 'when v_acc in (''preparar_cambio_cita'', ''preparar_constancia'', '],
    array['Acción desconocida. Las que hay: preparar_constancia, ', 'Acción desconocida. Las que hay: preparar_cambio_cita, preparar_constancia, '],
    array['when ''preparar_constancia'' then', 'when ''preparar_cambio_cita'' then public.agente_preparar_cambio_cita(k.org_id, d, v_ensayo, k.nombre)
        when ''preparar_constancia'' then']
  ];
  i int;
begin
  for i in 1 .. array_length(cambios, 1) loop
    if (length(definicion) - length(replace(definicion, cambios[i][1], ''))) / length(cambios[i][1]) <> 1 then
      raise exception 'Cambió la puerta para agentes (paso %)', i;
    end if;
    definicion := replace(definicion, cambios[i][1], cambios[i][2]);
  end loop;
  execute definicion;
end $$;
