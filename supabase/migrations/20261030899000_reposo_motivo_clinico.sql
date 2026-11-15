-- zamorApp Ocupacional · Motivo clínico del reposo (pedido de Cesar, 05-nov-2026)
-- «Que en el reposo médico haya contexto de lo que está sufriendo la persona: se indica reposo por presentar clínica de
-- dolor, limitación funcional… Igual que en el informe médico, pero en las hojas de reposo.»
-- 1) clinico.reposos.motivo_clinico: lo que escribió el médico. null = la hoja imprime la propuesta armada con el motivo
--    de consulta y los hallazgos positivos del examen físico (src/lib/reposo-motivo.ts). Quién lo ve: lo mismo que el
--    reposo (RLS de clinico.reposos: personal clínico; RR. HH. no lee reposos).
-- 2) guardar_consulta lo guarda solo si llega la clave: un guardado viejo de la bandeja o del celular no lo borra.
--    Base de guardar_consulta: 20261030830000_riesgos_consulta.sql (solo se agregaron las líneas de motivo_clinico).
-- 3) Columna nueva → vistas espejo al día (prueba 163).

alter table clinico.reposos add column if not exists motivo_clinico text;
alter table clinico.reposos drop constraint if exists reposos_motivo_clinico_check;
alter table clinico.reposos add constraint reposos_motivo_clinico_check check (motivo_clinico is null or char_length(motivo_clinico) <= 600);
comment on column clinico.reposos.motivo_clinico is 'Por qué se indica el reposo (sale en la hoja). null = propuesta desde el motivo y el examen de la consulta';

select public.vistas_al_dia();

create or replace function public.guardar_consulta(p_id uuid, p_consulta jsonb, p_diagnosticos jsonb, p_aptitud jsonb, p_reposo jsonb, p_cerrar boolean)
returns void language plpgsql set search_path = public as $$
declare
  c record;
  v_vigente date;
  v_hoy date := public.hoy_caracas();
  v_reposo uuid;
  v_cie10 text;
  v_motivo text;
  v_fecha date;
  v_copiada uuid := nullif(p_consulta ->> 'copiada_de', '')::uuid;
begin
  select id, org_id, estado, trabajador_id, fecha into c from clinico.consultas where id = p_id;
  if not found then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  if c.estado = 'firmada' then raise exception 'La consulta está firmada y no se puede modificar.'; end if;
  -- Bloquea la fila: dos guardados simultáneos de la misma consulta no se mezclan
  perform 1 from clinico.consultas where id = p_id for update;

  -- Fecha de la evaluación: la elige el médico (pasado o futuro). Las horas reales de registro y firma no se tocan.
  v_fecha := coalesce(nullif(p_consulta ->> 'fecha', '')::date, c.fecha);
  -- Sin tope que bloquee hacia el futuro (los avisos nunca bloquean: la pantalla avisa pasados N días, Configuración);
  -- solo se descarta lo imposible
  if v_fecha < date '2000-01-01' or v_fecha > date '2099-12-31' then
    raise exception 'La fecha de la evaluación % no es válida.', to_char(v_fecha, 'DD/MM/YYYY');
  end if;
  -- La cambian el médico, el gerente médico y el administrador; enfermería guarda signos pero no cambia la fecha
  if v_fecha is distinct from c.fecha and public.mi_rol(c.org_id)::text not in ('medico', 'gerente_medico', 'administrador') then
    raise exception 'Solo el médico, el gerente médico o el administrador cambian la fecha de la evaluación.';
  end if;
  -- Copia de una evaluación anterior: solo del mismo trabajador y de una consulta que este usuario puede ver
  -- (la función no es security definer: la RLS de consultas decide)
  if v_copiada is not null and not exists (
       select 1 from clinico.consultas o where o.id = v_copiada and o.trabajador_id = c.trabajador_id and o.id <> p_id) then
    raise exception 'La evaluación copiada no es de este trabajador o no tienes acceso a ella.';
  end if;

  -- Diagnósticos: se comparan con lo guardado. Los iguales se quedan (misma fila, misma versión);
  -- solo se borran los que ya no están y se insertan los nuevos.
  with nuevos as (
    select x.cie10, x.descripcion, nullif(x.sistema, '') as sistema, coalesce(x.origen, 'comun') as origen,
           coalesce(x.principal, false) as principal
    from jsonb_to_recordset(coalesce(p_diagnosticos, '[]')) as x(cie10 text, descripcion text, sistema text, origen text, principal boolean)
  ),
  n as (
    select nuevos.*, row_number() over (partition by cie10, descripcion, sistema, origen, principal) as k from nuevos
  ),
  e as (
    select d.id, d.cie10, d.descripcion, d.sistema, d.origen, d.principal,
           row_number() over (partition by d.cie10, d.descripcion, d.sistema, d.origen, d.principal order by d.id) as k
    from clinico.diagnosticos d where d.consulta_id = p_id
  ),
  sobran as (
    delete from clinico.diagnosticos d using e
    where d.id = e.id and not exists (
      select 1 from n where (n.cie10, n.descripcion, n.sistema, n.origen, n.principal, n.k)
                            is not distinct from (e.cie10, e.descripcion, e.sistema, e.origen, e.principal, e.k))
    returning d.id
  )
  insert into clinico.diagnosticos (org_id, consulta_id, cie10, descripcion, sistema, origen, principal)
  select c.org_id, p_id, n.cie10, n.descripcion, n.sistema, n.origen, n.principal
  from n
  where not exists (
    select 1 from e where (e.cie10, e.descripcion, e.sistema, e.origen, e.principal, e.k)
                          is not distinct from (n.cie10, n.descripcion, n.sistema, n.origen, n.principal, n.k));

  -- Aptitud: se actualiza en su lugar y solo si cambió
  if p_aptitud is not null and coalesce(p_aptitud ->> 'clasificacion', '') <> '' then
    v_vigente := nullif(p_aptitud ->> 'vigente_hasta', '')::date;
    if v_vigente is null then
      select (v_fecha + make_interval(months => coalesce((o.ajustes ->> 'meses_examen_periodico')::int, 12)))::date
        into v_vigente from public.organizaciones o where o.id = c.org_id;
    end if;
    insert into clinico.aptitudes as a (org_id, consulta_id, trabajador_id, clasificacion, observacion, limitaciones, restricciones, vigente_hasta)
    values (c.org_id, p_id, c.trabajador_id, p_aptitud ->> 'clasificacion', nullif(p_aptitud ->> 'observacion', ''),
            coalesce(p_aptitud -> 'limitaciones', '[]'),
            array(select jsonb_array_elements_text(coalesce(p_aptitud -> 'limitaciones', '[]'))),
            v_vigente)
    on conflict (consulta_id) do update set
      clasificacion = excluded.clasificacion, observacion = excluded.observacion, limitaciones = excluded.limitaciones,
      restricciones = excluded.restricciones, vigente_hasta = excluded.vigente_hasta
    where (a.clasificacion, a.observacion, a.limitaciones, a.restricciones, a.vigente_hasta)
          is distinct from (excluded.clasificacion, excluded.observacion, excluded.limitaciones, excluded.restricciones, excluded.vigente_hasta);
  else
    delete from clinico.aptitudes where consulta_id = p_id;
  end if;

  -- Reposo: uno por consulta, actualizado en su lugar (conserva su id y su origen del SAME)
  select id into v_reposo from clinico.reposos where consulta_id = p_id order by creado_en, id limit 1;
  if p_reposo is null then
    delete from clinico.reposos where consulta_id = p_id;
  else
    if (p_reposo ->> 'hasta')::date < (p_reposo ->> 'desde')::date then
      raise exception 'El reposo termina antes de empezar.';
    end if;
    -- Motivo clínico: texto del médico, sin espacios de sobra; vacío = la hoja imprime la propuesta de la consulta
    v_motivo := nullif(left(btrim(regexp_replace(coalesce(p_reposo ->> 'motivo_clinico', ''), '\s+', ' ', 'g')), 600), '');
    v_cie10 := coalesce(nullif(p_reposo ->> 'cie10', ''), (select x ->> 'cie10' from jsonb_array_elements(coalesce(p_diagnosticos, '[]')) x limit 1));
    delete from clinico.reposos where consulta_id = p_id and id <> v_reposo;
    if v_reposo is null then
      insert into clinico.reposos (org_id, consulta_id, trabajador_id, causa, ente_emisor, desde, hasta, reintegro, cie10,
                                   medico_externo, centro_ivss, validado_ivss, motivo_clinico)
      values (c.org_id, p_id, c.trabajador_id, p_reposo ->> 'causa', coalesce(nullif(p_reposo ->> 'ente', ''), 'servicio_medico'),
              (p_reposo ->> 'desde')::date, (p_reposo ->> 'hasta')::date, (p_reposo ->> 'hasta')::date + 1, v_cie10,
              nullif(p_reposo ->> 'medico_externo', ''), nullif(p_reposo ->> 'centro_ivss', ''), coalesce((p_reposo ->> 'validado_ivss')::boolean, false),
              v_motivo);
    else
      update clinico.reposos r set
        causa = p_reposo ->> 'causa', ente_emisor = coalesce(nullif(p_reposo ->> 'ente', ''), 'servicio_medico'),
        desde = (p_reposo ->> 'desde')::date, hasta = (p_reposo ->> 'hasta')::date, reintegro = (p_reposo ->> 'hasta')::date + 1,
        cie10 = v_cie10, medico_externo = nullif(p_reposo ->> 'medico_externo', ''), centro_ivss = nullif(p_reposo ->> 'centro_ivss', ''),
        validado_ivss = coalesce((p_reposo ->> 'validado_ivss')::boolean, false),
        motivo_clinico = case when p_reposo ? 'motivo_clinico' then v_motivo else r.motivo_clinico end
      where r.id = v_reposo
        and (r.causa, r.ente_emisor, r.desde, r.hasta, r.reintegro, r.cie10, r.medico_externo, r.centro_ivss, r.validado_ivss, r.motivo_clinico)
            is distinct from (p_reposo ->> 'causa', coalesce(nullif(p_reposo ->> 'ente', ''), 'servicio_medico'),
                              (p_reposo ->> 'desde')::date, (p_reposo ->> 'hasta')::date, (p_reposo ->> 'hasta')::date + 1, v_cie10,
                              nullif(p_reposo ->> 'medico_externo', ''), nullif(p_reposo ->> 'centro_ivss', ''),
                              coalesce((p_reposo ->> 'validado_ivss')::boolean, false),
                              case when p_reposo ? 'motivo_clinico' then v_motivo else r.motivo_clinico end);
    end if;
    -- Si el reposo cubre hoy, el trabajador queda "en reposo"
    if (p_reposo ->> 'desde')::date <= v_hoy and (p_reposo ->> 'hasta')::date >= v_hoy then
      update public.trabajadores set estado = 'reposo' where id = c.trabajador_id and estado is distinct from 'reposo';
    end if;
  end if;

  -- La consulta, al final (ver el punto 2 de arriba)
  update clinico.consultas set
    fecha = v_fecha,
    copiada_de = coalesce(v_copiada, copiada_de),
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
    -- Riesgos elegidos en la consulta: solo los seis grupos y listas de textos. Sin la clave se conservan;
    -- null = volver a los del cargo; {} = ninguno (el médico los quitó todos)
    riesgos = case
      when not (p_consulta ? 'riesgos') then riesgos
      when jsonb_typeof(p_consulta -> 'riesgos') <> 'object' then null
      else coalesce((
        select jsonb_object_agg(g.key, (select coalesce(jsonb_agg(distinct trim(a)), '[]'::jsonb)
                                          from jsonb_array_elements_text(g.value) a where trim(a) <> ''))
          from jsonb_each(p_consulta -> 'riesgos') g
         where g.key in ('fisico', 'quimico', 'biologico', 'mecanico', 'disergonomico', 'psicosocial')
           and jsonb_typeof(g.value) = 'array'), '{}'::jsonb) end,
    especialidad = nullif(trim(p_consulta ->> 'especialidad'), ''),
    estado = case when p_cerrar then 'cerrada' else estado end,
    hora_cierre = case when p_cerrar then public.ahora() else hora_cierre end
  where id = p_id;

  if p_cerrar then
    update public.citas set estado = 'atendido' where consulta_id = p_id and estado is distinct from 'atendido';
  end if;
end $$;
