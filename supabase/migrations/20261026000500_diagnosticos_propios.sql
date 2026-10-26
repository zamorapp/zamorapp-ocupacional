-- zamorApp Ocupacional · Diagnósticos propios, editables por cada organización
-- Lista "diagnostico": nombre = cómo lo escribe el médico, codigo = CIE-10, grupo = sistema (opcional).
-- Aparecen primero en el buscador de la consulta. Se precargan con los diagnósticos traídos del Sistema Integral.

insert into public.listas (codigo, nombre, descripcion)
values ('diagnostico', 'Mis diagnósticos', 'Tus diagnósticos con su código CIE-10; aparecen primero en el buscador de la consulta')
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

insert into public.lista_items (lista, org_id, codigo, nombre, grupo, orden, activo, origen, codigo_origen)
select 'diagnostico', d.org_id, d.cie10, d.descripcion, max(d.sistema), row_number() over (partition by d.org_id order by count(*) desc), true,
       'integral', 'diag-propio:' || d.cie10 || ':' || lower(d.descripcion)
from clinico.diagnosticos d
where d.codigo_origen is not null
group by d.org_id, d.cie10, d.descripcion
on conflict (org_id, origen, codigo_origen) where origen is not null do nothing;

create or replace function public.buscar_diagnosticos(p_texto text, p_limite int default 20)
returns table (cie10 text, descripcion text, usos bigint)
language sql stable set search_path = public, extensions as $$
  with palabras as (
    select array_agg(p) as lista
    from regexp_split_to_table(lower(extensions.unaccent(trim(p_texto))), '\s+') p
    where p <> ''
  ),
  propios as (
    select i.codigo as cie10, i.nombre as descripcion, 1000000::bigint - i.orden as usos
    from public.lista_items i, palabras w
    where i.lista = 'diagnostico' and i.activo and i.codigo is not null and i.org_id in (select public.mis_orgs())
      and (select bool_and(lower(extensions.unaccent(i.codigo || ' ' || i.nombre)) like '%' || x || '%') from unnest(w.lista) x)
    order by i.orden
    limit 10
  ),
  usados as (
    select d.cie10, d.descripcion, count(*) as usos
    from clinico.diagnosticos d, palabras w
    where (select bool_and(lower(extensions.unaccent(d.cie10 || ' ' || d.descripcion)) like '%' || x || '%') from unnest(w.lista) x)
      and not exists (select 1 from propios p where p.cie10 = d.cie10 and lower(p.descripcion) = lower(d.descripcion))
    group by d.cie10, d.descripcion
  ),
  catalogo as (
    select c.codigo as cie10, c.descripcion, 0::bigint as usos
    from public.cie10 c, palabras w
    where (select bool_and(c.busqueda like '%' || x || '%') from unnest(w.lista) x)
      and not exists (select 1 from usados u where u.cie10 = c.codigo)
      and not exists (select 1 from propios p where p.cie10 = c.codigo and lower(p.descripcion) = lower(c.descripcion))
    order by length(c.codigo), c.codigo
    limit p_limite
  )
  select * from propios
  union all
  select * from (select * from usados order by usos desc limit 8) u
  union all
  select * from catalogo
  limit p_limite
$$;
grant execute on function public.buscar_diagnosticos(text, int) to authenticated;
