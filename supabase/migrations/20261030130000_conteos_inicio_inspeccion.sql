-- zamorApp Ocupacional · Conteos del Inicio y de Inspección en UNA consulta (auditoría C14)
-- Desde Venezuela cada viaje a la base tarda 0,2 a 4 s. El Inicio hacía unas 12 consultas (y bajaba hasta 1.000
-- consultas para contar resultados pendientes) e Inspección bajaba a TODOS los trabajadores, aptitudes y
-- notificaciones de la empresa, en páginas de 1.000, solo para contar. Ahora la base cuenta y devuelve cifras.
-- Ambas son security invoker: cuentan solo lo que quien pregunta puede ver.

-- ─── Inicio ──────────────────────────────────────────────────
-- p_solo_mias: el médico ve sus consultas por firmar y abiertas (el gerente médico y el administrador, todas).
-- p_clinico: solo el personal de salud necesita los conteos de consultas.
-- Las tareas del día son de todas las empresas (como antes); p_empresa filtra solo el resumen y los vencimientos.
create or replace function public.inicio_conteos(p_empresa uuid default null, p_solo_mias boolean default false, p_clinico boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_hoy date := public.hoy_caracas();
  v_yo uuid := auth.uid();
  v_tareas jsonb;
  v_venc jsonb;
begin
  select jsonb_build_object(
    'citados', count(*) filter (where c.fecha = v_hoy and c.estado = 'citado'),
    'en_espera', count(*) filter (where c.fecha = v_hoy and c.estado = 'en_espera'),
    'solicitadas', count(*) filter (where c.estado = 'solicitada' and c.fecha >= v_hoy)
  ) into v_tareas
  from public.citas c
  where c.fecha = v_hoy or c.estado = 'solicitada';

  v_tareas := v_tareas || jsonb_build_object(
    'eventos_abiertos', (select count(*) from public.eventos e where e.estado <> 'cerrado'),
    'por_cobrar', (select count(*) from public.cobros b where b.estado = 'emitida'));

  if p_clinico then
    v_tareas := v_tareas || (
      select jsonb_build_object(
        'por_firmar', count(*) filter (where c.estado = 'cerrada'),
        'abiertas', count(*) filter (where c.estado = 'borrador'))
      from public.consultas c
      where c.estado in ('cerrada', 'borrador')
        and (not p_solo_mias or c.medico_id = v_yo)
    ) || jsonb_build_object('por_recibir', (
      -- Exámenes sin resultado ni estado en consultas de los últimos 60 días (las importadas del SAME no cuentan)
      select count(*)
      from public.consultas c
      cross join lateral jsonb_array_elements(case when jsonb_typeof(c.paraclinicos) = 'array' then c.paraclinicos else '[]'::jsonb end) p
      where c.origen is null and c.fecha >= v_hoy - 60
        and (not p_solo_mias or c.medico_id = v_yo)
        and btrim(coalesce(p ->> 'resultado', '')) = '' and coalesce(p ->> 'estado', '') = ''));
  end if;

  select coalesce(jsonb_agg(x), '[]') into v_venc
  from jsonb_array_elements(public.vencimientos_empresas()) x
  where p_empresa is null or x ->> 'id' = p_empresa::text;

  return jsonb_build_object('resumen', public.resumen_panel(p_empresa), 'vencimientos', v_venc, 'tareas', v_tareas);
end
$$;
revoke all on function public.inicio_conteos(uuid, boolean, boolean) from public, anon;
grant execute on function public.inicio_conteos(uuid, boolean, boolean) to authenticated;

-- ─── Inspección: cumplidos y total de cada criterio ──────────
-- Mismas reglas que src/lib/inspeccion.ts (que ahora solo arma los textos). «Desactualizada» compara la
-- evaluación del puesto con la entrega como texto ISO, igual que la app (collate "C" = comparación por bytes).
create or replace function public.inspeccion_conteos(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with hoy as (select public.hoy_caracas() as d),
  ev as (
    select e.* from public.eventos e
    where e.empresa_id = p_empresa
      and e.fecha_hora >= (p_desde::timestamp at time zone 'America/Caracas')
      and e.fecha_hora < ((p_hasta + 1)::timestamp at time zone 'America/Caracas')
  ),
  acc as (select a from ev cross join lateral jsonb_array_elements(case when jsonb_typeof(ev.acciones) = 'array' then ev.acciones else '[]'::jsonb end) a),
  trab as (
    select t.id, t.nombres, t.apellidos, t.puesto_id, pu.evaluado_en as puesto_evaluado, ua.vigente_hasta, n.entregada_en, n.firmada_en, n.puesto_id as notif_puesto
    from public.trabajadores t
    left join public.puestos pu on pu.id = t.puesto_id
    -- Como la app: la aptitud cuenta si su consulta es de esta empresa
    left join public.ultima_aptitud ua on ua.trabajador_id = t.id and ua.empresa_id = p_empresa
    left join lateral (
      select r.entregada_en, r.firmada_en, r.puesto_id from public.notificaciones_riesgo r
      where r.trabajador_id = t.id and r.empresa_id = p_empresa
      order by r.entregada_en desc, r.creado_en desc limit 1
    ) n on true
    where t.empresa_id = p_empresa and t.estado in ('activo', 'reposo')
  ),
  trab_n as (
    select trab.*, (firmada_en is not null and puesto_id is not null
        and notif_puesto is not distinct from puesto_id
        and not (puesto_evaluado is not null and (to_jsonb(puesto_evaluado) #>> '{}') collate "C" > (to_jsonb(entregada_en) #>> '{}'))) as vigente
    from trab
  ),
  puestos as (
    select p.evaluado_en from public.puestos p
    where p.empresa_id = p_empresa and p.activo
      and exists (select 1 from public.trabajadores t where t.puesto_id = p.id)
  )
  select jsonb_build_object(
    'declaracion', jsonb_build_object(
      'total', (select count(*) from ev where tipo <> 'incidente'),
      'cumplidos', (select count(*) from ev where tipo <> 'incidente' and fecha_declaracion is not null
        and fecha_declaracion <= coalesce(case when tipo = 'enfermedad' then fecha_diagnostico end, fecha_hora) + interval '24 hours')),
    'investigacion', jsonb_build_object(
      'total', (select count(*) from ev where tipo = 'accidente'),
      'cumplidos', (select count(*) from ev where tipo = 'accidente' and (btrim(coalesce(causas_inmediatas, '')) <> '' or btrim(coalesce(causas_basicas, '')) <> ''))),
    'nt02', jsonb_build_object(
      'total', (select count(*) from ev where tipo = 'enfermedad'),
      'cumplidos', (select count(*) from ev where tipo = 'enfermedad' and fecha_informe_nt02 is not null and fecha_diagnostico is not null
        and fecha_informe_nt02 <= (fecha_diagnostico at time zone 'America/Caracas')::date + case when en_anexo1 is false then 30 else 15 end)),
    'acciones', jsonb_build_object(
      'total', (select count(*) from acc),
      'cumplidos', (select count(*) from acc, hoy where a ->> 'estado' = 'cumplida' or coalesce(a ->> 'fecha', '') = '' or (a ->> 'fecha') collate "C" >= hoy.d::text)),
    'puestos', jsonb_build_object(
      'total', (select count(*) from puestos),
      'cumplidos', (select count(*) from puestos where evaluado_en is not null)),
    'notificacion', jsonb_build_object(
      'total', (select count(*) from trab_n),
      'cumplidos', (select count(*) from trab_n where vigente)),
    'evaluacion', jsonb_build_object(
      'total', (select count(*) from trab),
      'cumplidos', (select count(*) from trab, hoy where vigente_hasta >= hoy.d)),
    -- Quiénes no tienen la notificación vigente (la pantalla los lista y ofrece notificarlos)
    'pendientes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', apellidos || ', ' || nombres, 'con_puesto', puesto_id is not null,
        'notificado_en', entregada_en, 'firmado_en', firmada_en) order by apellidos, nombres), '[]') from trab_n where not vigente),
    'informes', (select count(*) from public.informes_vigilancia i where i.empresa_id = p_empresa and i.hasta >= p_desde and i.desde <= p_hasta)
  )
$$;
revoke all on function public.inspeccion_conteos(uuid, date, date) from public, anon;
grant execute on function public.inspeccion_conteos(uuid, date, date) to authenticated;
