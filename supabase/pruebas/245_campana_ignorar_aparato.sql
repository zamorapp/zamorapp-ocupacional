-- Campanita (20261030946000): «Ignorar» del aviso «Tu celular no confirmó…» se guarda en la nube, solo para el aviso
-- vigente y solo por el dueño del aparato. Si llega otro aviso, la tarjeta vuelve.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/245a', repeat('p', 87), repeat('a', 22), 'Android', repeat('k', 40)) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/245m', repeat('p', 87), repeat('a', 22), 'Windows', repeat('k', 40)) \g /dev/null
reset role;
update public.suscripciones_push set ultimo_aviso = now() - interval '2 hours' where endpoint like 'https://push.ejemplo/245%';

-- El dueño ignora el suyo: queda marcado para ese aviso
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.ignorar_aparato_sin_acuse((select id from public.suscripciones_push where endpoint = 'https://push.ejemplo/245a')) \g /dev/null
reset role;
select 'el dueño ignora su aparato (debe 1): ' || count(*) from public.suscripciones_push
 where endpoint = 'https://push.ejemplo/245a' and acuse_ignorado = ultimo_aviso;

-- No puede ignorar el aparato de otra persona
create temp table t245 as select id from public.suscripciones_push where endpoint = 'https://push.ejemplo/245m';
grant select on t245 to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.ignorar_aparato_sin_acuse((select id from t245)) \g /dev/null
reset role;
select 'no ignora el aparato ajeno (debe 0): ' || count(acuse_ignorado) from public.suscripciones_push where endpoint = 'https://push.ejemplo/245m';

-- Sin sesión no se puede llamar
set role anon;
do $$ begin perform public.ignorar_aparato_sin_acuse(gen_random_uuid());
 raise notice 'anon ignora: FALLA'; exception when insufficient_privilege then raise notice 'anon no ignora (ok)'; end $$;
reset role;

-- Llega otro aviso: lo ignorado ya no lo cubre (la tarjeta vuelve si tampoco lo confirma)
update public.suscripciones_push set ultimo_aviso = now() where endpoint = 'https://push.ejemplo/245a';
select 'otro aviso: ya no está ignorado (debe 1): ' || count(*) from public.suscripciones_push
 where endpoint = 'https://push.ejemplo/245a' and acuse_ignorado < ultimo_aviso;

-- Limpieza
drop table t245;
delete from public.suscripciones_push where endpoint like 'https://push.ejemplo/245%';
