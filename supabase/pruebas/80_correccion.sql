-- Corregir una consulta firmada: solo el autor / gerente médico / admin clínico, con motivo, guardando la versión firmada.
-- Usa la consulta f1 que 40_firma.sql dejó firmada por el médico a2 (aptitud «elegible», un diagnóstico).
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
update clinico.aptitudes set avisada_en = now() where consulta_id='40000000-0000-0000-0000-0000000000f1';
delete from public.notificaciones;
set role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin perform public.reabrir_consulta('40000000-0000-0000-0000-0000000000f1','Error en el diagnóstico'); raise notice 'otro médico corrigió: FALLA'; exception when others then raise notice 'otro médico no corrige (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin perform public.reabrir_consulta('40000000-0000-0000-0000-0000000000f1','Error en el diagnóstico'); raise notice 'enfermería corrigió: FALLA'; exception when others then raise notice 'enfermería no corrige (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform public.reabrir_consulta('40000000-0000-0000-0000-0000000000f1','Error en el diagnóstico'); raise notice 'RRHH corrigió: FALLA'; exception when others then raise notice 'RRHH no corrige (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.reabrir_consulta('40000000-0000-0000-0000-0000000000f1','error'); raise notice 'corrigió sin motivo: FALLA'; exception when others then raise notice 'motivo obligatorio (ok)'; end $$;
select 'sigue firmada tras intentos (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-0000000000f1' and estado='firmada';

-- El autor corrige
select 'revisión nueva (debe 2): ' || public.reabrir_consulta('40000000-0000-0000-0000-0000000000f1','Diagnóstico equivocado, era sinusitis');
select 'vuelve a borrador sin firma (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-0000000000f1' and estado='borrador' and firmada_en is null and revision=2;
select 'versión firmada guardada (debe 1): ' || count(*) from public.consultas_versiones
 where consulta_id='40000000-0000-0000-0000-0000000000f1' and revision=1 and firmada_en is not null
   and jsonb_array_length(contenido->'diagnosticos')=1 and contenido->'aptitud'->>'clasificacion'='elegible' and contenido->'consulta'->>'conclusiones'='final';
do $$ begin perform public.reabrir_consulta('40000000-0000-0000-0000-0000000000f1','Otra vez, sin estar firmada'); raise notice 'reabrió una no firmada: FALLA'; exception when others then raise notice 'solo se corrige una firmada (ok)'; end $$;
do $$ begin update public.consultas_versiones set motivo='cambiado a mano' ; raise notice 'editó una versión: FALLA'; exception when others then raise notice 'versión no editable (ok)'; end $$;
do $$ begin delete from public.consultas_versiones; raise notice 'borró una versión: FALLA'; exception when others then raise notice 'versión no borrable (ok)'; end $$;
do $$ begin insert into public.consultas_versiones (org_id,consulta_id,revision,contenido,motivo) values ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000f1',9,'{}','inventada a mano'); raise notice 'insertó una versión falsa: FALLA'; exception when others then raise notice 'versión falsa rechazada (ok)'; end $$;

-- Corrige la aptitud, cierra y firma de nuevo: la empresa recibe «Aptitud corregida»
select public.guardar_consulta('40000000-0000-0000-0000-0000000000f1','{"tipo":"primera","conclusiones":"corregida"}',
  '[{"cie10":"J01","descripcion":"Sinusitis aguda","origen":"comun","principal":true}]','{"clasificacion":"elegible_con_restricciones","limitaciones":[]}',null,true);
select public.firmar_consulta('40000000-0000-0000-0000-0000000000f1');
reset role;
select 'aviso de aptitud corregida (debe 1): ' || least(count(*),1) from public.notificaciones where titulo='Aptitud corregida';
select 'firmada de nuevo con la corrección (debe 1): ' || count(*) from clinico.consultas c join clinico.diagnosticos d on d.consulta_id=c.id
 where c.id='40000000-0000-0000-0000-0000000000f1' and c.estado='firmada' and c.revision=2 and d.cie10='J01';

-- Quién ve las versiones
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH no ve versiones (debe 0): ' || count(*) from public.consultas_versiones;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select 'otro médico de la empresa ve el historial (debe 1): ' || count(*) from public.consultas_versiones;
-- El historial del trabajador sigue abierto: se puede crear otra consulta
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.consultas (org_id,empresa_id,trabajador_id,estado) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador');
select 'nueva consulta tras una firmada (debe 1): ' || least(count(*),1) from public.consultas where trabajador_id='30000000-0000-0000-0000-00000000000a' and estado='borrador';
reset role;
