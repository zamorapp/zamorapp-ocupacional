-- Vacaciones y post vacacional (Cesar, 30-oct): RR. HH. y el servicio anotan vacaciones; el personal clínico recibe el
-- aviso cerca del regreso, una sola vez por etapa; se apaga por empresa y con la consulta «Post vacacional».
-- Pausar avisos de una empresa: solo administrador o gerente médico.
\pset tuples_only on
set role authenticated;
-- RR. HH. de A anota vacaciones de su trabajador; no las de la empresa B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into public.vacaciones (id, trabajador_id, desde, regreso) values ('17100000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', public.hoy_caracas() - 15, public.hoy_caracas() + 1);
select 'RR. HH. anota vacaciones de su empresa, empresa tomada del trabajador (debe 1): ' || count(*) from public.vacaciones
 where id = '17100000-0000-0000-0000-000000000001' and empresa_id = '20000000-0000-0000-0000-00000000000a';
do $$ begin insert into public.vacaciones (trabajador_id, desde, regreso) values ('30000000-0000-0000-0000-00000000000b', public.hoy_caracas() - 15, public.hoy_caracas() + 1);
 raise notice 'RR. HH. anota en otra empresa: FALLA'; exception when insufficient_privilege then raise notice 'solo su empresa (ok)'; end $$;
do $$ begin insert into public.vacaciones (org_id, empresa_id, trabajador_id, desde, regreso) values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-00000000000b', current_date, current_date + 1);
 raise notice 'disfrazar la empresa: FALLA'; exception when insufficient_privilege then raise notice 'la empresa sale del trabajador (ok)'; end $$;
do $$ begin insert into public.vacaciones (trabajador_id, desde, regreso) values ('30000000-0000-0000-0000-00000000000a', current_date, current_date);
 raise notice 'regreso igual a la salida: FALLA'; exception when check_violation then raise notice 'regreso después de la salida (ok)'; end $$;
-- Sin internet (escritorio local primero): la vacación anotada en la PC sube por la bandeja con las mismas reglas
reset role;
insert into public.equipos (id, org_id, nombre, serie, secreto_hash) values
 ('e0000000-0000-0000-0000-000000000171','10000000-0000-0000-0000-000000000001','PC 171','VQ',encode(sha256('s171'::bytea),'hex')) on conflict do nothing;
set role authenticated;
select set_config('request.path','/rpc/aplicar_cambios',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'anotada en la PC sube por la bandeja (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000171','s171',
 '[{"id":"c0000000-0000-0000-0000-000000000171","tabla":"public.vacaciones","fila_id":"17100000-0000-0000-0000-000000000002","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","trabajador_id":"30000000-0000-0000-0000-00000000000a","empresa_id":"20000000-0000-0000-0000-00000000000b","desde":"2026-10-01","regreso":"2026-10-20"}}]')) x where x->>'estado' = 'aplicado';
select 'y queda en la empresa del trabajador, no en la que diga la PC (debe 1): ' || count(*) from public.vacaciones
 where id = '17100000-0000-0000-0000-000000000002' and empresa_id = '20000000-0000-0000-0000-00000000000a';
select 'desde la PC tampoco se anota en una empresa que no ve (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000171','s171',
 '[{"id":"c0000000-0000-0000-0000-000000000172","tabla":"public.vacaciones","fila_id":"17100000-0000-0000-0000-000000000003","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","trabajador_id":"30000000-0000-0000-0000-00000000000b","desde":"2026-10-01","regreso":"2026-10-20"}}]')) x where x->>'estado' = 'rechazado';
select set_config('request.path','',false) \g /dev/null
select set_config('request.jwt.claims','',false) \g /dev/null
reset role;
delete from public.vacaciones where id = '17100000-0000-0000-0000-000000000002';
delete from sync.conflictos where equipo_id = 'e0000000-0000-0000-0000-000000000171';
set role authenticated;
-- El médico recibe el aviso una vez
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.recordar_post_vacacional() \g /dev/null
select public.recordar_post_vacacional() \g /dev/null
reset role;
select 'aviso de post vacacional, una vez (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a2' and titulo = 'Post vacacional pendiente' and enlace = '/pacientes/30000000-0000-0000-0000-00000000000a';
select 'RR. HH. no recibe el aviso clínico (debe 0): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo like 'Post vacacional%';
-- Empresa con el aviso apagado: otra vacación no avisa
delete from public.recordatorios_vacaciones;
delete from public.notificaciones where titulo like 'Post vacacional%';
update public.empresas set avisos_apagados = '{post_vacacional}' where id = '20000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.recordar_post_vacacional() \g /dev/null
reset role;
select 'empresa con post vacacional apagado (debe 0): ' || count(*) from public.notificaciones where titulo like 'Post vacacional%';
-- Pausar avisos: el médico no; el administrador sí (pausa todos) y reactiva
set role authenticated;
do $$ begin perform public.pausar_avisos_empresa('20000000-0000-0000-0000-00000000000a', true);
 raise notice 'el médico pausa avisos: FALLA'; exception when insufficient_privilege then raise notice 'solo administrador o gerente médico pausan (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.pausar_avisos_empresa('20000000-0000-0000-0000-00000000000a', true) \g /dev/null
reset role;
select 'pausa: los 4 avisos apagados (debe 4): ' || cardinality(avisos_apagados) from public.empresas where id = '20000000-0000-0000-0000-00000000000a';
set role authenticated;
select public.pausar_avisos_empresa('20000000-0000-0000-0000-00000000000a', false) \g /dev/null
reset role;
select 'reactivar: ninguno apagado (debe 0): ' || cardinality(avisos_apagados) from public.empresas where id = '20000000-0000-0000-0000-00000000000a';
-- Las vacaciones bajan a la copia del escritorio
select 'vacaciones en sync.tablas (debe 1): ' || count(*) from sync.tablas where nombre = 'public.vacaciones';
-- Quitar
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
delete from public.vacaciones where id = '17100000-0000-0000-0000-000000000001';
reset role;
select 'RR. HH. quita las que anotó (debe 0): ' || count(*) from public.vacaciones where id = '17100000-0000-0000-0000-000000000001';
delete from public.recordatorios_vacaciones;
delete from sync.aplicados where equipo_id = 'e0000000-0000-0000-0000-000000000171';
delete from public.equipos where id = 'e0000000-0000-0000-0000-000000000171';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
