-- zamorApp Ocupacional · Reportes del SAME, segunda parte (bloque 4 de la matriz SAME frente a zamorApp)
-- - Médicos históricos del SAME (medicos_historicos) en todos los cortes por médico.
-- - «medicos»: producción por médico (consultas, pacientes, tipos, aptitudes, reposos, interconsultas, duración).
-- - «declaracion»: diagnósticos de declaración obligatoria (lista editable diagnostico_declarable) y de origen
--   ocupacional para el INPSASEL, con el evento registrado si existe.
-- - Padrón con la ficha patronímica completa; limitaciones vigentes; exámenes pendientes de resultado;
--   duración y datos del IVSS en reposos.

-- Enfermedades de notificación obligatoria (MPPS). código = prefijo CIE-10; grupo = inmediata | semanal.
-- Cada organización la edita en Configuración › Listas.
insert into public.listas (codigo, nombre, descripcion) values
  ('diagnostico_declarable', 'Diagnósticos de declaración obligatoria', 'Prefijo CIE-10 en el código; grupo inmediata o semanal. Alimenta el reporte de declaración obligatoria')
on conflict (codigo) do nothing;

insert into public.lista_items (lista, codigo, nombre, grupo, orden)
select 'diagnostico_declarable', c, n, g, o from (values
  ('A00', 'Cólera', 'inmediata', 1), ('A01', 'Fiebre tifoidea y paratifoidea', 'inmediata', 2), ('A05.1', 'Botulismo', 'inmediata', 3),
  ('A20', 'Peste', 'inmediata', 4), ('A22', 'Ántrax', 'inmediata', 5), ('A33', 'Tétanos neonatal', 'inmediata', 6), ('A35', 'Tétanos', 'inmediata', 7),
  ('A36', 'Difteria', 'inmediata', 8), ('A37', 'Tos ferina', 'inmediata', 9), ('A39', 'Enfermedad meningocócica', 'inmediata', 10),
  ('A80', 'Poliomielitis', 'inmediata', 11), ('A82', 'Rabia', 'inmediata', 12), ('A91', 'Dengue grave', 'inmediata', 13),
  ('A95', 'Fiebre amarilla', 'inmediata', 14), ('A98.4', 'Enfermedad por virus del Ébola', 'inmediata', 15), ('B05', 'Sarampión', 'inmediata', 16),
  ('B06', 'Rubéola', 'inmediata', 17), ('J09', 'Influenza por virus identificado (pandémica o aviar)', 'inmediata', 18), ('U07.1', 'COVID-19', 'inmediata', 19),
  ('A09', 'Diarrea y gastroenteritis infecciosa', 'semanal', 30), ('A15', 'Tuberculosis respiratoria', 'semanal', 31), ('A16', 'Tuberculosis respiratoria', 'semanal', 32),
  ('A17', 'Tuberculosis del sistema nervioso', 'semanal', 33), ('A18', 'Tuberculosis de otros órganos', 'semanal', 34), ('A19', 'Tuberculosis miliar', 'semanal', 35),
  ('A27', 'Leptospirosis', 'semanal', 36), ('A30', 'Lepra', 'semanal', 37), ('A50', 'Sífilis congénita', 'semanal', 38), ('A51', 'Sífilis precoz', 'semanal', 39),
  ('A52', 'Sífilis tardía', 'semanal', 40), ('A53', 'Sífilis no especificada', 'semanal', 41), ('A54', 'Gonorrea', 'semanal', 42),
  ('A90', 'Dengue', 'semanal', 43), ('A97', 'Dengue', 'semanal', 44), ('A92.0', 'Chikungunya', 'semanal', 45), ('A92.5', 'Zika', 'semanal', 46),
  ('B01', 'Varicela', 'semanal', 47), ('B15', 'Hepatitis A', 'semanal', 48), ('B16', 'Hepatitis B', 'semanal', 49), ('B17', 'Otras hepatitis virales agudas', 'semanal', 50),
  ('B18', 'Hepatitis viral crónica', 'semanal', 51), ('B19', 'Hepatitis viral no especificada', 'semanal', 52), ('B20', 'Enfermedad por VIH', 'semanal', 53),
  ('B24', 'Enfermedad por VIH no especificada', 'semanal', 54), ('Z21', 'VIH asintomático', 'semanal', 55), ('B26', 'Parotiditis', 'semanal', 56),
  ('B50', 'Paludismo por P. falciparum', 'semanal', 57), ('B51', 'Paludismo por P. vivax', 'semanal', 58), ('B52', 'Paludismo por P. malariae', 'semanal', 59),
  ('B53', 'Otro paludismo', 'semanal', 60), ('B54', 'Paludismo no especificado', 'semanal', 61), ('B55', 'Leishmaniasis', 'semanal', 62),
  ('B57', 'Enfermedad de Chagas', 'semanal', 63), ('J10', 'Influenza', 'semanal', 64), ('J11', 'Influenza, virus no identificado', 'semanal', 65),
  ('T60', 'Intoxicación por plaguicidas', 'semanal', 66), ('T63', 'Envenenamiento por animales ponzoñosos', 'semanal', 67)
) s(c, n, g, o)
where not exists (select 1 from public.lista_items x where x.lista = 'diagnostico_declarable' and x.org_id is null and x.codigo = s.c);

select public.copiar_listas_base(id) from public.organizaciones;

-- Potencial discapacidad marcada por el médico en la consulta (la agrega también 20261027150000_consulta_agil.sql;
-- se repite aquí, idempotente, para que el reporte no dependa del orden en que se publiquen)
alter table clinico.consultas add column if not exists potencial_discapacidad boolean not null default false;
alter table clinico.consultas add column if not exists discapacidad_nota text;
create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;

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

  else
    raise exception 'Reporte desconocido: %', p_tipo;
  end case;
  return v;
end
$$;

revoke all on function public.reporte_listado(text, uuid, date, date, jsonb) from public, anon;
grant execute on function public.reporte_listado(text, uuid, date, date, jsonb) to authenticated;
