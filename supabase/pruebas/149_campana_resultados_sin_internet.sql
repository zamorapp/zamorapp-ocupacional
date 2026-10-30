-- Local primero: la campana de resultados pendientes registrada sin internet se vuelve a calcular en la nube al subir.
\pset tuples_only on
reset role;
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha, medico_id, paraclinicos) values
 ('49000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a',
  'cerrada', public.hoy_caracas() - 5, '00000000-0000-0000-0000-0000000000a2', '[{"id":"hb","nombre":"Hemoglobina","resultado":""}]');
set role authenticated;
select set_config('request.path','/rpc/constancia_diferida',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select 'campana aplicada (debe 1): ' || (public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','49000000-0000-0000-0000-000000000001',
  'recordar_resultados','{"locales":["49000000-0000-0000-0000-0000000000f1"]}', now(), true) = 'aplicado')::int;
select 'otra pasada no repite el aviso (debe 1): ' || (public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','49000000-0000-0000-0000-000000000002',
  'recordar_resultados','{}', now(), true) = 'aplicado')::int;
reset role;
select 'un solo aviso en la nube, del médico (debe 1): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a2' and enlace = '/atencion/49000000-0000-0000-0000-0000000000c1?paso=paraclinicos';
-- Otro usuario no puede hacer que la nube calcule la campana de un tercero: recordar_resultados usa auth.uid()
select 'nada para el administrador (debe 0): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and enlace = '/atencion/49000000-0000-0000-0000-0000000000c1?paso=paraclinicos';
delete from public.notificaciones where enlace = '/atencion/49000000-0000-0000-0000-0000000000c1?paso=paraclinicos';
delete from clinico.consultas where id = '49000000-0000-0000-0000-0000000000c1';
