-- Reportes por la puerta para agentes (parte 2 de «vigilancia por agentes», Cesar 14-nov-2026: «que me saquen las
-- relaciones de pacientes atendidos, las estadísticas y todo lo que tiene que ver con reportes»).
-- Acción nueva «ver_reporte» de public.puerta_vigilancia (casilla «Vigilancia y reportes» de la llave).
-- Reglas (las mismas de la puerta): nunca diagnósticos, aptitudes ni datos de salud de una persona.
--   · Listas con personas, sin columnas clínicas: atendidos, citas, pacientes (padrón), vencimientos.
--   · Cifras de gestión sin personas: relacion, estadistica, medicos, accidentalidad, dias-atencion.
--   · Reportes clínicos, SOLO totales agrupados (grupos de menos de 3 → «Otros»): aptitud, limitaciones, reposos,
--     interconsultas, examenes, enfermeria.
--   · Nunca: morbilidad y diagnósticos (van agrupados en vigilancia_cifras), discapacidad, tensión, declaración,
--     morbilidad de enfermería y unida.
-- Las columnas se eligen AQUÍ (lista cerrada por reporte): lo que no está en la lista no sale aunque el reporte lo traiga.

-- ===== 1. Proyección: solo las columnas permitidas, hasta 1000 filas =====
create or replace function public.agente_rep_columnas(p_filas jsonb, p_cols text[], p_max int default 1000)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'columnas', to_jsonb(p_cols),
    'total', jsonb_array_length(f),
    'recortado', jsonb_array_length(f) > p_max,
    'filas', coalesce((select jsonb_agg((select coalesce(jsonb_object_agg(c, e -> c), '{}'::jsonb) from unnest(p_cols) c where e ? c) order by o)
                       from jsonb_array_elements(f) with ordinality a(e, o) where o <= p_max), '[]'::jsonb))
  from (select case when jsonb_typeof(p_filas) = 'array' then p_filas else '[]'::jsonb end as f) x
$$;

-- Conteo de filas por una columna, con supresión (menos de 3 → «Otros»): para los reportes clínicos
create or replace function public.agente_rep_contar(p_filas jsonb, p_por text, p_suma text default null, p_sensible boolean default false)
returns jsonb language sql immutable set search_path = public as $$
  select public.agente_vig_lista(coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nombre', g, 'n', n, 'dias', s)) order by n desc), '[]'::jsonb), 'nombre', p_sensible)
  from (
    select coalesce(nullif(btrim(e ->> p_por), ''), 'Sin dato') as g, count(*) as n,
           case when p_suma is not null then sum(coalesce((e ->> p_suma)::numeric, 0)) end as s
    from jsonb_array_elements(case when jsonb_typeof(p_filas) = 'array' then p_filas else '[]'::jsonb end) e
    group by 1
  ) x
$$;

-- Conteo simple por columna, sin supresión (cifras de gestión sin datos de salud: motivo de consulta, médico, dependencia)
create or replace function public.agente_rep_por(p_filas jsonb, p_por text)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', g, 'consultas', n, 'pacientes', p) order by n desc, g), '[]'::jsonb)
  from (
    select coalesce(nullif(btrim(e ->> p_por), ''), 'Sin dato') as g, count(*) as n, count(distinct e ->> 'cedula') as p
    from jsonb_array_elements(case when jsonb_typeof(p_filas) = 'array' then p_filas else '[]'::jsonb end) e
    group by 1
  ) x
$$;

-- ===== 2. El reporte =====
create or replace function public.agente_vig_reporte(p_org uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_clave text := lower(btrim(coalesce(d ->> 'reporte', '')));
  v_hoy date := public.hoy_caracas();
  per record;
  v jsonb;
  v_res jsonb;
  v_padron boolean;
begin
  if v_clave in ('morbilidad', 'diagnosticos') then
    perform public.agente_no('La morbilidad y los diagnósticos salen agrupados, sin personas, en vigilancia_cifras (primeras causas por sistema).');
  elsif v_clave not in ('atendidos', 'relacion', 'estadistica', 'medicos', 'citas', 'pacientes', 'vencimientos', 'accidentalidad',
                        'dias-atencion', 'aptitud', 'limitaciones', 'reposos', 'interconsultas', 'examenes', 'enfermeria') then
    -- Lo que no está en la lista (incluidos los reportes con datos de salud de personas) no sale por la puerta
    perform public.agente_no('Ese reporte no está para agentes (o trae datos de salud de personas: solo lo ve el doctor en zamorApp). Los que hay: atendidos, relacion, estadistica, medicos, citas, pacientes, vencimientos, accidentalidad, dias-atencion, aptitud, limitaciones, reposos, interconsultas, examenes, enfermeria.');
  end if;
  -- El padrón y los vencimientos no dependen del período
  v_padron := v_clave in ('pacientes', 'vencimientos');
  if v_padron and not (d ? 'desde' or d ? 'trimestre') then
    d := d || jsonb_build_object('desde', v_hoy, 'hasta', v_hoy);
  end if;
  select * into per from public.agente_vig_periodo(p_org, d);

  v_res := case v_clave
    -- Listas con personas: solo columnas sin datos de salud (sin aptitud ni diagnósticos)
    when 'atendidos' then public.agente_rep_columnas(public.reporte_listado('atendidos', per.empresa_id, per.desde, per.hasta),
      array['fecha', 'historia', 'cedula', 'paciente', 'edad', 'sexo', 'empresa', 'dependencia', 'cargo', 'motivo', 'medico'])
    when 'citas' then public.agente_rep_columnas(public.reporte_listado('citas', per.empresa_id, per.desde, per.hasta),
      array['fecha', 'hora', 'cedula', 'paciente', 'empresa', 'motivo', 'estado'])
    when 'pacientes' then public.agente_rep_columnas(public.reporte_listado('pacientes', per.empresa_id, per.desde, per.hasta),
      array['historia', 'cedula', 'paciente', 'edad', 'sexo', 'empresa', 'dependencia', 'cargo', 'tipo_paciente', 'turno',
            'fecha_ingreso', 'estado', 'ultima_consulta', 'tipo_contrato', 'fecha_egreso'])
    when 'vencimientos' then public.agente_rep_columnas(public.reporte_indicadores('vencimientos', per.empresa_id, per.desde, per.hasta,
        jsonb_build_object('horizonte', coalesce(nullif(d ->> 'horizonte', ''), ''))),
      array['historia', 'cedula', 'paciente', 'empresa', 'dependencia', 'cargo', 'estado', 'ultimo_examen', 'vence', 'dias', 'situacion', 'fecha_ingreso'])
    -- Cifras de gestión, sin personas
    when 'estadistica' then public.agente_rep_columnas(public.reporte_listado('estadistica', per.empresa_id, per.desde, per.hasta),
      array['medico', 'motivo', 'consultas', 'pacientes', 'firmadas', 'minutos'])
    when 'medicos' then public.agente_rep_columnas(public.reporte_listado('medicos', per.empresa_id, per.desde, per.hasta),
      array['medico', 'consultas', 'pacientes', 'empresas', 'primera', 'sucesiva', 'derivada', 'firmadas', 'aptitudes', 'restringidas',
            'reposos', 'dias_reposo', 'interconsultas', 'dias_trabajados', 'minutos'])
    when 'accidentalidad' then public.agente_rep_columnas(public.reporte_indicadores('accidentalidad', per.empresa_id, per.desde, per.hasta, '{}'::jsonb),
      array['periodo', 'empresa', 'trabajadores', 'hht', 'metodo', 'accidentes', 'con_tiempo_perdido', 'sin_tiempo_perdido', 'dias_perdidos',
            'dias_cargados', 'ifn', 'ifb', 'isev', 'dias_por_lesion', 'incidentes', 'enfermedades'])
    when 'dias-atencion' then public.agente_rep_columnas(public.reporte_enfermeria('dias', per.empresa_id, per.desde, per.hasta, '{}'::jsonb),
      array['fecha', 'empresa', 'atendio', 'consultas_medico', 'pacientes_medico', 'atenciones_enfermeria', 'pacientes_enfermeria'])
    else null
  end;

  if v_res is null then
    if v_clave = 'relacion' then
      v := public.reporte_listado('atendidos', per.empresa_id, per.desde, per.hasta);
      v_res := jsonb_build_object(
        'consultas', jsonb_array_length(v),
        'pacientes', (select count(distinct e ->> 'cedula') from jsonb_array_elements(v) e),
        'por_motivo', public.agente_rep_por(v, 'motivo'),
        'por_medico', public.agente_rep_por(v, 'medico'),
        'por_dependencia', public.agente_rep_por(v, 'dependencia'));
    -- Reportes clínicos: solo totales agrupados, con supresión
    elsif v_clave in ('aptitud', 'limitaciones') then
      v := public.reporte_listado(v_clave, per.empresa_id, per.desde, per.hasta);
      v_res := jsonb_build_object('total', public.agente_vig_n(jsonb_array_length(v)), 'por_aptitud', public.agente_rep_contar(v, 'aptitud'));
    elsif v_clave = 'reposos' then
      v := public.reporte_listado('reposos', per.empresa_id, per.desde, per.hasta);
      v_res := jsonb_build_object('total', public.agente_vig_n(jsonb_array_length(v)),
        'dias', (select sum(coalesce((e ->> 'dias_periodo')::numeric, (e ->> 'dias')::numeric, 0)) from jsonb_array_elements(v) e),
        'por_causa', public.agente_rep_contar(v, 'causa', 'dias_periodo', true),  -- prenatal, postnatal, lactancia: confidenciales
        'por_dependencia', public.agente_rep_contar(v, 'dependencia', 'dias_periodo'));
    elsif v_clave = 'interconsultas' then
      v := public.reporte_listado('interconsultas', per.empresa_id, per.desde, per.hasta);
      v_res := jsonb_build_object('total', public.agente_vig_n(jsonb_array_length(v)), 'por_especialidad', public.agente_rep_contar(v, 'especialidad', null, true));
    elsif v_clave = 'examenes' then
      v := public.reporte_listado('examenes', per.empresa_id, per.desde, per.hasta);
      v_res := jsonb_build_object('total', public.agente_vig_n(jsonb_array_length(v)), 'por_grupo', public.agente_rep_contar(v, 'grupo', null, true));
    elsif v_clave = 'enfermeria' then
      v := public.reporte_enfermeria('atenciones', per.empresa_id, per.desde, per.hasta, '{}'::jsonb);
      v_res := jsonb_build_object('total', public.agente_vig_n(jsonb_array_length(v)), 'por_tipo', public.agente_rep_contar(v, 'tipo'));
    end if;
    if v_clave <> 'relacion' then v_res := v_res || jsonb_build_object('reglas', 'Solo totales: los grupos de menos de 3 van juntos en «Otros» y "<3" es 1 o 2. No nombres casos ni personas.'); end if;
  end if;

  return jsonb_build_object('_empresa', per.empresa_id, '_resumen', 'Reporte ' || v_clave,
    'reporte', v_clave, 'empresa_id', per.empresa_id,
    'desde', case when v_padron then null else per.desde end, 'hasta', case when v_padron then null else per.hasta end,
    'ruta', '/reportes/' || v_clave) || v_res;
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.agente_rep_columnas(jsonb, text[], integer)', 'public.agente_rep_contar(jsonb, text, text, boolean)',
                           'public.agente_rep_por(jsonb, text)', 'public.agente_vig_reporte(uuid, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ===== 3. La puerta de vigilancia suma «ver_reporte» (lectura) =====
do $$
declare
  v_def text := replace(pg_get_functiondef('public.puerta_vigilancia(text, text, jsonb, boolean)'::regprocedure), chr(13), '');
  v_lee text := '''ver_informe'', ''ver_propuestas'') then false';
  v_hace text := 'when ''ver_propuestas'' then public.agente_vig_ver_propuestas(k.org_id, k.id, d)';
  v_lista text := 'Las de vigilancia: vigilancia_cifras,';
begin
  if position('ver_reporte' in v_def) > 0 then return; end if;  -- repetir la migración no la suma dos veces
  if (length(v_def) - length(replace(v_def, v_lee, ''))) / length(v_lee) <> 1
     or (length(v_def) - length(replace(v_def, v_hace, ''))) / length(v_hace) <> 1
     or (length(v_def) - length(replace(v_def, v_lista, ''))) / length(v_lista) <> 1 then
    raise exception 'puerta_vigilancia cambió: revisar 20261030964000 antes de aplicarla';
  end if;
  v_def := replace(v_def, v_lee, '''ver_informe'', ''ver_propuestas'', ''ver_reporte'') then false');
  v_def := replace(v_def, v_hace, v_hace || '
        when ''ver_reporte'' then public.agente_vig_reporte(k.org_id, d)');
  v_def := replace(v_def, v_lista, 'Las de vigilancia: ver_reporte, vigilancia_cifras,');
  execute v_def;
end $$;

-- ===== 4. Embarazo y parto nunca salen por nombre (revisión de Analizar, 14-nov) =====
-- Las causas de reposo son códigos (prenatal, postnatal, lactancia) que el filtro de la 960 no atrapaba, y en
-- vigilancia_cifras › ausentismo › por_causa no se pedía el filtro. Ambos se parchean por texto, con guarda.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.agente_vig_lista(jsonb, text, boolean)'::regprocedure), chr(13), '');
  v_ancla text := 'mental|comportamiento|embarazo|parto|puerperio|vih|inmunodeficiencia';
begin
  if position('prenatal' in v_def) > 0 then return; end if;  -- repetir la migración no la suma dos veces
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'agente_vig_lista cambió: revisar 20261030964000 antes de aplicarla';
  end if;
  execute replace(v_def, v_ancla, v_ancla || '|prenatal|postnatal|lactancia|maternidad|obstetric');
end $$;

do $$
declare
  v_def text := replace(pg_get_functiondef('public.agente_vig_cifras(uuid, jsonb)'::regprocedure), chr(13), '');
  v_ancla text := '''por_causa'', public.agente_vig_lista(r #> ''{ausentismo,por_causa}'')';
begin
  if position('{ausentismo,por_causa}'', ''nombre'', true)' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'agente_vig_cifras cambió: revisar 20261030964000 antes de aplicarla';
  end if;
  execute replace(v_def, v_ancla, '''por_causa'', public.agente_vig_lista(r #> ''{ausentismo,por_causa}'', ''nombre'', true)');
end $$;
