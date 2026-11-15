-- (Renumerada desde 20261030897000: la nube ya tenía 20261030902000.)
-- zamorApp Ocupacional · Vigilancia: tres indicadores que pide la legislación y el informe no mostraba (Cesar, 05-nov:
-- «sí exámenes vencidos», «sí enfermedades declaradas», «sí resultados por exposición»)
-- 1) Cumplimiento de exámenes periódicos (LOPCYMAT art. 40 y 53; NT-01-2008, programa de vigilancia de la salud):
--    cuántos trabajadores debían evaluarse en el período, cuántos se evaluaron y cuántos quedaron vencidos, por dependencia.
--    «Debía evaluarse» = su próximo examen (vigencia de la constancia o último examen + periodicidad de la empresa,
--    igual que ultima_aptitud) calculado con el último examen ANTERIOR al período cae dentro o antes del cierre.
-- 2) Enfermedades ocupacionales (LOPCYMAT art. 73, Reglamento art. 84, NT-02-2008): registradas, declaradas ante el
--    INPSASEL en 24 h, informe NT-02 en 15 días (Anexo 1) o 30, certificadas, y su grupo del Anexo 1. Más las sospechas:
--    trabajadores con diagnóstico de origen ocupacional en el período sin enfermedad registrada (solo el servicio).
-- 3) Resultados de audiometría y espirometría por exposición (NT-01-2008, vigilancia por grupos de exposición):
--    expuestos a ruido / a polvos, humos o químicos según los riesgos marcados en la consulta o, si no, los del cargo.
--    Solo el personal del servicio (es_servicio) recibe resultados y sospechas: RR. HH. nunca lee datos clínicos.
--
-- Función aparte, stable e invocador, como vigilancia_complemento: no se reescribe reporte_vigilancia (la parchean en
-- vivo 20261027210000 y 20261030760000) y la puerta del escritorio la sirve sin conexión.
-- Columnas explícitas de trabajadores: nada de grupo sanguíneo ni discapacidad.

create or replace function public.vigilancia_legal(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with
-- Población efectiva (misma regla que reporte_vigilancia), activos o en reposo
trab as (
  select t.id, t.org_id, t.dependencia_id, t.puesto_id
  from public.trabajadores t
  left join public.organizaciones o on o.id = t.org_id
  left join public.lista_items tp on tp.id = t.tipo_paciente_id
  -- «Todas las empresas» deja fuera la bolsa de pacientes particulares (empresas.es_particular, 20261030894000)
  where (p_empresa is null and not exists (select 1 from public.empresas ep where ep.id = t.empresa_id and ep.es_particular) or t.empresa_id = p_empresa)
    and t.estado in ('activo', 'reposo')
    and (coalesce(o.ajustes ->> 'vigilancia_poblacion', 'efectivos') = 'todos'
         or coalesce(tp.grupo = 'efectivo', t.tipo_paciente_id is null))
),
-- ── 1) Exámenes periódicos
apt as (
  select a.trabajador_id, c.fecha,
         coalesce(a.vigente_hasta, (c.fecha + make_interval(months => coalesce(e.periodicidad_meses, 12)))::date) as proximo
  from public.aptitudes a
  join public.consultas c on c.id = a.consulta_id
  join trab t on t.id = a.trabajador_id
  left join public.empresas e on e.id = c.empresa_id
  where c.estado in ('cerrada', 'firmada') and c.fecha <= p_hasta
),
previo as (
  select distinct on (trabajador_id) trabajador_id, proximo from apt where fecha < p_desde order by trabajador_id, fecha desc
),
ultimo as (
  select distinct on (trabajador_id) trabajador_id, proximo from apt order by trabajador_id, fecha desc
),
hechos as (select distinct trabajador_id from apt where fecha between p_desde and p_hasta),
prog as (
  select t.id, coalesce(dp.nombre, 'Sin dependencia') as dependencia, (h.trabajador_id is not null) as hecho
  from trab t
  join previo p on p.trabajador_id = t.id
  left join hechos h on h.trabajador_id = t.id
  left join public.dependencias dp on dp.id = t.dependencia_id
  where p.proximo <= p_hasta
),
-- ── 2) Enfermedades ocupacionales registradas (fecha del diagnóstico en el período)
eo as (
  select ev.*, coalesce(ev.fecha_diagnostico, ev.fecha_hora) as fdx
  from public.eventos ev
  where ev.tipo = 'enfermedad'
    and (p_empresa is null and not exists (select 1 from public.empresas ep where ep.id = ev.empresa_id and ep.es_particular) or ev.empresa_id = p_empresa)
    and coalesce(ev.fecha_diagnostico, ev.fecha_hora) >= p_desde
    and coalesce(ev.fecha_diagnostico, ev.fecha_hora) < p_hasta + 1
),
-- Grupo del Anexo 1 de la NT-02 (lista declaracion_ocupacional de la organización o la base): por prefijo del CIE-10
eo_grupo as (
  select eo.id, coalesce((
    select li.grupo from public.lista_items li
    where li.lista = 'declaracion_ocupacional' and li.activo and (li.org_id = eo.org_id or li.org_id is null)
      and li.codigo is not null and li.codigo !~ '[,!-]' and nullif(trim(eo.cie10), '') is not null
      and upper(trim(eo.cie10)) like upper(trim(li.codigo)) || '%'
    order by li.org_id nulls last, length(li.codigo) desc limit 1), 'Fuera del Anexo 1') as grupo
  from eo
),
sospechas as (
  select count(distinct c.trabajador_id) as n
  from public.diagnosticos d
  join public.consultas c on c.id = d.consulta_id
  join trab t on t.id = c.trabajador_id
  where d.origen = 'ocupacional' and c.fecha between p_desde and p_hasta and c.estado <> 'borrador'
    and public.es_servicio(c.org_id)
    and not exists (select 1 from public.eventos ev where ev.tipo = 'enfermedad' and ev.trabajador_id = c.trabajador_id
                    and coalesce(ev.fecha_diagnostico, ev.fecha_hora) >= p_desde - 30)
),
-- ── 3) Audiometría y espirometría por exposición (último resultado de cada trabajador en el período)
riesgo as (
  select t.id, coalesce((select c.riesgos from public.consultas c
                         where c.trabajador_id = t.id and c.riesgos is not null and c.fecha <= p_hasta
                         order by c.fecha desc limit 1), pu.riesgos, '{}'::jsonb) as r
  from trab t left join public.puestos pu on pu.id = t.puesto_id
),
expo as (
  select id,
         r::text ~* 'ruido' as ruido,
         (jsonb_typeof(r -> 'quimico') = 'array' and jsonb_array_length(r -> 'quimico') > 0)
           or r::text ~* 'polvo|humo|gas|vapor|neblina|fibra|s[ií]lice|asbesto|solvente|aerosol' as respiratorio
  from riesgo
),
estudios as (
  select distinct on (c.trabajador_id, e.estudio) c.trabajador_id, e.estudio, s.estado
  from public.consultas c
  join trab t on t.id = c.trabajador_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(c.paraclinicos) = 'array' then c.paraclinicos else '[]'::jsonb end) p
  cross join lateral (select case when p ->> 'nombre' ~* 'audiometr' then 'Audiometría'
                                  when p ->> 'nombre' ~* 'espirometr' then 'Espirometría' end as estudio) e
  cross join lateral (select case
      when p ->> 'estado' in ('alterado', 'fuera') or coalesce(p ->> 'resultado', '') ~* 'alterad|anormal|patol|hipoacus|trauma ac|restrict|obstruct|mixto' then 'alterado'
      when p ->> 'estado' = 'normal' or coalesce(p ->> 'resultado', '') ~* '^\s*(normal|dentro de l)' then 'normal'
      else 'sin' end as estado) s
  where e.estudio is not null and c.estado <> 'borrador' and c.fecha between p_desde and p_hasta
    and public.es_servicio(c.org_id)
  order by c.trabajador_id, e.estudio, c.fecha desc
),
resultados as (
  select es.estudio,
         case when es.estudio = 'Audiometría' then (case when x.ruido then 'Expuestos a ruido' else 'Sin exposición a ruido registrada' end)
              else (case when x.respiratorio then 'Expuestos a polvos, humos o químicos' else 'Sin exposición respiratoria registrada' end) end as grupo,
         case when es.estudio = 'Audiometría' then x.ruido else x.respiratorio end as expuesto,
         es.estado
  from estudios es join expo x on x.id = es.trabajador_id
)
select jsonb_build_object(
  'examenes', jsonb_build_object(
    'programados', (select count(*) from prog),
    'realizados', (select count(*) from prog where hecho),
    'vencidos', (select count(*) from prog where not hecho),
    'evaluados_periodo', (select count(*) from hechos),
    'por_vencer', (select count(*) from ultimo u join trab t on t.id = u.trabajador_id where u.proximo > p_hasta and u.proximo <= (p_hasta + interval '3 months')::date),
    'sin_evaluacion', (select count(*) from trab t where not exists (select 1 from apt a where a.trabajador_id = t.id)),
    'por_dependencia', coalesce((select jsonb_agg(jsonb_build_object('dependencia', dependencia, 'programados', n, 'realizados', r, 'vencidos', n - r) order by n - r desc, dependencia)
        from (select dependencia, count(*) as n, count(*) filter (where hecho) as r from prog group by dependencia) x), '[]')),
  'enfermedades', jsonb_build_object(
    'registradas', (select count(*) from eo),
    'declaradas', (select count(*) from eo where fecha_declaracion is not null),
    'a_tiempo', (select count(*) from eo where fecha_declaracion is not null and fecha_declaracion <= fdx + interval '24 hours'),
    'por_declarar', (select count(*) from eo where fecha_declaracion is null),
    'informe_nt02', (select count(*) from eo where fecha_informe_nt02 is not null),
    'informe_a_tiempo', (select count(*) from eo where fecha_informe_nt02 is not null
                           and fecha_informe_nt02 <= (fdx at time zone 'America/Caracas')::date + case when en_anexo1 then 15 else 30 end),
    'informe_pendiente', (select count(*) from eo where fecha_informe_nt02 is null),
    'certificadas', (select count(*) from eo where certificacion_fecha is not null or coalesce(estado_certificacion, '') ~* 'certific'),
    'sospechas_sin_registro', (select n from sospechas),
    'por_grupo', coalesce((select jsonb_agg(jsonb_build_object('grupo', grupo, 'n', n) order by n desc, grupo)
        from (select grupo, count(*) as n from eo_grupo group by grupo) x), '[]')),
  'resultados', coalesce((select jsonb_agg(jsonb_build_object('estudio', estudio, 'grupo', grupo, 'expuesto', expuesto,
        'evaluados', n, 'normales', nn, 'alterados', na, 'sin_resultado', ns) order by estudio, expuesto desc)
      from (select estudio, grupo, expuesto, count(*) as n, count(*) filter (where estado = 'normal') as nn,
                   count(*) filter (where estado = 'alterado') as na, count(*) filter (where estado = 'sin') as ns
            from resultados group by estudio, grupo, expuesto) x), '[]'),
  'expuestos_sin_estudio', jsonb_build_object(
    'ruido', (select count(*) from expo x where x.ruido and not exists (select 1 from estudios es where es.trabajador_id = x.id and es.estudio = 'Audiometría')
              and exists (select 1 from trab t where t.id = x.id and public.es_servicio(t.org_id))),
    'respiratorio', (select count(*) from expo x where x.respiratorio and not exists (select 1 from estudios es where es.trabajador_id = x.id and es.estudio = 'Espirometría')
              and exists (select 1 from trab t where t.id = x.id and public.es_servicio(t.org_id))))
);
$$;

revoke execute on function public.vigilancia_legal(uuid, date, date) from public, anon;
grant execute on function public.vigilancia_legal(uuid, date, date) to authenticated;
