-- Invitación por enlace para RR. HH.: solo el administrador la crea, se ve sin cuenta, un solo uso, nunca cambia
-- el rol de alguien del servicio médico. Deja los datos como los encontró.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000c1','nueva-rrhh@x'),('00000000-0000-0000-0000-0000000000c2','otra@x');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  insert into public.invitaciones (org_id,empresa_id,token_hash) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',sha256('x'::bytea));
  raise notice 'FALLA: un médico creó una invitación';
exception when insufficient_privilege then raise notice 'médico no crea invitaciones (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.invitaciones (id,org_id,empresa_id,nombre,token_hash,vence) values
 ('7a000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Ana RRHH',sha256(convert_to('token-b','UTF8')), now() + interval '90 days'),
 ('7a000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',null,sha256(convert_to('token-a','UTF8')), null),
 ('7a000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',null,sha256(convert_to('token-medico','UTF8')), null);
select 'el vencimiento nunca pasa de 7 días (debe 0): ' || count(*) from public.invitaciones where vence > now() + interval '7 days 1 minute';
do $$ begin
  update public.invitaciones set usada_en = now() where id = '7a000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: se marcó una invitación como usada desde la app';
exception when insufficient_privilege then raise notice 'el uso no se marca a mano (debe 1): 1';
end $$;

-- Sin cuenta: solo ve a qué empresa lo invitan
set role anon;
select 'sin cuenta ve la invitación vigente (debe 1): ' || count(*) from public.ver_invitacion('token-b') where estado = 'vigente' and empresa = 'B';
select 'un token inventado no muestra nada (debe 0): ' || count(*) from public.ver_invitacion('inventado');
do $$ begin
  perform public.aceptar_invitacion('token-b');
  raise notice 'FALLA: se aceptó sin cuenta';
exception when insufficient_privilege then raise notice 'sin cuenta no acepta (debe 1): 1';
end $$;
do $$ begin
  perform count(*) from public.invitaciones;
  raise notice 'FALLA: sin cuenta se leyó la tabla de invitaciones';
exception when insufficient_privilege then raise notice 'sin cuenta no lee la tabla (debe 1): 1';
end $$;

-- Cuenta nueva acepta: queda como RR. HH. solo de B
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c1',false) \g /dev/null
select 'acepta y entra a la empresa B (debe 1): ' || count(*) from public.aceptar_invitacion('token-b') x where x = '20000000-0000-0000-0000-00000000000b';
select 'queda como RR. HH. de B (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000c1' and rol = 'gerente_empresa' and empresas_permitidas = '{20000000-0000-0000-0000-00000000000b}';
select 've los trabajadores de B y no los de A (debe 1): ' || count(*) from public.trabajadores;
select 'aceptar dos veces no falla (debe 1): ' || count(*) from public.aceptar_invitacion('token-b');
-- Una segunda invitación suma la empresa A
select 'segunda invitación suma A (debe 1): ' || count(*) from public.aceptar_invitacion('token-a');
select 'ahora es RR. HH. de A y B (debe 2): ' || cardinality(empresas_permitidas) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000c1';
-- Otra cuenta no reutiliza un enlace usado
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c2',false) \g /dev/null
do $$ begin
  perform public.aceptar_invitacion('token-b');
  raise notice 'FALLA: un enlace usado sirvió dos veces';
exception when others then
  if sqlerrm like '%ya se usó%' then raise notice 'un enlace usado no sirve a otra cuenta (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
-- Un RR. HH. que el administrador desactivó no vuelve a entrar con otro enlace
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas,activo) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c2','gerente_empresa','{20000000-0000-0000-0000-00000000000b}',false);
insert into public.invitaciones (id,org_id,empresa_id,token_hash) values ('7a000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',sha256(convert_to('token-desactivado','UTF8')));
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c2',false) \g /dev/null
do $$ begin
  perform public.aceptar_invitacion('token-desactivado');
  raise notice 'FALLA: un RR. HH. desactivado se reactivó con un enlace';
exception when others then
  if sqlerrm like '%desactivada%' then raise notice 'un RR. HH. desactivado no se reactiva con un enlace (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
reset role;
select 'sigue desactivado y sin la empresa nueva (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000c2' and not activo and empresas_permitidas = '{20000000-0000-0000-0000-00000000000b}';
select 'el enlace sigue sin usar (debe 1): ' || count(*) from public.invitaciones where id = '7a000000-0000-0000-0000-000000000004' and usada_por is null;
set role authenticated;
-- El médico no pierde su rol si abre un enlace
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.aceptar_invitacion('token-medico');
  raise notice 'FALLA: el médico aceptó una invitación de RR. HH.';
exception when others then
  if sqlerrm like '%otro rol%' then raise notice 'no cambia el rol del servicio médico (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
select 'el médico sigue siendo médico (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000a2' and rol = 'medico';
-- Anulada: ya no sirve
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.invitaciones set revocada_en = now() where id = '7a000000-0000-0000-0000-000000000003';
select 'la anulada se muestra como anulada (debe 1): ' || count(*) from public.ver_invitacion('token-medico') where estado = 'anulada';
do $$ begin
  update public.invitaciones set revocada_en = null where id = '7a000000-0000-0000-0000-000000000003';
  raise notice 'FALLA: se reactivó una invitación anulada';
exception when others then
  if sqlerrm like '%solo se puede anular%' then raise notice 'una anulada no se reactiva (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
select 'el administrador recibe un aviso por cada aceptación (debe 2): ' || count(*) from public.notificaciones where titulo = 'RR. HH. aceptó la invitación' and usuario_id = '00000000-0000-0000-0000-0000000000a1';

-- RR. HH. no escribe grupo sanguíneo ni discapacidad por la API
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into public.trabajadores (org_id,empresa_id,cedula,nombres,apellidos,grupo_sanguineo,discapacidad) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-99106001','Prueba','Ciento seis','O+',true);
update public.trabajadores set grupo_sanguineo = 'AB-', discapacidad = true where cedula = 'V-99106001';
reset role;
select 'RR. HH. no escribe datos de salud (debe 1): ' || count(*) from public.trabajadores where cedula = 'V-99106001' and grupo_sanguineo is null and not discapacidad;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.trabajadores set grupo_sanguineo = 'O+' where cedula = 'V-99106001';
reset role;
select 'el médico sí los escribe (debe 1): ' || count(*) from public.trabajadores where cedula = 'V-99106001' and grupo_sanguineo = 'O+';
delete from public.trabajadores where cedula = 'V-99106001';

reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.notificaciones where titulo = 'RR. HH. aceptó la invitación';
delete from public.invitaciones where id::text like '7a000000-%';
delete from public.miembros where usuario_id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2');
