-- Tasa BCV automática (migración 903000): el latido sin sesión guarda la tasa con la clave del servidor, nunca pisa la
-- escrita a mano, rechaza clave falsa, fechas fuera de rango y saltos de más de 30 %. Deja los datos como estaban.
\pset tuples_only on
reset role;
delete from public.tasas_bcv where org_id='10000000-0000-0000-0000-000000000001';
delete from public.avisos_push_clave where org_id='10000000-0000-0000-0000-000000000001';
insert into public.avisos_push_clave (org_id, clave_hash) values
 ('10000000-0000-0000-0000-000000000001', sha256(convert_to('clave-de-prueba-210-0123456789abcdef','UTF8')));

set role anon;
select 'sin tasas la última fecha es nula (debe 1): ' || count(*) from (select public.tasa_bcv_ultima_fecha('clave-de-prueba-210-0123456789abcdef') u) x where u is null;
select 'clave falsa no guarda (debe 0): ' || public.guardar_tasa_bcv_auto('clave-falsa-210-xxxxxxxxxxxxxxxxxxxxxxx', public.hoy_caracas(), 896.1225, 'bcv');
select 'clave corta no guarda (debe 0): ' || public.guardar_tasa_bcv_auto('corta', public.hoy_caracas(), 896.1225, 'bcv');
select 'el latido guarda la de hoy (debe 1): ' || public.guardar_tasa_bcv_auto('clave-de-prueba-210-0123456789abcdef', public.hoy_caracas(), 896.1225, 'bcv');
select 'y la de mañana (debe 1): ' || public.guardar_tasa_bcv_auto('clave-de-prueba-210-0123456789abcdef', public.hoy_caracas() + 1, 898.5, 'respaldo');
select 'la última fecha es mañana (debe 1): ' || count(*) from (select public.tasa_bcv_ultima_fecha('clave-de-prueba-210-0123456789abcdef') u) x where u = public.hoy_caracas() + 1;
do $$ begin perform public.guardar_tasa_bcv_auto('clave-de-prueba-210-0123456789abcdef', public.hoy_caracas() + 30, 900, 'bcv'); raise notice 'FALLA: aceptó una fecha lejana';
exception when others then null; end $$;
do $$ begin perform public.guardar_tasa_bcv_auto('clave-de-prueba-210-0123456789abcdef', public.hoy_caracas() + 2, 2000, 'bcv'); raise notice 'FALLA: aceptó un salto de más de 30 %%';
exception when others then null; end $$;
do $$ begin perform public.guardar_tasa_bcv_auto('clave-de-prueba-210-0123456789abcdef', public.hoy_caracas() + 2, 900, 'manual'); raise notice 'FALLA: el latido se hizo pasar por manual';
exception when others then null; end $$;

select 'freno: el primer intento toca (debe 1): ' || count(*) from (select public.tasa_bcv_reservar_intento('clave-de-prueba-210-0123456789abcdef') r) x where r;
select 'freno: el segundo antes de 10 min no (debe 0): ' || count(*) from (select public.tasa_bcv_reservar_intento('clave-de-prueba-210-0123456789abcdef') r) x where r;
select 'freno: clave falsa no reserva (debe 0): ' || count(*) from (select public.tasa_bcv_reservar_intento('clave-falsa-210-xxxxxxxxxxxxxxxxxxxxxxx') r) x where r;

-- El administrador corrige la de hoy a mano: el latido ya no la pisa
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
with x as (insert into public.tasas_bcv (org_id, fecha, tasa, fuente) values ('10000000-0000-0000-0000-000000000001', public.hoy_caracas(), 895, 'manual')
  on conflict (org_id, fecha) do update set tasa = excluded.tasa, fuente = excluded.fuente returning 1)
select 'el administrador la escribe a mano (debe 1): ' || count(*) from x;
-- RR. HH. no la toca
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
with x as (update public.tasas_bcv set tasa = 1 where org_id = '10000000-0000-0000-0000-000000000001' returning 1)
select 'RR. HH. no cambia la tasa (debe 0): ' || count(*) from x;
reset role;
set role anon;
select 'el latido cuenta la organización (debe 1): ' || public.guardar_tasa_bcv_auto('clave-de-prueba-210-0123456789abcdef', public.hoy_caracas(), 896.1225, 'bcv');
reset role;
select 'la manual se conserva (debe 1): ' || count(*) from public.tasas_bcv where org_id='10000000-0000-0000-0000-000000000001' and fecha = public.hoy_caracas() and tasa = 895 and fuente = 'manual';
select 'historial: dos fechas (debe 2): ' || count(*) from public.tasas_bcv where org_id='10000000-0000-0000-0000-000000000001';

delete from public.tasas_bcv where org_id='10000000-0000-0000-0000-000000000001';
delete from public.avisos_push_clave where org_id='10000000-0000-0000-0000-000000000001';
