-- Empresas y usuarios ficticios de este escenario, independientes del resto de la suite.
begin;
set local "request.jwt.claims" = '{"aal":"aal2"}';
set local "request.jwt.claim.sub" = '';
insert into auth.users (id, email) values
 ('27500000-0000-0000-0000-000000000006', 'nomina-b@prueba.invalid'),
 ('27500000-0000-0000-0000-000000000002', 'nomina-a-sin-permiso@prueba.invalid'),
 ('27500000-0000-0000-0000-000000000003', 'auditor-a@prueba.invalid'),
 ('27500000-0000-0000-0000-000000000004', 'nomina-admin@prueba.invalid'),
 ('27500000-0000-0000-0000-000000000005', 'nomina-a@prueba.invalid');
insert into public.organizaciones (id, nombre) values ('27500000-0000-0000-0000-000000000100', 'Servicio ficticio de nómina');
insert into public.empresas (id, org_id, razon_social, rif) values
 ('27500000-0000-0000-0000-00000000010a', '27500000-0000-0000-0000-000000000100', 'Nómina ficticia A', 'J-27501'),
 ('27500000-0000-0000-0000-00000000010b', '27500000-0000-0000-0000-000000000100', 'Nómina ficticia B', 'J-27502');
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos) values
 ('27500000-0000-0000-0000-00000000020a', '27500000-0000-0000-0000-000000000100', '27500000-0000-0000-0000-00000000010a', '275201', 'Trabajadora', 'Ficticia A'),
 ('27500000-0000-0000-0000-00000000020b', '27500000-0000-0000-0000-000000000100', '27500000-0000-0000-0000-00000000010b', '275202', 'Trabajadora', 'Ficticia B');
insert into public.miembros (org_id, usuario_id, rol, empresas_permitidas, permisos_portal) values
 ('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-000000000006','gerente_empresa','{27500000-0000-0000-0000-00000000010b}',null),
 ('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-000000000002','gerente_empresa','{27500000-0000-0000-0000-00000000010a}','{descargas}'),
 ('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-000000000003','auditor','{27500000-0000-0000-0000-00000000010a}','{nomina}'),
 ('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-000000000004','administrador',null,null),
 ('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-000000000005','gerente_empresa','{27500000-0000-0000-0000-00000000010a}','{nomina}');

create function pg_temp.comprueba(p boolean, asunto text) returns text language plpgsql as $$
begin
  if p is distinct from true then raise exception 'Nómina del portal: %', asunto; end if;
  return asunto || ' (debe 1): 1';
end $$;
set local role authenticated;
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000004';
do $$ begin
  perform public.crear_depuracion_nomina('27500000-0000-0000-0000-00000000010b', 'Contacto ficticio', '04140000000');
end $$;
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000005';
select pg_temp.comprueba((public.nomina_portal('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-00000000010a')->>'estado') = 'disponible', 'RR. HH. A ve que puede iniciar');
do $$
declare r jsonb;
begin
  r := public.nomina_portal('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-00000000010a',true);
  perform set_config('prueba.token_nomina', r->>'token', true);
  perform pg_temp.comprueba(r->>'estado' = 'borrador', 'crea en A');
end $$;
select pg_temp.comprueba(public.nomina_portal('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-00000000010a',true)->>'token' = current_setting('prueba.token_nomina'), 'reintentar conserva el enlace');
select pg_temp.comprueba(jsonb_array_length(public.ver_depuracion_nomina(current_setting('prueba.token_nomina'))->'trabajadores') = 1, 'la sesión ve solo la nómina de A');
select pg_temp.comprueba(public.ver_depuracion_nomina(current_setting('prueba.token_nomina'))->'trabajadores'->0->>'id' = '27500000-0000-0000-0000-00000000020a', 'solo identifica al trabajador de A');
select pg_temp.comprueba(public.marcar_depuracion_nomina(current_setting('prueba.token_nomina'),null,'27500000-0000-0000-0000-00000000020b','no','Otro') <> 'ok', 'no puede marcar a un trabajador de B');
select pg_temp.comprueba(public.marcar_depuracion_nomina(current_setting('prueba.token_nomina'),null,'27500000-0000-0000-0000-00000000020a','no','Renunció') = 'ok', 'marca una salida en A');
select pg_temp.comprueba(public.agregar_depuracion_nomina(current_setting('prueba.token_nomina'),null,'Persona','Inventada','275001','Operador') = 'ok', 'propone un alta en A');
do $$ begin
  begin
    perform public.nomina_portal('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-00000000010b',true);
    raise exception 'RR. HH. A no debe poder iniciar en B';
  exception when insufficient_privilege then null; end;
end $$;

set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000006';
select pg_temp.comprueba(public.ver_depuracion_nomina(current_setting('prueba.token_nomina')) is null, 'la sesión de B no abre el enlace de A');
select pg_temp.comprueba(public.enviar_depuracion_nomina(current_setting('prueba.token_nomina'),null) <> 'ok', 'la sesión de B no envía por A');
select pg_temp.comprueba(public.nomina_portal('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-00000000010b',true)->>'estado' = 'enlace_servicio', 'no reemplaza un enlace de teléfono vigente');
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000002';
select pg_temp.comprueba(public.ver_depuracion_nomina(current_setting('prueba.token_nomina')) is null, 'una cuenta sin permiso de nómina no puede abrir');
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000003';
select pg_temp.comprueba(public.ver_depuracion_nomina(current_setting('prueba.token_nomina')) is null, 'un auditor no usa el enlace aunque tenga el permiso marcado');
reset role;
set local role anon;
set local "request.jwt.claim.sub" = '';
select pg_temp.comprueba(not has_function_privilege('anon','public.nomina_portal(uuid,uuid,boolean)','execute'), 'una cuenta anónima no puede crear');
select pg_temp.comprueba(public.ver_depuracion_nomina(current_setting('prueba.token_nomina')) is null, 'el enlace reenviado no muestra datos sin sesión');
select pg_temp.comprueba(public.abrir_depuracion_nomina(current_setting('prueba.token_nomina'),'04140000000',repeat('a',64)) = 'cerrado', 'el enlace del portal no abre por teléfono');
select pg_temp.comprueba(public.enviar_depuracion_nomina(current_setting('prueba.token_nomina'),null) <> 'ok', 'una llamada anónima no envía');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000004';
select pg_temp.comprueba((public.revision_depuracion_nomina('27500000-0000-0000-0000-00000000010a')->>'desde_portal')::boolean, 'el servicio ve el origen de la revisión');
select pg_temp.comprueba(public.revision_depuracion_nomina('27500000-0000-0000-0000-00000000010a')->>'token' is null, 'el servicio no recibe el token de sesión');
do $$
declare v_id uuid;
begin
  v_id := (public.revision_depuracion_nomina('27500000-0000-0000-0000-00000000010a')->>'id')::uuid;
  begin
    perform public.aplicar_depuracion_nomina(v_id);
    raise exception 'un borrador no se aplica';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.cerrar_depuracion_nomina(v_id, null);
    raise exception 'un borrador no se confirma';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.crear_depuracion_nomina('27500000-0000-0000-0000-00000000010a','Contacto ficticio','04140000000',7,true);
    raise exception 'el servicio no sustituye un borrador en curso';
  exception when check_violation then null; end;
end $$;
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000005';
select pg_temp.comprueba(public.enviar_depuracion_nomina(current_setting('prueba.token_nomina'),null) = 'ok', 'RR. HH. envía la actualización');
select pg_temp.comprueba(public.nomina_portal('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-00000000010a',true)->>'estado' = 'enviada', 'no se pisa una revisión enviada');
select pg_temp.comprueba(public.marcar_depuracion_nomina(current_setting('prueba.token_nomina'),null,'27500000-0000-0000-0000-00000000020a','si',null) <> 'ok', 'una revisión enviada queda fija');

reset role;
set local "request.jwt.claim.sub" = '';
select pg_temp.comprueba((select estado = 'activo' from public.trabajadores where id = '27500000-0000-0000-0000-00000000020a'), 'el envío no inactiva a quien salió');
select pg_temp.comprueba(not exists (select from public.trabajadores where cedula = '275001'), 'el envío no registra el alta');
select pg_temp.comprueba((select count(*) = 1 from public.actividad_rrhh where tipo='nomina_enviada' and empresa_id='27500000-0000-0000-0000-00000000010a' and actor_id='27500000-0000-0000-0000-000000000005'), 'el envío se registra a nombre de RR. HH.');
select pg_temp.comprueba((select count(*) = 1 from public.notificaciones where titulo='RR. HH. envió la depuración de nómina' and usuario_id='27500000-0000-0000-0000-000000000004' and empresa_id='27500000-0000-0000-0000-00000000010a'), 'el servicio recibe un aviso de envío');
set local role authenticated;
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000004';
select pg_temp.comprueba(public.aplicar_depuracion_nomina((public.revision_depuracion_nomina('27500000-0000-0000-0000-00000000010a')->>'id')::uuid)->>'inactivados' = '1', 'el servicio confirma y aplica la salida');
set local "request.jwt.claim.sub" = '27500000-0000-0000-0000-000000000005';
select pg_temp.comprueba(public.nomina_portal('27500000-0000-0000-0000-000000000100','27500000-0000-0000-0000-00000000010a',true)->>'token' <> current_setting('prueba.token_nomina'), 'se puede iniciar otra actualización al cerrar la anterior');
rollback;
