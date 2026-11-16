-- El enlace de invitación lleva el rol: enfermería queda como enfermería (no RR. HH.), con su empresa;
-- nunca se invita como administrador; aceptar no cambia el rol de nadie; quien ve todas las empresas sigue viéndolas.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000264e1','enfermera-264@x'),('00000000-0000-0000-0000-0000000264e2','recepcion-264@x');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.invitaciones (id,org_id,empresa_id,rol,nombre,token_hash) values
 ('7b000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','enfermeria','Carmen',sha256(convert_to('t264-enf','UTF8'))),
 ('7b000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',null,'recepcion',null,sha256(convert_to('t264-rec','UTF8'))),
 ('7b000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','medico',null,sha256(convert_to('t264-med','UTF8')));
do $$ begin
  insert into public.invitaciones (org_id,empresa_id,rol,token_hash) values ('10000000-0000-0000-0000-000000000001',null,'administrador',sha256(convert_to('t264-adm','UTF8')));
  raise notice 'FALLA: se creó un enlace de administrador';
exception when check_violation then raise notice 'nunca se invita como administrador (debe 1): 1';
end $$;
do $$ begin
  insert into public.invitaciones (org_id,empresa_id,rol,token_hash) values ('10000000-0000-0000-0000-000000000001',null,'enfermeria',sha256(convert_to('t264-x1','UTF8')));
  raise notice 'FALLA: enfermería sin empresa';
exception when check_violation then raise notice 'enfermería siempre lleva su empresa (debe 1): 1';
end $$;
do $$ begin
  insert into public.invitaciones (org_id,empresa_id,rol,token_hash) values ('10000000-0000-0000-0000-000000000001',null,'gerente_empresa',sha256(convert_to('t264-x2','UTF8')));
  raise notice 'FALLA: RR. HH. sin empresa';
exception when check_violation then raise notice 'RR. HH. siempre lleva su empresa (debe 1): 1';
end $$;
do $$ begin
  insert into public.invitaciones (org_id,empresa_id,rol,permisos_portal,token_hash) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','enfermeria','{citas}',sha256(convert_to('t264-x3','UTF8')));
  raise notice 'FALLA: permisos del portal fuera de RR. HH.';
exception when check_violation then raise notice 'permisos del portal solo para RR. HH. (debe 1): 1';
end $$;
do $$ begin
  update public.invitaciones set rol = 'gerente_medico', empresa_id = null where id = '7b000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: se cambió el rol de una invitación';
exception when others then raise notice 'el rol de una invitación no se cambia (debe 1): 1';
end $$;

-- Sin cuenta: ve el rol y la empresa
set role anon;
select 'sin cuenta ve que es de enfermería de B (debe 1): ' || count(*) from public.ver_invitacion('t264-enf') where rol = 'enfermeria' and empresa = 'B' and estado = 'vigente';
select 'recepción sin empresa también se ve (debe 1): ' || count(*) from public.ver_invitacion('t264-rec') where rol = 'recepcion' and empresa is null and estado = 'vigente';

-- La enfermera acepta: queda como ENFERMERÍA solo de B, sin acceso clínico extra ni permisos de portal
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000264e1',false) \g /dev/null
select 'acepta y devuelve la empresa B (debe 1): ' || count(*) from public.aceptar_invitacion('t264-enf') x where x = '20000000-0000-0000-0000-00000000000b';
reset role;
select 'queda como enfermería de B, no como RR. HH. (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000264e1' and rol = 'enfermeria' and empresas_permitidas = '{20000000-0000-0000-0000-00000000000b}' and not acceso_clinico and permisos_portal is null;
select 'el administrador recibe «Enfermería aceptó la invitación» (debe 1): ' || count(*) from public.notificaciones where titulo = 'Enfermería aceptó la invitación' and usuario_id = '00000000-0000-0000-0000-0000000000a1';

-- La enfermera abre un enlace de médico: no cambia su rol
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000264e1',false) \g /dev/null
select 'con su sesión ve el aviso de «otro rol» (debe 1): ' || count(*) from public.ver_invitacion('t264-med') where otro_rol;
do $$ begin
  perform public.aceptar_invitacion('t264-med');
  raise notice 'FALLA: la enfermera se volvió médico con un enlace';
exception when others then
  if sqlerrm like '%otro rol%' then raise notice 'un enlace no cambia el rol (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
reset role;
select 'sigue siendo enfermería (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000264e1' and rol = 'enfermeria';
select 'el enlace de médico sigue sin usar (debe 1): ' || count(*) from public.invitaciones where id = '7b000000-0000-0000-0000-000000000003' and usada_en is null;

-- Recepción sin empresa: queda sin empresas marcadas
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000264e2',false) \g /dev/null
select 'recepción acepta sin empresa (debe 1): ' || count(*) from public.aceptar_invitacion('t264-rec') x where x is null;
reset role;
select 'queda como recepción (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000264e2' and rol = 'recepcion' and empresas_permitidas is null;

-- El médico que ve solo A recibe un enlace de médico de B: suma B
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico acepta su enlace de B (debe 1): ' || count(*) from public.aceptar_invitacion('t264-med');
reset role;
select 'ahora el médico ve A y B (debe 2): ' || cardinality(empresas_permitidas) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000a2';

-- Deja los datos como los encontró
update public.miembros set empresas_permitidas = '{20000000-0000-0000-0000-00000000000a}' where usuario_id = '00000000-0000-0000-0000-0000000000a2';
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.notificaciones where titulo like '% aceptó la invitación';
delete from public.invitaciones where id::text like '7b000000-%';
delete from public.miembros where usuario_id in ('00000000-0000-0000-0000-0000000264e1','00000000-0000-0000-0000-0000000264e2');
delete from auth.users where id in ('00000000-0000-0000-0000-0000000264e1','00000000-0000-0000-0000-0000000264e2');
