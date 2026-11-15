-- zamorApp Ocupacional · La consulta lista para la bandeja del escritorio (fase A del local primero)
-- La PC ejecuta guardar_consulta en su base y la bandeja sube FILAS a la nube (aplicar_cambios compara
-- version_base con version; en lo clínico cualquier diferencia es un conflicto). Para que guardar no llene
-- la bandeja ni choque consigo mismo:
-- 1) guardar_consulta ya no borra y reinserta diagnósticos ni reposo en cada guardado: solo toca lo que cambió.
--    Antes, 10 guardados de una consulta con 3 diagnósticos subían 60 filas (borrar + insertar) y, con eso,
--    los reposos importados del SAME perdían su origen al primer guardado.
-- 2) La consulta se actualiza al FINAL. En la nube las filas llegan en el mismo orden: primero diagnósticos,
--    aptitud y reposo, y después el cambio de estado, que dispara el aviso de la aptitud. Así ese disparador no
--    le cambia la versión a una aptitud que todavía viene en camino (sería un conflicto en cada cierre).
-- 3) Los avisos (portal de la empresa, citas) y la revocación de enlaces son efectos que corren solo en la
--    nube: en la base local se saltan, y la nube los ejecuta al recibir las filas.

create or replace function public.es_base_local()
returns boolean language sql stable parallel safe set search_path = '' as $$
  select coalesce(current_setting('zamorapp.local', true), '') = 'on'
$$;
grant execute on function public.es_base_local() to anon, authenticated, service_role;

-- ─── 1. Efectos solo en la nube ───
drop trigger if exists avisar_aptitud on clinico.aptitudes;
create trigger avisar_aptitud before insert or update on clinico.aptitudes
  for each row when (not public.es_base_local()) execute function public.avisar_aptitud();

drop trigger if exists avisar_aptitud_al_cerrar on clinico.consultas;
create trigger avisar_aptitud_al_cerrar after update of estado on clinico.consultas
  for each row when (new.estado in ('cerrada', 'firmada') and old.estado not in ('cerrada', 'firmada') and not public.es_base_local())
  execute function public.avisar_aptitud_al_cerrar();

drop trigger if exists revocar_enlaces_consulta on clinico.consultas;
create trigger revocar_enlaces_consulta after update of estado on clinico.consultas
  for each row when (old.estado = 'firmada' and new.estado <> 'firmada' and not public.es_base_local())
  execute function public.revocar_enlaces_consulta();

drop trigger if exists avisar_cita on public.citas;
create trigger avisar_cita after insert or update on public.citas
  for each row when (not public.es_base_local()) execute function public.avisar_cita();

-- ─── 2. Guardar solo lo que cambió, y la consulta al final ───
create or replace function public.guardar_consulta(p_id uuid, p_consulta jsonb, p_diagnosticos jsonb, p_aptitud jsonb, p_reposo jsonb, p_cerrar boolean)
returns void language plpgsql set search_path = public as $$
declare
  c record;
  v_vigente date;
  v_hoy date := public.hoy_caracas();
  v_reposo uuid;
  v_cie10 text;
begin
  select id, org_id, estado, trabajador_id, fecha into c from clinico.consultas where id = p_id;
  if not found then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  if c.estado = 'firmada' then raise exception 'La consulta está firmada y no se puede modificar.'; end if;
  -- Bloquea la fila: dos guardados simultáneos de la misma consulta no se mezclan
  perform 1 from clinico.consultas where id = p_id for update;

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
      select (c.fecha + make_interval(months => coalesce((o.ajustes ->> 'meses_examen_periodico')::int, 12)))::date
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
    v_cie10 := coalesce(nullif(p_reposo ->> 'cie10', ''), (select x ->> 'cie10' from jsonb_array_elements(coalesce(p_diagnosticos, '[]')) x limit 1));
    delete from clinico.reposos where consulta_id = p_id and id <> v_reposo;
    if v_reposo is null then
      insert into clinico.reposos (org_id, consulta_id, trabajador_id, causa, ente_emisor, desde, hasta, reintegro, cie10,
                                   medico_externo, centro_ivss, validado_ivss)
      values (c.org_id, p_id, c.trabajador_id, p_reposo ->> 'causa', coalesce(nullif(p_reposo ->> 'ente', ''), 'servicio_medico'),
              (p_reposo ->> 'desde')::date, (p_reposo ->> 'hasta')::date, (p_reposo ->> 'hasta')::date + 1, v_cie10,
              nullif(p_reposo ->> 'medico_externo', ''), nullif(p_reposo ->> 'centro_ivss', ''), coalesce((p_reposo ->> 'validado_ivss')::boolean, false));
    else
      update clinico.reposos r set
        causa = p_reposo ->> 'causa', ente_emisor = coalesce(nullif(p_reposo ->> 'ente', ''), 'servicio_medico'),
        desde = (p_reposo ->> 'desde')::date, hasta = (p_reposo ->> 'hasta')::date, reintegro = (p_reposo ->> 'hasta')::date + 1,
        cie10 = v_cie10, medico_externo = nullif(p_reposo ->> 'medico_externo', ''), centro_ivss = nullif(p_reposo ->> 'centro_ivss', ''),
        validado_ivss = coalesce((p_reposo ->> 'validado_ivss')::boolean, false)
      where r.id = v_reposo
        and (r.causa, r.ente_emisor, r.desde, r.hasta, r.reintegro, r.cie10, r.medico_externo, r.centro_ivss, r.validado_ivss)
            is distinct from (p_reposo ->> 'causa', coalesce(nullif(p_reposo ->> 'ente', ''), 'servicio_medico'),
                              (p_reposo ->> 'desde')::date, (p_reposo ->> 'hasta')::date, (p_reposo ->> 'hasta')::date + 1, v_cie10,
                              nullif(p_reposo ->> 'medico_externo', ''), nullif(p_reposo ->> 'centro_ivss', ''),
                              coalesce((p_reposo ->> 'validado_ivss')::boolean, false));
    end if;
    -- Si el reposo cubre hoy, el trabajador queda "en reposo"
    if (p_reposo ->> 'desde')::date <= v_hoy and (p_reposo ->> 'hasta')::date >= v_hoy then
      update public.trabajadores set estado = 'reposo' where id = c.trabajador_id and estado is distinct from 'reposo';
    end if;
  end if;

  -- La consulta, al final (ver el punto 2 de arriba)
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
    hora_cierre = case when p_cerrar then public.ahora() else hora_cierre end
  where id = p_id;

  if p_cerrar then
    update public.citas set estado = 'atendido' where consulta_id = p_id and estado is distinct from 'atendido';
  end if;
end $$;
