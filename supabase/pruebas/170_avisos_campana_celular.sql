-- Avisos de la campana al celular (Cesar, 30-oct): el latido sin sesión solo obtiene algo con la clave del servidor;
-- cada notificación sale una sola vez; lo de RR. HH. (que ya sale al instante) no se repite.
\pset tuples_only on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/admin170', repeat('p', 87), repeat('a', 22), null, repeat('k', 40)) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_suscripcion_push('10000000-0000-0000-0000-000000000001', 'https://push.ejemplo/medico170', repeat('p', 87), repeat('a', 22), null, repeat('k', 40)) \g /dev/null
reset role;
insert into public.notificaciones (id, org_id, usuario_id, titulo, texto, enlace) values
 ('17000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Resultados por recibir', 'Prueba 170', '/atencion/x'),
 ('17000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Nueva solicitud de cita', 'Prueba 170 RR. HH.', '/atencion');
-- Empresa A con «resultados» apagado: su aviso de resultados no suena en el celular
update public.empresas set avisos_apagados = '{resultados}' where id = '20000000-0000-0000-0000-00000000000a';
insert into public.notificaciones (id, org_id, usuario_id, empresa_id, titulo, texto, enlace) values
 ('17000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2',
  '20000000-0000-0000-0000-00000000000a', 'Resultados por recibir', 'Prueba 170 apagada', '/atencion/y');
set role anon;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select 'clave errada: nada (debe 0): ' || count(*) from public.avisos_campana_para_celular(repeat('x', 40));
create temp table r170 as select * from public.avisos_campana_para_celular(repeat('k', 40));
select 'la notificación nueva sale al celular del médico (debe 1): ' || count(*) from r170 where endpoint = 'https://push.ejemplo/medico170' and cuerpo like '%Prueba 170%';
select 'empresa con el aviso apagado: no suena (debe 0): ' || count(*) from r170 where cuerpo like '%Prueba 170 apagada%';
select 'lo de RR. HH. no se repite (debe 0): ' || count(*) from r170 where cuerpo like '%Prueba 170 RR. HH.%';
select 'a otro usuario no le llega la del médico (debe 0): ' || count(*) from r170 where endpoint = 'https://push.ejemplo/admin170' and cuerpo like '%Prueba 170%';
select 'sin sesión el usuario impersonado no queda puesto (debe 1): ' || (auth.uid() is null)::int;
-- Freno: otra llamada en los mismos 2 s no hace nada, aunque haya algo nuevo
reset role;
insert into public.notificaciones (id, org_id, usuario_id, titulo, texto, enlace) values
 ('17000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Estudio recibido de RR. HH.', 'Prueba 170 nueva', '/pacientes/x');
set role anon;
select 'llamada en bucle: frenada (debe 0): ' || count(*) from public.avisos_campana_para_celular(repeat('k', 40));
reset role;
update public.avisos_push_latido set ultima = public.ahora() - interval '2 minutes';
set role anon;
create temp table r170b as select * from public.avisos_campana_para_celular(repeat('k', 40));
select 'pasado el freno: sale lo nuevo (debe 1): ' || count(*) from r170b where cuerpo like '%Prueba 170 nueva%';
select 'y no se repite lo anterior (debe 0): ' || count(*) from r170b where cuerpo like '%Prueba 170' or cuerpo like '%Prueba 170 ·%';
drop table r170b;
do $$ begin perform 1 from public.avisos_push_enviadas;
 raise notice 'anon lee los enviados: FALLA'; exception when insufficient_privilege then raise notice 'enviados privados (ok)'; end $$;
-- Vencida: sin clave no se borra; con la clave sí
select public.quitar_suscripcion_vencida_clave('https://push.ejemplo/medico170', repeat('x', 40)) \g /dev/null
reset role;
select 'sin clave sigue (debe 1): ' || count(*) from public.suscripciones_push where endpoint = 'https://push.ejemplo/medico170';
set role anon;
select public.quitar_suscripcion_vencida_clave('https://push.ejemplo/medico170', repeat('k', 40)) \g /dev/null
reset role;
select 'con la clave se borra (debe 0): ' || count(*) from public.suscripciones_push where endpoint = 'https://push.ejemplo/medico170';
drop table r170;
delete from public.notificaciones where id in ('17000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000003', '17000000-0000-0000-0000-000000000004');
delete from public.avisos_push_latido;
update public.empresas set avisos_apagados = '{}' where id = '20000000-0000-0000-0000-00000000000a';
delete from public.avisos_push_resumen;
delete from public.suscripciones_push;
delete from public.avisos_push_clave;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
