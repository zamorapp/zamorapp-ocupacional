-- Rendimiento de las reglas de acceso (arreglo 4 del mantenimiento, 14-nov).
-- 1) Políticas: auth.uid(), auth.role() y current_setting(...) se envuelven en (select ...) para que Postgres los calcule
--    UNA vez por consulta y no una vez por fila (aviso «auth_rls_initplan» de Supabase). El resultado es idéntico:
--    son funciones estables dentro de una misma sentencia. Se hace leyendo cada política de pg_policies, así cubre
--    también las que existan solo en la nube o solo en la base local, sin reescribirlas a mano.
-- 2) Llaves foráneas sin índice (aviso «unindexed_foreign_keys»): se crea un índice por cada una. Acelera los
--    filtros por org_id/empresa/trabajador y los borrados del lado «padre».
-- Solo esquemas propios (public, clinico, sync); storage y auth son de Supabase y no se tocan.
-- Se puede repetir: lo ya envuelto o ya indexado se salta. La prueba 261 falla si una migración futura vuelve a dejar
-- una política sin envolver o una llave foránea sin índice.

create or replace function public.envolver_funciones_rls(p text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(regexp_replace(p,
    '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid() AS uid)', 'g'),
    '(?<!SELECT )auth\.role\(\)', '( SELECT auth.role() AS role)', 'g'),
    '(?<!SELECT )current_setting\(([^()]*)\)', '( SELECT current_setting(\1) AS current_setting)', 'g')
$$;
revoke all on function public.envolver_funciones_rls(text) from public, anon, authenticated;

do $$
declare
  r record; q text; c text; sentencia text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
     where schemaname in ('public', 'clinico', 'sync')
  loop
    q := public.envolver_funciones_rls(r.qual);
    c := public.envolver_funciones_rls(r.with_check);
    if q is distinct from r.qual or c is distinct from r.with_check then
      sentencia := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      if r.qual is not null then sentencia := sentencia || ' using (' || q || ')'; end if;
      if r.with_check is not null then sentencia := sentencia || ' with check (' || c || ')'; end if;
      execute sentencia;
    end if;
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select c.conrelid, c.conname, n.nspname, t.relname,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columnas
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f' and n.nspname in ('public', 'clinico', 'sync')
       and t.relkind = 'r'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
            and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey)
  loop
    execute format('create index if not exists %I on %I.%I (%s)',
      'ix_' || left(r.conname, 51) || '_' || substr(md5(r.conrelid::regclass::text || r.conname), 1, 6),
      r.nspname, r.relname, r.columnas);
  end loop;
end $$;
