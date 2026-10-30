-- zamorApp Ocupacional · «Perfil normal» por motivo y copiar la evaluación anterior (pedido de Cesar, 30-oct)
-- 1) Plantillas de pre vacacional (PREV) y post vacacional (POSV), y dos campos nuevos en cada plantilla, que se editan
--    en Configuración › Plantillas de examen: clasificacion (la que pone el botón «Perfil normal»; vacío = ninguna) y
--    sano (sin diagnósticos). La aplicación automática al elegir el motivo NO pone la clasificación: solo el botón,
--    que es un acto explícito del médico (enfermería no lo ve).
-- 2) consultas.copiada_de: la evaluación anterior de la que se copiaron antecedentes, hábitos y examen. guardar_consulta
--    comprueba (con la RLS, sin security definer) que sea del mismo trabajador; en la nube queda en la bitácora
--    (COPIA_EVALUACION con la consulta de origen). Nunca se copian fecha, firma, signos, aptitud, recomendaciones,
--    diagnósticos, tratamiento, reposo ni consentimiento (Analizar, 30-oct).
-- Base de guardar_consulta: 20261030490000_fecha_evaluacion.sql.

-- Datos (plantillas): solo en la nube. En la base de la PC llegan por la réplica con sus mismos ids; sembrarlas allí
-- crearía filas propias que luego chocan o se duplican (Analizar, 30-oct; mismo caso que la 480000)
create or replace function public.sembrar_plantillas_perfil_normal()
returns void language plpgsql set search_path = public as $$
begin
  if public.es_base_local() then return; end if;
  insert into public.lista_items (lista, codigo, nombre, orden, datos)
  select 'plantilla_examen', x.codigo, x.nombre, x.orden, x.datos::jsonb
  from (values
    ('PREV', 'Pre vacacional', 5, '{"funcional":"normal","fisico":"normal","aptitud":["prev_apto"],"empresa":["emp_periodico"],"trabajador":[],"meses":null,"conclusiones":"","clasificacion":"elegible","sano":true}'),
    ('POSV', 'Post vacacional', 6, '{"funcional":"normal","fisico":"normal","aptitud":["postvacacional"],"empresa":["emp_periodico"],"trabajador":[],"meses":null,"conclusiones":"","clasificacion":"elegible","sano":true}')
  ) as x(codigo, nombre, orden, datos)
  where not exists (select 1 from public.lista_items i where i.lista = 'plantilla_examen' and i.org_id is null and i.codigo = x.codigo);

  -- Las plantillas que ya existen (base y de cada organización) ganan los dos campos sin perder lo editado.
  -- Egreso no clasifica aptitud.
  update public.lista_items set datos = jsonb_build_object('clasificacion', case when codigo = 'EGR' then '' else 'elegible' end, 'sano', true) || coalesce(datos, '{}'::jsonb)
  where lista = 'plantilla_examen' and not (coalesce(datos, '{}'::jsonb) ? 'clasificacion');

  perform public.copiar_listas_base(id) from public.organizaciones;
end $$;
revoke execute on function public.sembrar_plantillas_perfil_normal() from public, anon, authenticated;
select public.sembrar_plantillas_perfil_normal();

alter table clinico.consultas add column if not exists copiada_de uuid references clinico.consultas (id) on delete set null;

create or replace function public.guardar_consulta(p_id uuid, p_consulta jsonb, p_diagnosticos jsonb, p_aptitud jsonb, p_reposo jsonb, p_cerrar boolean)
returns void language plpgsql set search_path = public as $$
declare
  c record;
  v_vigente date;
  v_hoy date := public.hoy_caracas();
  v_reposo uuid;
  v_cie10 text;
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
    especialidad = nullif(trim(p_consulta ->> 'especialidad'), ''),
    estado = case when p_cerrar then 'cerrada' else estado end,
    hora_cierre = case when p_cerrar then public.ahora() else hora_cierre end
  where id = p_id;

  if p_cerrar then
    update public.citas set estado = 'atendido' where consulta_id = p_id and estado is distinct from 'atendido';
  end if;
end $$;

-- En la nube, la copia queda en la bitácora con la consulta de origen (también si llega por la bandeja)
create or replace function public.anotar_copia_evaluacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.copiada_de is null or (tg_op = 'UPDATE' and new.copiada_de is not distinct from old.copiada_de) then return null; end if;
  insert into public.bitacora (org_id, usuario_id, tabla, registro_id, accion, antes, despues)
  values (new.org_id, auth.uid(), 'clinico.consultas', new.id, 'COPIA_EVALUACION', null,
          jsonb_build_object('copiada_de', new.copiada_de,
                             'fecha_origen', (select o.fecha from clinico.consultas o where o.id = new.copiada_de)));
  return null;
end $$;
revoke execute on function public.anotar_copia_evaluacion() from public, anon, authenticated;

drop trigger if exists anotar_copia_evaluacion on clinico.consultas;
create trigger anotar_copia_evaluacion after insert or update of copiada_de on clinico.consultas
  for each row when (not public.es_base_local()) execute function public.anotar_copia_evaluacion();

-- Un UPDATE directo (sin guardar_consulta) tampoco puede apuntar a una consulta de otro trabajador
create or replace function public.validar_copiada_de()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.copiada_de is not null and (new.copiada_de = new.id or not exists (
       select 1 from clinico.consultas o where o.id = new.copiada_de and o.trabajador_id = new.trabajador_id)) then
    raise exception 'La evaluación copiada no es de este trabajador.';
  end if;
  return new;
end $$;
revoke execute on function public.validar_copiada_de() from public, anon, authenticated;

drop trigger if exists validar_copiada_de on clinico.consultas;
create trigger validar_copiada_de before insert or update of copiada_de on clinico.consultas
  for each row when (new.copiada_de is not null) execute function public.validar_copiada_de();
