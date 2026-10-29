-- zamorApp Ocupacional · Vigilancia: cuadrar con el SAME para la marcha en paralelo
-- 1) Población «efectiva»: los tipos de paciente con grupo 'efectivo' (Configuración › Listas). Vienen marcados
--    los mismos del SAME: Empleado, Obrero, Contratado, Pasante y Aprendiz. organizaciones.ajustes.vigilancia_poblacion
--    = 'todos' vuelve a contar a todos los pacientes. Motivo y tipo de paciente siempre cuentan a todos (como el SAME).
-- 2) Permisos (causas de reposo del grupo 'permiso': paternidad, lactancia) fuera del ausentismo y en su propio cuadro.
-- 3) Reubicaciones por resultado (reubicacion.resultado, lista resultado_reubicacion).
-- 4) Especialidad de la consulta externa o especializada (consultas.especialidad) y su cuadro.
-- 5) reporte_vigilancia ya no se puede ejecutar como anon (faltaba el revoke).
-- Se reescribe entero; conserva el parche de 20261027210000 (sin t.*, discapacidad desde trabajadores_salud).

alter table clinico.consultas add column if not exists especialidad text;
create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;

update public.lista_items set grupo = 'efectivo'
where lista = 'tipo_paciente' and codigo in ('EMP', 'OBR', 'CON', 'PAS', 'APR') and coalesce(grupo, '') = '';

create or replace function public.guardar_consulta(
  p_id uuid, p_consulta jsonb, p_diagnosticos jsonb, p_aptitud jsonb, p_reposo jsonb, p_cerrar boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare
  c record;
  v_vigente date;
  v_hoy date := (now() at time zone 'America/Caracas')::date;
begin
  select id, org_id, estado, trabajador_id, fecha into c from clinico.consultas where id = p_id;
  if not found then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  if c.estado = 'firmada' then raise exception 'La consulta está firmada y no se puede modificar.'; end if;
  -- Bloquea la fila: dos guardados simultáneos de la misma consulta no se mezclan
  perform 1 from clinico.consultas where id = p_id for update;

  update clinico.consultas set
    tipo = p_consulta ->> 'tipo',
    motivo_id = (p_consulta ->> 'motivo_id')::uuid,
    motivo_texto = p_consulta ->> 'motivo_texto',
    enfermedad_actual = p_consulta ->> 'enfermedad_actual',
    antecedentes = coalesce(p_consulta -> 'antecedentes', '[]'),
    habitos = coalesce(p_consulta -> 'habitos', '[]'),
    signos_vitales = coalesce(p_consulta -> 'signos_vitales', '{}'),
    examen_funcional = coalesce(p_consulta -> 'examen_funcional', '[]'),
    examen_fisico = coalesce(p_consulta -> 'examen_fisico', '[]'),
    paraclinicos = coalesce(p_consulta -> 'paraclinicos', '[]'),
    tratamiento = coalesce(p_consulta -> 'tratamiento', '[]'),
    indicaciones = p_consulta ->> 'indicaciones',
    interconsultas = coalesce(p_consulta -> 'interconsultas', '[]'),
    conclusiones = p_consulta ->> 'conclusiones',
    recomendaciones_empresa = p_consulta ->> 'recomendaciones_empresa',
    recomendaciones_trabajador = p_consulta ->> 'recomendaciones_trabajador',
    observacion_privada = p_consulta ->> 'observacion_privada',
    autoriza_paciente = coalesce((p_consulta ->> 'autoriza_paciente')::boolean, false),
    sano = coalesce((p_consulta ->> 'sano')::boolean, false),
    reubicacion = nullif(p_consulta -> 'reubicacion', 'null'::jsonb),
    informe_libre = nullif(p_consulta -> 'informe_libre', 'null'::jsonb),
    potencial_discapacidad = coalesce((p_consulta ->> 'potencial_discapacidad')::boolean, false),
    discapacidad_nota = nullif(p_consulta ->> 'discapacidad_nota', ''),
    especialidad = nullif(trim(p_consulta ->> 'especialidad'), ''),
    estado = case when p_cerrar then 'cerrada' else estado end,
    hora_cierre = case when p_cerrar then now() else hora_cierre end
  where id = p_id;

  -- Diagnósticos: se reemplazan completos
  delete from clinico.diagnosticos where consulta_id = p_id;
  insert into clinico.diagnosticos (org_id, consulta_id, cie10, descripcion, sistema, origen, principal)
  select c.org_id, p_id, x.cie10, x.descripcion, nullif(x.sistema, ''), coalesce(x.origen, 'comun'), coalesce(x.principal, false)
  from jsonb_to_recordset(coalesce(p_diagnosticos, '[]')) as x(cie10 text, descripcion text, sistema text, origen text, principal boolean);

  -- Aptitud: se actualiza en su lugar (no se borra y reinserta)
  if p_aptitud is not null and coalesce(p_aptitud ->> 'clasificacion', '') <> '' then
    v_vigente := nullif(p_aptitud ->> 'vigente_hasta', '')::date;
    if v_vigente is null then
      select (c.fecha + make_interval(months => coalesce((o.ajustes ->> 'meses_examen_periodico')::int, 12)))::date
        into v_vigente from public.organizaciones o where o.id = c.org_id;
    end if;
    insert into clinico.aptitudes (org_id, consulta_id, trabajador_id, clasificacion, observacion, limitaciones, restricciones, vigente_hasta)
    values (c.org_id, p_id, c.trabajador_id, p_aptitud ->> 'clasificacion', nullif(p_aptitud ->> 'observacion', ''),
            coalesce(p_aptitud -> 'limitaciones', '[]'),
            array(select jsonb_array_elements_text(coalesce(p_aptitud -> 'limitaciones', '[]'))),
            v_vigente)
    on conflict (consulta_id) do update set
      clasificacion = excluded.clasificacion, observacion = excluded.observacion, limitaciones = excluded.limitaciones,
      restricciones = excluded.restricciones, vigente_hasta = excluded.vigente_hasta;
  else
    delete from clinico.aptitudes where consulta_id = p_id;
  end if;

  -- Reposo
  delete from clinico.reposos where consulta_id = p_id;
  if p_reposo is not null then
    if (p_reposo ->> 'hasta')::date < (p_reposo ->> 'desde')::date then
      raise exception 'El reposo termina antes de empezar.';
    end if;
    insert into clinico.reposos (org_id, consulta_id, trabajador_id, causa, ente_emisor, desde, hasta, reintegro, cie10,
                                 medico_externo, centro_ivss, validado_ivss)
    values (c.org_id, p_id, c.trabajador_id, p_reposo ->> 'causa', coalesce(nullif(p_reposo ->> 'ente', ''), 'servicio_medico'),
            (p_reposo ->> 'desde')::date, (p_reposo ->> 'hasta')::date, (p_reposo ->> 'hasta')::date + 1,
            coalesce(nullif(p_reposo ->> 'cie10', ''), (select x ->> 'cie10' from jsonb_array_elements(coalesce(p_diagnosticos, '[]')) x limit 1)),
            nullif(p_reposo ->> 'medico_externo', ''), nullif(p_reposo ->> 'centro_ivss', ''), coalesce((p_reposo ->> 'validado_ivss')::boolean, false));
    -- Si el reposo cubre hoy, el trabajador queda "en reposo"
    if (p_reposo ->> 'desde')::date <= v_hoy and (p_reposo ->> 'hasta')::date >= v_hoy then
      update public.trabajadores set estado = 'reposo' where id = c.trabajador_id;
    end if;
  end if;

  if p_cerrar then
    update public.citas set estado = 'atendido' where consulta_id = p_id;
  end if;
end $$;

revoke execute on function public.guardar_consulta(uuid, jsonb, jsonb, jsonb, jsonb, boolean) from anon, public;
grant execute on function public.guardar_consulta(uuid, jsonb, jsonb, jsonb, jsonb, boolean) to authenticated;

create or replace function public.reporte_vigilancia(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with
dias_periodo as (select (p_hasta - p_desde + 1)::numeric as n),
-- Todos los pacientes de la empresa (motivo y tipo de paciente se cuentan sobre todos, como el SAME)
trab_todos as (
  -- Columnas explícitas: grupo sanguíneo y discapacidad no se leen de trabajadores (20261027210000_salud_oculta_rrhh);
  -- la discapacidad llega desde trabajadores_salud, vacía para quien no es del servicio.
  select t.id, t.org_id, t.empresa_id, t.dependencia_id, t.tipo_paciente_id, t.sexo, t.fecha_nacimiento, t.estado, t.fecha_egreso,
         coalesce((select s.discapacidad from public.trabajadores_salud s where s.id = t.id), false) as discapacidad,
         coalesce(o.ajustes ->> 'vigilancia_poblacion', 'efectivos') <> 'todos' as solo_efectivos,
         coalesce(tp.grupo = 'efectivo', t.tipo_paciente_id is null and t.estado <> 'aspirante') as efectivo
  from public.trabajadores t
  left join public.organizaciones o on o.id = t.org_id
  left join public.lista_items tp on tp.id = t.tipo_paciente_id
  where (p_empresa is null or t.empresa_id = p_empresa)
),
-- Población del informe: por defecto solo los «trabajadores efectivos» (tipos de paciente marcados en
-- Configuración › Listas; sin tipo cuenta si no es aspirante). Configuración › Organización › Vigilancia permite contar a todos.
trab as (
  select * from trab_todos where not solo_efectivos or efectivo
),
-- Causas de reposo del grupo «permiso» (paternidad, lactancia…): van aparte y no cuentan como ausentismo
permisos as (
  select distinct codigo from public.lista_items where lista = 'causa_reposo' and grupo = 'permiso' and codigo is not null
),
poblacion as (
  select * from trab
  where estado in ('activo', 'reposo')
     or (estado = 'egresado' and coalesce(fecha_egreso, p_hasta) >= p_desde)
),
-- Grupos etarios del formato INPSASEL / SAME
cons as (
  select c.*, t.sexo, t.fecha_nacimiento, t.tipo_paciente_id, m.nombre as motivo, m.grupo as motivo_grupo, m.codigo as motivo_codigo,
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
cons_todos as (
  select c.id, c.tipo, c.trabajador_id, t.tipo_paciente_id, m.nombre as motivo, m.grupo as motivo_grupo
  from public.consultas c
  join trab_todos t on t.id = c.trabajador_id
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
    greatest(0, (least(r.hasta, p_hasta) - greatest(r.desde, p_desde) + 1)) as dias_en_periodo,
    r.causa in (select codigo from permisos) as permiso
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
      from (select motivo, motivo_grupo, count(*) n from cons_todos group by 1, 2) x), '[]'),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from cons group by 1) x), '{}'),
    'por_tipo_paciente', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(li.nombre, 'Sin tipo'), 'n', x.n) order by x.n desc)
      from (select tipo_paciente_id, count(*) n from cons_todos group by 1) x left join public.lista_items li on li.id = x.tipo_paciente_id), '[]'),
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
  -- Especialidad de las consultas externas o especializadas (campo de la consulta)
  'especialidades_externas', coalesce((select jsonb_agg(jsonb_build_object('nombre', especialidad, 'n', n) order by n desc, especialidad)
    from (select coalesce(nullif(trim(especialidad), ''), 'Sin especialidad') especialidad, count(*) n from cons c
          where c.especialidad is not null or c.motivo_codigo in ('EXT', 'ESP') group by 1 order by 2 desc, 1 limit 10) x), '[]'),
  -- Reubicaciones indicadas en el período, por resultado (lista «Resultados de reubicación») y por tipo
  'reubicaciones', jsonb_build_object(
    'total', (select count(*) from cons where reubicacion is not null),
    'por_resultado', coalesce((select jsonb_agg(jsonb_build_object('nombre', resultado, 'n', n) order by n desc, resultado)
      from (select coalesce(nullif(reubicacion ->> 'resultado', ''), 'pendiente') resultado, count(*) n from cons where reubicacion is not null group by 1) x), '[]'),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n)
      from (select coalesce(reubicacion ->> 'tipo', 'temporal') tipo, count(*) n from cons where reubicacion is not null group by 1) x), '{}')
  ),
  -- Criterio de población usado (se imprime en el encabezado, como la nota del SAME)
  'criterio', jsonb_build_object(
    'solo_efectivos', coalesce((select bool_or(coalesce(o.ajustes ->> 'vigilancia_poblacion', 'efectivos') <> 'todos')
      from public.organizaciones o where o.id in (select public.mis_orgs())), true),
    'tipos', coalesce((select jsonb_agg(distinct li.nombre order by li.nombre) from public.lista_items li
      where li.lista = 'tipo_paciente' and li.grupo = 'efectivo' and li.activo and li.org_id in (select public.mis_orgs())), '[]')
  ),
  'ausentismo', jsonb_build_object(
    'reposos', (select count(*) from rep where not permiso),
    'reposos_iniciados', (select count(*) from rep where desde >= p_desde and not permiso),
    'trabajadores_ausentes', (select count(distinct trabajador_id) from rep where causa not in ('prenatal', 'postnatal') and not permiso),
    'dias_perdidos', (select coalesce(sum(dias_en_periodo), 0) from rep where not permiso),
    'dias_periodo', (select n from dias_periodo),
    -- pre y postnatal no cuentan para el % de ausentismo
    -- pre y postnatal y los permisos no cuentan para el % de ausentismo
    'dias_computables', (select coalesce(sum(dias_en_periodo), 0) from rep where causa not in ('prenatal', 'postnatal') and not permiso),
    'por_causa', coalesce((select jsonb_agg(jsonb_build_object('nombre', causa, 'n', n, 'dias', dias) order by dias desc)
      from (select causa, count(*) n, sum(dias_en_periodo) dias from rep where not permiso group by 1) x), '[]'),
    'permisos', coalesce((select jsonb_agg(jsonb_build_object('nombre', causa, 'n', n, 'dias', dias) order by dias desc)
      from (select causa, count(*) n, sum(dias_en_periodo) dias from rep where permiso group by 1) x), '[]'),
    'por_ente', coalesce((select jsonb_agg(jsonb_build_object('nombre', ente_emisor, 'n', n, 'dias', dias) order by dias desc)
      from (select ente_emisor, count(*) n, sum(dias_en_periodo) dias from rep where not permiso group by 1) x), '[]'),
    'primeras_causas', coalesce((select jsonb_agg(jsonb_build_object('cie10', x.cie10, 'descripcion', coalesce(c.descripcion, x.cie10), 'n', x.n, 'dias', x.dias) order by x.n desc, x.dias desc)
      from (select cie10, count(*) n, sum(dias_en_periodo) dias from rep where cie10 is not null and not permiso group by 1 order by 2 desc, 3 desc limit 10) x
      left join public.cie10 c on c.codigo = x.cie10), '[]'),
    'detalle', coalesce((select jsonb_agg(jsonb_build_object('causa', x.causa, 'ente', x.ente_emisor, 'cie10', x.cie10, 'descripcion', coalesce(c.descripcion, x.cie10), 'n', x.n, 'dias', x.dias) order by x.causa, x.dias desc)
      from (select causa, ente_emisor, cie10, count(*) n, sum(dias_en_periodo) dias from rep where not permiso group by 1, 2, 3) x
      left join public.cie10 c on c.codigo = x.cie10), '[]'),
    'por_dependencia', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(dp.nombre, 'Sin dependencia'), 'n', x.n, 'dias', x.dias) order by x.dias desc)
      from (select dependencia_id, count(*) n, sum(dias_en_periodo) dias from rep where not permiso group by 1) x
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

revoke execute on function public.reporte_vigilancia(uuid, date, date) from public, anon;
grant execute on function public.reporte_vigilancia(uuid, date, date) to authenticated;

create or replace function public.vigilancia_series(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with
-- Misma población que reporte_vigilancia (trabajadores efectivos por defecto)
trab as (
  select t.id, t.sexo, t.fecha_nacimiento, t.estado, t.fecha_egreso
  from public.trabajadores t
  left join public.organizaciones o on o.id = t.org_id
  left join public.lista_items tp on tp.id = t.tipo_paciente_id
  where (p_empresa is null or t.empresa_id = p_empresa)
    and (coalesce(o.ajustes ->> 'vigilancia_poblacion', 'efectivos') = 'todos'
         or coalesce(tp.grupo = 'efectivo', t.tipo_paciente_id is null and t.estado <> 'aspirante'))
),
poblacion as (
  select * from trab
  where estado in ('activo', 'reposo')
     or (estado = 'egresado' and coalesce(fecha_egreso, p_hasta) >= p_desde)
),
meses as (
  select generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month')::date as mes
),
cons as (
  select c.id, c.fecha, m.grupo as motivo_grupo
  from public.consultas c
  join trab t on t.id = c.trabajador_id
  left join public.lista_items m on m.id = c.motivo_id
  where c.fecha between p_desde and p_hasta
),
diag as (
  select d.cie10, c.fecha from public.diagnosticos d join cons c on c.id = d.consulta_id
),
rep as (
  select r.desde, r.hasta, r.causa
  from public.reposos r join trab t on t.id = r.trabajador_id
  where r.desde <= p_hasta and r.hasta >= p_desde
),
-- Capítulos CIE-10 por la letra (y el número cuando una letra se reparte en dos capítulos)
capitulos (desde_cod, hasta_cod, nombre) as (values
  ('A00', 'B99', 'Infecciosas y parasitarias'), ('C00', 'D49', 'Tumores'), ('D50', 'D89', 'Sangre e inmunidad'),
  ('E00', 'E90', 'Endocrinas y metabólicas'), ('F00', 'F99', 'Trastornos mentales'), ('G00', 'G99', 'Sistema nervioso'),
  ('H00', 'H59', 'Ojo y anexos'), ('H60', 'H95', 'Oído'), ('I00', 'I99', 'Circulatorio'), ('J00', 'J99', 'Respiratorio'),
  ('K00', 'K93', 'Digestivo'), ('L00', 'L99', 'Piel'), ('M00', 'M99', 'Osteomuscular'), ('N00', 'N99', 'Genitourinario'),
  ('O00', 'O99', 'Embarazo y parto'), ('R00', 'R99', 'Síntomas y signos'), ('S00', 'T98', 'Traumatismos'),
  ('V01', 'Y98', 'Causas externas'), ('Z00', 'Z99', 'Factores de salud y contacto')
)
select jsonb_build_object(
  'por_mes', coalesce((select jsonb_agg(jsonb_build_object(
      'mes', to_char(m.mes, 'YYYY-MM'),
      'consultas', (select count(*) from cons c where date_trunc('month', c.fecha) = m.mes),
      'preventivas', (select count(*) from cons c where date_trunc('month', c.fecha) = m.mes and c.motivo_grupo = 'preventivo'),
      'diagnosticos', (select count(*) from diag d where date_trunc('month', d.fecha) = m.mes),
      'dias_reposo', (select coalesce(sum(greatest(0, least(r.hasta, p_hasta, (m.mes + interval '1 month - 1 day')::date)
                                                   - greatest(r.desde, p_desde, m.mes) + 1)), 0)
                        from rep r where r.causa not in ('prenatal', 'postnatal')
                          and r.causa not in (select codigo from public.lista_items where lista = 'causa_reposo' and grupo = 'permiso' and codigo is not null))
    ) order by m.mes) from meses m), '[]'),
  'piramide', coalesce((select jsonb_agg(jsonb_build_object('grupo', (array['< 18', '18-24', '25-34', '35-44', '45-54', '55-64', '65 y más', 'Sin dato'])[k], 'F', f, 'M', mm, 'n', n) order by k)
    from (
      select case when e is null then 8 when e < 18 then 1 when e < 25 then 2 when e < 35 then 3
                  when e < 45 then 4 when e < 55 then 5 when e < 65 then 6 else 7 end k,
             count(*) filter (where sexo = 'F') f,
             count(*) filter (where sexo = 'M') mm, count(*) n
      from (select sexo, extract(year from age(p_hasta, fecha_nacimiento)) e from poblacion) p group by 1
    ) x), '[]'),
  'capitulos', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'n', n) order by n desc, nombre)
    from (
      select coalesce(k.nombre, 'Sin capítulo') nombre, count(*) n
      from diag d
      left join capitulos k on upper(left(d.cie10, 3)) between k.desde_cod and k.hasta_cod
      group by 1
    ) x), '[]')
)
$$;

revoke execute on function public.vigilancia_series(uuid, date, date) from public, anon;
grant execute on function public.vigilancia_series(uuid, date, date) to authenticated;
