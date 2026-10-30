-- Bajada del escritorio por tabla (30-oct-2026): miles de cambios acumulados no pasan los 8 s de la nube y el resultado
-- es idéntico al de antes (una fila_visible por fila), para el servicio y para RR. HH.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.equipos (id,org_id,nombre,serie,secreto_hash) values
 ('e0000000-0000-0000-0000-000000000175','10000000-0000-0000-0000-000000000001','PC 175','Y',encode(sha256('s175'::bytea),'hex'))
 on conflict do nothing;
create temp table p175 as select coalesce(max(seq), 0) as desde from sync.registro;
grant select on p175 to authenticated;
-- 3.000 trabajadores nuevos y luego un cambio a todos (como restaurar cargos con la PC apagada), y uno borrado
insert into public.trabajadores (org_id, empresa_id, cedula, nombres, apellidos, grupo_sanguineo, codigo_origen)
select '10000000-0000-0000-0000-000000000001',
       (array['20000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000b'])[1 + (g % 2)]::uuid,
       'V-175' || g, 'N' || g, 'A' || g, 'O+', 'p175-' || g
from generate_series(1, 3000) g;
update public.trabajadores set turno = 'Diurno' where codigo_origen like 'p175-%';
delete from public.trabajadores where codigo_origen = 'p175-7';
set role authenticated;

-- Lo mismo que armaba la versión anterior, fila por fila
create function pg_temp.antes(p_desde bigint, p_limite int) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('seq', l.seq, 'tabla', l.tabla, 'fila_id', l.fila_id, 'op', l.op,
           'version', coalesce((f.fila ->> 'version')::bigint, l.version), 'cambio_id', l.cambio_id, 'fila', f.fila) order by l.seq), '[]')
    from (select * from sync.registro where (org_id = '10000000-0000-0000-0000-000000000001' or org_id is null)
             and seq > p_desde order by seq limit p_limite) l
    cross join lateral (select case when l.op = 'D' then null else sync.fila_visible(l.tabla, l.fila_id) end as fila) f
   where l.op = 'D' or f.fila is not null
$$;

-- Administrador (servicio): con grupo sanguíneo
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin: igual que antes en cada lote (debe 1): ' || count(*) from p175
 where public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde,2000)->'cambios' = pg_temp.antes(desde,2000)
   and public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde+2000,2000)->'cambios' = pg_temp.antes(desde+2000,2000)
   and public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde+4000,2000)->'cambios' = pg_temp.antes(desde+4000,2000);
select 'admin: baja el grupo sanguíneo (debe 1): ' || least(count(*),1) from p175,
  jsonb_array_elements(public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde,2000)->'cambios') x
 where x->'fila'->>'grupo_sanguineo' = 'O+';
select 'admin: llega el borrado (debe 1): ' || count(*)
  from jsonb_array_elements(public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',
         (select max(seq) - 1 from sync.registro where op = 'D' and tabla = 'public.trabajadores'),10)->'cambios') x
 where x->>'op' = 'D' and x->>'tabla' = 'public.trabajadores';
select 'cursor avanza al último del lote aunque no se vea (debe 1): ' || count(*) from p175
 where (public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde,2000)->>'hasta')::bigint
       = (select max(seq) from (select seq from sync.registro where seq > desde order by seq limit 2000) s);
select 'sin cambios devuelve el mismo cursor (debe 1): ' || count(*) from p175
 where public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde+100000,2000) = jsonb_build_object('hasta', desde+100000, 'cambios', '[]'::jsonb);
-- Tiempo: un lote de 2.000 (el máximo) muy por debajo de los 8 s del rol authenticated
do $$ declare t0 timestamptz := clock_timestamp(); begin
  perform public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',(select desde from p175),2000);
  raise notice 'lote de 2000 en % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);
  t0 := clock_timestamp();
  perform pg_temp.antes((select desde from p175),2000);
  raise notice 'antes (fila por fila): % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
select 'lote de 2000 en menos de 3 s (debe 1): ' || count(*) from (select clock_timestamp() t0) a,
  lateral (select public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',(select desde from p175),2000) r) b
 where clock_timestamp() - t0 < interval '3 seconds';

-- Médico de A: ve solo A, con salud
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico: igual que antes (debe 1): ' || count(*) from p175
 where public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde,2000)->'cambios' = pg_temp.antes(desde,2000);
select 'médico: no baja la empresa B (debe 0): ' || count(*) from p175,
  jsonb_array_elements(public.cambios_desde('e0000000-0000-0000-0000-000000000175','s175',desde,2000)->'cambios') x
 where x->'fila'->>'empresa_id' = '20000000-0000-0000-0000-00000000000b';
reset role;
-- Cada prueba deja su propio estado
delete from public.trabajadores where codigo_origen like 'p175-%';
delete from public.equipos where id = 'e0000000-0000-0000-0000-000000000175';
drop table p175;
