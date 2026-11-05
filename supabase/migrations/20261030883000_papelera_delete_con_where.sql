-- Eliminar desde la Papelera fallaba en la nube con «DELETE requires a WHERE clause».
-- Causa: Supabase carga pg_safeupdate en las sesiones de la API, que rechaza todo DELETE/UPDATE sin WHERE,
-- también dentro de funciones. papelera_disparadores vaciaba su tabla temporal con «delete from papelera_apagados;».
-- La base local de pruebas no carga pg_safeupdate, por eso no se vio. La prueba 198 barre todas las funciones.
create or replace function public.papelera_disparadores(p_tablas text[], p_encender boolean)
returns void language plpgsql set search_path = '' as $$
declare r record;
begin
  if not p_encender then
    create temp table if not exists papelera_apagados (tabla text, nombre text) on commit drop;
    insert into papelera_apagados
      select t.tgrelid::regclass::text, t.tgname
        from pg_catalog.pg_trigger t
       where t.tgrelid in (select x::regclass from unnest(p_tablas) x)
         and not t.tgisinternal and t.tgname not in ('sync_anotar', 'sync_version') and t.tgenabled <> 'D'
         and not exists (select 1 from papelera_apagados a where a.tabla = t.tgrelid::regclass::text and a.nombre = t.tgname);
    for r in select tabla, nombre from papelera_apagados loop
      execute format('alter table %s disable trigger %I', r.tabla, r.nombre);
    end loop;
  else
    for r in select tabla, nombre from papelera_apagados loop
      execute format('alter table %s enable trigger %I', r.tabla, r.nombre);
    end loop;
    delete from papelera_apagados where true;
  end if;
end $$;
