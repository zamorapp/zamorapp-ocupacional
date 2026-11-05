-- Enlace para que el paciente llene sus datos (solicitudes_paciente, /registro/<token>): solo el servicio sin límite de
-- empresas crea, lee y revisa; el paciente (anónimo) solo llena una vez un enlace vigente; los datos no se cambian.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.lista_items (id,lista,org_id,nombre) values
 ('5f000000-0000-0000-0000-0000000000f1','motivo_consulta','10000000-0000-0000-0000-000000000001','Pre-empleo prueba 204')
on conflict do nothing;

-- Administrador (sin límite) crea dos enlaces
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
with x as (
  insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,telefono,vence,datos,recibido_en)
  values ('5f000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',sha256('pac-0123456789-0123456789-0123456789-uno'),
          'Luis','584141234567', now() + interval '60 days', '{"cedula":"falsa"}', now()),
         ('5f000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',sha256('pac-0123456789-0123456789-0123456789-dos'),
          null,null,default,default,null)
  returning 1)
select 'el servicio crea enlaces (debe 2): ' || count(*) from x;
select 'al crear no entran datos ni recibido, y vence en 7 días (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000001' and datos = '{}' and recibido_en is null and vence <= now() + interval '7 days 1 minute';

-- Médico limitado a la empresa A y RR. HH.: no ven ni crean
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico limitado a una empresa no ve los enlaces (debe 0): ' || count(*) from public.solicitudes_paciente;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve los enlaces (debe 0): ' || count(*) from public.solicitudes_paciente;
do $$ begin
  insert into public.solicitudes_paciente (org_id,token_hash) values ('10000000-0000-0000-0000-000000000001',sha256('rrhh'));
  raise notice 'FALLA: RR. HH. creó un enlace';
exception when others then raise notice 'RR. HH. no crea enlaces (debe 1): 1';
end $$;

-- Anónimo: ve lo justo y llena una sola vez
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'anónimo no lee la tabla (debe 1): ' || (case when has_table_privilege('anon','public.solicitudes_paciente','select') then 0 else 1 end);
select 'el paciente ve el enlace vigente con su nombre y los motivos (debe 1): ' || count(*)
  from public.ver_solicitud_paciente('pac-0123456789-0123456789-0123456789-uno') where estado = 'vigente' and nombre = 'Luis' and motivos @> '[{"nombre":"Pre-empleo prueba 204"}]';
select 'token inventado no devuelve nada (debe 0): ' || count(*) from public.ver_solicitud_paciente('pac-0123456789-0123456789-0123456789-xxx');
select 'cédula mala se rechaza (debe 1): ' || (public.enviar_solicitud_paciente('pac-0123456789-0123456789-0123456789-uno',
  '{"cedula":"12","nombres":"Luis","apellidos":"Pérez","fecha_nacimiento":"1990-01-01","telefono":"04141234567"}') like 'Revise la cédula%')::int;
select 'envía sus datos (debe 1): ' || (public.enviar_solicitud_paciente('pac-0123456789-0123456789-0123456789-uno',
  '{"cedula":"v 12.345.678","nombres":" Luis  Alberto ","apellidos":"Pérez","fecha_nacimiento":"1990-01-01","sexo":"M","telefono":"0414-1234567",
    "tipo":"particular","empresa":"no va","motivo_id":"5f000000-0000-0000-0000-0000000000f1","motivo":"Evaluación pre-empleo",
    "fecha":"2000-01-01","clave_rara":"<script>","grupo_sanguineo":"O+"}') = 'ok')::int;
select 'el mismo enlace no sirve dos veces (debe 1): ' || (public.enviar_solicitud_paciente('pac-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-1234567","nombres":"Otro","apellidos":"Más","fecha_nacimiento":"1990-01-01","telefono":"04141234567"}') like 'Sus datos ya se enviaron%')::int;
select 'ya usado se ve como usado y sin motivos (debe 1): ' || count(*)
  from public.ver_solicitud_paciente('pac-0123456789-0123456789-0123456789-uno') where estado = 'usado' and motivos is null and nombre is null;

reset role;
select 'guarda solo campos conocidos y limpios (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000001' and recibido_en is not null
   and datos->>'cedula' = 'V-12345678' and datos->>'nombres' = 'Luis Alberto' and datos->>'telefono' = '584141234567'
   and not datos ? 'clave_rara' and not datos ? 'grupo_sanguineo' and not datos ? 'empresa' and not datos ? 'fecha'
   and datos->>'motivo_id' = '5f000000-0000-0000-0000-0000000000f1';
select 'avisa al servicio en la campana (debe 1): ' || (count(*) > 0)::int from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a1' and titulo = 'Paciente envió sus datos';
select 'RR. HH. no recibe el aviso (debe 0): ' || count(*) from public.notificaciones
 where usuario_id = '00000000-0000-0000-0000-0000000000a3' and titulo = 'Paciente envió sus datos';

-- El servicio revisa
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  update public.solicitudes_paciente set datos = '{}' where id = '5f000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: el servicio cambió los datos del paciente';
exception when others then raise notice 'el servicio no cambia los datos del paciente (debe 1): 1';
end $$;
do $$ begin
  update public.solicitudes_paciente set anulado_en = now() where id = '5f000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: anuló uno ya llenado';
exception when others then raise notice 'no se anula un enlace ya llenado (debe 1): 1';
end $$;
do $$ begin
  update public.solicitudes_paciente set resultado = 'aceptada' where id = '5f000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: aceptó sin ficha ni cita';
exception when others then raise notice 'aceptar exige la ficha y la cita (debe 1): 1';
end $$;
with x as (update public.solicitudes_paciente set resultado = 'descartada' where id = '5f000000-0000-0000-0000-000000000001' returning revisado_por)
select 'descarta y anota quién (debe 1): ' || count(*) from x where revisado_por = '00000000-0000-0000-0000-0000000000a1';
with x as (update public.solicitudes_paciente set resultado = null where id = '5f000000-0000-0000-0000-000000000001' returning revisado_en)
select 'deshacer el descarte la devuelve a por revisar (debe 1): ' || count(*) from x where revisado_en is null;
with x as (update public.solicitudes_paciente set resultado = 'aceptada', trabajador_id = '30000000-0000-0000-0000-00000000000a',
                  cita_id = gen_random_uuid() where id = '5f000000-0000-0000-0000-000000000001' returning 1)
select 'acepta con ficha y cita (debe 1): ' || count(*) from x;
do $$ begin
  update public.solicitudes_paciente set resultado = 'descartada' where id = '5f000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: cambió una aceptada';
exception when others then raise notice 'una aceptada no cambia más (debe 1): 1';
end $$;
do $$ begin
  update public.solicitudes_paciente set resultado = 'descartada' where id = '5f000000-0000-0000-0000-000000000002';
  raise notice 'FALLA: descartó uno sin llenar';
exception when others then raise notice 'no se revisa un enlace sin llenar (debe 1): 1';
end $$;
with x as (update public.solicitudes_paciente set anulado_en = now() where id = '5f000000-0000-0000-0000-000000000002' returning 1)
select 'anula un enlace sin llenar (debe 1): ' || count(*) from x;
do $$ begin
  delete from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000002';
  raise notice 'FALLA: borró un enlace';
exception when others then raise notice 'nadie borra enlaces (debe 1): 1';
end $$;

set role anon;
select 'el paciente no llena un enlace anulado (debe 1): ' || (public.enviar_solicitud_paciente('pac-0123456789-0123456789-0123456789-dos',
  '{"cedula":"V-7654321","nombres":"Ana","apellidos":"Gil","fecha_nacimiento":"1990-01-01","telefono":"04141234567"}') like '%anulado%')::int;

-- Cada prueba deja su propio estado
reset role;
alter table public.solicitudes_paciente disable trigger user;
delete from public.solicitudes_paciente where id in ('5f000000-0000-0000-0000-000000000001','5f000000-0000-0000-0000-000000000002');
alter table public.solicitudes_paciente enable trigger user;
delete from public.notificaciones where titulo = 'Paciente envió sus datos';
delete from public.lista_items where id = '5f000000-0000-0000-0000-0000000000f1';
