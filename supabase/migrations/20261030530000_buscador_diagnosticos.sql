-- zamorApp Ocupacional · Buscador de diagnósticos y medicinas como en el SAME (pedido de Cesar, 30-oct)
-- 1) Desde la consulta, el médico (también el gerente médico y el administrador) agrega a «Mis diagnósticos» o a
--    «Mis medicinas» lo que no encuentra. Solo INSERT en esas dos listas; editar o borrar sigue en Configuración › Listas
--    (administrador o gerente médico). Sube por la bandeja como cualquier fila de lista_items.
-- 2) buscar_diagnosticos muestra más (la pantalla pide hasta 40) y también los propios sin código CIE-10 todavía.

--    Se marcan con datos.propio = true (así los reportes los distinguen: un diagnóstico sin código sale «sin CIE-10»,
--    nunca con un código inventado). Un disparador fija base_id, activo y origen y limita los largos; un índice único
--    evita dos iguales, y en la bandeja la misma medicina agregada en dos PC se funde por (org_id, lista, nombre).
drop policy if exists items_agregar_propios on public.lista_items;
create policy items_agregar_propios on public.lista_items for insert to authenticated
  with check (lista in ('diagnostico', 'medicina') and org_id is not null and (datos ->> 'propio') = 'true'
              and origen is null and base_id is null and activo
              and org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}'))::uuid[]));

create or replace function public.preparar_item_propio()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.lista not in ('diagnostico', 'medicina') then
    raise exception 'Desde la consulta solo se agregan diagnósticos y medicinas.';
  end if;
  new.nombre := btrim(regexp_replace(coalesce(new.nombre, ''), '\s+', ' ', 'g'));
  new.codigo := nullif(upper(btrim(coalesce(new.codigo, ''))), '');
  if new.nombre = '' or length(new.nombre) > 200 or length(coalesce(new.codigo, '')) > 20 then
    raise exception 'Nombre de 1 a 200 letras y código de hasta 20.';
  end if;
  new.base_id := null;
  new.activo := true;
  new.origen := null;
  new.codigo_origen := null;
  return new;
end $$;
revoke execute on function public.preparar_item_propio() from public, anon, authenticated;

drop trigger if exists preparar_item_propio on public.lista_items;
create trigger preparar_item_propio before insert on public.lista_items
  for each row when ((new.datos ->> 'propio') = 'true') execute function public.preparar_item_propio();

create unique index if not exists lista_items_propios_unicos on public.lista_items (org_id, lista, lower(nombre))
  where (datos ->> 'propio') = 'true';

-- Bandeja: el mismo nombre agregado en dos PC sin internet se funde en una sola fila (20261030400000)
update sync.tablas set clave_natural = array['org_id', 'lista', 'nombre'] where nombre = 'public.lista_items' and clave_natural is null;

create or replace function public.buscar_diagnosticos(p_texto text, p_limite int default 20)
returns table (cie10 text, descripcion text, usos bigint)
language sql stable set search_path = public, extensions as $$
  with palabras as (
    select array_agg(p) as lista
    from regexp_split_to_table(lower(extensions.unaccent(trim(p_texto))), '\s+') p
    where p <> ''
  ),
  propios as (
    select coalesce(i.codigo, '') as cie10, i.nombre as descripcion, 1000000::bigint - i.orden as usos
    from public.lista_items i, palabras w
    where i.lista = 'diagnostico' and i.activo and i.org_id in (select public.mis_orgs())
      and (select bool_and(lower(extensions.unaccent(coalesce(i.codigo, '') || ' ' || i.nombre)) like '%' || x || '%') from unnest(w.lista) x)
    order by i.orden
    limit 25
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
  select * from (select * from usados order by usos desc limit 15) u
  union all
  select * from catalogo
  limit p_limite
$$;
grant execute on function public.buscar_diagnosticos(text, int) to authenticated;
