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
               e.razon_social as empresa, pu.nombre as cargo, (select s.discapacidad from public.trabajadores_salud s where s.id = t.id) as discapacidad,
               coalesce(rp.dias, 0) as dias_reposo, ua.clasificacion as ultima_aptitud, ua.restricciones,
               dx.ocupacionales, pm.nota as nota_medico,
               concat_ws('; ',
                 case when (select s.discapacidad from public.trabajadores_salud s where s.id = t.id) then 'Discapacidad registrada' end,
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
             t.fecha_egreso, (select s.grupo_sanguineo from public.trabajadores_salud s where s.id = t.id) as grupo_sanguineo, t.lateralidad,
             (select s.discapacidad from public.trabajadores_salud s where s.id = t.id) as discapacidad, t.telefono, t.correo, t.direccion, t.autoriza_envio_resultados,
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

  else
    raise exception 'Reporte desconocido: %', p_tipo;
  end case;
  return v;
end
$$;

create or replace function public.reporte_vigilancia(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with
dias_periodo as (select (p_hasta - p_desde + 1)::numeric as n),
trab as (
  -- columnas explícitas: grupo sanguíneo y discapacidad solo llegan al personal de salud (vista trabajadores_salud)
  select t.id, t.org_id, t.empresa_id, t.sede_id, t.dependencia_id, t.puesto_id, t.numero_historia, t.cedula, t.nombres, t.apellidos, t.sexo, t.fecha_nacimiento, t.lugar_nacimiento, t.nivel_educativo, t.profesion, t.tipo_paciente_id, t.tipo_contrato, t.ficha, t.fecha_ingreso, t.fecha_egreso, t.turno, t.lateralidad, t.telefono, t.correo, t.direccion, t.foto_url, t.estado, t.autoriza_envio_resultados, t.creado_en, t.actualizado_en, t.origen, t.codigo_origen, t.lote_importacion, t.version,
         coalesce((select s.discapacidad from public.trabajadores_salud s where s.id = t.id), false) as discapacidad
  from public.trabajadores t
  where (p_empresa is null or t.empresa_id = p_empresa)
),
poblacion as (
  select * from trab
  where estado in ('activo', 'reposo')
     or (estado = 'egresado' and coalesce(fecha_egreso, p_hasta) >= p_desde)
),
-- Grupos etarios del formato INPSASEL / SAME
cons as (
  select c.*, t.sexo, t.fecha_nacimiento, t.tipo_paciente_id, m.nombre as motivo, m.grupo as motivo_grupo,
         coalesce(c.dependencia_id, t.dependencia_id) as dep_id,
         case when t.fecha_nacimiento is null then 'Sin dato'
              when extract(year from age(c.fecha, t.fecha_nacimiento)) < 18 then '12-17'
              when extract(year from age(c.fecha, t.fecha_nacimiento)) < 40 then '18-39'
              when extract(year from age(c.fecha, t.fecha_nacimiento)) < 60 then '40-59'
              else '60 y más' end as edad
  from public.consultas c
  join trab t on t.id = c.trabajador_id
  left join public.lista_items m on m.id = c.motivo_id
  where c.fecha between p_desde and p_hasta
),
diag as (
  select d.*, c.sexo, c.tipo, c.edad, c.motivo, c.motivo_grupo, c.trabajador_id,
         coalesce(dp.nombre, 'Sin dependencia') as dependencia
  from public.diagnosticos d
  join cons c on c.id = d.consulta_id
  left join public.dependencias dp on dp.id = c.dep_id
),
-- Diez primeras causas por cada corte (tipo de consulta, origen, sexo, edad, sistema, actividad, motivo, dependencia)
cortes as (
  select k.grupo, k.clave, d.cie10, min(d.descripcion) as descripcion, count(*) as n, count(distinct d.trabajador_id) as pacientes
  from diag d
  cross join lateral (values
    ('tipo', d.tipo),
    ('origen', d.origen),
    ('sexo', coalesce(d.sexo::text, 'Sin dato')),
    ('edad', d.edad),
    ('sistema', coalesce(nullif(d.sistema, ''), 'Sin clasificar')),
    ('actividad', case when d.motivo_grupo = 'preventivo' then 'preventiva' else 'no_preventiva' end),
    ('motivo', coalesce(d.motivo, 'Sin motivo')),
    ('dependencia', d.dependencia)
  ) as k (grupo, clave)
  group by 1, 2, 3
),
cortes_top as (
  select *, row_number() over (partition by grupo, clave order by n desc, cie10) as puesto from cortes
),
rep as (
  select r.*, t.dependencia_id,
    greatest(0, (least(r.hasta, p_hasta) - greatest(r.desde, p_desde) + 1)) as dias_en_periodo
  from public.reposos r
  join trab t on t.id = r.trabajador_id
  where r.desde <= p_hasta and r.hasta >= p_desde
),
apt as (
  select a.clasificacion from public.aptitudes a join cons c on c.id = a.consulta_id
),
refs as (
  select coalesce(nullif(trim(i ->> 'especialidad'), ''), 'Sin especialidad') as especialidad
  from cons c cross join lateral jsonb_array_elements(coalesce(c.interconsultas, '[]'::jsonb)) i
),
ev as (
  select e.* from public.eventos e
  where (p_empresa is null or e.empresa_id = p_empresa)
),
-- Diagnósticos de toda la historia de la población (vigilancia clínica: no depende del período)
diag_historia as (
  select distinct c.trabajador_id, d.origen
  from public.diagnosticos d
  join public.consultas c on c.id = d.consulta_id
  join poblacion p on p.id = c.trabajador_id
)
select jsonb_build_object(
  'poblacion', jsonb_build_object(
    'total', (select count(*) from poblacion),
    'femenino', (select count(*) from poblacion where sexo = 'F'),
    'masculino', (select count(*) from poblacion where sexo = 'M'),
    'discapacidad', (select count(*) from poblacion where discapacidad),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(li.nombre, 'Sin tipo'), 'n', x.n) order by x.n desc)
      from (select tipo_paciente_id, count(*) n from poblacion group by 1) x left join public.lista_items li on li.id = x.tipo_paciente_id), '[]'),
    'vigilancia_ocupacional', (select count(distinct trabajador_id) from diag_historia where origen in ('ocupacional', 'accidente_laboral')),
    'vigilancia_no_ocupacional', (select count(distinct trabajador_id) from diag_historia where origen in ('comun', 'accidente_comun'))
  ),
  'consultas', jsonb_build_object(
    'total', (select count(*) from cons),
    'pacientes', (select count(distinct trabajador_id) from cons),
    'preventivas', (select count(*) from cons where motivo_grupo = 'preventivo'),
    'no_preventivas', (select count(*) from cons where coalesce(motivo_grupo, '') <> 'preventivo'),
    'sanos', (select count(*) from cons where sano),
    'patologicos', (select count(*) from cons c where exists (select 1 from diag d where d.consulta_id = c.id)),
    'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(motivo, 'Sin motivo'), 'grupo', motivo_grupo, 'n', n) order by n desc)
      from (select motivo, motivo_grupo, count(*) n from cons group by 1, 2) x), '[]'),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from cons group by 1) x), '{}'),
    'por_tipo_paciente', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(li.nombre, 'Sin tipo'), 'n', x.n) order by x.n desc)
      from (select tipo_paciente_id, count(*) n from cons group by 1) x left join public.lista_items li on li.id = x.tipo_paciente_id), '[]'),
    'por_sexo', jsonb_build_object('F', (select count(*) from cons where sexo = 'F'), 'M', (select count(*) from cons where sexo = 'M')),
    'por_edad', coalesce((select jsonb_agg(jsonb_build_object('grupo', edad, 'n', n) order by edad)
      from (select edad, count(*) n from cons group by 1) x), '[]'),
    'por_dependencia', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'personal', x.personal, 'n', x.n) order by x.n desc, x.nombre)
      from (
        select coalesce(dp.nombre, 'Sin dependencia') nombre,
               (select count(*) from poblacion p where p.dependencia_id is not distinct from g.dep_id) personal,
               g.n
        from (select dep_id, count(*) n from cons group by 1) g
        left join public.dependencias dp on dp.id = g.dep_id
      ) x), '[]')
  ),
  'morbilidad', jsonb_build_object(
    'total', (select count(*) from diag),
    'pacientes', (select count(distinct trabajador_id) from diag),
    'por_sistema', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(nullif(sistema, ''), 'Sin clasificar'), 'n', n) order by n desc)
      from (select sistema, count(*) n from diag group by 1) x), '[]'),
    'por_origen', coalesce((select jsonb_object_agg(origen, n) from (select origen, count(*) n from diag group by 1) x), '{}'),
    'por_tipo_consulta', coalesce((select jsonb_object_agg(tipo, jsonb_build_object('n', n, 'pacientes', pacientes))
      from (select tipo, count(*) n, count(distinct trabajador_id) pacientes from diag group by 1) x), '{}'),
    'primeras_causas', coalesce((select jsonb_agg(jsonb_build_object('cie10', cie10, 'descripcion', descripcion, 'n', n, 'pacientes', pacientes) order by n desc, cie10)
      from (select cie10, min(descripcion) descripcion, count(*) n, count(distinct trabajador_id) pacientes from diag group by 1 order by 3 desc, 1 limit 10) x), '[]'),
    'cortes', coalesce((select jsonb_object_agg(grupo, claves) from (
        select grupo, jsonb_object_agg(clave, causas) claves from (
          select grupo, clave, jsonb_agg(jsonb_build_object('cie10', cie10, 'descripcion', descripcion, 'n', n, 'pacientes', pacientes) order by puesto) causas
          from cortes_top where puesto <= 10 group by 1, 2
        ) y group by 1
      ) z), '{}')
  ),
  'referencias', jsonb_build_object(
    'total', (select count(*) from refs),
    'por_especialidad', coalesce((select jsonb_agg(jsonb_build_object('nombre', especialidad, 'n', n) order by n desc, especialidad)
      from (select especialidad, count(*) n from refs group by 1 order by 2 desc, 1 limit 10) x), '[]')
  ),
  'ausentismo', jsonb_build_object(
    'reposos', (select count(*) from rep),
    'reposos_iniciados', (select count(*) from rep where desde >= p_desde),
    'trabajadores_ausentes', (select count(distinct trabajador_id) from rep where causa not in ('prenatal', 'postnatal')),
    'dias_perdidos', (select coalesce(sum(dias_en_periodo), 0) from rep),
    'dias_periodo', (select n from dias_periodo),
    -- pre y postnatal no cuentan para el % de ausentismo
    'dias_computables', (select coalesce(sum(dias_en_periodo), 0) from rep where causa not in ('prenatal', 'postnatal')),
    'por_causa', coalesce((select jsonb_agg(jsonb_build_object('nombre', causa, 'n', n, 'dias', dias) order by dias desc)
      from (select causa, count(*) n, sum(dias_en_periodo) dias from rep group by 1) x), '[]'),
    'por_ente', coalesce((select jsonb_agg(jsonb_build_object('nombre', ente_emisor, 'n', n, 'dias', dias) order by dias desc)
      from (select ente_emisor, count(*) n, sum(dias_en_periodo) dias from rep group by 1) x), '[]'),
    'primeras_causas', coalesce((select jsonb_agg(jsonb_build_object('cie10', x.cie10, 'descripcion', coalesce(c.descripcion, x.cie10), 'n', x.n, 'dias', x.dias) order by x.n desc, x.dias desc)
      from (select cie10, count(*) n, sum(dias_en_periodo) dias from rep where cie10 is not null group by 1 order by 2 desc, 3 desc limit 10) x
      left join public.cie10 c on c.codigo = x.cie10), '[]'),
    'detalle', coalesce((select jsonb_agg(jsonb_build_object('causa', x.causa, 'ente', x.ente_emisor, 'cie10', x.cie10, 'descripcion', coalesce(c.descripcion, x.cie10), 'n', x.n, 'dias', x.dias) order by x.causa, x.dias desc)
      from (select causa, ente_emisor, cie10, count(*) n, sum(dias_en_periodo) dias from rep group by 1, 2, 3) x
      left join public.cie10 c on c.codigo = x.cie10), '[]'),
    'por_dependencia', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(dp.nombre, 'Sin dependencia'), 'n', x.n, 'dias', x.dias) order by x.dias desc)
      from (select dependencia_id, count(*) n, sum(dias_en_periodo) dias from rep group by 1) x
      left join public.dependencias dp on dp.id = x.dependencia_id), '[]')
  ),
  'enfermedad_ocupacional', jsonb_build_object(
    'casos', (select count(*) from ev where tipo = 'enfermedad'
      and coalesce(fecha_diagnostico, fecha_hora) >= p_desde and coalesce(fecha_diagnostico, fecha_hora) < p_hasta + 1),
    'dias', (select coalesce(sum(dias_en_periodo), 0) from rep where causa = 'enfermedad_ocupacional'),
    'casos_anteriores', (select count(*) from ev where tipo = 'enfermedad' and coalesce(fecha_diagnostico, fecha_hora) < p_desde),
    'dias_anteriores', (select coalesce(sum(r.dias_en_periodo), 0) from rep r where r.causa = 'enfermedad_ocupacional'
      and exists (select 1 from ev where ev.tipo = 'enfermedad' and ev.trabajador_id = r.trabajador_id and coalesce(ev.fecha_diagnostico, ev.fecha_hora) < p_desde))
  ),
  'accidentes', coalesce((select jsonb_agg(jsonb_build_object(
      'fecha', fecha_hora, 'tipo', tipo, 'lugar', lugar, 'lesion', naturaleza_lesion, 'parte', parte_cuerpo,
      'gravedad', gravedad, 'dias', dias_perdidos, 'estado', estado) order by fecha_hora)
    from ev where tipo in ('accidente', 'incidente') and fecha_hora >= p_desde and fecha_hora < p_hasta + 1), '[]'),
  'aptitud', coalesce((select jsonb_object_agg(clasificacion, n) from (select clasificacion, count(*) n from apt group by 1) x), '{}')
)
$$;

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
