-- Posponer (20261030969000): la cita que estaba en consulta vuelve a «citado» en otro día y RR. HH. recibe
-- «Cita reprogramada», no «Cita confirmada». Confirmar una solicitud de la empresa sigue diciendo «Cita confirmada».
\pset tuples_only on
reset role;
insert into public.citas (id,org_id,empresa_id,trabajador_id,fecha,hora,estado) values
 ('5d000000-0000-0000-0000-000000002671','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'09:00','en_consulta'),
 ('5d000000-0000-0000-0000-000000002672','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a',public.hoy_caracas() + 2,'10:00','solicitada');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
set role authenticated;
update public.citas set fecha = public.hoy_caracas() + 3, hora = '08:00', estado = 'citado', llegada = null where id = '5d000000-0000-0000-0000-000000002671';
update public.citas set fecha = public.hoy_caracas() + 4, estado = 'citado' where id = '5d000000-0000-0000-0000-000000002672';
reset role;
select 'pospuesta: RR. HH. recibe «Cita reprogramada» (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo = 'Cita reprogramada' and texto like '%' || to_char(public.hoy_caracas() + 3, 'DD/MM/YYYY') || '%';
select 'pospuesta: sin «Cita confirmada» de esa fecha (debe 0): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo = 'Cita confirmada' and texto like '%' || to_char(public.hoy_caracas() + 3, 'DD/MM/YYYY') || '%';
select 'solicitud confirmada: sigue «Cita confirmada» (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo = 'Cita confirmada' and texto like '%' || to_char(public.hoy_caracas() + 4, 'DD/MM/YYYY') || '%';
select 'la cita pospuesta queda citada en su día nuevo (debe 1): ' || count(*) from public.citas
 where id = '5d000000-0000-0000-0000-000000002671' and estado = 'citado' and fecha = public.hoy_caracas() + 3 and llegada is null;
select 'repetir la migración no cambia nada (debe 1): ' || (position('''Cita reprogramada'' else ''Cita confirmada''' in pg_get_functiondef('public.avisar_cita()'::regprocedure)) > 0)::int;
delete from public.notificaciones where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo in ('Cita reprogramada', 'Cita confirmada', 'Trabajador en consulta');
delete from public.citas where id::text like '5d000000-0000-0000-0000-00000000267_';
