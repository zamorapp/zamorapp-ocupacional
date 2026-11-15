-- zamorApp · Empresas inactivas (Cesar, 31-oct): «quiero inactivar empresas con las que ya no trabajo (p. ej. Forum)
-- para que no me aparezcan sus trabajadores, salvo si vuelven como candidatos a otra empresa; la data la tengo que
-- tener respaldada por temas legales».
-- La columna empresas.activa existe desde el esquema inicial; la app ahora la usa (Empresas › Inactivar / Ver inactivas).
-- NADA se borra ni se mueve: esta migración solo hace que el Inicio y la campana dejen de contar las inactivas.
--   resumen_panel        «Todas las empresas» cuenta solo trabajadores de empresas activas
--   recordar_alertas     sin «Alerta para la próxima evaluación» de empresas inactivas
--   recordar_resultados  sin «Resultados por recibir» de empresas inactivas
-- vencimientos_empresas, la campana del celular y el post vacacional ya filtraban e.activa.
-- Los reportes legales y los impresos siguen leyendo todo (períodos en que la empresa estaba activa).
-- Sin columnas nuevas: no hace falta vistas_al_dia ni cambia la sincronía (activa ya viaja con la empresa).

create or replace function public.resumen_panel(p_empresa uuid default null)
returns jsonb language sql stable security invoker set search_path = public as $$
  with t as (
    select t.id, t.estado, u.clasificacion, u.proximo_examen, e.dias_aviso_examen as aviso
    from public.trabajadores t
    join public.empresas e on e.id = t.empresa_id
    left join public.ultima_aptitud u on u.trabajador_id = t.id
    -- «Todas las empresas» = las activas; una empresa pedida por su id se cuenta aunque esté inactiva
    where (p_empresa is null and e.activa) or t.empresa_id = p_empresa
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

create or replace function public.recordar_alertas()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select a.id, a.org_id, a.empresa_id, a.revisar_antes, a.trabajador_id, t.nombres || ' ' || t.apellidos as nombre
      from clinico.alertas_clinicas a
      join public.trabajadores t on t.id = a.trabajador_id
      left join clinico.consultas c on c.id = a.consulta_id
      left join public.empresas e on e.id = a.empresa_id
      left join public.recordatorios_alertas x on x.alerta_id = a.id and x.usuario_id = v_uid
     where a.estado = 'pendiente' and a.revisar_antes is not null
       and not ('proxima_evaluacion' = any (coalesce(e.avisos_apagados, '{}'))) and a.revisar_antes <= v_hoy + 3
       and coalesce(e.activa, true)
       and (a.org_id = any (public.orgs_con(p_clinico => true, p_sin_limite => true))
            or (a.org_id::text || a.empresa_id::text) = any (public.pares_limitados(p_clinico => true)))
       and not (btrim(a.texto) = '' and c.id is not null and public.paraclinicos_pendientes(c.paraclinicos) > 0)
       and (x.ultimo_aviso is null or (a.revisar_antes <= v_hoy and public.fecha_caracas(x.ultimo_aviso) < a.revisar_antes))
     order by a.revisar_antes
     limit 20
  loop
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    values (r.org_id, v_uid, r.empresa_id, 'Alerta para la próxima evaluación',
      r.nombre || case when r.revisar_antes < v_hoy then ' · venció el ' when r.revisar_antes = v_hoy then ' · vence hoy, ' else ' · revisar antes del ' end
        || to_char(r.revisar_antes, 'DD/MM/YYYY'),
      '/pacientes/' || r.trabajador_id);
    insert into public.recordatorios_alertas (alerta_id, usuario_id, org_id, ultimo_aviso)
    values (r.id, v_uid, r.org_id, now())
    on conflict (alerta_id, usuario_id) do update set ultimo_aviso = excluded.ultimo_aviso;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

create or replace function public.recordar_resultados()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select c.id, c.org_id, c.empresa_id, c.fecha, public.paraclinicos_pendientes(c.paraclinicos) as faltan,
           t.nombres || ' ' || t.apellidos as nombre
    from clinico.consultas c
    join public.miembros m on m.org_id = c.org_id and m.usuario_id = v_uid and m.activo
      and m.rol in ('administrador', 'gerente_medico', 'medico')
    join public.organizaciones o on o.id = c.org_id
    join public.trabajadores t on t.id = c.trabajador_id
    left join public.empresas e on e.id = c.empresa_id
    left join public.recordatorios_resultados x on x.consulta_id = c.id and x.usuario_id = v_uid
    cross join lateral (select case when o.ajustes ->> 'recordatorio_resultados_dias' ~ '^[0-9]{1,3}$' then (o.ajustes ->> 'recordatorio_resultados_dias')::int else 3 end as dias) a
    where c.medico_id = v_uid
      and not ('resultados' = any (coalesce(e.avisos_apagados, '{}')))
      and coalesce(e.activa, true)
      and c.origen is null
      and c.estado in ('borrador', 'cerrada')
      and a.dias > 0
      and c.fecha <= v_hoy - a.dias
      and c.fecha >= v_hoy - 60
      and public.paraclinicos_pendientes(c.paraclinicos) > 0
      and not coalesce(x.ignorado, false)
      and (x.ultimo_aviso is null or x.ultimo_aviso <= now() - make_interval(days => a.dias))
    order by c.fecha
    limit 20
  loop
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    values (r.org_id, v_uid, r.empresa_id, 'Resultados por recibir',
      r.nombre || ' · ' || case when r.faltan = 1 then 'falta 1 resultado' else 'faltan ' || r.faltan || ' resultados' end
        || ' (consulta del ' || to_char(r.fecha, 'DD/MM/YYYY') || ')',
      '/atencion/' || r.id || '?paso=paraclinicos');
    insert into public.recordatorios_resultados (consulta_id, usuario_id, org_id, ultimo_aviso)
    values (r.id, v_uid, r.org_id, now())
    on conflict (consulta_id, usuario_id) do update set ultimo_aviso = excluded.ultimo_aviso;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- «Deshacer» de Pasar a otra empresa: solo si aún no lo atendieron en la empresa nueva. Recepción no lee consultas
-- (RLS clínica), así que la pregunta va por aquí y devuelve solo sí/no, y solo a quien puede ver al trabajador.
create or replace function public.tiene_consultas_en(p_trabajador uuid, p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trabajadores t
    where t.id = p_trabajador and public.puede_ver_empresa(t.org_id, t.empresa_id)
      and exists (select 1 from clinico.consultas c where c.trabajador_id = t.id and c.empresa_id = p_empresa)
  )
$$;
revoke all on function public.tiene_consultas_en(uuid, uuid) from public, anon;
grant execute on function public.tiene_consultas_en(uuid, uuid) to authenticated;
