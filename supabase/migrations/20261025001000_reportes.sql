-- zamorApp Ocupacional · Indicadores para Reportes y el informe trimestral (Reglamento LOPCYMAT art. 34)
-- security invoker: las reglas RLS siguen aplicando (sin acceso clínico, los bloques clínicos salen en cero).

create or replace function public.reporte_vigilancia(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with
dias_periodo as (select (p_hasta - p_desde + 1)::numeric as n),
trab as (
  select t.* from public.trabajadores t
  where (p_empresa is null or t.empresa_id = p_empresa)
),
poblacion as (
  select * from trab
  where estado in ('activo', 'reposo')
     or (estado = 'egresado' and coalesce(fecha_egreso, p_hasta) >= p_desde)
),
cons as (
  select c.*, t.sexo, t.fecha_nacimiento, m.nombre as motivo, m.grupo as motivo_grupo
  from public.consultas c
  join trab t on t.id = c.trabajador_id
  left join public.lista_items m on m.id = c.motivo_id
  where c.fecha between p_desde and p_hasta
),
diag as (
  select d.*, c.sexo from public.diagnosticos d join cons c on c.id = d.consulta_id
),
rep as (
  select r.*,
    greatest(0, (least(r.hasta, p_hasta) - greatest(r.desde, p_desde) + 1)) as dias_en_periodo
  from public.reposos r
  join trab t on t.id = r.trabajador_id
  where r.desde <= p_hasta and r.hasta >= p_desde
),
apt as (
  select a.clasificacion from public.aptitudes a join cons c on c.id = a.consulta_id
),
cuenta as (select count(*) from poblacion)
select jsonb_build_object(
  'poblacion', jsonb_build_object(
    'total', (select count(*) from poblacion),
    'femenino', (select count(*) from poblacion where sexo = 'F'),
    'masculino', (select count(*) from poblacion where sexo = 'M'),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(li.nombre, 'Sin tipo'), 'n', x.n) order by x.n desc)
      from (select tipo_paciente_id, count(*) n from poblacion group by 1) x left join public.lista_items li on li.id = x.tipo_paciente_id), '[]')
  ),
  'consultas', jsonb_build_object(
    'total', (select count(*) from cons),
    'pacientes', (select count(distinct trabajador_id) from cons),
    'preventivas', (select count(*) from cons where motivo_grupo = 'preventivo'),
    'no_preventivas', (select count(*) from cons where coalesce(motivo_grupo, '') <> 'preventivo'),
    'sanos', (select count(*) from cons where sano),
    'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(motivo, 'Sin motivo'), 'grupo', motivo_grupo, 'n', n) order by n desc)
      from (select motivo, motivo_grupo, count(*) n from cons group by 1, 2) x), '[]'),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from cons group by 1) x), '{}'),
    'por_sexo', jsonb_build_object('F', (select count(*) from cons where sexo = 'F'), 'M', (select count(*) from cons where sexo = 'M')),
    'por_edad', coalesce((select jsonb_agg(jsonb_build_object('grupo', g, 'n', n) order by g)
      from (select case
              when fecha_nacimiento is null then 'Sin dato'
              when extract(year from age(fecha, fecha_nacimiento)) < 20 then '< 20'
              when extract(year from age(fecha, fecha_nacimiento)) < 30 then '20-29'
              when extract(year from age(fecha, fecha_nacimiento)) < 40 then '30-39'
              when extract(year from age(fecha, fecha_nacimiento)) < 50 then '40-49'
              when extract(year from age(fecha, fecha_nacimiento)) < 60 then '50-59'
              else '60 y más' end g, count(*) n
            from cons group by 1) x), '[]')
  ),
  'morbilidad', jsonb_build_object(
    'total', (select count(*) from diag),
    'por_sistema', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(nullif(sistema, ''), 'Sin clasificar'), 'n', n) order by n desc)
      from (select sistema, count(*) n from diag group by 1) x), '[]'),
    'por_origen', coalesce((select jsonb_object_agg(origen, n) from (select origen, count(*) n from diag group by 1) x), '{}'),
    'primeras_causas', coalesce((select jsonb_agg(jsonb_build_object('cie10', cie10, 'descripcion', descripcion, 'n', n) order by n desc)
      from (select cie10, min(descripcion) descripcion, count(*) n from diag group by 1 order by 3 desc limit 10) x), '[]')
  ),
  'ausentismo', jsonb_build_object(
    'reposos', (select count(*) from rep),
    'dias_perdidos', (select coalesce(sum(dias_en_periodo), 0) from rep),
    'dias_periodo', (select n from dias_periodo),
    -- pre y postnatal no cuentan para el % de ausentismo
    'dias_computables', (select coalesce(sum(dias_en_periodo), 0) from rep where causa not in ('prenatal', 'postnatal')),
    'por_causa', coalesce((select jsonb_agg(jsonb_build_object('nombre', causa, 'n', n, 'dias', dias) order by dias desc)
      from (select causa, count(*) n, sum(dias_en_periodo) dias from rep group by 1) x), '[]'),
    'por_ente', coalesce((select jsonb_agg(jsonb_build_object('nombre', ente_emisor, 'n', n) order by n desc)
      from (select ente_emisor, count(*) n from rep group by 1) x), '[]')
  ),
  'aptitud', coalesce((select jsonb_object_agg(clasificacion, n) from (select clasificacion, count(*) n from apt group by 1) x), '{}')
)
$$;

grant execute on function public.reporte_vigilancia(uuid, date, date) to authenticated;
