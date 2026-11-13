-- RR. HH. no lee lo clínico de los accidentes y enfermedades ocupacionales (regla de Cesar: RR. HH. nunca ve
-- diagnósticos ni discapacidad). Hasta hoy la pantalla lo ocultaba, pero la regla eventos_leer le dejaba pedir la
-- fila completa por la API (cie10, diagnostico, incapacidad, discapacidad, certificación…).
--
-- 1) Regla restrictiva: quien es RR. HH. (gerente_empresa) en una organización no lee public.eventos de ella.
--    Sigue pudiendo CREAR el reporte inicial (eventos_reportar_rrhh, 935000): el alta no devuelve la fila.
-- 2) Vista public.eventos_empresa: lo que RR. HH. sí ve de su empresa, con lista CERRADA de columnas. Una columna
--    nueva en eventos no aparece aquí sola: hay que agregarla a mano y pensar si es clínica.
--    Fuera: cie10, diagnostico, estado_certificacion, certificacion_fecha, certificacion_numero, incapacidad,
--    cargos y dias_cargados (salen de la incapacidad), potencial_discapacidad, discapacidad, discapacidad_pct,
--    consulta_id, observaciones (texto libre del informe NT-02), origen y quién lo creó.
--    Dentro: los hechos, la lesión (COVENIN 474), la declaración y los plazos legales (fecha_diagnostico y
--    en_anexo1 solo dicen cuándo vence el informe NT-02, no qué enfermedad es) y dias_cargados_indice
--    (lo que suma el índice de severidad, ya neto).

drop policy if exists eventos_sin_rrhh on public.eventos;
create policy eventos_sin_rrhh on public.eventos as restrictive for select to authenticated
  using (not org_id = any ((select public.orgs_con('{gerente_empresa}'))::uuid[]));

-- Vista con permisos del dueño que filtra por el usuario (mismo modelo que evaluaciones_ergonomicas_rrhh);
-- security_barrier: un filtro del usuario no se evalúa antes que el where de la vista.
create or replace view public.eventos_empresa with (security_barrier = true) as
  select e.id, e.org_id, e.empresa_id, e.trabajador_id, e.numero, e.tipo, e.subtipo, e.fecha_hora, e.lugar,
         e.descripcion, e.testigos, e.testigos_detalle, e.turno, e.actividad_momento, e.motivo_actividad, e.lesiones,
         e.parte_cuerpo, e.naturaleza_lesion, e.agente, e.forma, e.gravedad, e.con_tiempo_perdido, e.dias_perdidos,
         e.fecha_aviso, e.fecha_declaracion, e.numero_declaracion,
         e.fecha_diagnostico, e.en_anexo1, e.fecha_informe_nt02,
         e.causas_inmediatas, e.causas_basicas, e.acto_inseguro, e.condicion_insegura, e.acciones,
         e.estado, e.creado_en, e.actualizado_en,
         -- Días cargados ya netos para el índice de severidad (COVENIN 474, 4.4): el número que suma el índice,
         -- sin decir el tipo de incapacidad. Así RR. HH. ve el mismo índice que el servicio.
         case when e.incapacidad = 'parcial_permanente' then greatest(e.dias_cargados - e.dias_perdidos, 0)
              else e.dias_cargados end as dias_cargados_indice
  from public.eventos e
  where e.org_id = any ((select public.orgs_con('{gerente_empresa}', p_sin_limite => true))::uuid[])
     or (e.org_id::text || e.empresa_id::text) = any ((select public.pares_limitados('{gerente_empresa}'))::text[]);
revoke all on public.eventos_empresa from public, anon;
grant select on public.eventos_empresa to authenticated;
comment on view public.eventos_empresa is
  'Accidentes y enfermedades de la empresa para RR. HH., sin datos clínicos (lista cerrada de columnas).';

-- 3) vigilancia_legal corre con los permisos de quien la llama: RR. HH. seguía contando sus enfermedades
--    registradas, declaradas y con informe NT-02 desde la tabla. Ahora las cuenta desde la vista; el grupo del
--    Anexo 1 (sale del CIE-10) y la certificación quedan solo para el servicio. Resto de la función, igual que 905000.
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
  -- Lo que el usuario puede leer de la tabla (el servicio) más lo de la vista sin datos clínicos (RR. HH., 937000).
  -- Son disjuntos: quien es RR. HH. en una organización no lee la tabla de esa organización.
  select ev.id, ev.org_id, ev.cie10, ev.fecha_declaracion, ev.fecha_informe_nt02, ev.en_anexo1,
         ev.certificacion_fecha, ev.estado_certificacion, true as con_detalle,
         coalesce(ev.fecha_diagnostico, ev.fecha_hora) as fdx
  from public.eventos ev
  where ev.tipo = 'enfermedad'
    and (p_empresa is null and not exists (select 1 from public.empresas ep where ep.id = ev.empresa_id and ep.es_particular) or ev.empresa_id = p_empresa)
    and coalesce(ev.fecha_diagnostico, ev.fecha_hora) >= p_desde
    and coalesce(ev.fecha_diagnostico, ev.fecha_hora) < p_hasta + 1
  union all
  select ev.id, ev.org_id, null, ev.fecha_declaracion, ev.fecha_informe_nt02, ev.en_anexo1,
         null::date, null, false,
         coalesce(ev.fecha_diagnostico, ev.fecha_hora)
  from public.eventos_empresa ev
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
  from eo where eo.con_detalle
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

-- 4) Los reportes que corren con los permisos de quien llama (Inicio, índices, vigilancia, inspección, listados)
--    leían public.eventos: con la regla 1, RR. HH. habría visto 0 accidentes sin aviso. eventos_visibles() da lo
--    que el usuario lee de la tabla más lo de la vista, con lo clínico vacío. Son disjuntos (regla 1).
--    Para RR. HH.: incapacidad vacía y dias_cargados = el neto del índice, así la fórmula de severidad
--    (parcial permanente: cargados − perdidos) da el mismo número que al servicio.
create or replace function public.eventos_visibles()
returns setof public.eventos language sql stable set search_path = public as $$
  select * from public.eventos
  union all
  select r.* from public.eventos_empresa v
  cross join lateral jsonb_populate_record(null::public.eventos,
    (to_jsonb(v) - 'dias_cargados_indice')
    || jsonb_build_object('dias_cargados', v.dias_cargados_indice, 'potencial_discapacidad', false, 'cargos', '[]'::jsonb)) r
$$;
revoke execute on function public.eventos_visibles() from public, anon;
grant execute on function public.eventos_visibles() to authenticated;

-- Parches de texto sobre la versión vigente de cada función: falla si el texto no aparece exactamente una vez
-- (mismo ayudante temporal que 931000; se borra al final)
create or replace function public.parche_unico(p_def text, p_viejo text, p_nuevo text, p_donde text)
returns text language plpgsql immutable set search_path = public as $$
declare v_def text := replace(p_def, chr(13), ''); v_viejo text := replace(p_viejo, chr(13), '');
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception '% cambió: revisar 20261030937000 antes de aplicarla (%)', p_donde, left(v_viejo, 60);
  end if;
  return replace(v_def, v_viejo, replace(p_nuevo, chr(13), ''));
end $$;
revoke execute on function public.parche_unico(text, text, text, text) from public, anon, authenticated;
do $$
begin
  execute public.parche_unico(pg_get_functiondef('public.indices_accidentalidad(uuid,date,date)'::regprocedure),
    'select * from public.eventos
  where', 'select * from public.eventos_visibles()
  where', 'indices_accidentalidad');
  execute public.parche_unico(pg_get_functiondef('public.reporte_indicadores(text,uuid,date,date,jsonb)'::regprocedure),
    'from public.eventos ev', 'from public.eventos_visibles() ev', 'reporte_indicadores');
  execute public.parche_unico(pg_get_functiondef('public.reporte_vigilancia(uuid,date,date)'::regprocedure),
    'select e.* from public.eventos e', 'select e.* from public.eventos_visibles() e', 'reporte_vigilancia');
  execute public.parche_unico(pg_get_functiondef('public.inicio_conteos(uuid,boolean,boolean)'::regprocedure),
    'from public.eventos e where', 'from public.eventos_visibles() e where', 'inicio_conteos');
  execute public.parche_unico(pg_get_functiondef('public.inspeccion_conteos(uuid,date,date)'::regprocedure),
    'select e.* from public.eventos e', 'select e.* from public.eventos_visibles() e', 'inspeccion_conteos');
  execute public.parche_unico(pg_get_functiondef('public.reporte_listado(text,uuid,date,date,jsonb)'::regprocedure),
    'from public.eventos ev', 'from public.eventos_visibles() ev', 'reporte_listado');
end $$;
drop function public.parche_unico(text, text, text, text);
