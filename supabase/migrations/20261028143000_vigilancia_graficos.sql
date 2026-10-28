-- zamorApp Ocupacional · Informe de vigilancia ejecutivo (gráficos y análisis)
-- 1) vigilancia_series: lo que necesitan los gráficos y que reporte_vigilancia no trae:
--    tendencia por mes, pirámide de la población por edad y sexo y morbilidad por capítulo CIE-10.
--    Función aparte (no se recrea reporte_vigilancia, que ya parchearon otras migraciones).
-- 2) informes_vigilancia.analisis: análisis editable de cada sección ({seccion: texto}) y la variante de redacción.
-- 3) Índices por fecha para el consolidado (todas las empresas), que filtra solo por período.

create index if not exists consultas_fecha on clinico.consultas (fecha);
create index if not exists reposos_periodo on clinico.reposos (desde, hasta);
create index if not exists eventos_fecha on public.eventos (fecha_hora);

alter table public.informes_vigilancia
  add column if not exists analisis jsonb not null default '{}'::jsonb,
  add column if not exists variante int not null default 0;

-- security invoker: las reglas RLS siguen aplicando (sin acceso clínico, la morbilidad sale vacía)
create or replace function public.vigilancia_series(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with
trab as (
  select t.id, t.sexo, t.fecha_nacimiento, t.estado, t.fecha_egreso
  from public.trabajadores t
  where (p_empresa is null or t.empresa_id = p_empresa)
),
poblacion as (
  select * from trab
  where estado in ('activo', 'reposo')
     or (estado = 'egresado' and coalesce(fecha_egreso, p_hasta) >= p_desde)
),
meses as (
  select generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month')::date as mes
),
cons as (
  select c.id, c.fecha, m.grupo as motivo_grupo
  from public.consultas c
  join trab t on t.id = c.trabajador_id
  left join public.lista_items m on m.id = c.motivo_id
  where c.fecha between p_desde and p_hasta
),
diag as (
  select d.cie10, c.fecha from public.diagnosticos d join cons c on c.id = d.consulta_id
),
rep as (
  select r.desde, r.hasta, r.causa
  from public.reposos r join trab t on t.id = r.trabajador_id
  where r.desde <= p_hasta and r.hasta >= p_desde
),
-- Capítulos CIE-10 por la letra (y el número cuando una letra se reparte en dos capítulos)
capitulos (desde_cod, hasta_cod, nombre) as (values
  ('A00', 'B99', 'Infecciosas y parasitarias'), ('C00', 'D49', 'Tumores'), ('D50', 'D89', 'Sangre e inmunidad'),
  ('E00', 'E90', 'Endocrinas y metabólicas'), ('F00', 'F99', 'Trastornos mentales'), ('G00', 'G99', 'Sistema nervioso'),
  ('H00', 'H59', 'Ojo y anexos'), ('H60', 'H95', 'Oído'), ('I00', 'I99', 'Circulatorio'), ('J00', 'J99', 'Respiratorio'),
  ('K00', 'K93', 'Digestivo'), ('L00', 'L99', 'Piel'), ('M00', 'M99', 'Osteomuscular'), ('N00', 'N99', 'Genitourinario'),
  ('O00', 'O99', 'Embarazo y parto'), ('R00', 'R99', 'Síntomas y signos'), ('S00', 'T98', 'Traumatismos'),
  ('V01', 'Y98', 'Causas externas'), ('Z00', 'Z99', 'Factores de salud y contacto')
)
select jsonb_build_object(
  'por_mes', coalesce((select jsonb_agg(jsonb_build_object(
      'mes', to_char(m.mes, 'YYYY-MM'),
      'consultas', (select count(*) from cons c where date_trunc('month', c.fecha) = m.mes),
      'preventivas', (select count(*) from cons c where date_trunc('month', c.fecha) = m.mes and c.motivo_grupo = 'preventivo'),
      'diagnosticos', (select count(*) from diag d where date_trunc('month', d.fecha) = m.mes),
      'dias_reposo', (select coalesce(sum(greatest(0, least(r.hasta, p_hasta, (m.mes + interval '1 month - 1 day')::date)
                                                   - greatest(r.desde, p_desde, m.mes) + 1)), 0)
                        from rep r where r.causa not in ('prenatal', 'postnatal'))
    ) order by m.mes) from meses m), '[]'),
  'piramide', coalesce((select jsonb_agg(jsonb_build_object('grupo', (array['< 18', '18-24', '25-34', '35-44', '45-54', '55-64', '65 y más', 'Sin dato'])[k], 'F', f, 'M', mm, 'n', n) order by k)
    from (
      select case when e is null then 8 when e < 18 then 1 when e < 25 then 2 when e < 35 then 3
                  when e < 45 then 4 when e < 55 then 5 when e < 65 then 6 else 7 end k,
             count(*) filter (where sexo = 'F') f,
             count(*) filter (where sexo = 'M') mm, count(*) n
      from (select sexo, extract(year from age(p_hasta, fecha_nacimiento)) e from poblacion) p group by 1
    ) x), '[]'),
  'capitulos', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'n', n) order by n desc, nombre)
    from (
      select coalesce(k.nombre, 'Sin capítulo') nombre, count(*) n
      from diag d
      left join capitulos k on upper(left(d.cie10, 3)) between k.desde_cod and k.hasta_cod
      group by 1
    ) x), '[]')
)
$$;

grant execute on function public.vigilancia_series(uuid, date, date) to authenticated;
