-- Limpieza de llaves de la puerta para agentes (20261030947000): las apagadas o vencidas se van solas
-- (sin uso: 1 día; con uso: 7 días); las encendidas y el registro se quedan.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.agentes_llaves (id, org_id, nombre, huella, final, permiso, creada_por, creada_en, vence_en, revocada_en, usos) values
 ('a9470000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Sin uso apagada hace 2 días', repeat('1',64),'aaaa','consultar','00000000-0000-0000-0000-0000000000a1', public.ahora() - interval '3 days', public.ahora() + interval '5 days', public.ahora() - interval '2 days', 0),
 ('a9470000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Sin uso apagada hace 2 horas', repeat('2',64),'bbbb','consultar','00000000-0000-0000-0000-0000000000a1', public.ahora() - interval '3 hours', public.ahora() + interval '5 days', public.ahora() - interval '2 hours', 0),
 ('a9470000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Usada apagada hace 2 días', repeat('3',64),'cccc','crear','00000000-0000-0000-0000-0000000000a1', public.ahora() - interval '9 days', public.ahora() + interval '5 days', public.ahora() - interval '2 days', 4),
 ('a9470000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','Usada vencida hace 8 días', repeat('4',64),'dddd','crear','00000000-0000-0000-0000-0000000000a1', public.ahora() - interval '20 days', public.ahora() - interval '8 days', null, 4),
 ('a9470000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','Encendida sin uso de hace 5 días', repeat('5',64),'eeee','consultar','00000000-0000-0000-0000-0000000000a1', public.ahora() - interval '5 days', public.ahora() + interval '25 days', null, 0);
insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ok, resumen) values
 ('10000000-0000-0000-0000-000000000001','a9470000-0000-0000-0000-000000000004','Usada vencida hace 8 días','resumen',true,'Consulta');
select count(*) from public.limpieza_correr(true) \g /dev/null
select 'sin uso y apagada hace 2 días: se borra (debe 0): ' || count(*) from public.agentes_llaves where id = 'a9470000-0000-0000-0000-000000000001';
select 'sin uso y apagada hace 2 horas: se queda (debe 1): ' || count(*) from public.agentes_llaves where id = 'a9470000-0000-0000-0000-000000000002';
select 'usada y apagada hace 2 días: se queda (debe 1): ' || count(*) from public.agentes_llaves where id = 'a9470000-0000-0000-0000-000000000003';
select 'usada y vencida hace 8 días: se borra (debe 0): ' || count(*) from public.agentes_llaves where id = 'a9470000-0000-0000-0000-000000000004';
select 'encendida: nunca se borra (debe 1): ' || count(*) from public.agentes_llaves where id = 'a9470000-0000-0000-0000-000000000005';
select 'el registro de la llave borrada sigue con su nombre (debe 1): ' || count(*) from public.agentes_registro where llave_nombre = 'Usada vencida hace 8 días' and llave_id is null;
-- Deja la base como estaba
delete from public.agentes_registro where llave_nombre = 'Usada vencida hace 8 días';
delete from public.agentes_llaves where id::text like 'a9470000-%';
