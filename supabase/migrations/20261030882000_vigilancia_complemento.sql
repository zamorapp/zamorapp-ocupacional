-- zamorApp Ocupacional · Vigilancia: lo que el SAME trae y el informe todavía no (pedido de Cesar, 05-nov)
-- 1) Morbilidad por dependencia desglosada por motivo de consulta (SAME pág. 19, diferencia D7 del paralelo).
-- 2) Diez primeras causas de morbilidad por cargo (puesto de trabajo).
-- 3) Catálogo de motivos y de aparatos y sistemas, para listar también los que quedan en cero (como el SAME).
--
-- Función aparte (no se reescribe reporte_vigilancia): esa función la parchean en vivo 20261027210000 y
-- 20261030760000 con pg_get_functiondef, y copiarla entera desharía esos parches.
-- Invocador (sin security definer): lee con las reglas de acceso de quien la llama, igual que reporte_vigilancia.
-- Columnas explícitas de trabajadores: nada de salud (grupo sanguíneo, discapacidad) se lee de ahí.

create or replace function public.vigilancia_complemento(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with
-- Misma población de consultas que reporte_vigilancia: solo efectivos, salvo que la organización cuente a todos
trab as (
  select t.id, t.org_id, t.dependencia_id, t.puesto_id
  from public.trabajadores t
  left join public.organizaciones o on o.id = t.org_id
  left join public.lista_items tp on tp.id = t.tipo_paciente_id
  where (p_empresa is null or t.empresa_id = p_empresa)
    and (coalesce(o.ajustes ->> 'vigilancia_poblacion', 'efectivos') = 'todos'
         or coalesce(tp.grupo = 'efectivo', t.tipo_paciente_id is null and t.estado <> 'aspirante'))
),
cons as (
  select c.id, c.trabajador_id, coalesce(c.dependencia_id, t.dependencia_id) as dep_id, t.puesto_id,
         coalesce(m.nombre, 'Sin motivo') as motivo
  from public.consultas c
  join trab t on t.id = c.trabajador_id
  left join public.lista_items m on m.id = c.motivo_id
  where c.fecha between p_desde and p_hasta
),
diag as (
  select d.cie10, d.descripcion, c.id as consulta_id, c.trabajador_id, c.dep_id, c.motivo,
         coalesce(nullif(trim(pu.nombre), ''), 'Sin cargo') as cargo
  from public.diagnosticos d
  join cons c on c.id = d.consulta_id
  left join public.puestos pu on pu.id = c.puesto_id
),
dep_mot as (
  select coalesce(dp.nombre, 'Sin dependencia') as dependencia, c.motivo,
         count(distinct c.id) as consultas,
         (select count(*) from diag d where d.dep_id is not distinct from c.dep_id and d.motivo = c.motivo) as diagnosticos
  from cons c
  left join public.dependencias dp on dp.id = c.dep_id
  group by 1, 2, c.dep_id
),
cargo_causas as (
  select cargo, cie10, min(descripcion) as descripcion, count(*) as n, count(distinct trabajador_id) as pacientes,
         row_number() over (partition by cargo order by count(*) desc, cie10) as puesto
  from diag
  group by cargo, cie10
),
-- Los 15 cargos con más diagnósticos (el resto se resume en el análisis, no en cuadros)
cargos_top as (
  select cargo from diag group by cargo order by count(*) desc, cargo limit 15
),
-- Organizaciones de quien consulta (las listas propias de cada una)
mis_org as (
  select m.org_id from public.miembros m where m.usuario_id = auth.uid() and m.activo
)
select jsonb_build_object(
  'dependencia_motivo', coalesce((select jsonb_agg(jsonb_build_object('dependencia', dependencia, 'motivo', motivo, 'consultas', consultas, 'diagnosticos', diagnosticos)
      order by dependencia, consultas desc, motivo) from dep_mot), '[]'),
  'cargos', coalesce((select jsonb_object_agg(cargo, causas) from (
      select k.cargo, jsonb_agg(jsonb_build_object('cie10', k.cie10, 'descripcion', k.descripcion, 'n', k.n, 'pacientes', k.pacientes) order by k.n desc, k.cie10) as causas
      from cargo_causas k join cargos_top ct on ct.cargo = k.cargo
      where k.puesto <= 10
      group by k.cargo) x), '{}'),
  'cargos_total', (select count(distinct cargo) from diag),
  -- Motivos activos de la organización (o de la lista base si no tiene propia), en el orden de Configuración › Listas
  'motivos', coalesce((select jsonb_agg(jsonb_build_object('nombre', li.nombre, 'grupo', li.grupo) order by li.orden, li.nombre)
      from public.lista_items li
      where li.lista = 'motivo_consulta' and li.activo
        and (li.org_id in (select org_id from mis_org)
             or (li.org_id is null and not exists (select 1 from public.lista_items x where x.lista = 'motivo_consulta' and x.org_id in (select org_id from mis_org))))), '[]'),
  -- Aparatos y sistemas que el servicio ya usó alguna vez (y los de su lista de diagnósticos)
  'sistemas', coalesce((select jsonb_agg(s order by s) from (
      select distinct trim(d.sistema) s from public.diagnosticos d
      join public.consultas c on c.id = d.consulta_id
      join trab t on t.id = c.trabajador_id
      where nullif(trim(d.sistema), '') is not null
      union
      select distinct trim(li.grupo) from public.lista_items li
      where li.lista = 'diagnostico' and li.activo and li.org_id in (select org_id from mis_org) and nullif(trim(li.grupo), '') is not null
    ) x), '[]')
);
$$;

revoke execute on function public.vigilancia_complemento(uuid, date, date) from public, anon;
grant execute on function public.vigilancia_complemento(uuid, date, date) to authenticated;
