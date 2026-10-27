-- zamorApp Ocupacional · Vencimientos de aptitud y examen periódico, accidentabilidad mensual y tablero de inicio
-- 1. Cada empresa define cada cuánto se repite el examen periódico y con cuántos días de anticipación se avisa.
-- 2. ultima_aptitud calcula el próximo examen: la vigencia de la constancia o, si no la tiene, la fecha del
--    último examen más la periodicidad de la empresa. Pacientes, portal, inicio y reportes usan el mismo dato.
-- 3. vencimientos_empresas(): vencidos, por vencer y sin evaluación por empresa (alertas del inicio).
-- 4. reporte_listado: «vencimientos» (trabajador por trabajador) y «accidentalidad» (mes a mes, COVENIN 474:
--    índices de frecuencia neta y bruta y de severidad por millón de horas hombre trabajadas).

alter table public.empresas
  add column if not exists periodicidad_meses smallint not null default 12 check (periodicidad_meses between 1 and 60),
  add column if not exists dias_aviso_examen smallint not null default 30 check (dias_aviso_examen between 0 and 180);

-- Misma vista de 20261026002000_seguridad_clinica.sql, con la columna proximo_examen al final
create or replace view public.ultima_aptitud with (security_invoker = false) as
  select distinct on (a.trabajador_id) a.trabajador_id, a.org_id, c.empresa_id, c.fecha, a.clasificacion, a.vigente_hasta,
         coalesce(a.vigente_hasta, (c.fecha + make_interval(months => coalesce(e.periodicidad_meses, 12)))::date) as proximo_examen
  from clinico.aptitudes a
  join clinico.consultas c on c.id = a.consulta_id
  left join public.empresas e on e.id = c.empresa_id
  where c.estado in ('cerrada', 'firmada')
    and public.puede_ver_empresa(a.org_id, c.empresa_id)
  order by a.trabajador_id, c.fecha desc, a.emitida_en desc;

-- Indicadores del Inicio: ahora con el próximo examen y los días de aviso de cada empresa
create or replace function public.resumen_panel(p_empresa uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (
    select t.id, t.estado, u.clasificacion, u.proximo_examen, e.dias_aviso_examen as aviso
    from public.trabajadores t
    join public.empresas e on e.id = t.empresa_id
    left join public.ultima_aptitud u on u.trabajador_id = t.id
    where p_empresa is null or t.empresa_id = p_empresa
  ),
  hoy as (select (now() at time zone 'America/Caracas')::date d)
  select jsonb_build_object(
    'activos', count(*) filter (where estado in ('activo', 'reposo')),
    'en_reposo', count(*) filter (where estado = 'reposo'),
    'al_dia', count(*) filter (where estado in ('activo', 'reposo') and proximo_examen >= hoy.d),
    'vencidos', count(*) filter (where estado in ('activo', 'reposo') and proximo_examen < hoy.d),
    'por_vencer', count(*) filter (where estado in ('activo', 'reposo') and proximo_examen between hoy.d and hoy.d + aviso),
    'sin_evaluar', count(*) filter (where clasificacion is null and estado not in ('egresado', 'inactivo')),
    'aspirantes', count(*) filter (where clasificacion is null and estado = 'aspirante'),
    'aptitud', jsonb_build_object(
      'elegible', count(*) filter (where clasificacion = 'elegible'),
      'elegible_con_restricciones', count(*) filter (where clasificacion = 'elegible_con_restricciones'),
      'no_elegible', count(*) filter (where clasificacion = 'no_elegible'),
      'espera_resultados', count(*) filter (where clasificacion = 'espera_resultados'),
      'diferido', count(*) filter (where clasificacion = 'diferido')))
  from t, hoy
  group by hoy.d
$$;
grant execute on function public.resumen_panel(uuid) to authenticated;

-- Vencimientos por empresa (trabajadores activos o en reposo). Respeta las reglas de acceso (security invoker).
create or replace function public.vencimientos_empresas()
returns jsonb language sql stable security invoker set search_path = public as $$
  with hoy as (select (now() at time zone 'America/Caracas')::date d)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.vencidos desc, x.por_vencer desc, x.empresa), '[]') from (
    select e.id, e.razon_social as empresa, e.dias_aviso_examen as dias_aviso, e.periodicidad_meses,
           count(t.id) as activos,
           count(t.id) filter (where u.proximo_examen < hoy.d) as vencidos,
           count(t.id) filter (where u.proximo_examen between hoy.d and hoy.d + e.dias_aviso_examen) as por_vencer,
           count(t.id) filter (where u.trabajador_id is null) as sin_evaluar,
           count(t.id) filter (where u.proximo_examen >= hoy.d) as al_dia,
           min(u.proximo_examen) filter (where u.proximo_examen >= hoy.d) as proximo
    from public.empresas e
    cross join hoy
    join public.trabajadores t on t.empresa_id = e.id and t.estado in ('activo', 'reposo')
    left join public.ultima_aptitud u on u.trabajador_id = t.id
    where e.activa
    group by e.id, e.razon_social, e.dias_aviso_examen, e.periodicidad_meses
  ) x
$$;
revoke all on function public.vencimientos_empresas() from public, anon;
grant execute on function public.vencimientos_empresas() to authenticated;

-- reporte_listado COMPLETO (copia de 20261027160000_reportes_bloque4.sql) más «vencimientos» y «accidentalidad»
create or replace function public.reporte_listado(p_tipo text, p_empresa uuid, p_desde date, p_hasta date, p_opciones jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v jsonb;
  -- Potencial discapacidad: días de reposo acumulados en el período que encienden la alerta
  v_umbral int := coalesce((p_opciones ->> 'umbral_dias')::int, 90);
  -- Morbilidad agrupada por 'empresa' o 'dependencia' (como el SAME); vacío = general
  v_agrupar text := coalesce(p_opciones ->> 'agrupar', '');
  -- Reposos: solo los que empiezan en el período (el SAME por defecto incluye los que vienen de antes)
  v_solo_iniciados boolean := coalesce((p_opciones ->> 'solo_iniciados')::boolean, false);
  -- Limitaciones: solo las vigentes hoy (última aptitud de cada trabajador), sin importar el período
  v_vigentes boolean := coalesce((p_opciones ->> 'vigentes')::boolean, false);
  -- Vencimientos: '' = días de aviso de cada empresa; un número de días; 'todos' incluye a los que están al día
  v_horizonte text := coalesce(p_opciones ->> 'horizonte', '');
  -- Accidentabilidad: una fila por empresa y mes, o 'consolidado' (todas las empresas juntas por mes)
  v_nivel text := coalesce(p_opciones ->> 'nivel', '');
  v_hoy date := (now() at time zone 'America/Caracas')::date;
begin
  case p_tipo

  -- Relación de pacientes atendidos: una fila por consulta. El diagnóstico solo aparece para personal de salud.
  when 'atendidos' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.empresa, x.fecha, x.paciente), '[]') into v from (
      select a.id, a.fecha, t.numero_historia as historia, a.cedula, a.paciente,
             extract(year from age(a.fecha, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
             e.razon_social as empresa, dp.nombre as dependencia, a.cargo, a.motivo, a.tipo, a.estado, a.aptitud,
             (select string_agg(d.cie10 || ' ' || d.descripcion, '; ' order by d.principal desc, d.cie10)
                from public.diagnosticos d where d.consulta_id = a.id) as diagnosticos,
             coalesce(pf.nombre_completo, mh.nombre_completo) as medico
      from public.atenciones a
      join public.trabajadores t on t.id = a.trabajador_id
      join public.empresas e on e.id = a.empresa_id
      left join public.consultas c on c.id = a.id
      left join public.dependencias dp on dp.id = coalesce(c.dependencia_id, t.dependencia_id)
      left join public.perfiles pf on pf.id = c.medico_id
      left join public.medicos_historicos mh on mh.id = c.medico_historico_id
      where a.estado <> 'borrador' and a.fecha between p_desde and p_hasta
        and (p_empresa is null or a.empresa_id = p_empresa)
      limit 20000
    ) x;

  -- Morbilidad: una fila por código CIE-10 (y por empresa o dependencia si se pide agrupar) con casos, pacientes,
  -- sexo, grupo etario y origen. "atendidos": pacientes atendidos del grupo, base del % del SAME
  -- (proporción de la población atendida que fue afectada).
  when 'morbilidad' then
    with cons as (
      select c.id, c.fecha, c.trabajador_id, t.sexo, t.fecha_nacimiento,
             case v_agrupar when 'empresa' then e.razon_social
                            when 'dependencia' then coalesce(dp.nombre, 'Sin dependencia') end as grupo
      from public.consultas c
      join public.trabajadores t on t.id = c.trabajador_id
      join public.empresas e on e.id = c.empresa_id
      left join public.dependencias dp on dp.id = coalesce(c.dependencia_id, t.dependencia_id)
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
    ),
    atendidos as (select grupo, count(distinct trabajador_id) as n from cons group by grupo)
    select coalesce(jsonb_agg(to_jsonb(x) order by x.grupo nulls first, x.casos desc, x.cie10), '[]') into v from (
      select c.grupo, d.cie10, min(d.descripcion) as descripcion, coalesce(min(nullif(d.sistema, '')), 'Sin clasificar') as sistema,
             count(*) as casos, count(distinct c.trabajador_id) as pacientes,
             (select n from atendidos a where a.grupo is not distinct from c.grupo) as atendidos,
             count(*) filter (where c.sexo = 'F') as femenino, count(*) filter (where c.sexo = 'M') as masculino,
             count(*) filter (where extract(year from age(c.fecha, c.fecha_nacimiento)) < 18) as e_menor_18,
             count(*) filter (where extract(year from age(c.fecha, c.fecha_nacimiento)) between 18 and 39) as e_18_39,
             count(*) filter (where extract(year from age(c.fecha, c.fecha_nacimiento)) between 40 and 59) as e_40_59,
             count(*) filter (where extract(year from age(c.fecha, c.fecha_nacimiento)) >= 60) as e_60_mas,
             count(*) filter (where d.origen in ('ocupacional', 'accidente_laboral')) as ocupacional,
             count(*) filter (where d.origen in ('comun', 'accidente_comun')) as comun
      from public.diagnosticos d
      join cons c on c.id = d.consulta_id
      group by c.grupo, d.cie10
    ) x;

  -- Diagnósticos: detalle de cada diagnóstico emitido
  when 'diagnosticos' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.paciente, x.principal desc), '[]') into v from (
      select c.id, c.fecha, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             extract(year from age(c.fecha, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
             e.razon_social as empresa, dp.nombre as dependencia, m.nombre as motivo,
             d.cie10, d.descripcion, coalesce(nullif(d.sistema, ''), 'Sin clasificar') as sistema, d.origen, d.principal
      from public.diagnosticos d
      join public.consultas c on c.id = d.consulta_id
      join public.trabajadores t on t.id = c.trabajador_id
      join public.empresas e on e.id = c.empresa_id
      left join public.dependencias dp on dp.id = coalesce(c.dependencia_id, t.dependencia_id)
      left join public.lista_items m on m.id = c.motivo_id
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
      limit 20000
    ) x;

  -- Aptitud emitida (constancias) y limitaciones: una fila por constancia; limitaciones = solo las que tienen restricciones
  when 'aptitud', 'limitaciones' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.empresa, x.fecha, x.paciente), '[]') into v from (
      select c.id, c.fecha, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             extract(year from age(c.fecha, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
             e.razon_social as empresa, dp.nombre as dependencia, pu.nombre as cargo, m.nombre as motivo,
             a.clasificacion as aptitud, array_to_string(a.restricciones, '; ') as restricciones,
             coalesce(array_length(a.restricciones, 1), 0) as n_restricciones,
             a.observacion, a.vigente_hasta, c.conclusiones,
             c.recomendaciones_empresa, c.recomendaciones_trabajador
      from public.aptitudes a
      join public.consultas c on c.id = a.consulta_id
      join public.trabajadores t on t.id = c.trabajador_id
      join public.empresas e on e.id = c.empresa_id
      left join public.dependencias dp on dp.id = coalesce(c.dependencia_id, t.dependencia_id)
      left join public.puestos pu on pu.id = coalesce(c.puesto_id, t.puesto_id)
      left join public.lista_items m on m.id = c.motivo_id
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
        and (p_tipo = 'aptitud' or coalesce(array_length(a.restricciones, 1), 0) > 0 or a.clasificacion = 'elegible_con_restricciones')
        and not (p_tipo = 'limitaciones' and v_vigentes)
      union all
      -- Limitaciones vigentes: la última aptitud de cada trabajador activo, si tiene restricciones y no ha vencido
      select c.id, c.fecha, t.numero_historia, t.cedula, t.nombres || ' ' || t.apellidos,
             extract(year from age(c.fecha, t.fecha_nacimiento))::int, t.sexo::text,
             e.razon_social, dp.nombre, pu.nombre, m.nombre,
             a.clasificacion, array_to_string(a.restricciones, '; '), coalesce(array_length(a.restricciones, 1), 0),
             a.observacion, a.vigente_hasta, c.conclusiones, c.recomendaciones_empresa, c.recomendaciones_trabajador
      from public.trabajadores t
      join lateral (
        select a.* from public.aptitudes a join public.consultas c2 on c2.id = a.consulta_id
        where a.trabajador_id = t.id and c2.estado <> 'borrador'
        order by c2.fecha desc, a.emitida_en desc limit 1
      ) a on true
      join public.consultas c on c.id = a.consulta_id
      join public.empresas e on e.id = t.empresa_id
      left join public.dependencias dp on dp.id = coalesce(c.dependencia_id, t.dependencia_id)
      left join public.puestos pu on pu.id = coalesce(c.puesto_id, t.puesto_id)
      left join public.lista_items m on m.id = c.motivo_id
      where p_tipo = 'limitaciones' and v_vigentes and t.estado in ('activo', 'reposo')
        and (p_empresa is null or t.empresa_id = p_empresa)
        and (coalesce(array_length(a.restricciones, 1), 0) > 0 or a.clasificacion = 'elegible_con_restricciones')
        and (a.vigente_hasta is null or a.vigente_hasta >= current_date)
      limit 20000
    ) x;

  -- Reposos que tocan el período, con los días que caen dentro
  when 'reposos' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.empresa, x.desde, x.paciente), '[]') into v from (
      select r.id, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente, t.sexo::text as sexo,
             e.razon_social as empresa, dp.nombre as dependencia,
             r.causa, r.ente_emisor, r.desde, r.hasta, r.reintegro, r.dias,
             greatest(0, least(r.hasta, p_hasta) - greatest(r.desde, p_desde) + 1) as dias_periodo,
             r.cie10, cx.descripcion as diagnostico, r.validado_ivss, r.medico_externo, r.centro_ivss,
             case when r.dias <= 3 then '1 a 3 días' when r.dias <= 21 then '4 a 21 días'
                  when r.dias <= 90 then '22 a 90 días' else 'Más de 90 días' end as duracion
      from public.reposos r
      join public.trabajadores t on t.id = r.trabajador_id
      join public.empresas e on e.id = t.empresa_id
      left join public.dependencias dp on dp.id = t.dependencia_id
      left join public.cie10 cx on cx.codigo = r.cie10
      where r.desde <= p_hasta and r.hasta >= p_desde
        and (not v_solo_iniciados or r.desde >= p_desde)
        and (p_empresa is null or t.empresa_id = p_empresa)
      limit 20000
    ) x;

  -- Interconsultas (referencias a especialistas)
  when 'interconsultas' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.paciente), '[]') into v from (
      select c.id, c.fecha, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             e.razon_social as empresa, m.nombre as motivo,
             coalesce(nullif(trim(i ->> 'especialidad'), ''), 'Sin especialidad') as especialidad, nullif(trim(i ->> 'motivo'), '') as motivo_referencia
      from public.consultas c
      cross join lateral jsonb_array_elements(coalesce(c.interconsultas, '[]'::jsonb)) i
      join public.trabajadores t on t.id = c.trabajador_id
      join public.empresas e on e.id = c.empresa_id
      left join public.lista_items m on m.id = c.motivo_id
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
      limit 20000
    ) x;

  -- Exámenes aplicados (paraclínicos registrados en las consultas)
  when 'examenes' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.paciente, x.examen), '[]') into v from (
      select c.id, c.fecha, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             e.razon_social as empresa, m.nombre as motivo,
             coalesce(nullif(trim(p ->> 'nombre'), ''), 'Sin nombre') as examen, coalesce(nullif(trim(p ->> 'grupo'), ''), 'Sin grupo') as grupo,
             nullif(trim(p ->> 'resultado'), '') as resultado,
             case when nullif(trim(p ->> 'resultado'), '') is null then 'Pendiente' else 'Con resultado' end as estado_resultado
      from public.consultas c
      cross join lateral jsonb_array_elements(case when jsonb_typeof(c.paraclinicos) = 'array' then c.paraclinicos else '[]'::jsonb end) p
      join public.trabajadores t on t.id = c.trabajador_id
      join public.empresas e on e.id = c.empresa_id
      left join public.lista_items m on m.id = c.motivo_id
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
      limit 20000
    ) x;

  -- Citas del período (agenda y asistencia)
  when 'citas' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.hora nulls last, x.paciente), '[]') into v from (
      select ci.id, ci.fecha, to_char(ci.hora, 'HH24:MI') as hora, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             e.razon_social as empresa, m.nombre as motivo, ci.estado, ci.origen, ci.observacion
      from public.citas ci
      join public.trabajadores t on t.id = ci.trabajador_id
      join public.empresas e on e.id = ci.empresa_id
      left join public.lista_items m on m.id = ci.motivo_id
      where ci.fecha between p_desde and p_hasta
        and (p_empresa is null or ci.empresa_id = p_empresa)
      limit 20000
    ) x;

  -- Estadística médica: por médico y motivo (consultas, pacientes, firmadas y duración promedio)
  when 'estadistica' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.medico, x.consultas desc), '[]') into v from (
      select coalesce(pf.nombre_completo, mh.nombre_completo, 'Sin médico') as medico, coalesce(m.nombre, 'Sin motivo') as motivo,
             count(*) as consultas, count(distinct c.trabajador_id) as pacientes,
             count(*) filter (where c.estado = 'firmada') as firmadas,
             round(avg(extract(epoch from (c.hora_cierre - c.hora_inicio)) / 60)
               filter (where c.hora_cierre > c.hora_inicio and c.hora_cierre - c.hora_inicio < interval '8 hours'))::int as minutos
      from public.consultas c
      left join public.perfiles pf on pf.id = c.medico_id
      left join public.medicos_historicos mh on mh.id = c.medico_historico_id
      left join public.lista_items m on m.id = c.motivo_id
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
      group by 1, 2
    ) x;

  -- Pacientes con potencial discapacidad: discapacidad registrada, reposo acumulado ≥ umbral en el período,
  -- última aptitud no elegible o con restricciones, o diagnóstico de origen ocupacional en el período
  when 'discapacidad' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.empresa, x.dias_reposo desc, x.paciente), '[]') into v from (
      select * from (
        select t.id, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
               extract(year from age(p_hasta, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
               e.razon_social as empresa, pu.nombre as cargo, t.discapacidad,
               coalesce(rp.dias, 0) as dias_reposo, ua.clasificacion as ultima_aptitud, ua.restricciones,
               dx.ocupacionales, pm.nota as nota_medico,
               concat_ws('; ',
                 case when t.discapacidad then 'Discapacidad registrada' end,
                 case when pm.marcada then 'Marcado por el médico' end,
                 case when coalesce(rp.dias, 0) >= v_umbral then coalesce(rp.dias, 0) || ' días de reposo' end,
                 case when ua.clasificacion = 'no_elegible' then 'No elegible' when ua.clasificacion = 'elegible_con_restricciones' then 'Con restricciones' end,
                 case when dx.ocupacionales is not null then 'Diagnóstico ocupacional' end) as criterios
        from public.trabajadores t
        join public.empresas e on e.id = t.empresa_id
        left join public.puestos pu on pu.id = t.puesto_id
        left join lateral (
          select sum(greatest(0, least(r.hasta, p_hasta) - greatest(r.desde, p_desde) + 1)) as dias
          from public.reposos r where r.trabajador_id = t.id and r.desde <= p_hasta and r.hasta >= p_desde
            and r.causa not in ('prenatal', 'postnatal', 'paternidad', 'lactancia')
        ) rp on true
        left join lateral (
          select a.clasificacion, array_to_string(a.restricciones, '; ') as restricciones
          from public.aptitudes a join public.consultas c on c.id = a.consulta_id
          where a.trabajador_id = t.id and c.estado <> 'borrador' and c.fecha <= p_hasta
          order by c.fecha desc, a.emitida_en desc limit 1
        ) ua on true
        left join lateral (
          select string_agg(distinct d.cie10 || ' ' || d.descripcion, '; ') as ocupacionales
          from public.diagnosticos d join public.consultas c on c.id = d.consulta_id
          where c.trabajador_id = t.id and c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
            and d.origen in ('ocupacional', 'accidente_laboral')
        ) dx on true
        -- Criterio del médico: la última consulta cerrada o firmada del período
        left join lateral (
          select c.potencial_discapacidad as marcada, c.discapacidad_nota as nota from public.consultas c
          where c.trabajador_id = t.id and c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
          order by c.fecha desc, c.hora_inicio desc limit 1
        ) pm on true
        where t.estado in ('activo', 'reposo')
          and (p_empresa is null or t.empresa_id = p_empresa)
      ) y
      where y.criterios <> ''
      limit 20000
    ) x;

  -- Padrón de pacientes: trabajadores con su última consulta y su aptitud vigente (no depende del período)
  when 'pacientes' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.empresa, x.paciente), '[]') into v from (
      select t.id, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             extract(year from age(current_date, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
             e.razon_social as empresa, dp.nombre as dependencia, pu.nombre as cargo, tp.nombre as tipo_paciente,
             t.turno, t.fecha_ingreso, t.estado::text as estado, uc.fecha as ultima_consulta, um.nombre as ultimo_motivo,
             t.fecha_nacimiento, t.lugar_nacimiento, t.nivel_educativo, t.profesion, t.tipo_contrato::text as tipo_contrato, t.ficha,
             t.fecha_egreso, t.grupo_sanguineo, t.lateralidad, t.discapacidad, t.telefono, t.correo, t.direccion, t.autoriza_envio_resultados,
             ap.clasificacion as aptitud, ap.vigente_hasta,
             -- Vigilancia clínica (como el SAME): por diagnósticos de toda la historia, ocupacionales primero
             (select case when bool_or(d.origen in ('ocupacional', 'accidente_laboral')) then 'Origen ocupacional'
                          when count(*) > 0 then 'Origen no ocupacional' end
                from public.diagnosticos d join public.consultas c on c.id = d.consulta_id
                where c.trabajador_id = t.id and c.estado <> 'borrador') as vigilancia
      from public.trabajadores t
      join public.empresas e on e.id = t.empresa_id
      left join public.dependencias dp on dp.id = t.dependencia_id
      left join public.puestos pu on pu.id = t.puesto_id
      left join public.lista_items tp on tp.id = t.tipo_paciente_id
      left join public.ultima_consulta uc on uc.trabajador_id = t.id
      left join public.lista_items um on um.id = uc.motivo_id
      left join lateral (
        select a.clasificacion, a.vigente_hasta from public.aptitud_trabajadores a
        where a.trabajador_id = t.id order by a.fecha desc limit 1
      ) ap on true
      where (p_empresa is null or t.empresa_id = p_empresa)
        and (coalesce(p_opciones ->> 'estado', '') = '' or t.estado::text = p_opciones ->> 'estado')
      limit 20000
    ) x;

  -- Producción por médico: una fila por médico (incluye los médicos históricos del SAME)
  when 'medicos' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.consultas desc, x.medico), '[]') into v from (
      select coalesce(pf.nombre_completo, mh.nombre_completo, 'Sin médico') as medico,
             count(*) as consultas, count(distinct c.trabajador_id) as pacientes, count(distinct c.empresa_id) as empresas,
             count(*) filter (where c.tipo = 'primera') as primera, count(*) filter (where c.tipo = 'sucesiva') as sucesiva,
             count(*) filter (where c.tipo = 'derivada') as derivada, count(*) filter (where c.estado = 'firmada') as firmadas,
             count(a.clasificacion) as aptitudes, count(*) filter (where a.clasificacion in ('elegible_con_restricciones', 'no_elegible')) as restringidas,
             coalesce(sum(r.n), 0) as reposos, coalesce(sum(r.dias), 0) as dias_reposo,
             coalesce(sum(jsonb_array_length(case when jsonb_typeof(c.interconsultas) = 'array' then c.interconsultas else '[]'::jsonb end)), 0) as interconsultas,
             count(distinct c.fecha) as dias_trabajados,
             round(avg(extract(epoch from (c.hora_cierre - c.hora_inicio)) / 60)
               filter (where c.hora_cierre > c.hora_inicio and c.hora_cierre - c.hora_inicio < interval '8 hours'))::int as minutos
      from public.consultas c
      left join public.perfiles pf on pf.id = c.medico_id
      left join public.medicos_historicos mh on mh.id = c.medico_historico_id
      -- Una fila por consulta: aptitud y reposos se resumen aparte para no duplicar conteos
      left join lateral (select a.clasificacion from public.aptitudes a where a.consulta_id = c.id order by a.emitida_en desc limit 1) a on true
      left join lateral (select count(*) as n, sum(r.dias) as dias from public.reposos r where r.consulta_id = c.id) r on true
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
      group by 1
    ) x;

  -- Diagnósticos de declaración obligatoria: enfermedades de notificación obligatoria (lista editable, MPPS)
  -- y diagnósticos de origen ocupacional o por accidente laboral (declaración ante el INPSASEL, LOPCYMAT art. 73).
  -- «evento»: el accidente o enfermedad registrado para ese trabajador alrededor de la fecha, si existe.
  when 'declaracion' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.paciente), '[]') into v from (
      select c.id, c.fecha, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             extract(year from age(c.fecha, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
             e.razon_social as empresa, d.cie10, d.descripcion, d.origen,
             case when l.grupo = 'inmediata' then 'EDO inmediata (MPPS)' when l.id is not null then 'EDO semanal (MPPS)'
                  when d.origen = 'accidente_laboral' then 'Accidente de trabajo (INPSASEL)'
                  else 'Enfermedad ocupacional (INPSASEL)' end as notificacion,
             case when l.grupo = 'inmediata' then 'Inmediata, 24 horas' when l.id is not null then 'Semanal (EPI-12)'
                  else '24 horas (LOPCYMAT art. 73)' end as plazo,
             ev.numero as evento, ev.fecha_declaracion is not null as declarado
      from public.diagnosticos d
      join public.consultas c on c.id = d.consulta_id
      join public.trabajadores t on t.id = c.trabajador_id
      join public.empresas e on e.id = c.empresa_id
      left join lateral (
        select li.id, li.grupo from public.lista_items li
        where li.lista = 'diagnostico_declarable' and li.org_id = c.org_id and li.activo
          and li.codigo is not null and upper(d.cie10) like upper(li.codigo) || '%'
        order by (li.grupo = 'inmediata') desc, length(li.codigo) desc limit 1
      ) l on true
      left join lateral (
        select ev.numero, ev.fecha_declaracion from public.eventos ev
        where ev.trabajador_id = c.trabajador_id and ev.tipo in ('accidente', 'enfermedad')
          and ev.fecha_hora::date between c.fecha - 30 and c.fecha + 30
        order by abs(ev.fecha_hora::date - c.fecha) limit 1
      ) ev on true
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
        and (p_empresa is null or c.empresa_id = p_empresa)
        and (l.id is not null or d.origen in ('ocupacional', 'accidente_laboral'))
      limit 20000
    ) x;

  -- Vencimientos de aptitud y examen periódico: activos y en reposo, con su próximo examen (no depende del período)
  when 'vencimientos' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.dias nulls first, x.empresa, x.paciente), '[]') into v from (
      select t.id, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
             e.razon_social as empresa, dp.nombre as dependencia, pu.nombre as cargo, t.fecha_ingreso,
             t.estado::text as estado, ua.fecha as ultimo_examen, ua.clasificacion as aptitud,
             ua.proximo_examen as vence, ua.proximo_examen - v_hoy as dias,
             case when ua.trabajador_id is null then 'Sin evaluación'
                  when ua.proximo_examen < v_hoy then 'Vencido'
                  when ua.proximo_examen <= v_hoy + case when v_horizonte ~ '^[0-9]+$' then v_horizonte::int else e.dias_aviso_examen end then 'Por vencer'
                  else 'Al día' end as situacion,
             case when ua.vigente_hasta is not null then 'Vigencia de la constancia'
                  when ua.trabajador_id is not null then 'Periódico cada ' || e.periodicidad_meses || ' meses' end as base
      from public.trabajadores t
      join public.empresas e on e.id = t.empresa_id
      left join public.dependencias dp on dp.id = t.dependencia_id
      left join public.puestos pu on pu.id = t.puesto_id
      left join public.ultima_aptitud ua on ua.trabajador_id = t.id
      where t.estado in ('activo', 'reposo')
        and (p_empresa is null or t.empresa_id = p_empresa)
        and (v_horizonte = 'todos' or ua.trabajador_id is null
             or ua.proximo_examen <= v_hoy + case when v_horizonte ~ '^[0-9]+$' then v_horizonte::int else e.dias_aviso_examen end)
      limit 20000
    ) x;

  -- Accidentabilidad mensual (COVENIN 474): horas hombre de la nómina cargada o, si falta el mes, estimadas
  -- (activos × 8 h × días hábiles, 5.2). Días cargados como en indices_accidentalidad.
  when 'accidentalidad' then
    with meses as (
      select m::date as mes from generate_series(date_trunc('month', p_desde), p_hasta, interval '1 month') m
    ),
    emp as (
      select e.id, e.razon_social,
             (select count(*) from public.trabajadores t where t.empresa_id = e.id and t.estado in ('activo', 'reposo')) as activos
      from public.empresas e
      where p_empresa is null or e.id = p_empresa
    ),
    base as (
      select m.mes, e.razon_social as empresa,
             coalesce(h.trabajadores, e.activos) as trabajadores,
             coalesce(h.horas, e.activos * 8 * (
               select count(*) from generate_series(m.mes, (m.mes + interval '1 month' - interval '1 day')::date, interval '1 day') d
               where extract(isodow from d) < 6)) as hht,
             case when h.id is null then 'Estimado automático' when h.metodo = 'nomina' then 'Nómina' else 'Estimado' end as metodo,
             ev.accidentes, ev.con_tiempo_perdido, ev.incidentes, ev.enfermedades, ev.dias_perdidos, ev.dias_cargados
      from meses m
      cross join emp e
      left join public.horas_trabajadas h on h.empresa_id = e.id and h.mes = m.mes
      left join lateral (
        select count(*) filter (where ev.tipo = 'accidente') as accidentes,
               count(*) filter (where ev.tipo = 'accidente' and ev.con_tiempo_perdido) as con_tiempo_perdido,
               count(*) filter (where ev.tipo = 'incidente') as incidentes,
               count(*) filter (where ev.tipo = 'enfermedad') as enfermedades,
               coalesce(sum(ev.dias_perdidos) filter (where ev.tipo = 'accidente'), 0) as dias_perdidos,
               coalesce(sum(case when ev.incapacidad = 'parcial_permanente' then greatest(ev.dias_cargados - ev.dias_perdidos, 0)
                                 else ev.dias_cargados end) filter (where ev.tipo = 'accidente'), 0) as dias_cargados
        from public.eventos ev
        where ev.empresa_id = e.id
          and (ev.fecha_hora at time zone 'America/Caracas')::date >= m.mes
          and (ev.fecha_hora at time zone 'America/Caracas')::date < m.mes + interval '1 month'
      ) ev on true
      where e.activos > 0 or h.id is not null or ev.accidentes + ev.incidentes + ev.enfermedades > 0
    ),
    agrupado as (
      select mes, case when v_nivel = 'consolidado' then 'Todas las empresas' else empresa end as empresa,
             sum(trabajadores)::int as trabajadores, sum(hht) as hht,
             case when count(distinct metodo) = 1 then min(metodo) else 'Mixto' end as metodo,
             sum(accidentes)::int as accidentes, sum(con_tiempo_perdido)::int as con_tiempo_perdido,
             sum(accidentes - con_tiempo_perdido)::int as sin_tiempo_perdido,
             sum(incidentes)::int as incidentes, sum(enfermedades)::int as enfermedades,
             sum(dias_perdidos)::int as dias_perdidos, sum(dias_cargados)::int as dias_cargados
      from base
      group by 1, 2
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.mes, x.empresa), '[]') into v from (
      select to_char(a.mes, 'YYYY-MM') as mes,
             (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from a.mes)::int]
               || ' ' || extract(year from a.mes)::int as periodo,
             a.empresa, a.trabajadores, round(a.hht)::bigint as hht, a.metodo,
             a.accidentes, a.con_tiempo_perdido, a.sin_tiempo_perdido, a.incidentes, a.enfermedades,
             a.dias_perdidos, a.dias_cargados,
             round(a.con_tiempo_perdido * 1000000.0 / nullif(a.hht, 0), 2) as ifn,
             round(a.accidentes * 1000000.0 / nullif(a.hht, 0), 2) as ifb,
             round((a.dias_perdidos + a.dias_cargados) * 1000000.0 / nullif(a.hht, 0), 2) as isev,
             round((a.dias_perdidos + a.dias_cargados)::numeric / nullif(a.con_tiempo_perdido, 0), 1) as dias_por_lesion
      from agrupado a
    ) x;

  else
    raise exception 'Reporte desconocido: %', p_tipo;
  end case;
  return v;
end
$$;

revoke all on function public.reporte_listado(text, uuid, date, date, jsonb) from public, anon;
grant execute on function public.reporte_listado(text, uuid, date, date, jsonb) to authenticated;
