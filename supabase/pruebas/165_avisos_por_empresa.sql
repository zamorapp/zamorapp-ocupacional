-- Avisos por empresa (Cesar, 30-oct): una empresa con «próxima evaluación» o «resultados» apagados no manda
-- recordatorios a la campana; solo valen los avisos conocidos. Alertas pendientes: las corrige su autor o el médico.
\pset tuples_only on
reset role;
-- Solo los avisos conocidos
do $$ begin update public.empresas set avisos_apagados = '{inventado}' where id = '20000000-0000-0000-0000-00000000000a';
 raise notice 'aviso desconocido aceptado: FALLA'; exception when check_violation then raise notice 'solo avisos conocidos (ok)'; end $$;
-- Una alerta vencida del trabajador de la empresa A, dejada por el médico
insert into clinico.alertas_clinicas (id, org_id, trabajador_id, texto, revisar_antes, creada_por) values
 ('16500000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
  'Control de tensión', public.hoy_caracas() - 1, '00000000-0000-0000-0000-0000000000a2');
update public.empresas set avisos_apagados = '{proxima_evaluacion}' where id = '20000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.recordar_alertas() \g /dev/null
select 'empresa con el aviso apagado: sin campana (debe 0): ' || count(*) from public.recordatorios_alertas where alerta_id = '16500000-0000-0000-0000-000000000001';
reset role;
update public.empresas set avisos_apagados = '{}' where id = '20000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.recordar_alertas() \g /dev/null
select 'aviso encendido: sale en la campana (debe 1): ' || count(*) from public.recordatorios_alertas where alerta_id = '16500000-0000-0000-0000-000000000001';
-- Corregir: enfermería (ni autora ni médico) no; el médico sí, mientras está pendiente
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin update public.alertas_clinicas set texto = 'Otro' where id = '16500000-0000-0000-0000-000000000001';
 raise notice 'enfermería corrige ajena: FALLA'; exception when insufficient_privilege then raise notice 'solo el autor o el médico corrigen (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.alertas_clinicas set texto = '  Control de tensión y glicemia ', revisar_antes = public.hoy_caracas() + 30 where id = '16500000-0000-0000-0000-000000000001';
select 'el médico corrige texto y fecha (debe 1): ' || count(*) from public.alertas_clinicas
 where id = '16500000-0000-0000-0000-000000000001' and texto = 'Control de tensión y glicemia' and revisar_antes = public.hoy_caracas() + 30;
update public.alertas_clinicas set estado = 'descartada', respuesta = 'Ya no aplica' where id = '16500000-0000-0000-0000-000000000001';
update public.alertas_clinicas set texto = 'Cambio tardío' where id = '16500000-0000-0000-0000-000000000001';
select 'descartada ya no cambia (debe 1): ' || count(*) from public.alertas_clinicas
 where id = '16500000-0000-0000-0000-000000000001' and estado = 'descartada' and texto = 'Control de tensión y glicemia';
reset role;
select 'la bitácora guarda el texto anterior (debe 1): ' || count(*) from public.bitacora
 where registro_id = '16500000-0000-0000-0000-000000000001' and accion = 'UPDATE' and antes ->> 'texto' = 'Control de tensión' and despues ->> 'texto' = 'Control de tensión y glicemia';
delete from public.recordatorios_alertas where alerta_id = '16500000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
