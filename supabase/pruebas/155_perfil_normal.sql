-- Perfil normal y copiar la evaluación anterior: plantillas PREV/POSV con clasificación, copiada_de validada y en la bitácora.
\pset tuples_only on
reset role;
select 'plantillas de pre y post vacacional en cada organización (debe 2): ' || count(*) from public.lista_items
 where lista = 'plantilla_examen' and org_id = '10000000-0000-0000-0000-000000000001' and codigo in ('PREV', 'POSV');
select 'toda plantilla base tiene clasificación y sano (debe 0): ' || count(*) from public.lista_items
 where lista = 'plantilla_examen' and org_id is null and not (datos ? 'clasificacion' and datos ? 'sano');
select 'egreso no pone aptitud (debe 1): ' || count(*) from public.lista_items
 where lista = 'plantilla_examen' and org_id = '10000000-0000-0000-0000-000000000001' and codigo = 'EGR' and datos ->> 'clasificacion' = '';
-- En la base de la PC no se siembran plantillas (llegan por la réplica)
begin;
delete from public.lista_items where lista = 'plantilla_examen' and codigo = 'PREV';
select set_config('zamorapp.local', 'on', true) \g /dev/null
select public.sembrar_plantillas_perfil_normal() \g /dev/null
select 'base local: la siembra no crea plantillas (debe 0): ' || count(*) from public.lista_items where lista = 'plantilla_examen' and codigo = 'PREV';
select set_config('zamorapp.local', '', true) \g /dev/null
select public.sembrar_plantillas_perfil_normal() \g /dev/null
select 'nube: la siembra sí las crea (debe 1): ' || count(*) from public.lista_items where lista = 'plantilla_examen' and codigo = 'PREV' and org_id is null;
rollback;
-- Origen: una evaluación del mismo trabajador, otra de otro trabajador
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,fecha,estado,hora_cierre) values
 ('15500000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','2026-08-12','cerrada',now()),
 ('15500000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','2026-10-30','borrador',null);
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,fecha,estado,hora_cierre)
select '15500000-0000-0000-0000-0000000000b1', org_id, empresa_id, id, '00000000-0000-0000-0000-0000000000a4', '2026-08-12', 'cerrada', now()
from public.trabajadores where org_id = '10000000-0000-0000-0000-000000000001' and id <> '30000000-0000-0000-0000-00000000000a' limit 1;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin perform public.guardar_consulta('15500000-0000-0000-0000-0000000000c1', '{"tipo":"primera","copiada_de":"15500000-0000-0000-0000-0000000000b1"}', '[]', null, null, false);
 raise notice 'copia de otro trabajador aceptada: FALLA'; exception when others then raise notice 'copia de otro trabajador rechazada (ok)'; end $$;
do $$ begin perform public.guardar_consulta('15500000-0000-0000-0000-0000000000c1', '{"tipo":"primera","copiada_de":"15500000-0000-0000-0000-0000000000c1"}', '[]', null, null, false);
 raise notice 'copia de sí misma aceptada: FALLA'; exception when others then raise notice 'copia de sí misma rechazada (ok)'; end $$;
-- RR. HH. (sin acceso clínico) no ve la consulta de origen: no puede copiarla aunque conozca el id
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve la evaluación de origen (debe 0): ' || count(*) from clinico.consultas where id = '15500000-0000-0000-0000-0000000000a1';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select public.guardar_consulta('15500000-0000-0000-0000-0000000000c1', '{"tipo":"primera","copiada_de":"15500000-0000-0000-0000-0000000000a1"}', '[]', null, null, false) \g /dev/null
select 'copia del mismo trabajador queda en la consulta (debe 1): ' || count(*) from clinico.consultas
 where id = '15500000-0000-0000-0000-0000000000c1' and copiada_de = '15500000-0000-0000-0000-0000000000a1';
do $$ begin update clinico.consultas set copiada_de = '15500000-0000-0000-0000-0000000000b1' where id = '15500000-0000-0000-0000-0000000000c1';
 raise notice 'UPDATE directo con origen de otro trabajador: FALLA'; exception when others then raise notice 'UPDATE directo con origen de otro trabajador rechazado (ok)'; end $$;
-- Guardar después sin copiada_de no la borra
select public.guardar_consulta('15500000-0000-0000-0000-0000000000c1', '{"tipo":"primera"}', '[]', null, null, false) \g /dev/null
select 'guardar sin copiada_de la conserva (debe 1): ' || count(*) from clinico.consultas
 where id = '15500000-0000-0000-0000-0000000000c1' and copiada_de = '15500000-0000-0000-0000-0000000000a1';
reset role;
select 'la copia queda en la bitácora con el origen (debe 1): ' || count(*) from public.bitacora
 where registro_id = '15500000-0000-0000-0000-0000000000c1' and accion = 'COPIA_EVALUACION' and usuario_id = '00000000-0000-0000-0000-0000000000a4'
   and despues ->> 'copiada_de' = '15500000-0000-0000-0000-0000000000a1' and despues ->> 'fecha_origen' = '2026-08-12';
select 'la bitácora de copia solo corre en la nube (debe 1): ' || count(*) from pg_trigger
 where tgname = 'anotar_copia_evaluacion' and tgrelid = 'clinico.consultas'::regclass and pg_get_triggerdef(oid) like '%es_base_local%';
delete from clinico.consultas where id::text like '15500000-%';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
