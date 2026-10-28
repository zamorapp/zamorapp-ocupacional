-- Recordatorio de paraclínicos sin resultado: solo al médico autor, cada N días, con «No recordar más».
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,estado,fecha,paraclinicos,origen) values
 -- pendiente, de hace 5 días: se recuerda
 ('97000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','cerrada',public.hoy_caracas() - 5,
  '[{"id":"hb","nombre":"Hemoglobina","resultado":""},{"id":"rx","nombre":"Rx","resultado":"","estado":"normal"}]',null),
 -- de hoy: todavía no
 ('97000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','cerrada',public.hoy_caracas(),
  '[{"id":"hb","nombre":"Hemoglobina","resultado":""}]',null),
 -- importada del SAME: nunca
 ('97000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','cerrada',public.hoy_caracas() - 5,
  '[{"id":"hb","nombre":"Hemoglobina","resultado":""}]','same'),
 -- con todos los resultados: no
 ('97000000-0000-0000-0000-00000000000d','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2','cerrada',public.hoy_caracas() - 5,
  '[{"id":"hb","nombre":"Hemoglobina","resultado":"13"}]',null);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select 'otro médico no recibe avisos de consultas ajenas (debe 0): ' || public.recordar_resultados();
select 'ni puede apagarlas (debe 0): ' || public.ignorar_recordatorio_resultados('97000000-0000-0000-0000-00000000000a')::int;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el autor recibe un aviso por la consulta pendiente (debe 1): ' || public.recordar_resultados();
select 'el aviso cuenta solo lo que falta y lleva a paraclínicos (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = auth.uid() and texto like '%falta 1 resultado%' and enlace = '/atencion/97000000-0000-0000-0000-00000000000a?paso=paraclinicos';
select 'no repite antes de N días (debe 0): ' || public.recordar_resultados();
do $$ begin
  insert into public.recordatorios_resultados (consulta_id,usuario_id,org_id) values
   ('97000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001');
  raise notice 'FALLA: escribió el recordatorio directo';
exception when insufficient_privilege then raise notice 'no se escribe la tabla directo (debe 1): 1';
end $$;

reset role;
update public.recordatorios_resultados set ultimo_aviso = now() - interval '4 days' where consulta_id = '97000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'pasados N días vuelve a recordar (debe 1): ' || public.recordar_resultados();
select 'no recordar más (debe 1): ' || public.ignorar_recordatorio_resultados('97000000-0000-0000-0000-00000000000a')::int;
reset role;
update public.recordatorios_resultados set ultimo_aviso = now() - interval '4 days' where consulta_id = '97000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'apagada ya no avisa (debe 0): ' || public.recordar_resultados();
select 've solo sus recordatorios (debe 1): ' || count(*) from public.recordatorios_resultados;

reset role;
update public.organizaciones set ajustes = coalesce(ajustes,'{}') || '{"recordatorio_resultados_dias": 0}' where id = '10000000-0000-0000-0000-000000000001';
update public.recordatorios_resultados set ignorado = false, ultimo_aviso = null;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'con 0 días está apagado para la organización (debe 0): ' || public.recordar_resultados();
reset role;
update public.organizaciones set ajustes = ajustes - 'recordatorio_resultados_dias' where id = '10000000-0000-0000-0000-000000000001';
delete from public.notificaciones where enlace like '/atencion/97000000%';
delete from clinico.consultas where id::text like '97000000%';
