-- Limpieza con plazos (914000): borra solo lo temporal vencido, respeta el plazo, nunca lo clínico; solo el administrador
-- la ve, la corre y cambia plazos; «Quitar de la lista» en enlaces del paciente solo esconde lo terminado y se deshace.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set session_replication_role = replica;
-- Enlaces del paciente: nunca llenado y vencido hace 40 días (se borra), vencido hace 5 días (se queda por el plazo),
-- llenado y descartado hace 40 días (no se borra aquí) y uno vigente
insert into public.solicitudes_paciente (id,org_id,token_hash,vence,recibido_en,resultado,datos,creado_en,creado_por) values
 ('5e100000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',sha256('l1'),now() - interval '40 days',null,null,'{}',now() - interval '47 days','00000000-0000-0000-0000-0000000000a1'),
 ('5e100000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',sha256('l2'),now() - interval '5 days',null,null,'{}',now() - interval '12 days','00000000-0000-0000-0000-0000000000a1'),
 ('5e100000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',sha256('l3'),now() - interval '40 days',now() - interval '45 days','descartada','{}',now() - interval '47 days','00000000-0000-0000-0000-0000000000a1'),
 ('5e100000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',sha256('l4'),now() + interval '5 days',null,null,'{}',now(),'00000000-0000-0000-0000-0000000000a1');
-- Avisos: leído viejo (se borra), leído reciente y no leído viejo (se quedan)
insert into public.notificaciones (id,org_id,usuario_id,titulo,leida,creado_en) values
 ('5e200000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','v',true,now() - interval '100 days'),
 ('5e200000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','r',true,now() - interval '10 days'),
 ('5e200000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','n',false,now() - interval '100 days');
insert into public.pases_respaldo (huella,creado) values (repeat('a',64), now() - interval '3 days'), (repeat('b',64), now());
set session_replication_role = origin;

-- Un médico no ve ni corre la limpieza
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.limpieza_estado(); raise notice 'el médico ve la limpieza: FALLA';
exception when insufficient_privilege then raise notice 'el médico no ve la limpieza (ok)'; end $$;
do $$ begin perform public.limpieza_ejecutar(); raise notice 'el médico limpia: FALLA';
exception when insufficient_privilege then raise notice 'el médico no limpia (ok)'; end $$;
do $$ begin perform public.limpieza_cambiar_plazo('pases_respaldo', 5); raise notice 'el médico cambia plazos: FALLA';
exception when insufficient_privilege then raise notice 'el médico no cambia plazos (ok)'; end $$;
do $$ begin perform public.limpieza_correr(true); raise notice 'un usuario corre la limpieza interna: FALLA';
exception when insufficient_privilege then raise notice 'un usuario no corre la limpieza interna (ok)'; end $$;

-- El administrador ve cuánto hay antes de borrar
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'vista previa: enlaces sin llenar (debe 1): ' || (r ->> 'cantidad') from jsonb_array_elements(public.limpieza_estado() -> 'reglas') r where r ->> 'clave' = 'enlaces_paciente';
select 'vista previa: avisos leídos (debe 1): ' || (r ->> 'cantidad') from jsonb_array_elements(public.limpieza_estado() -> 'reglas') r where r ->> 'clave' = 'notificaciones_leidas';
select 'la vista previa no borra (debe 3): ' || count(*) from public.notificaciones where id::text like '5e200000%';
do $$ begin perform public.limpieza_cambiar_plazo('pases_respaldo', 999); raise notice 'acepta un plazo fuera de rango: FALLA';
exception when others then raise notice 'rechaza un plazo fuera de rango (ok)'; end $$;

-- Quitar de la lista: el vigente no se puede; el vencido sí, y se deshace
do $$ begin update public.solicitudes_paciente set oculto_en = now() where id = '5e100000-0000-0000-0000-000000000004';
  raise notice 'quita un enlace vigente: FALLA';
exception when others then raise notice 'no quita un enlace que todavía se puede llenar (ok)'; end $$;
update public.solicitudes_paciente set oculto_en = now() where id = '5e100000-0000-0000-0000-000000000002';
select 'quita el vencido (debe 1): ' || count(*) from public.solicitudes_paciente where id = '5e100000-0000-0000-0000-000000000002' and oculto_en is not null;
update public.solicitudes_paciente set oculto_en = null where id = '5e100000-0000-0000-0000-000000000002';
select 'deshacer lo devuelve (debe 1): ' || count(*) from public.solicitudes_paciente where id = '5e100000-0000-0000-0000-000000000002' and oculto_en is null;

-- Limpiar ahora
select 'limpia (debe 1 enlace): ' || (public.limpieza_ejecutar() ->> 'enlaces_paciente');
reset role;
select 'queda el vencido dentro del plazo, el descartado y el vigente (debe 3): ' || count(*) from public.solicitudes_paciente where id::text like '5e100000%';
select 'quedan el aviso reciente y el no leído (debe 2): ' || count(*) from public.notificaciones where id::text like '5e200000%';
select 'borra el pase viejo y deja el nuevo (debe 1): ' || count(*) from public.pases_respaldo where huella in (repeat('a',64), repeat('b',64));
select 'anota la limpieza a mano en el historial (debe 1): ' || count(*) from public.limpieza_historial where not automatica;
select 'la purga de siempre conserva sus claves (debe 1): ' || (public.mantenimiento_purgar() ? 'pdf_enlaces_vencidos')::int;
-- En la base local de la PC no borra nada
select set_config('zamorapp.local','on',false) \g /dev/null
select 'en la PC no borra (debe {}): ' || public.mantenimiento_purgar()::text;
select set_config('zamorapp.local','',false) \g /dev/null
delete from public.solicitudes_paciente where id::text like '5e100000%';
delete from public.notificaciones where id::text like '5e200000%';
delete from public.pases_respaldo where huella in (repeat('a',64), repeat('b',64));
delete from public.limpieza_historial;
