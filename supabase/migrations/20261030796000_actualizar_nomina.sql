-- zamorApp Ocupacional · Actualizar la nómina con la plantilla de RR. HH. (Cesar, 04-nov-2026)
-- RR. HH. llena una plantilla sencilla (la nómina actual de la empresa, prellenada) y Cesar la sube. Con eso:
--   · se completan los datos que faltan (sexo, nacimiento, cargo, departamento, ingreso…): la población de la
--     vigilancia sale completa y con datos reales;
--   · se corrigen los cambios de cargo, departamento, turno y contacto;
--   · se registran los trabajadores nuevos;
--   · quien RR. HH. marca «NO» (o no aparece, si Cesar lo pide) queda INACTIVO, nunca borrado.
-- Coincidencia EXACTA por cédula. Nada se aplica sin la vista previa y el conteo. Cada actualización queda en
-- nomina_actualizaciones con lo que había antes, para «Deshacer» el mismo día; la bitácora anota cada fila.
-- Solo administrador y personal de salud (como «Depurar trabajadores»), en las empresas que puede ver.

create table if not exists public.nomina_actualizaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  archivo text check (length(archivo) <= 200),
  fecha date not null default public.hoy_caracas(),
  hecho_por uuid default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  -- Lo hecho, para deshacer: altas (con la huella de la fila al crearla), cambios (antes y después de cada campo),
  -- cargos anotados en el historial e inactivados con su estado anterior
  nuevos jsonb not null default '[]',
  cambios jsonb not null default '[]',
  historial uuid[] not null default '{}',
  inactivados jsonb not null default '[]',
  deshecho_en timestamptz,
  deshecho jsonb
);
create index if not exists nomina_actualizaciones_empresa on public.nomina_actualizaciones (empresa_id, creado_en desc);
alter table public.nomina_actualizaciones enable row level security;
drop policy if exists nomina_actualizaciones_leer on public.nomina_actualizaciones;
create policy nomina_actualizaciones_leer on public.nomina_actualizaciones for select
  using (org_id = any ((select public.orgs_con('{administrador}', p_sin_limite => true))::uuid[])
         or org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador}'))::text[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
revoke all on public.nomina_actualizaciones from anon, authenticated;
grant select (id, org_id, empresa_id, archivo, fecha, hecho_por, creado_en, deshecho_en) on public.nomina_actualizaciones to authenticated;

-- Campos que la plantilla puede escribir (nada clínico: ni grupo sanguíneo, ni discapacidad, ni lateralidad)
create or replace function public.nomina_campos()
returns text[] language sql immutable as $$
  select array['nombres', 'apellidos', 'sexo', 'fecha_nacimiento', 'fecha_ingreso', 'puesto_id', 'dependencia_id', 'turno',
               'tipo_paciente_id', 'telefono', 'correo', 'direccion', 'ficha']
$$;
revoke execute on function public.nomina_campos() from public, anon, authenticated;

-- Quién puede, en qué empresa; y que los catálogos (cargo, departamento, tipo) sean de esa empresa u organización
create or replace function public.nomina_validar(p_org uuid, p_empresa uuid, p_campos jsonb)
returns void language plpgsql stable security definer set search_path = public as $$
declare k text;
begin
  for k in select jsonb_object_keys(p_campos) loop
    if not k = any (public.nomina_campos() || array['cedula']) then
      raise exception 'Campo no permitido en la nómina: %', k using errcode = '22023';
    end if;
  end loop;
  if nullif(p_campos ->> 'puesto_id', '') is not null
     and not exists (select 1 from public.puestos where id = (p_campos ->> 'puesto_id')::uuid and empresa_id = p_empresa) then
    raise exception 'Cargo de otra empresa' using errcode = '22023';
  end if;
  if nullif(p_campos ->> 'dependencia_id', '') is not null
     and not exists (select 1 from public.dependencias where id = (p_campos ->> 'dependencia_id')::uuid and empresa_id = p_empresa) then
    raise exception 'Departamento de otra empresa' using errcode = '22023';
  end if;
  if nullif(p_campos ->> 'tipo_paciente_id', '') is not null
     and not exists (select 1 from public.lista_items where id = (p_campos ->> 'tipo_paciente_id')::uuid and org_id = p_org and lista = 'tipo_paciente') then
    raise exception 'Tipo de trabajador de otra organización' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.nomina_validar(uuid, uuid, jsonb) from public, anon, authenticated;

-- Aplica una parte (hasta 1.000 filas) de la actualización. La primera llamada crea el registro (p_lote null) y las
-- siguientes lo continúan: así una nómina grande no pasa los 8 s de la nube y todo queda en un solo «Deshacer».
create or replace function public.aplicar_nomina(p_lote uuid, p_empresa uuid, p_archivo text, p_cambios jsonb, p_nuevos jsonb,
                                                 p_inactivar uuid[], p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_lote public.nomina_actualizaciones;
  v_hoy date := public.hoy_caracas();
  x jsonb;
  v_t public.trabajadores;
  v_n public.trabajadores;
  v_antes jsonb;
  v_despues jsonb;
  v_hist uuid;
  v_id uuid;
  v_cambios jsonb := '[]';
  v_nuevos jsonb := '[]';
  v_inact jsonb := '[]';
  v_hists uuid[] := '{}';
begin
  select e.org_id into v_org from public.empresas e where e.id = p_empresa;
  if v_org is null or not (public.es_admin(v_org) or public.es_clinico(v_org)) or not public.puede_ver_empresa(v_org, p_empresa) then
    raise exception 'Solo el administrador o el personal de salud actualizan la nómina' using errcode = '42501';
  end if;
  if coalesce(jsonb_array_length(p_cambios), 0) + coalesce(jsonb_array_length(p_nuevos), 0) + coalesce(array_length(p_inactivar, 1), 0) > 1000 then
    raise exception 'Demasiadas filas en una sola parte' using errcode = '22023';
  end if;

  if p_lote is null then
    insert into public.nomina_actualizaciones (org_id, empresa_id, archivo, fecha)
    values (v_org, p_empresa, left(nullif(btrim(p_archivo), ''), 200), v_hoy) returning * into v_lote;
  else
    select * into v_lote from public.nomina_actualizaciones
     where id = p_lote and org_id = v_org and empresa_id = p_empresa and hecho_por = auth.uid() and fecha = v_hoy and deshecho_en is null
     for update;
    if v_lote.id is null then raise exception 'Esa actualización ya no se puede continuar' using errcode = '22023'; end if;
  end if;

  -- El historial de cargos lo anota esta función (para poder quitarlo al deshacer), no el disparador
  perform set_config('zamorapp.uniendo_cargos', 'si', true);

  -- 1) Cambios y datos que faltaban: solo a quien está en esta empresa y en la nómina (activo, reposo o aspirante)
  for x in select * from jsonb_array_elements(coalesce(p_cambios, '[]')) loop
    perform public.nomina_validar(v_org, p_empresa, x -> 'campos');
    select * into v_t from public.trabajadores t
     where t.id = (x ->> 'id')::uuid and t.org_id = v_org and t.empresa_id = p_empresa and t.estado in ('activo', 'reposo', 'aspirante')
     for update;
    continue when v_t.id is null;
    v_n := jsonb_populate_record(v_t, x -> 'campos');
    v_hist := null;
    if v_n.puesto_id is distinct from v_t.puesto_id then
      if v_t.puesto_id is not null then
        insert into public.cargos_historial (org_id, empresa_id, trabajador_id, puesto_id, cargo, desde, hasta)
        select v_t.org_id, v_t.empresa_id, v_t.id, v_t.puesto_id, p.nombre, v_t.fecha_ingreso_cargo, v_hoy
          from public.puestos p where p.id = v_t.puesto_id
        returning id into v_hist;
        if v_hist is not null then v_hists := v_hists || v_hist; end if;
      end if;
      -- Antigüedad en el cargo nuevo: desde hoy (RR. HH. no la trae en la plantilla)
      v_n.fecha_ingreso_cargo := v_hoy;
    end if;
    select jsonb_object_agg(k, to_jsonb(v_t) -> k) into v_antes
      from unnest(public.nomina_campos() || array['fecha_ingreso_cargo']) k where (to_jsonb(v_t) -> k) is distinct from (to_jsonb(v_n) -> k);
    continue when v_antes is null;
    update public.trabajadores t set
      nombres = v_n.nombres, apellidos = v_n.apellidos, sexo = v_n.sexo, fecha_nacimiento = v_n.fecha_nacimiento,
      fecha_ingreso = v_n.fecha_ingreso, puesto_id = v_n.puesto_id, dependencia_id = v_n.dependencia_id, turno = v_n.turno,
      tipo_paciente_id = v_n.tipo_paciente_id, telefono = v_n.telefono, correo = v_n.correo, direccion = v_n.direccion,
      ficha = v_n.ficha, fecha_ingreso_cargo = v_n.fecha_ingreso_cargo
     where t.id = v_t.id
    returning * into v_n;
    -- «Después» se lee de la fila guardada: al deshacer se compara campo por campo con lo que haya entonces
    select jsonb_object_agg(k, to_jsonb(v_n) -> k) into v_despues from jsonb_object_keys(v_antes) k;
    v_cambios := v_cambios || jsonb_build_array(jsonb_build_object('id', v_t.id, 'antes', v_antes, 'despues', v_despues, 'historial', v_hist));
  end loop;

  -- 2) Nuevos: la cédula no existe en la organización (si existe, la pantalla lo manda a «Revisar», nunca aquí)
  for x in select * from jsonb_array_elements(coalesce(p_nuevos, '[]')) loop
    perform public.nomina_validar(v_org, p_empresa, x);
    v_n := jsonb_populate_record(null::public.trabajadores, x);
    continue when coalesce(btrim(v_n.cedula), '') = '' or coalesce(btrim(v_n.nombres), '') = '' or coalesce(btrim(v_n.apellidos), '') = '';
    insert into public.trabajadores (org_id, empresa_id, cedula, nombres, apellidos, sexo, fecha_nacimiento, fecha_ingreso, puesto_id,
                                     fecha_ingreso_cargo, dependencia_id, turno, tipo_paciente_id, telefono, correo, direccion, ficha, estado)
    values (v_org, p_empresa, btrim(v_n.cedula), btrim(v_n.nombres), btrim(v_n.apellidos), v_n.sexo, v_n.fecha_nacimiento, v_n.fecha_ingreso,
            v_n.puesto_id, case when v_n.puesto_id is not null then coalesce(v_n.fecha_ingreso, v_hoy) end, v_n.dependencia_id, v_n.turno,
            v_n.tipo_paciente_id, v_n.telefono, v_n.correo, v_n.direccion, v_n.ficha, 'activo')
    on conflict (org_id, cedula) do nothing
    returning * into v_n;
    continue when not found;
    -- Huella de la fila tal como se creó: al deshacer solo se quita si nadie la tocó después
    v_nuevos := v_nuevos || jsonb_build_array(jsonb_build_object('id', v_n.id, 'huella', md5(to_jsonb(v_n)::text)));
  end loop;

  perform set_config('zamorapp.uniendo_cargos', '', true);

  -- 3) Ya no están en la empresa: inactivos (no egreso), con su estado anterior para deshacer
  with antes as (
    select t.id, t.estado from public.trabajadores t
     where t.id = any (coalesce(p_inactivar, '{}')) and t.org_id = v_org and t.empresa_id = p_empresa and t.estado in ('activo', 'reposo', 'aspirante')
     for update
  ), hechos as (
    update public.trabajadores t set estado = 'inactivo', fecha_inactivo = v_hoy,
           motivo_inactivo = left(coalesce(nullif(btrim(p_motivo), ''), 'No está en la nómina de RR. HH.'), 200)
      from antes where t.id = antes.id
    returning t.id, antes.estado
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'estado', estado)), '[]') into v_inact from hechos;

  update public.nomina_actualizaciones set
    cambios = cambios || v_cambios, nuevos = nuevos || v_nuevos, inactivados = inactivados || v_inact, historial = historial || v_hists
   where id = v_lote.id;

  return jsonb_build_object('lote', v_lote.id, 'cambios', jsonb_array_length(v_cambios), 'nuevos', jsonb_array_length(v_nuevos),
                            'inactivados', jsonb_array_length(v_inact));
end $$;
revoke execute on function public.aplicar_nomina(uuid, uuid, text, jsonb, jsonb, uuid[], text) from public, anon;
grant execute on function public.aplicar_nomina(uuid, uuid, text, jsonb, jsonb, uuid[], text) to authenticated;

-- ¿Algo cuelga de este trabajador (consulta, cita, adjunto, envío…)? Se mira en TODAS las tablas que lo referencian,
-- para que deshacer un alta nunca se lleve en cascada algo registrado después.
create or replace function public.trabajador_en_uso(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  v boolean;
begin
  for r in
    select c.conrelid::regclass as tabla, a.attname as columna
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.trabajadores'::regclass and array_length(c.conkey, 1) = 1
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabla, r.columna) into v using p_id;
    if v then return true; end if;
  end loop;
  return false;
end $$;
revoke execute on function public.trabajador_en_uso(uuid) from public, anon, authenticated;

-- Deshacer (el mismo día): vuelve cada campo a como estaba si nadie lo cambió después; quita las altas que no se
-- usaron; reactiva a los inactivados que siguen inactivos con esa fecha. Lo que ya cambió se queda y se cuenta.
create or replace function public.deshacer_nomina(p_lote uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lote public.nomina_actualizaciones;
  x jsonb;
  k text;
  v_t public.trabajadores;
  v_ok boolean;
  n_cambios int := 0; q_cambios int := 0;
  n_nuevos int := 0; q_nuevos int := 0;
  n_inact int := 0;
  v_res jsonb;
begin
  select * into v_lote from public.nomina_actualizaciones where id = p_lote for update;
  if v_lote.id is null or not (public.es_admin(v_lote.org_id) or public.es_clinico(v_lote.org_id))
     or not public.puede_ver_empresa(v_lote.org_id, v_lote.empresa_id) then
    raise exception 'Sin permiso para deshacer esta actualización' using errcode = '42501';
  end if;
  if v_lote.deshecho_en is not null then raise exception 'Esa actualización ya se deshizo' using errcode = '22023'; end if;
  if v_lote.fecha <> public.hoy_caracas() then raise exception 'Solo se puede deshacer el mismo día' using errcode = '22023'; end if;

  perform set_config('zamorapp.uniendo_cargos', 'si', true);
  -- Cambios, del último al primero
  for x in select e from jsonb_array_elements(v_lote.cambios) with ordinality as a(e, i) order by i desc loop
    select * into v_t from public.trabajadores where id = (x ->> 'id')::uuid and org_id = v_lote.org_id for update;
    v_ok := v_t.id is not null;
    if v_ok then
      for k in select jsonb_object_keys(x -> 'despues') loop
        if (to_jsonb(v_t) -> k) is distinct from (x -> 'despues' -> k) then v_ok := false; end if;
      end loop;
    end if;
    if not v_ok then q_cambios := q_cambios + 1; continue; end if;
    v_t := jsonb_populate_record(v_t, x -> 'antes');
    update public.trabajadores t set
      nombres = v_t.nombres, apellidos = v_t.apellidos, sexo = v_t.sexo, fecha_nacimiento = v_t.fecha_nacimiento,
      fecha_ingreso = v_t.fecha_ingreso, puesto_id = v_t.puesto_id, dependencia_id = v_t.dependencia_id, turno = v_t.turno,
      tipo_paciente_id = v_t.tipo_paciente_id, telefono = v_t.telefono, correo = v_t.correo, direccion = v_t.direccion,
      ficha = v_t.ficha, fecha_ingreso_cargo = v_t.fecha_ingreso_cargo
     where t.id = v_t.id;
    if nullif(x ->> 'historial', '') is not null then
      delete from public.cargos_historial where id = (x ->> 'historial')::uuid and trabajador_id = v_t.id;
    end if;
    n_cambios := n_cambios + 1;
  end loop;
  perform set_config('zamorapp.uniendo_cargos', '', true);

  -- Altas: solo si nadie las tocó ni les registró nada
  for x in select * from jsonb_array_elements(v_lote.nuevos) loop
    select * into v_t from public.trabajadores where id = (x ->> 'id')::uuid and org_id = v_lote.org_id for update;
    if v_t.id is not null and md5(to_jsonb(v_t)::text) = x ->> 'huella' and not public.trabajador_en_uso(v_t.id) then
      delete from public.trabajadores where id = v_t.id;
      n_nuevos := n_nuevos + 1;
    elsif v_t.id is not null then
      q_nuevos := q_nuevos + 1;
    end if;
  end loop;

  -- Inactivados: vuelven a su estado si siguen inactivos con la fecha de esta actualización
  update public.trabajadores t set estado = y.estado::public.estado_trabajador
    from jsonb_to_recordset(v_lote.inactivados) as y(id uuid, estado text)
   where t.id = y.id and t.org_id = v_lote.org_id and t.estado = 'inactivo' and t.fecha_inactivo = v_lote.fecha
     and y.estado in ('activo', 'reposo', 'aspirante');
  get diagnostics n_inact = row_count;

  v_res := jsonb_build_object('cambios', n_cambios, 'cambios_quedan', q_cambios, 'nuevos', n_nuevos, 'nuevos_quedan', q_nuevos,
                              'reactivados', n_inact, 'inactivos_quedan', jsonb_array_length(v_lote.inactivados) - n_inact);
  update public.nomina_actualizaciones set deshecho_en = public.ahora(), deshecho = v_res where id = v_lote.id;
  return v_res;
end $$;
revoke execute on function public.deshacer_nomina(uuid) from public, anon;
grant execute on function public.deshacer_nomina(uuid) to authenticated;
