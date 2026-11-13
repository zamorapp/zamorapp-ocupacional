-- Historial de enlaces al paciente (20261030931000): alargar (solo el servicio, tope 30 días), la prórroga de resultados
-- que usan las funciones públicas, avisos que llevan al historial y autolimpieza de enlaces terminados.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,resultados_hasta) values
 ('5f000000-0000-0000-0000-000000000301','10000000-0000-0000-0000-000000000001',sha256('his-0123456789-0123456789-0123456789-uno'),'Uno', now() + interval '300 days'),
 ('5f000000-0000-0000-0000-000000000302','10000000-0000-0000-0000-000000000001',sha256('his-0123456789-0123456789-0123456789-dos'),'Dos', null),
 ('5f000000-0000-0000-0000-000000000303','10000000-0000-0000-0000-000000000001',sha256('his-0123456789-0123456789-0123456789-tre'),'Tres', null),
 ('5f000000-0000-0000-0000-000000000304','10000000-0000-0000-0000-000000000001',sha256('his-0123456789-0123456789-0123456789-cua'),'Cuatro', null);
select 'la prórroga nace vacía aunque la app la mande (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000301' and resultados_hasta is null;
do $$ begin
  update public.solicitudes_paciente set vence = now() + interval '60 days' where id = '5f000000-0000-0000-0000-000000000301';
  raise notice 'FALLA: la app cambió el vencimiento a mano';
exception when others then raise notice 'el vencimiento no se cambia a mano (debe 1): 1';
end $$;
do $$ begin
  update public.solicitudes_paciente set resultados_hasta = now() + interval '60 days' where id = '5f000000-0000-0000-0000-000000000301';
  raise notice 'FALLA: la app cambió la prórroga a mano';
exception when others then raise notice 'la prórroga no se cambia a mano (debe 1): 1';
end $$;
reset role;

-- Vencido hace 3 días, sin llenar: «Alargar 7» lo deja vigente 7 días desde hoy
update public.solicitudes_paciente set vence = now() - interval '3 days' where id = '5f000000-0000-0000-0000-000000000301';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no alarga (debe 1): ' || (public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000301', 7) = 'Ese enlace ya no está. Recarga la pantalla.')::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el servicio alarga (debe ok): ' || public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000301', 7);
select 'días fuera de 1 a 30 no (debe 1): ' || (public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000301', 31) = 'Elige entre 1 y 30 días.')::int;
reset role;
select 'vencido: 7 días desde hoy (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000301' and vence between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour';
set role anon;
select 'el paciente ya puede llenarlo (debe 1): ' || (public.catalogo_registro_paciente('his-0123456789-0123456789-0123456789-uno') is not null)::int;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'alargar dos veces 30 (debe ok): ' || public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000301', 30) || public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000301', 30);
reset role;
select 'nunca más de 30 días desde hoy (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000301' and vence <= now() + interval '30 days' and vence > now() + interval '29 days';

-- Caducado (anulado): no se alarga
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.solicitudes_paciente set anulado_en = now() where id = '5f000000-0000-0000-0000-000000000302';
select 'caducado no se alarga (debe 1): ' || (public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000302', 7) = 'Ese enlace está caducado: envíale uno nuevo.')::int;
reset role;

-- Aceptado hace 40 días: ya no recibe resultados; alargado 10 días, sí y hasta 10 días desde hoy
update public.solicitudes_paciente set recibido_en = now() - interval '40 days', datos = '{"cedula":"V-1","nombres":"Tres","apellidos":"T"}',
       resultado = 'aceptada', revisado_en = now() - interval '39 days', trabajador_id = '30000000-0000-0000-0000-00000000000a'
 where id = '5f000000-0000-0000-0000-000000000303';
set role anon;
select 'aceptado hace 40 días: ya no recibe resultados (debe 0): ' || (public.resultados_registro_paciente('his-0123456789-0123456789-0123456789-tre') ->> 'puede')::boolean::int;
select 'y lo dice como vencido (debe 1): ' || (public.resultados_registro_paciente('his-0123456789-0123456789-0123456789-tre') ->> 'motivo' = 'vencido')::int;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'alargar el aceptado (debe ok): ' || public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000303', 10);
reset role;
set role anon;
select 'alargado: recibe resultados otra vez (debe 1): ' || (public.resultados_registro_paciente('his-0123456789-0123456789-0123456789-tre') ->> 'puede')::boolean::int;
select 'hasta 10 días desde hoy (debe 1): ' || (public.resultados_registro_paciente('his-0123456789-0123456789-0123456789-tre') ->> 'hasta' = to_char(public.hoy_caracas() + 10, 'YYYY-MM-DD'))::int;
reset role;
-- Por revisar: no se alarga
update public.solicitudes_paciente set recibido_en = now(), datos = '{"cedula":"V-4","nombres":"Cuatro","apellidos":"C"}'
 where id = '5f000000-0000-0000-0000-000000000304';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'por revisar no se alarga (debe 1): ' || (public.alargar_solicitud_paciente('5f000000-0000-0000-0000-000000000304', 7) like 'Ese paciente está por revisar%')::int;
reset role;

-- Avisos: llevan al historial
update public.solicitudes_paciente set abierto_en = now() where id = '5f000000-0000-0000-0000-000000000301';
select 'el aviso lleva al historial (debe 1): ' || (count(*) > 0)::int from public.notificaciones
 where titulo = 'Paciente abrió su enlace' and texto like 'Uno abrió%' and enlace = '/atencion/enlaces';

-- Autolimpieza: el caducado hace 200 días se borra; el aceptado con plazo vigente y el por revisar se quedan
update public.solicitudes_paciente set anulado_en = now() - interval '200 days', recibido_en = now() - interval '201 days',
       datos = '{"cedula":"V-2","nombres":"Dos","apellidos":"D"}', resultado = 'aceptada', trabajador_id = '30000000-0000-0000-0000-00000000000a'
 where id = '5f000000-0000-0000-0000-000000000302';
select 'la limpieza lo cuenta (debe 1): ' || (cantidad >= 1)::int from public.limpieza_correr(false) where clave = 'enlaces_historial';
select 'regla editable de 180 días (debe 180): ' || dias from public.limpieza_plazos where clave = 'enlaces_historial';
select count(*) from public.limpieza_correr(true) \g /dev/null
select 'el terminado hace 200 días se borró (debe 0): ' || count(*) from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000302';
select 'los que siguen en uso se quedan (debe 3): ' || count(*) from public.solicitudes_paciente
 where id in ('5f000000-0000-0000-0000-000000000301','5f000000-0000-0000-0000-000000000303','5f000000-0000-0000-0000-000000000304');
select 'la ficha del paciente se queda (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-00000000000a';
