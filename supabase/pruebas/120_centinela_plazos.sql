-- Centinela de plazos legales: avisos en la campana a los roles de salud y SST de cada empresa, un aviso por hito,
-- sin diagnóstico en el texto, y correos en cola que solo el administrador o el gerente médico pueden leer.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.notificaciones;
-- Los eventos de otras pruebas ya se dan por avisados: aquí se cuentan solo los de esta
insert into public.avisos_legales (evento_id, plazo, hito, org_id)
select evento_id, plazo, h, '10000000-0000-0000-0000-000000000001' from public.plazos_legales_abiertos('10000000-0000-0000-0000-000000000001'),
  unnest(array['inicio', 'urgente', 'vencido']) h on conflict do nothing;
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,fecha_hora,fecha_diagnostico,diagnostico,en_anexo1,origen) values
 -- accidente de hace 2 h en A: declaración e investigación pendientes
 ('12000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente',now() - interval '2 hours',null,null,true,null),
 -- enfermedad diagnosticada hace 20 h en A: declaración por vencer e informe NT-02 pendiente
 ('12000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','enfermedad',now() - interval '20 hours',now() - interval '20 hours','Asma ocupacional',true,null),
 -- importado del SAME: nunca avisa
 ('12000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente',now() - interval '2 hours',null,null,true,'same'),
 -- accidente de hace 30 h en B: declaración vencida (solo lo ve quien tiene la empresa B)
 ('12000000-0000-0000-0000-00000000000d','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','accidente',now() - interval '30 hours',null,null,true,null);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de la empresa no dispara el centinela (debe 0): ' || public.centinela_legal();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico revisa toda la organización: 6 avisos nuevos (debe 6): ' || public.centinela_legal();
select 've solo los de su empresa A (debe 4): ' || count(*) from public.notificaciones where usuario_id = auth.uid();
select 'el texto no lleva el diagnóstico (debe 0): ' || count(*) from public.notificaciones where texto like '%Asma%';
select 'el informe NT-02 abre la investigación (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = auth.uid() and enlace = '/accidentes/12000000-0000-0000-0000-00000000000b/investigacion';
select 'no repite el mismo hito (debe 0): ' || public.centinela_legal();
select 'no lee la cola de correos (debe 0): ' || count(*) from public.centinela_correos_pendientes();
do $$ begin
  perform 1 from public.correos_centinela;
  raise notice 'FALLA: leyó la cola directo';
exception when insufficient_privilege then raise notice 'la cola no se lee directo (debe 1): 1';
end $$;

reset role;
select 'RR. HH. no recibe avisos (debe 0): ' || count(*) from public.notificaciones where usuario_id = '00000000-0000-0000-0000-0000000000a3';
select 'enfermería de A sí (debe 4): ' || count(*) from public.notificaciones where usuario_id = '00000000-0000-0000-0000-0000000000a5';
select 'el administrador recibe las 6, incluida B (debe 6): ' || count(*) from public.notificaciones where usuario_id = '00000000-0000-0000-0000-0000000000a1';
select 'quien llega tarde recibe un solo aviso de la vencida (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'Declaración ante el INPSASEL vencida';
select 'y sale en alerta (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'Declaración ante el INPSASEL vencida' and nivel = 'alerta';
select 'la de 20 h sale en aviso con su título completo (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'Declaración ante el INPSASEL: vence en menos de 12 horas' and nivel = 'aviso';
select 'pero quedan marcados los tres hitos (debe 3): ' || count(*) from public.avisos_legales
 where evento_id = '12000000-0000-0000-0000-00000000000d' and plazo = 'declaracion';
select 'el importado no avisa (debe 0): ' || count(*) from public.avisos_legales where evento_id = '12000000-0000-0000-0000-00000000000c';
-- el accidente de A entra en sus últimas 12 h
update public.eventos set fecha_hora = now() - interval '13 hours' where id = '12000000-0000-0000-0000-00000000000a';

create temp table ids_cola as select id from public.correos_centinela;
grant select on ids_cola to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'al entrar en las últimas 12 h avisa de nuevo (debe 1): ' || public.centinela_legal();
reset role;
select 'un correo en cola por cada aviso de la campana (debe 1): ' || ((select count(*) from public.correos_centinela) = (select count(*) from public.notificaciones))::int;
truncate ids_cola; insert into ids_cola select id from public.correos_centinela;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador ve toda la cola (debe 1): ' || (count(*) = (select count(*) from ids_cola))::int from public.centinela_correos_pendientes();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico no marca enviados (debe 0): ' || public.centinela_correos_enviados(array(select id from ids_cola));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador sí (debe 1): ' || (public.centinela_correos_enviados(array(select id from public.centinela_correos_pendientes())) = (select count(*) from ids_cola))::int;
select 'la cola queda vacía (debe 0): ' || count(*) from public.centinela_correos_pendientes();

reset role;
update public.organizaciones set ajustes = coalesce(ajustes,'{}') || '{"centinela_correo": false}' where id = '10000000-0000-0000-0000-000000000001';
update public.eventos set fecha_declaracion = null, fecha_hora = now() - interval '25 hours' where id = '12000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'con el correo apagado la campana avisa igual (debe 1): ' || public.centinela_legal();
select 'pero no deja correos en cola (debe 0): ' || count(*) from public.centinela_correos_pendientes();
reset role;
update public.eventos set fecha_declaracion = now() where id = '12000000-0000-0000-0000-00000000000d';
select 'declarado, ya no figura entre los plazos abiertos (debe 0): ' || count(*) from public.plazos_legales_abiertos('10000000-0000-0000-0000-000000000001')
 where evento_id = '12000000-0000-0000-0000-00000000000d' and plazo = 'declaracion';

update public.organizaciones set ajustes = ajustes - 'centinela_correo' where id = '10000000-0000-0000-0000-000000000001';
delete from public.notificaciones;
delete from public.correos_centinela;
delete from public.avisos_legales;
delete from public.eventos where id::text like '12000000%';
