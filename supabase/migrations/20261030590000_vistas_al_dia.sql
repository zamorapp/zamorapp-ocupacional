-- zamorApp · URGENTE (Cesar, 30-oct 08:40): «marco reposo, lo lleno y al imprimir dice que no tiene reposo».
-- Causa: las vistas public.X («select * from clinico.X», las que lee la app) se congelan con las columnas que la tabla tenía
-- al crearlas. La 20261030420000 agregó clinico.reposos.observacion y la app la pide → PostgREST responde error →
-- la consulta se leía «sin reposo» (y un Guardar después lo borraba). Lo mismo pasaba con otras 7 vistas.
-- Arreglo definitivo: public.vistas_al_dia() rehace toda vista «select *» de una sola tabla a la que le falten columnas,
-- conservando sus opciones (security_invoker) y sus permisos. Se llama aquí y desde cualquier migración que agregue
-- columnas; la prueba 163 falla si alguna vista queda atrasada.
create or replace function public.vistas_al_dia()
returns text[] language plpgsql set search_path = '' as $$
declare
  v record;
  v_hechas text[] := '{}';
begin
  for v in
    select vc.oid as vista, vc.relname as nombre, t.oid as tabla, format('%I.%I', tn.nspname, t.relname) as tabla_nombre, vc.reloptions
      from pg_class vc
      join pg_namespace vn on vn.oid = vc.relnamespace and vn.nspname = 'public'
      join pg_rewrite r on r.ev_class = vc.oid
      join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass and d.refobjid <> vc.oid
      join pg_class t on t.oid = d.refobjid and t.relkind = 'r'
      join pg_namespace tn on tn.oid = t.relnamespace
     where vc.relkind = 'v'
     group by vc.oid, vc.relname, t.oid, tn.nspname, t.relname, vc.reloptions
     -- Solo vistas de UNA tabla cuyas columnas son, en orden, el comienzo de las de la tabla (el patrón «select *»)
    having (select count(distinct d2.refobjid) from pg_rewrite r2 join pg_depend d2 on d2.objid = r2.oid and d2.classid = 'pg_rewrite'::regclass
             where r2.ev_class = vc.oid and d2.refobjid <> vc.oid) = 1
  loop
    if (select array_agg(attname order by attnum) from pg_attribute where attrelid = v.vista and attnum > 0 and not attisdropped)
       = (select (array_agg(attname order by attnum))[1:(select count(*) from pg_attribute where attrelid = v.vista and attnum > 0 and not attisdropped)]
            from pg_attribute where attrelid = v.tabla and attnum > 0 and not attisdropped)
       and exists (select 1 from pg_attribute a where a.attrelid = v.tabla and a.attnum > 0 and not a.attisdropped
                     and not exists (select 1 from pg_attribute b where b.attrelid = v.vista and b.attname = a.attname)) then
      execute format('create or replace view public.%I %s as select * from %s', v.nombre,
        case when v.reloptions is null then '' else 'with (' || array_to_string(v.reloptions, ', ') || ')' end, v.tabla_nombre);
      v_hechas := v_hechas || v.nombre::text;
    end if;
  end loop;
  return v_hechas;
end $$;
revoke execute on function public.vistas_al_dia() from public, anon, authenticated;

select public.vistas_al_dia();
