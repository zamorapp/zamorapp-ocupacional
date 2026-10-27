-- zamorApp Ocupacional · Datos de salud del trabajador fuera del alcance de las empresas (decisión de Cesar, 27/10/2026)
-- 1) Grupo sanguíneo y discapacidad dejan de poder leerse desde public.trabajadores (privilegio por columna).
--    Solo el personal del servicio (administrador, gerente médico, médico, enfermería, recepción) los ve, por la
--    vista public.trabajadores_salud. RR. HH., supervisor, delegado, SST, auditor y trabajador ya no los reciben
--    ni en pantalla, ni en el padrón, ni en la vigilancia, ni en la copia de escritorio.
--    Escribirlos sigue igual (privilegios de INSERT/UPDATE intactos).
-- 2) Bitácora: la copia completa de consultas, aptitudes y reposos (y de la ficha del trabajador) solo la lee
--    el administrador o gerente médico con acceso clínico; el auditor ve el resto, solo de sus empresas.

-- ─── 1) Columnas de salud ───
revoke select on public.trabajadores from authenticated, anon;
do $$
declare v text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into v
    from pg_attribute
   where attrelid = 'public.trabajadores'::regclass and attnum > 0 and not attisdropped
     and attname not in ('grupo_sanguineo', 'discapacidad');
  execute format('grant select (%s) on public.trabajadores to authenticated', v);
end $$;

-- Vista con permisos del dueño: filtra ella misma (misma org, empresa permitida, rol del servicio).
create or replace view public.trabajadores_salud as
  select t.id, t.org_id, t.empresa_id, t.grupo_sanguineo, t.discapacidad
  from public.trabajadores t
  where public.es_servicio(t.org_id) and public.puede_ver_empresa(t.org_id, t.empresa_id);
revoke all on public.trabajadores_salud from public, anon;
grant select on public.trabajadores_salud to authenticated;

-- Reportes: mismas salidas; para quien no es del servicio, esas dos columnas llegan vacías.
-- Se parchea la versión vigente de cada función (la que haya dejado la última migración), sin copiarla entera:
-- así no pisa reportes nuevos de otras migraciones. Falla si no encuentra lo que reemplaza.
do $$
declare
  f text;
  s text := '(select s.%s from public.trabajadores_salud s where s.id = t.id)';
begin
  f := pg_get_functiondef('public.reporte_listado(text, uuid, date, date, jsonb)'::regprocedure);
  f := replace(f, 'pu.nombre as cargo, t.discapacidad,', 'pu.nombre as cargo, ' || format(s, 'discapacidad') || ' as discapacidad,');
  f := replace(f, 'case when t.discapacidad then', 'case when ' || format(s, 'discapacidad') || ' then');
  f := replace(f, 't.grupo_sanguineo, t.lateralidad, t.discapacidad,',
               format(s, 'grupo_sanguineo') || ' as grupo_sanguineo, t.lateralidad, ' || format(s, 'discapacidad') || ' as discapacidad,');
  if f ~ 't\.(grupo_sanguineo|discapacidad)\M' then
    raise exception 'reporte_listado todavía lee grupo_sanguineo o discapacidad de trabajadores';
  end if;
  execute f;

  f := pg_get_functiondef('public.reporte_vigilancia(uuid, date, date)'::regprocedure);
  if position('select t.* from public.trabajadores t' in f) = 0 then
    raise exception 'reporte_vigilancia cambió: revisar cómo lee trabajadores';
  end if;
  f := replace(f, 'select t.* from public.trabajadores t',
               'select ' || (select string_agg('t.' || quote_ident(attname), ', ' order by attnum) from pg_attribute
                              where attrelid = 'public.trabajadores'::regclass and attnum > 0 and not attisdropped
                                and attname not in ('grupo_sanguineo', 'discapacidad'))
               || ', coalesce(' || format(s, 'discapacidad') || ', false) as discapacidad from public.trabajadores t');
  execute f;
end $$;

-- Copia de escritorio: solo columnas legibles (to_jsonb(t) ya no se puede sobre trabajadores) y, para el
-- personal del servicio, las dos de salud desde la vista.
create or replace function sync.fila_visible(p_tabla text, p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_cols text; v jsonb;
begin
  if has_table_privilege(p_tabla, 'SELECT') then -- lo común: la tabla entera es legible
    execute format('select to_jsonb(t) from %s t where id = $1', p_tabla) into v using p_id;
    return v;
  end if;
  select string_agg(format('t.%I', column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema || '.' || table_name = p_tabla
     and has_column_privilege(p_tabla, column_name, 'SELECT');
  if v_cols is null then return null; end if;
  execute format('select to_jsonb(x) from (select %s from %s t where t.id = $1) x', v_cols, p_tabla) into v using p_id;
  if v is not null and p_tabla = 'public.trabajadores' then
    v := v || coalesce((select jsonb_build_object('grupo_sanguineo', s.grupo_sanguineo, 'discapacidad', s.discapacidad)
                          from public.trabajadores_salud s where s.id = p_id), '{}');
  end if;
  return v;
end $$;
revoke execute on function sync.fila_visible(text, uuid) from public, anon;
grant execute on function sync.fila_visible(text, uuid) to authenticated;

create or replace function public.cambios_desde(p_equipo uuid, p_secreto text, p_desde bigint, p_limite int default 500)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := sync.equipo_valido(p_equipo, p_secreto);
  g record; v_fila jsonb; v_hasta bigint := p_desde; cambios jsonb := '[]';
begin
  for g in select * from sync.registro
            where (org_id = v_org or org_id is null) and seq > p_desde order by seq limit least(greatest(p_limite, 1), 2000) loop
    v_hasta := g.seq;
    v_fila := null;
    if g.op <> 'D' then
      v_fila := sync.fila_visible(g.tabla, g.fila_id);
      continue when v_fila is null; -- no visible para este usuario, o borrada después (llega su D)
    end if;
    cambios := cambios || jsonb_build_array(jsonb_build_object('seq', g.seq, 'tabla', g.tabla, 'fila_id', g.fila_id,
      'op', g.op, 'version', coalesce((v_fila ->> 'version')::bigint, g.version), 'cambio_id', g.cambio_id, 'fila', v_fila));
  end loop;
  return jsonb_build_object('hasta', v_hasta, 'cambios', cambios);
end $$;

create or replace function public.instantanea(p_equipo uuid, p_secreto text, p_tabla text,
                                              p_despues uuid default null, p_limite int default 1000)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := sync.equipo_valido(p_equipo, p_secreto);
  v_seq bigint := (select coalesce(max(seq), 0) from sync.registro);
  v_cols text; v_tiene_id boolean; v_filas jsonb; v_extra text := '';
begin
  if p_tabla not in (select nombre from sync.tablas) and p_tabla not in
     ('public.organizaciones', 'public.perfiles', 'public.listas', 'public.cie10', 'public.precios_empresa', 'public.tasas_bcv') then
    raise exception 'Tabla no disponible para la copia: %', p_tabla;
  end if;
  select string_agg(format('t.%I', column_name), ', ' order by ordinal_position), bool_or(column_name = 'id')
    into v_cols, v_tiene_id
    from information_schema.columns where table_schema || '.' || table_name = p_tabla
     and has_column_privilege(p_tabla, column_name, 'SELECT');
  if p_tabla = 'public.trabajadores' then
    v_extra := ' || coalesce((select jsonb_build_object(''grupo_sanguineo'', s.grupo_sanguineo, ''discapacidad'', s.discapacidad)
                               from public.trabajadores_salud s where s.id = x.id), ''{}'')';
  end if;
  if v_tiene_id then
    execute format('select coalesce(jsonb_agg(f order by f->>''id''), ''[]'') from (
                      select to_jsonb(x)%s f from (select %s from %s t where $1 is null or t.id > $1 order by t.id limit $2) x) y',
                   v_extra, v_cols, p_tabla)
      into v_filas using p_despues, least(greatest(p_limite, 1), 5000);
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (select %s from %s t) x', v_cols, p_tabla) into v_filas;
  end if;
  return jsonb_build_object('seq', v_seq, 'filas', v_filas,
    'ultimo', case when v_tiene_id and jsonb_array_length(v_filas) > 0 then v_filas -> -1 ->> 'id' end);
end $$;

-- ─── 2) Bitácora ───
-- Las filas guardan la copia completa (antes/después). Clínicas: solo admin o gerente médico con acceso clínico.
-- Ficha del trabajador (trae grupo sanguíneo y discapacidad): admin o gerente médico. Auditor: lo demás, de sus empresas.
drop policy if exists bitacora_leer on public.bitacora;
create policy bitacora_leer on public.bitacora for select using (
  case
    when tabla like 'clinico.%' then
      public.mi_rol(org_id) in ('administrador', 'gerente_medico') and public.es_clinico(org_id)
    when tabla = 'public.trabajadores' then
      public.mi_rol(org_id) in ('administrador', 'gerente_medico')
    else
      public.mi_rol(org_id) in ('administrador', 'gerente_medico')
      or (public.mi_rol(org_id) = 'auditor'
          and public.puede_ver_empresa(org_id, nullif(coalesce(despues, antes) ->> case when tabla = 'public.empresas' then 'id' else 'empresa_id' end, '')::uuid))
  end);

-- Trabajadores por empresa (lista de empresas). El embebido trabajadores(count) de PostgREST
-- ya no sirve sin SELECT sobre toda la tabla; esto cuenta con las mismas reglas de acceso (invoker).
create or replace function public.trabajadores_por_empresa()
returns table (empresa_id uuid, total bigint) language sql stable security invoker set search_path = public as $$
  select t.empresa_id, count(*) from public.trabajadores t group by t.empresa_id
$$;
revoke execute on function public.trabajadores_por_empresa() from public, anon;
grant execute on function public.trabajadores_por_empresa() to authenticated;
