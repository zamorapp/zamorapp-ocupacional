-- Alerta para la próxima evaluación: solo el personal clínico la ve; enfermería la crea, la revisa el médico; no se
-- borra ni se cambia lo escrito; gana la primera revisión; la de solo paraclínicos se cierra sola con los resultados.
\pset tuples_only on
reset role;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000001561','trabA@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000001561','trabajador','{20000000-0000-0000-0000-00000000000a}');
set role authenticated;
-- Enfermería deja la alerta desde la consulta del día (texto con espacios: se limpia; autor y hora los pone la base)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
insert into public.alertas_clinicas (id, org_id, trabajador_id, consulta_id, texto, revisar_antes, creada_por, creada_en)
values ('15600000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
        '40000000-0000-0000-0000-00000000000a', '  Revisar lesión infectada en el pie  ', public.hoy_caracas() + 2,
        '00000000-0000-0000-0000-0000000000a2', '2020-01-01');
select 'enfermería crea; autor, hora y empresa los pone la base (debe 1): ' || count(*) from public.alertas_clinicas
 where id = '15600000-0000-0000-0000-000000000001' and texto = 'Revisar lesión infectada en el pie' and estado = 'pendiente'
   and creada_por = '00000000-0000-0000-0000-0000000000a5' and creada_en > now() - interval '1 minute'
   and empresa_id = '20000000-0000-0000-0000-00000000000a';
do $$ begin update public.alertas_clinicas set estado = 'revisada', respuesta = 'ok' where id = '15600000-0000-0000-0000-000000000001';
 raise notice 'enfermería revisa: FALLA'; exception when insufficient_privilege then raise notice 'enfermería no revisa (ok)'; end $$;
-- Consulta de otro trabajador: rechazada
do $$ begin insert into public.alertas_clinicas (org_id, trabajador_id, consulta_id, texto) values
 ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000b', 'x');
 raise notice 'consulta ajena aceptada: FALLA'; exception when others then raise notice 'la consulta debe ser del mismo trabajador (ok)'; end $$;
do $$ begin insert into public.alertas_clinicas (org_id, trabajador_id, texto) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '   ');
 raise notice 'alerta vacía aceptada: FALLA'; exception when check_violation then raise notice 'sin texto ni paraclínicos no se crea (ok)'; end $$;
-- RR. HH. y el propio trabajador no la ven
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve alertas (debe 0): ' || count(*) from public.alertas_clinicas;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001561',false) \g /dev/null
select 'el trabajador no ve alertas (debe 0): ' || count(*) from public.alertas_clinicas;
do $$ begin insert into public.alertas_clinicas (org_id, trabajador_id, texto) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'x');
 raise notice 'el trabajador crea: FALLA'; exception when insufficient_privilege then raise notice 'el trabajador no crea alertas (ok)'; end $$;
-- El médico de la empresa B no ve la de A (alcance por empresa)
reset role;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000001562','medB@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000001562','medico','{20000000-0000-0000-0000-00000000000b}');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000001562',false) \g /dev/null
select 'médico de otra empresa no la ve (debe 0): ' || count(*) from public.alertas_clinicas;
-- El médico: el autor no cambia, no se borra; revisa con respuesta (autor y hora de la revisión los pone la base).
-- Corregir el texto de una pendiente se prueba en la 165.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.alertas_clinicas set creada_por = '00000000-0000-0000-0000-0000000000a2' where id = '15600000-0000-0000-0000-000000000001';
select 'el autor no se edita (debe 1): ' || count(*) from public.alertas_clinicas
 where id = '15600000-0000-0000-0000-000000000001' and texto = 'Revisar lesión infectada en el pie' and creada_por = '00000000-0000-0000-0000-0000000000a5';
do $$ begin delete from public.alertas_clinicas where id = '15600000-0000-0000-0000-000000000001';
 raise notice 'se pudo borrar: FALLA'; exception when insufficient_privilege then raise notice 'nadie borra una alerta (ok)'; end $$;
select 'no se borra (debe 1): ' || count(*) from public.alertas_clinicas where id = '15600000-0000-0000-0000-000000000001';
update public.alertas_clinicas set estado = 'revisada', respuesta = '  Curada, sin signos de infección ', revisada_por = '00000000-0000-0000-0000-0000000000a1', revisada_en = '2020-01-01'
 where id = '15600000-0000-0000-0000-000000000001';
select 'el médico la revisa (debe 1): ' || count(*) from public.alertas_clinicas
 where id = '15600000-0000-0000-0000-000000000001' and estado = 'revisada' and respuesta = 'Curada, sin signos de infección'
   and revisada_por = '00000000-0000-0000-0000-0000000000a2' and revisada_en > now() - interval '1 minute';
-- Una segunda revisión (otra PC) no pisa la primera
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
update public.alertas_clinicas set estado = 'descartada', respuesta = 'Otra' where id = '15600000-0000-0000-0000-000000000001';
select 'gana la primera revisión (debe 1): ' || count(*) from public.alertas_clinicas
 where id = '15600000-0000-0000-0000-000000000001' and estado = 'revisada' and respuesta = 'Curada, sin signos de infección';
-- Solo paraclínicos: se cierra sola cuando una consulta posterior trae sus resultados (una con texto, no)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.alertas_clinicas (id, org_id, trabajador_id, consulta_id, paraclinicos) values
 ('15600000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-00000000000a',
  '[{"id":"p1","nombre":"Hemoglobina"},{"id":"p2","nombre":"Glicemia"}]');
insert into public.alertas_clinicas (id, org_id, trabajador_id, texto, paraclinicos) values
 ('15600000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'Ver también la presión',
  '[{"id":"p1","nombre":"Hemoglobina"}]');
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos) values
 ('15600000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas(),
  '[{"id":"x1","nombre":"Hemoglobina","resultado":""},{"id":"x2","nombre":"Glicemia","resultado":"90"}]');
select 'con un resultado faltante sigue pendiente (debe 1): ' || count(*) from clinico.alertas_clinicas where id = '15600000-0000-0000-0000-000000000002' and estado = 'pendiente';
update clinico.consultas set paraclinicos = '[{"id":"x1","nombre":"hemoglobina ","resultado":"13,5"},{"id":"x2","nombre":"Glicemia","resultado":"90"}]'
 where id = '15600000-0000-0000-0000-0000000000c1';
select 'con todos los resultados se cierra sola (debe 1): ' || count(*) from clinico.alertas_clinicas
 where id = '15600000-0000-0000-0000-000000000002' and estado = 'revisada' and automatica and revisada_en_consulta = '15600000-0000-0000-0000-0000000000c1';
select 'la que tiene texto espera al médico (debe 1): ' || count(*) from clinico.alertas_clinicas where id = '15600000-0000-0000-0000-000000000003' and estado = 'pendiente';
-- Campana: «revisar antes de» en 3 días, solo clínicos, una vez; sin el texto clínico
insert into clinico.alertas_clinicas (id, org_id, trabajador_id, texto, revisar_antes) values
 ('15600000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'Control de tensión', public.hoy_caracas() + 1);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'campana del médico (debe 1): ' || public.recordar_alertas();
select 'no repite el aviso (debe 0): ' || public.recordar_alertas();
select 'el aviso no lleva el texto clínico (debe 0): ' || count(*) from public.notificaciones where titulo = 'Alerta para la próxima evaluación' and texto like '%tensión%';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. sin campana (debe 0): ' || public.recordar_alertas();
-- Sin internet: la PC crea la alerta y sube por la bandeja con su autor y su hora (marcada sin verificar → hora de la nube)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.path','/rpc/aplicar_cambios',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select 'creada en la PC sube por la bandeja (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000156","tabla":"clinico.alertas_clinicas","fila_id":"15600000-0000-0000-0000-000000000005","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","trabajador_id":"30000000-0000-0000-0000-00000000000a","texto":"Hecha sin internet",
            "creada_por":"00000000-0000-0000-0000-0000000000a2","creada_en":"2026-10-29T10:00:00Z"}}]')) x where x->>'estado' = 'aplicado';
select 'guarda la hora de la PC en hora_equipo (debe 1): ' || count(*) from public.alertas_clinicas
 where id = '15600000-0000-0000-0000-000000000005' and creada_por = '00000000-0000-0000-0000-0000000000a2' and hora_equipo -> 'creada_en' ->> 'verificada' = 'false';
select set_config('request.path','',false) \g /dev/null
-- En la PC rigen las mismas reglas: enfermería tampoco revisa con la base local encendida
select set_config('zamorapp.local', 'on', false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin update public.alertas_clinicas set estado = 'revisada' where id = '15600000-0000-0000-0000-000000000004';
 raise notice 'enfermería revisa en la PC: FALLA'; exception when insufficient_privilege then raise notice 'en la PC enfermería tampoco revisa (ok)'; end $$;
select set_config('zamorapp.local', '', false) \g /dev/null
-- Sin excepción por es_base_local, salvo el cierre por resultados, que hace la nube
reset role;
select 'reglas sin excepción para la base local (debe 0): ' || count(*) from pg_proc where proname = 'proteger_alerta_clinica' and prosrc like '%es_base_local%';
select 'sube por la bandeja (debe 1): ' || count(*) from sync.tablas where nombre = 'clinico.alertas_clinicas' and clinica and subible;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
delete from public.notificaciones where titulo = 'Alerta para la próxima evaluación';
delete from clinico.alertas_clinicas where trabajador_id = '30000000-0000-0000-0000-00000000000a';
delete from clinico.consultas where id = '15600000-0000-0000-0000-0000000000c1';
delete from public.miembros where usuario_id in ('00000000-0000-0000-0000-000000001561', '00000000-0000-0000-0000-000000001562');
