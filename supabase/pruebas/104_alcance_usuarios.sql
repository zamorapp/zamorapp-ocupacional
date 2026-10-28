-- Usuarios entre empresas, listas clínicas y el rol trabajador (solo su ficha).
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into auth.users (id,email) values ('00000000-0000-0000-0000-000000000d41','rrhhB104@x'), ('00000000-0000-0000-0000-000000000d42','Ana104@X'),
  ('00000000-0000-0000-0000-000000000d43','sst104@x');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000d41','gerente_empresa','{20000000-0000-0000-0000-00000000000b}'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000d42','trabajador','{20000000-0000-0000-0000-00000000000a}'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000d43','coordinador_sst',null);
insert into public.perfiles (id,nombre_completo,cedula,telefono) values
 ('00000000-0000-0000-0000-000000000d41','RRHH de B','V-104','0414') on conflict (id) do update set cedula='V-104';
insert into public.perfiles (id,nombre_completo) values ('00000000-0000-0000-0000-0000000000a2','Médico A') on conflict (id) do nothing;
update public.trabajadores set correo=' ana104@x ' where id='30000000-0000-0000-0000-00000000000a';
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos) values
 ('30000000-0000-0000-0000-000000000a04','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','104','Compañero','A');
insert into public.lista_items (lista,org_id,nombre) values
 ('grupo_paraclinicos','10000000-0000-0000-0000-000000000001','Perfil Empresa B 104'),
 ('motivo_consulta','10000000-0000-0000-0000-000000000001','Motivo 104');
set role authenticated;

-- RR. HH. de A (a3) no ve a RR. HH. de B, sí al médico
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A no ve el usuario de B (debe 0): ' || count(*) from public.miembros where usuario_id='00000000-0000-0000-0000-000000000d41';
select 'RR. HH. de A no ve el perfil de B (debe 0): ' || count(*) from public.perfiles where id='00000000-0000-0000-0000-000000000d41';
select 'RR. HH. de A ve al médico (debe 1): ' || count(*) from public.perfiles where id='00000000-0000-0000-0000-0000000000a2';
select 'RR. HH. de A ve su propio usuario (debe 1): ' || count(*) from public.miembros where usuario_id='00000000-0000-0000-0000-0000000000a3';
select 'RR. HH. de A ve la trabajadora de su empresa con correo (debe 1): ' || count(*) from public.miembros where usuario_id='00000000-0000-0000-0000-000000000d42';
select 'RR. HH. no lee perfiles de paraclínicos (debe 0): ' || count(*) from public.lista_items where nombre='Perfil Empresa B 104';
select 'RR. HH. sí lee motivos de consulta (debe 1): ' || count(*) from public.lista_items where nombre='Motivo 104';
select 'RR. HH. de A sigue viendo toda su nómina (debe 2): ' || count(*) from public.trabajadores where id in ('30000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000a04');

-- El médico ve a todos los usuarios y las listas clínicas
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'El médico ve el perfil de RR. HH. de B (debe 1): ' || count(*) from public.perfiles where id='00000000-0000-0000-0000-000000000d41';
select 'El médico lee perfiles de paraclínicos (debe 1): ' || count(*) from public.lista_items where nombre='Perfil Empresa B 104';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000d43',false) \g /dev/null
select 'El coordinador SST lee perfiles de paraclínicos (debe 1): ' || count(*) from public.lista_items where nombre='Perfil Empresa B 104';

-- La trabajadora (mismo correo que su ficha, sin importar mayúsculas ni espacios) ve solo lo suyo
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000d42',false) \g /dev/null
select 'La trabajadora ve su ficha (debe 1): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-00000000000a';
select 'La trabajadora no ve a su compañero (debe 0): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-000000000a04';
select 'La trabajadora alcanza lo ligado a su ficha (debe 1): ' || public.ve_trabajador('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a')::int;
select 'La trabajadora no alcanza lo de su compañero (debe 0): ' || public.ve_trabajador('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000a04')::int;
select 'La trabajadora alcanza su consulta (debe 1): ' || public.ve_consulta('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-00000000000a')::int;
select 'La trabajadora no ve otros usuarios de empresa (debe 0): ' || count(*) from public.miembros where usuario_id='00000000-0000-0000-0000-0000000000a3';
select 'La trabajadora no ve el diagnóstico (debe 0): ' || count(*) from clinico.diagnosticos;

-- Otro correo: la ficha deja de ser suya
reset role;
update public.trabajadores set correo='otra@x' where id='30000000-0000-0000-0000-00000000000a';
set role authenticated;
select 'Con otro correo la trabajadora no ve la ficha (debe 0): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-00000000000a';
select 'Con otro correo no alcanza su consulta (debe 0): ' || public.ve_consulta('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-00000000000a')::int;
reset role;
update public.trabajadores set correo=null where id='30000000-0000-0000-0000-00000000000a';
select set_config('request.jwt.claim.sub','',false) \g /dev/null
