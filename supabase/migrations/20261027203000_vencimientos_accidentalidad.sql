-- zamorApp Ocupacional · Vencimientos de aptitud y examen periódico, accidentabilidad mensual y tablero de inicio
-- 1. Cada empresa define cada cuánto se repite el examen periódico y con cuántos días de anticipación se avisa.
-- 2. ultima_aptitud calcula el próximo examen: la vigencia de la constancia o, si no la tiene, la fecha del
--    último examen más la periodicidad de la empresa. Pacientes, portal, inicio y reportes usan el mismo dato.
-- 3. vencimientos_empresas(): vencidos, por vencer y sin evaluación por empresa (alertas del inicio).
-- 4. reporte_indicadores: «vencimientos» (trabajador por trabajador) y «accidentalidad» (mes a mes, COVENIN 474:
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

-- Reportes de indicadores en su propia función (no se recrea reporte_listado: así no choca con otras migraciones
-- que la cambian). Mismo contrato: devuelve un arreglo jsonb de filas; security invoker, decide RLS.
create or replace function public.reporte_indicadores(p_tipo text, p_empresa uuid, p_desde date, p_hasta date, p_opciones jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v jsonb;
  -- Vencimientos: '' = días de aviso de cada empresa; un número de días; 'todos' incluye a los que están al día
  v_horizonte text := coalesce(p_opciones ->> 'horizonte', '');
  -- Accidentabilidad: una fila por empresa y mes, o 'consolidado' (todas las empresas juntas por mes)
  v_nivel text := coalesce(p_opciones ->> 'nivel', '');
  v_hoy date := (now() at time zone 'America/Caracas')::date;
begin
  case p_tipo
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

revoke all on function public.reporte_indicadores(text, uuid, date, date, jsonb) from public, anon;
grant execute on function public.reporte_indicadores(text, uuid, date, date, jsonb) to authenticated;
