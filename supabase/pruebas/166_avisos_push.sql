-- Avisos al celular (Cesar, 30-oct): solo el personal del servicio activa avisos; RR. HH. no lee las suscripciones y
-- solo obtiene a quién avisar con la clave del servidor y para su propia empresa.
\pset tuples_only on
set role authenticated;
-- RR. HH. no activa avisos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/rrhh', repeat('p', 87), repeat('a', 22), 'Celular', repeat('k', 40));
 raise notice 'RR. HH. activa avisos: FALLA'; exception when insufficient_privilege then raise notice 'RR. HH. no activa avisos (ok)'; end $$;
-- Recepción no puede activar primero (anotar la clave es del administrador o el gerente médico)
reset role;
insert into auth.users (id,email) values ('16600000-0000-0000-0000-0000000000a6','recep@x');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values ('10000000-0000-0000-0000-000000000001','16600000-0000-0000-0000-0000000000a6','recepcion',null);
set role authenticated;
select set_config('request.jwt.claim.sub','16600000-0000-0000-0000-0000000000a6',false) \g /dev/null
do $$ begin perform public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/recep', repeat('p', 87), repeat('a', 22), null, repeat('k', 40));
 raise notice 'recepción anota la primera clave: FALLA'; exception when insufficient_privilege then raise notice 'la primera clave la anota el administrador (ok)'; end $$;
-- El administrador activa primero (anota la clave); luego el médico activa su celular
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/admin', repeat('p', 87), repeat('a', 22), 'Android', repeat('k', 40)) \g /dev/null
select 'el administrador ve su suscripción (debe 1): ' || count(*) from public.suscripciones_push;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/medico', repeat('p', 87), repeat('a', 22), 'Android', repeat('k', 40)) \g /dev/null
select 'el médico ve su suscripción (debe 1): ' || count(*) from public.suscripciones_push;
-- Enfermería no puede cambiar la clave ya anotada
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin perform public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/enf', repeat('p', 87), repeat('a', 22), null, repeat('x', 40));
 raise notice 'enfermería cambia la clave: FALLA'; exception when insufficient_privilege then raise notice 'solo el administrador cambia la clave (ok)'; end $$;
select 'enfermería no ve la del médico (debe 0): ' || count(*) from public.suscripciones_push;
-- RR. HH. de A: no lee la tabla ni la clave
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no lee suscripciones (debe 0): ' || count(*) from public.suscripciones_push;
do $$ begin perform 1 from public.avisos_push_clave;
 raise notice 'RR. HH. lee la clave: FALLA'; exception when insufficient_privilege then raise notice 'la clave no se lee (ok)'; end $$;
do $$ begin insert into public.suscripciones_push (org_id, usuario_id, endpoint, p256dh, auth) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'https://x', repeat('p', 87), repeat('a', 22));
 raise notice 'RR. HH. inserta directo: FALLA'; exception when insufficient_privilege then raise notice 'sin insertar directo (ok)'; end $$;
-- Con clave errada: nada; con la clave del servidor y su empresa: el celular del médico
select 'clave errada: nadie (debe 0): ' || count(*) from public.suscripciones_para_aviso('20000000-0000-0000-0000-00000000000a', repeat('x', 40));
select 'clave del servidor: administrador y médico (debe 2): ' || count(*) from public.suscripciones_para_aviso('20000000-0000-0000-0000-00000000000a', repeat('k', 40));
select 'empresa ajena: nadie (debe 0): ' || count(*) from public.suscripciones_para_aviso('20000000-0000-0000-0000-00000000000b', repeat('k', 40));
-- Suscripción vencida: se borra solo con la clave
select public.quitar_suscripcion_vencida('20000000-0000-0000-0000-00000000000a', 'https://push.ejemplo/medico', repeat('x', 40)) \g /dev/null
select 'sin clave no se borra (debe 2): ' || count(*) from public.suscripciones_para_aviso('20000000-0000-0000-0000-00000000000a', repeat('k', 40));
select public.quitar_suscripcion_vencida('20000000-0000-0000-0000-00000000000a', 'https://push.ejemplo/medico', repeat('k', 40)) \g /dev/null
reset role;
select 'vencida borrada (debe 1): ' || count(*) from public.suscripciones_push;
delete from public.suscripciones_push;
delete from public.avisos_push_clave;
delete from public.miembros where usuario_id = '16600000-0000-0000-0000-0000000000a6';
delete from auth.users where id = '16600000-0000-0000-0000-0000000000a6';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
