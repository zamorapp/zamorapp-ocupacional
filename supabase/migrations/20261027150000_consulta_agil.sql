-- zamorApp Ocupacional · Consulta más ágil (bloque 5 de la matriz SAME)
-- Potencial discapacidad marcada por el médico, duplicar una consulta y modelos de informe libre.

-- Potencial discapacidad: criterio del médico en la consulta (los criterios automáticos siguen en reporte_listado)
alter table clinico.consultas add column if not exists potencial_discapacidad boolean not null default false;
alter table clinico.consultas add column if not exists discapacidad_nota text;

-- Las vistas «select *» fijan sus columnas al crearse: se recrea para exponer las nuevas
create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;

-- guardar_consulta: igual que en 20261026130000_documentos_same.sql, más la potencial discapacidad
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

-- Duplicar una consulta: borrador nuevo de hoy, mismo trabajador, con el contenido clínico de la original.
-- No copia lo que es propio de ese día o de ese acto: signos vitales, resultados de paraclínicos, aptitud,
-- reposo, reubicación, firma ni cierre. Security invoker: solo quien puede ver y crear consultas (RLS).
create or replace function public.duplicar_consulta(p_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  o clinico.consultas;
  t record;
  v_id uuid;
begin
  select * into o from clinico.consultas where id = p_id;
  if not found then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  -- El contexto laboral es el de hoy (el trabajador pudo cambiar de empresa o puesto)
  select empresa_id, dependencia_id, puesto_id into t from public.trabajadores where id = o.trabajador_id;

  insert into clinico.consultas (org_id, empresa_id, trabajador_id, dependencia_id, puesto_id, fecha, tipo, motivo_id,
    motivo_texto, enfermedad_actual, antecedentes, habitos, examen_funcional, examen_fisico, paraclinicos,
    tratamiento, indicaciones, interconsultas, conclusiones, recomendaciones_empresa, recomendaciones_trabajador,
    autoriza_paciente, sano, informe_libre, potencial_discapacidad, discapacidad_nota, duplicada_de)
  values (o.org_id, coalesce(t.empresa_id, o.empresa_id), o.trabajador_id, t.dependencia_id, t.puesto_id,
    (now() at time zone 'America/Caracas')::date, 'sucesiva', o.motivo_id,
    o.motivo_texto, o.enfermedad_actual, o.antecedentes, o.habitos, o.examen_funcional, o.examen_fisico,
    coalesce((select jsonb_agg(x || '{"resultado": ""}'::jsonb) from jsonb_array_elements(o.paraclinicos) x), '[]'),
    o.tratamiento, o.indicaciones, o.interconsultas, o.conclusiones, o.recomendaciones_empresa, o.recomendaciones_trabajador,
    o.autoriza_paciente, o.sano, o.informe_libre, o.potencial_discapacidad, o.discapacidad_nota, o.id)
  returning id into v_id;

  insert into clinico.diagnosticos (org_id, consulta_id, cie10, descripcion, sistema, origen, principal)
  select org_id, v_id, cie10, descripcion, sistema, origen, principal from clinico.diagnosticos where consulta_id = p_id;

  return v_id;
end $$;

revoke execute on function public.duplicar_consulta(uuid) from anon, public;
grant execute on function public.duplicar_consulta(uuid) to authenticated;

-- Modelos de informe libre (Configuración › Listas): nombre = título, texto = cuerpo con campos
-- {nombre} {cedula} {edad} {empresa} {cargo} {fecha} {diagnostico} {medico}, que se llenan al aplicarlo.
insert into public.listas (codigo, nombre, descripcion) values
  ('modelo_informe_libre', 'Modelos de informe libre', 'Textos base del informe médico libre. Campos: {nombre} {cedula} {edad} {empresa} {cargo} {fecha} {diagnostico} {medico}')
on conflict (codigo) do nothing;

insert into public.lista_items (lista, nombre, texto, orden)
select 'modelo_informe_libre', x.nombre, x.texto, x.orden
from (values
  ('Informe médico', 'Quien suscribe, médico ocupacional, hace constar que el(la) ciudadano(a) {nombre}, titular de la cédula de identidad {cedula}, de {edad} años de edad, quien labora como {cargo} en {empresa}, fue evaluado(a) en esta fecha {fecha}.' || E'\n\n' || 'Diagnóstico: {diagnostico}.' || E'\n\n' || 'Informe que se expide a solicitud de la parte interesada.', 1),
  ('Constancia de evolución', 'El(la) trabajador(a) {nombre}, C.I. {cedula}, de {empresa}, acude a control en fecha {fecha} con diagnóstico de {diagnostico}.' || E'\n\n' || 'Evolución: ' || E'\n\n' || 'Plan: ', 2),
  ('Solicitud de evaluación por especialista', 'Se refiere a {nombre}, C.I. {cedula}, {edad} años, {cargo} en {empresa}, con diagnóstico de {diagnostico}, para evaluación y conducta por su especialidad.' || E'\n\n' || 'Agradecemos contrarreferencia con sus hallazgos y recomendaciones laborales.', 3)
) as x(nombre, texto, orden)
where not exists (select 1 from public.lista_items i where i.lista = 'modelo_informe_libre' and i.org_id is null);
