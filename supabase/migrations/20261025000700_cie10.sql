-- zamorApp Ocupacional · Catálogo CIE-10 y "trabajador sano"
-- El catálogo (14.204 códigos en español) se carga con scripts/cargar-cie10.mjs.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists public.cie10 (
  codigo text primary key,          -- con punto: M54.5
  descripcion text not null,
  busqueda text not null            -- código + descripción, en minúscula y sin acentos
);
create index if not exists cie10_busqueda_trgm on public.cie10 using gin (busqueda extensions.gin_trgm_ops);

alter table public.cie10 enable row level security;
drop policy if exists cie10_leer on public.cie10;
create policy cie10_leer on public.cie10 for select using (auth.role() = 'authenticated');

-- Búsqueda mientras se escribe: primero los diagnósticos que el servicio ya usó (más frecuentes),
-- luego el catálogo. Las palabras pueden ir en cualquier orden ("sindrome tunel").
create or replace function public.buscar_diagnosticos(p_texto text, p_limite int default 20)
returns table (cie10 text, descripcion text, usos bigint)
language sql stable set search_path = public, extensions as $$
  with palabras as (
    select array_agg(p) as lista
    from regexp_split_to_table(lower(extensions.unaccent(trim(p_texto))), '\s+') p
    where p <> ''
  ),
  usados as (
    select d.cie10, d.descripcion, count(*) as usos
    from clinico.diagnosticos d, palabras w
    where (select bool_and(lower(extensions.unaccent(d.cie10 || ' ' || d.descripcion)) like '%' || x || '%') from unnest(w.lista) x)
    group by d.cie10, d.descripcion
  ),
  catalogo as (
    select c.codigo as cie10, c.descripcion, 0::bigint as usos
    from public.cie10 c, palabras w
    where (select bool_and(c.busqueda like '%' || x || '%') from unnest(w.lista) x)
      and not exists (select 1 from usados u where u.cie10 = c.codigo)
    order by length(c.codigo), c.codigo
    limit p_limite
  )
  select * from (select * from usados order by usos desc limit 8) u
  union all
  select * from catalogo
  limit p_limite
$$;

grant execute on function public.buscar_diagnosticos(text, int) to authenticated;

-- "Trabajador sano según el protocolo de evaluación clínica"
alter table clinico.consultas add column if not exists sano boolean not null default false;
-- La vista se rehace para incluir la columna nueva
create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;
