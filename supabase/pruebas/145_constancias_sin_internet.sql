-- Local primero: constancias (acceso a la historia, lectura de laboratorio) registradas sin internet y subidas después.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.path','/rpc/constancia_diferida',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
-- Acceso a la historia hecho hace 2 horas, con hora verificada: queda con esa hora y el equipo
select 'acceso aplicado (debe 1): ' || (public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','45000000-0000-0000-0000-000000000001',
  'registrar_acceso','{"p_trabajador":"30000000-0000-0000-0000-00000000000a"}', now() - interval '2 hours', true) = 'aplicado')::int;
select 'el mismo id no se repite (debe 1): ' || (public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','45000000-0000-0000-0000-000000000001',
  'registrar_acceso','{"p_trabajador":"30000000-0000-0000-0000-00000000000a"}', now() - interval '2 hours', true) = 'duplicado')::int;
reset role;
select 'con la hora de la PC y el equipo (debe 1): ' || count(*) from public.accesos
 where trabajador_id = '30000000-0000-0000-0000-00000000000a' and usuario_id = '00000000-0000-0000-0000-0000000000a2'
   and en between now() - interval '2 hours 1 minute' and now() - interval '1 hour 59 minutes' and equipo_id = 'e0000000-0000-0000-0000-000000000001'
   and llego_en > now() - interval '1 minute';
set role authenticated;
-- Hora sin verificar o fuera de lo plausible: queda la hora de llegada
select 'hora sin verificar no se usa (debe 1): ' || (public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','45000000-0000-0000-0000-000000000002',
  'registrar_acceso','{"p_trabajador":"30000000-0000-0000-0000-00000000000a"}', now() - interval '3 hours', false) = 'aplicado')::int;
select 'hora de hace un año no se usa (debe 1): ' || (public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','45000000-0000-0000-0000-000000000003',
  'registrar_acceso','{"p_trabajador":"30000000-0000-0000-0000-00000000000a"}', now() - interval '1 year', true) = 'aplicado')::int;
reset role;
select 'las dos con la hora de llegada (debe 2): ' || count(*) from public.accesos
 where trabajador_id = '30000000-0000-0000-0000-00000000000a' and usuario_id = '00000000-0000-0000-0000-0000000000a2' and en > now() - interval '1 minute';
set role authenticated;
-- Lectura de laboratorio de una consulta de la empresa A: bitácora con la hora de la PC y la marca
reset role;
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado) values
 ('45000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador');
set role authenticated;
select 'lectura aplicada (debe 1): ' || (public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','45000000-0000-0000-0000-000000000004',
  'registrar_lectura_laboratorio','{"p_consulta":"45000000-0000-0000-0000-0000000000c1","p_adjunto":null,"p_cedula_leida":"V-1","p_cedula_coincide":true,"p_cedula_ignorada":false,"p_examenes":3}',
  now() - interval '1 hour', true) = 'aplicado')::int;
reset role;
select 'bitácora con hora de la PC y marca (debe 1): ' || count(*) from public.bitacora
 where registro_id = '45000000-0000-0000-0000-0000000000c1' and tabla = 'clinico.lectura_laboratorio' and en < now() - interval '59 minutes'
   and (despues ->> 'registrada_sin_internet')::boolean and equipo_id = 'e0000000-0000-0000-0000-000000000001';
set role authenticated;
-- Una función que no es constancia: rechazada
do $$ begin
  perform public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','45000000-0000-0000-0000-000000000005','registrar_bitacora','{}', now(), true);
  raise notice 'constancia desconocida aplicada: FALLA';
exception when invalid_parameter_value then raise notice 'constancia desconocida rechazada (ok)'; end $$;
-- Equipo con secreto malo: rechazada
do $$ begin
  perform public.constancia_diferida('e0000000-0000-0000-0000-000000000001','malo','45000000-0000-0000-0000-000000000006','registrar_acceso','{"p_trabajador":"30000000-0000-0000-0000-00000000000a"}', now(), true);
  raise notice 'secreto malo aplicado: FALLA';
exception when insufficient_privilege then raise notice 'secreto malo rechazado (ok)'; end $$;
-- Administrador sin segundo paso: no sube
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}',false) \g /dev/null
do $$ begin
  perform public.constancia_diferida('e0000000-0000-0000-0000-000000000001','s1','45000000-0000-0000-0000-000000000007','registrar_acceso','{"p_trabajador":"30000000-0000-0000-0000-00000000000a"}', now(), true);
  raise notice 'admin aal1 sube constancia: FALLA';
exception when insufficient_privilege then raise notice 'admin aal1 no sube constancias (ok)'; end $$;
reset role;
delete from public.accesos where trabajador_id = '30000000-0000-0000-0000-00000000000a' and usuario_id = '00000000-0000-0000-0000-0000000000a2';
delete from public.bitacora where registro_id = '45000000-0000-0000-0000-0000000000c1';
delete from clinico.consultas where id = '45000000-0000-0000-0000-0000000000c1';
delete from sync.constancias_aplicadas where id::text like '45000000-%';
