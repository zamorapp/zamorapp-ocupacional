-- zamorApp Ocupacional · Informe trimestral de vigilancia epidemiológica (Reglamento LOPCYMAT art. 34), versión 2
-- 1) Mes de inicio de la gestión por empresa: los trimestres se cuentan desde ese mes (p. ej. feb-abr).
-- 2) Textos del informe (resumen, conclusiones, recomendaciones, factores de riesgo, medidas de control y firmantes)
--    guardados por empresa y período, editables por el servicio médico.
-- 3) reporte_vigilancia amplía los indicadores (los mismos del SAME y algunos más). Conserva las claves anteriores.

alter table public.empresas
  add column if not exists mes_inicio_gestion smallint not null default 1 check (mes_inicio_gestion between 1 and 12);

create table if not exists public.informes_vigilancia (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete cascade,   -- vacío = consolidado de todas las empresas
  desde date not null,
  hasta date not null,
  resumen text,
  conclusiones text,
  recomendaciones text,
  factores_riesgo text,
  medidas_control text,
  firmantes jsonb not null default '{}'::jsonb,   -- {medico:{nombre,cedula}, sst:{...}, delegados:[...], empleador:{...}}
  actualizado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (hasta >= desde),
  unique nulls not distinct (org_id, empresa_id, desde, hasta)
);

alter table public.informes_vigilancia enable row level security;
-- Lo leen quienes ven la empresa (el consolidado, solo el servicio médico o el administrador)
create policy informes_vigilancia_leer on public.informes_vigilancia for select using (
  case when empresa_id is null then public.es_clinico(org_id) or public.es_admin(org_id)
       else public.puede_ver_empresa(org_id, empresa_id) end);
-- Lo redacta el servicio médico (y el administrador o el coordinador de SST)
create policy informes_vigilancia_editar on public.informes_vigilancia for all
  using ((public.es_clinico(org_id) or public.mi_rol(org_id) in ('administrador', 'coordinador_sst'))
         and (empresa_id is null or public.puede_ver_empresa(org_id, empresa_id)))
  with check ((public.es_clinico(org_id) or public.mi_rol(org_id) in ('administrador', 'coordinador_sst'))
         and (empresa_id is null or public.puede_ver_empresa(org_id, empresa_id)));

create trigger bit_informes_vigilancia after insert or update or delete on public.informes_vigilancia
  for each row execute function public.registrar_bitacora();
create trigger upd_informes_vigilancia before update on public.informes_vigilancia
  for each row execute function public.tocar_actualizado();

-- ─── Indicadores ───
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
-- Grupos etarios del formato INPSASEL / SAME
cons as (
  select c.*, t.sexo, t.fecha_nacimiento, t.tipo_paciente_id, m.nombre as motivo, m.grupo as motivo_grupo,
         coalesce(c.dependencia_id, t.dependencia_id) as dep_id,
         case when t.fecha_nacimiento is null then 'Sin dato'
              when extract(year from age(c.fecha, t.fecha_nacimiento)) < 18 then '12-17'
              when extract(year from age(c.fecha, t.fecha_nacimiento)) < 40 then '18-39'
              when extract(year from age(c.fecha, t.fecha_nacimiento)) < 60 then '40-59'
              else '60 y más' end as edad
  from public.consultas c
  join trab t on t.id = c.trabajador_id
  left join public.lista_items m on m.id = c.motivo_id
  where c.fecha between p_desde and p_hasta
),
diag as (
  select d.*, c.sexo, c.tipo, c.edad, c.motivo, c.motivo_grupo, c.trabajador_id,
         coalesce(dp.nombre, 'Sin dependencia') as dependencia
  from public.diagnosticos d
  join cons c on c.id = d.consulta_id
  left join public.dependencias dp on dp.id = c.dep_id
),
-- Diez primeras causas por cada corte (tipo de consulta, origen, sexo, edad, sistema, actividad, motivo, dependencia)
cortes as (
  select k.grupo, k.clave, d.cie10, min(d.descripcion) as descripcion, count(*) as n, count(distinct d.trabajador_id) as pacientes
  from diag d
  cross join lateral (values
    ('tipo', d.tipo),
    ('origen', d.origen),
    ('sexo', coalesce(d.sexo::text, 'Sin dato')),
    ('edad', d.edad),
    ('sistema', coalesce(nullif(d.sistema, ''), 'Sin clasificar')),
    ('actividad', case when d.motivo_grupo = 'preventivo' then 'preventiva' else 'no_preventiva' end),
    ('motivo', coalesce(d.motivo, 'Sin motivo')),
    ('dependencia', d.dependencia)
  ) as k (grupo, clave)
  group by 1, 2, 3
),
cortes_top as (
  select *, row_number() over (partition by grupo, clave order by n desc, cie10) as puesto from cortes
),
rep as (
  select r.*, t.dependencia_id,
    greatest(0, (least(r.hasta, p_hasta) - greatest(r.desde, p_desde) + 1)) as dias_en_periodo
  from public.reposos r
  join trab t on t.id = r.trabajador_id
  where r.desde <= p_hasta and r.hasta >= p_desde
),
apt as (
  select a.clasificacion from public.aptitudes a join cons c on c.id = a.consulta_id
),
refs as (
  select coalesce(nullif(trim(i ->> 'especialidad'), ''), 'Sin especialidad') as especialidad
  from cons c cross join lateral jsonb_array_elements(coalesce(c.interconsultas, '[]'::jsonb)) i
),
ev as (
  select e.* from public.eventos e
  where (p_empresa is null or e.empresa_id = p_empresa)
),
-- Diagnósticos de toda la historia de la población (vigilancia clínica: no depende del período)
diag_historia as (
  select distinct c.trabajador_id, d.origen
  from public.diagnosticos d
  join public.consultas c on c.id = d.consulta_id
  join poblacion p on p.id = c.trabajador_id
)
select jsonb_build_object(
  'poblacion', jsonb_build_object(
    'total', (select count(*) from poblacion),
    'femenino', (select count(*) from poblacion where sexo = 'F'),
    'masculino', (select count(*) from poblacion where sexo = 'M'),
    'discapacidad', (select count(*) from poblacion where discapacidad),
    'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(li.nombre, 'Sin tipo'), 'n', x.n) order by x.n desc)
      from (select tipo_paciente_id, count(*) n from poblacion group by 1) x left join public.lista_items li on li.id = x.tipo_paciente_id), '[]'),
    'vigilancia_ocupacional', (select count(distinct trabajador_id) from diag_historia where origen in ('ocupacional', 'accidente_laboral')),
    'vigilancia_no_ocupacional', (select count(distinct trabajador_id) from diag_historia where origen in ('comun', 'accidente_comun'))
  ),
  'consultas', jsonb_build_object(
    'total', (select count(*) from cons),
    'pacientes', (select count(distinct trabajador_id) from cons),
    'preventivas', (select count(*) from cons where motivo_grupo = 'preventivo'),
    'no_preventivas', (select count(*) from cons where coalesce(motivo_grupo, '') <> 'preventivo'),
    'sanos', (select count(*) from cons where sano),
    'patologicos', (select count(*) from cons c where exists (select 1 from diag d where d.consulta_id = c.id)),
    'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(motivo, 'Sin motivo'), 'grupo', motivo_grupo, 'n', n) order by n desc)
      from (select motivo, motivo_grupo, count(*) n from cons group by 1, 2) x), '[]'),
    'por_tipo', coalesce((select jsonb_object_agg(tipo, n) from (select tipo, count(*) n from cons group by 1) x), '{}'),
    'por_tipo_paciente', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(li.nombre, 'Sin tipo'), 'n', x.n) order by x.n desc)
      from (select tipo_paciente_id, count(*) n from cons group by 1) x left join public.lista_items li on li.id = x.tipo_paciente_id), '[]'),
    'por_sexo', jsonb_build_object('F', (select count(*) from cons where sexo = 'F'), 'M', (select count(*) from cons where sexo = 'M')),
    'por_edad', coalesce((select jsonb_agg(jsonb_build_object('grupo', edad, 'n', n) order by edad)
      from (select edad, count(*) n from cons group by 1) x), '[]'),
    'por_dependencia', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'personal', x.personal, 'n', x.n) order by x.n desc, x.nombre)
      from (
        select coalesce(dp.nombre, 'Sin dependencia') nombre,
               (select count(*) from poblacion p where p.dependencia_id is not distinct from g.dep_id) personal,
               g.n
        from (select dep_id, count(*) n from cons group by 1) g
        left join public.dependencias dp on dp.id = g.dep_id
      ) x), '[]')
  ),
  'morbilidad', jsonb_build_object(
    'total', (select count(*) from diag),
    'pacientes', (select count(distinct trabajador_id) from diag),
    'por_sistema', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(nullif(sistema, ''), 'Sin clasificar'), 'n', n) order by n desc)
      from (select sistema, count(*) n from diag group by 1) x), '[]'),
    'por_origen', coalesce((select jsonb_object_agg(origen, n) from (select origen, count(*) n from diag group by 1) x), '{}'),
    'por_tipo_consulta', coalesce((select jsonb_object_agg(tipo, jsonb_build_object('n', n, 'pacientes', pacientes))
      from (select tipo, count(*) n, count(distinct trabajador_id) pacientes from diag group by 1) x), '{}'),
    'primeras_causas', coalesce((select jsonb_agg(jsonb_build_object('cie10', cie10, 'descripcion', descripcion, 'n', n, 'pacientes', pacientes) order by n desc, cie10)
      from (select cie10, min(descripcion) descripcion, count(*) n, count(distinct trabajador_id) pacientes from diag group by 1 order by 3 desc, 1 limit 10) x), '[]'),
    'cortes', coalesce((select jsonb_object_agg(grupo, claves) from (
        select grupo, jsonb_object_agg(clave, causas) claves from (
          select grupo, clave, jsonb_agg(jsonb_build_object('cie10', cie10, 'descripcion', descripcion, 'n', n, 'pacientes', pacientes) order by puesto) causas
          from cortes_top where puesto <= 10 group by 1, 2
        ) y group by 1
      ) z), '{}')
  ),
  'referencias', jsonb_build_object(
    'total', (select count(*) from refs),
    'por_especialidad', coalesce((select jsonb_agg(jsonb_build_object('nombre', especialidad, 'n', n) order by n desc, especialidad)
      from (select especialidad, count(*) n from refs group by 1 order by 2 desc, 1 limit 10) x), '[]')
  ),
  'ausentismo', jsonb_build_object(
    'reposos', (select count(*) from rep),
    'reposos_iniciados', (select count(*) from rep where desde >= p_desde),
    'trabajadores_ausentes', (select count(distinct trabajador_id) from rep where causa not in ('prenatal', 'postnatal')),
    'dias_perdidos', (select coalesce(sum(dias_en_periodo), 0) from rep),
    'dias_periodo', (select n from dias_periodo),
    -- pre y postnatal no cuentan para el % de ausentismo
    'dias_computables', (select coalesce(sum(dias_en_periodo), 0) from rep where causa not in ('prenatal', 'postnatal')),
    'por_causa', coalesce((select jsonb_agg(jsonb_build_object('nombre', causa, 'n', n, 'dias', dias) order by dias desc)
      from (select causa, count(*) n, sum(dias_en_periodo) dias from rep group by 1) x), '[]'),
    'por_ente', coalesce((select jsonb_agg(jsonb_build_object('nombre', ente_emisor, 'n', n, 'dias', dias) order by dias desc)
      from (select ente_emisor, count(*) n, sum(dias_en_periodo) dias from rep group by 1) x), '[]'),
    'primeras_causas', coalesce((select jsonb_agg(jsonb_build_object('cie10', x.cie10, 'descripcion', coalesce(c.descripcion, x.cie10), 'n', x.n, 'dias', x.dias) order by x.n desc, x.dias desc)
      from (select cie10, count(*) n, sum(dias_en_periodo) dias from rep where cie10 is not null group by 1 order by 2 desc, 3 desc limit 10) x
      left join public.cie10 c on c.codigo = x.cie10), '[]'),
    'detalle', coalesce((select jsonb_agg(jsonb_build_object('causa', x.causa, 'ente', x.ente_emisor, 'cie10', x.cie10, 'descripcion', coalesce(c.descripcion, x.cie10), 'n', x.n, 'dias', x.dias) order by x.causa, x.dias desc)
      from (select causa, ente_emisor, cie10, count(*) n, sum(dias_en_periodo) dias from rep group by 1, 2, 3) x
      left join public.cie10 c on c.codigo = x.cie10), '[]'),
    'por_dependencia', coalesce((select jsonb_agg(jsonb_build_object('nombre', coalesce(dp.nombre, 'Sin dependencia'), 'n', x.n, 'dias', x.dias) order by x.dias desc)
      from (select dependencia_id, count(*) n, sum(dias_en_periodo) dias from rep group by 1) x
      left join public.dependencias dp on dp.id = x.dependencia_id), '[]')
  ),
  'enfermedad_ocupacional', jsonb_build_object(
    'casos', (select count(*) from ev where tipo = 'enfermedad'
      and coalesce(fecha_diagnostico, fecha_hora) >= p_desde and coalesce(fecha_diagnostico, fecha_hora) < p_hasta + 1),
    'dias', (select coalesce(sum(dias_en_periodo), 0) from rep where causa = 'enfermedad_ocupacional'),
    'casos_anteriores', (select count(*) from ev where tipo = 'enfermedad' and coalesce(fecha_diagnostico, fecha_hora) < p_desde),
    'dias_anteriores', (select coalesce(sum(r.dias_en_periodo), 0) from rep r where r.causa = 'enfermedad_ocupacional'
      and exists (select 1 from ev where ev.tipo = 'enfermedad' and ev.trabajador_id = r.trabajador_id and coalesce(ev.fecha_diagnostico, ev.fecha_hora) < p_desde))
  ),
  'accidentes', coalesce((select jsonb_agg(jsonb_build_object(
      'fecha', fecha_hora, 'tipo', tipo, 'lugar', lugar, 'lesion', naturaleza_lesion, 'parte', parte_cuerpo,
      'gravedad', gravedad, 'dias', dias_perdidos, 'estado', estado) order by fecha_hora)
    from ev where tipo in ('accidente', 'incidente') and fecha_hora >= p_desde and fecha_hora < p_hasta + 1), '[]'),
  'aptitud', coalesce((select jsonb_object_agg(clasificacion, n) from (select clasificacion, count(*) n from apt group by 1) x), '{}')
)
$$;

grant execute on function public.reporte_vigilancia(uuid, date, date) to authenticated;
