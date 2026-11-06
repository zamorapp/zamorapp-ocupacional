-- Orden de evaluación de RR. HH. y relación mensual (20261030921000)
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos) values
 ('30000000-0000-0000-0000-000000000231','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','22301','Carla','Ruiz'),
 ('30000000-0000-0000-0000-000000000232','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','22302','Dario','Luna'),
 ('30000000-0000-0000-0000-000000000233','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','22303','Elsa','Mora');
-- Cita de la empresa B (ajena a RR. HH. de A) y una cita del servicio (no del portal)
insert into public.citas (id,org_id,empresa_id,trabajador_id,fecha,estado,origen,solicitada_por) values
 ('6c000000-0000-0000-0000-000000000233','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-000000000233','2026-11-10','solicitada','portal','00000000-0000-0000-0000-0000000000a3'),
 ('6c000000-0000-0000-0000-000000000234','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000231','2026-11-10','citado','individual',null);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into public.citas (id,org_id,empresa_id,trabajador_id,fecha,hora,estado,origen,solicitada_por) values
 ('6c000000-0000-0000-0000-000000000231','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000231','2026-11-10','08:30','solicitada','portal','00000000-0000-0000-0000-0000000000a3'),
 ('6c000000-0000-0000-0000-000000000232','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000232','2026-11-10','08:00','solicitada','portal','00000000-0000-0000-0000-0000000000a3');
select 'RR. HH. crea la orden de sus citas (debe 1): ' || jsonb_array_length(public.crear_orden_evaluacion(array['6c000000-0000-0000-0000-000000000231','6c000000-0000-0000-0000-000000000232']::uuid[]));
select 'la orden tiene Nº 1, sus 2 citas por hora y el nombre de quien la pidió (debe 1): ' || count(*) from public.ordenes_evaluacion
 where numero = 1 and citas = array['6c000000-0000-0000-0000-000000000232','6c000000-0000-0000-0000-000000000231']::uuid[] and solicitante = 'rrhhA';
do $$ begin
  perform public.crear_orden_evaluacion(array['6c000000-0000-0000-0000-000000000231']::uuid[]);
  raise notice 'FALLA: dos órdenes para la misma cita';
exception when others then raise notice 'una cita no entra en dos órdenes (debe 1): 1';
end $$;
do $$ begin
  perform public.crear_orden_evaluacion(array['6c000000-0000-0000-0000-000000000233']::uuid[]);
  raise notice 'FALLA: orden con una cita de otra empresa';
exception when others then raise notice 'no crea orden con citas de otra empresa (debe 1): 1';
end $$;
do $$ begin
  perform public.crear_orden_evaluacion(array['6c000000-0000-0000-0000-000000000234']::uuid[]);
  raise notice 'FALLA: orden con una cita que no pidió';
exception when others then raise notice 'no crea orden con una cita del servicio (debe 1): 1';
end $$;
do $$ begin
  insert into public.ordenes_evaluacion (org_id,empresa_id,numero,citas,solicitante) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',99,array[gen_random_uuid()],'x');
  raise notice 'FALLA: escribió la orden a mano';
exception when others then raise notice 'nadie escribe la orden a mano (debe 1): 1';
end $$;
do $$ begin
  update public.ordenes_evaluacion set numero = 7;
  raise notice 'FALLA: cambió el número de la orden';
exception when others then raise notice 'la orden no se edita (debe 1): 1';
end $$;
do $$ begin
  delete from public.ordenes_evaluacion;
  raise notice 'FALLA: borró la orden';
exception when others then raise notice 'la orden no se borra (debe 1): 1';
end $$;
reset role;
select 'la orden no se edita ni se borra (debe 1): ' || count(*) from public.ordenes_evaluacion where numero = 1;

-- El médico de A la ve; RR. HH. de otra empresa no (RR. HH. de A no ve órdenes de B)
reset role;
insert into public.ordenes_evaluacion (org_id,empresa_id,numero,citas,solicitante) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b',2,array['6c000000-0000-0000-0000-000000000233']::uuid[],'RR. HH. B');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A solo ve las órdenes de A (debe 1): ' || count(*) from public.ordenes_evaluacion;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico de A ve la orden de A (debe 1): ' || count(*) from public.ordenes_evaluacion;
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
do $$ begin
  perform 1 from public.ordenes_evaluacion;
  raise notice 'FALLA: anon leyó órdenes';
exception when others then raise notice 'anon no lee órdenes (debe 1): 1';
end $$;

-- Relación mensual: la consulta atendida con su orden y su nota de cobro emitida; sin diagnósticos
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('40000000-0000-0000-0000-000000000231','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000231','firmada','2026-11-10'),
 ('40000000-0000-0000-0000-000000000232','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000232','borrador','2026-11-10'),
 ('40000000-0000-0000-0000-000000000233','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-000000000233','cerrada','2026-11-10');
update public.citas set consulta_id = '40000000-0000-0000-0000-000000000231', estado = 'atendido' where id = '6c000000-0000-0000-0000-000000000231';
insert into public.cobros (id,org_id,empresa_id,estado,numero_factura_fiscal) values
 ('7c000000-0000-0000-0000-000000000231','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','emitida','00000123');
insert into public.cobro_items (org_id,cobro_id,consulta_id,descripcion) values
 ('10000000-0000-0000-0000-000000000001','7c000000-0000-0000-0000-000000000231','40000000-0000-0000-0000-000000000231','Evaluación');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. ve lo realizado en A con orden Nº 1 y la factura (debe 1): ' || count(*) from public.relacion_mensual('20000000-0000-0000-0000-00000000000a','2026-11-01','2026-11-30')
 where orden = 1 and factura = '00000123' and nota_cobro is not null;
select 'el borrador no cuenta como realizado (debe 0): ' || count(*) from public.relacion_mensual('20000000-0000-0000-0000-00000000000a','2026-11-01','2026-11-30') where consulta_id = '40000000-0000-0000-0000-000000000232';
select 'RR. HH. de A no ve la relación de B (debe 0): ' || count(*) from public.relacion_mensual('20000000-0000-0000-0000-00000000000b','2026-11-01','2026-11-30');
select 'más de 92 días no responde (debe 0): ' || count(*) from public.relacion_mensual('20000000-0000-0000-0000-00000000000a','2026-01-01','2026-11-30');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador ve la relación de B (debe 1): ' || count(*) from public.relacion_mensual('20000000-0000-0000-0000-00000000000b','2026-11-01','2026-11-30');
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
do $$ begin
  perform public.relacion_mensual('20000000-0000-0000-0000-00000000000a','2026-11-01','2026-11-30');
  raise notice 'FALLA: anon pidió la relación';
exception when others then raise notice 'anon no pide la relación (debe 1): 1';
end $$;
-- Una orden por trabajador: cada cita del lote recibe su propio número, en el orden de la hora
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into public.citas (id,org_id,empresa_id,trabajador_id,fecha,hora,estado,origen,solicitada_por) values
 ('6c000000-0000-0000-0000-000000000235','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000231','2026-11-12','09:00','solicitada','portal','00000000-0000-0000-0000-0000000000a3'),
 ('6c000000-0000-0000-0000-000000000236','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000232','2026-11-12','08:00','solicitada','portal','00000000-0000-0000-0000-0000000000a3');
select 'por trabajador: dos órdenes para dos citas (debe 2): ' || jsonb_array_length(public.crear_orden_evaluacion(array['6c000000-0000-0000-0000-000000000235','6c000000-0000-0000-0000-000000000236']::uuid[], true));
select 'cada orden con un solo trabajador y la de las 8:00 primero (debe 2): ' || count(*) from public.ordenes_evaluacion
 where (numero = 3 and citas = array['6c000000-0000-0000-0000-000000000236']::uuid[]) or (numero = 4 and citas = array['6c000000-0000-0000-0000-000000000235']::uuid[]);
reset role;
-- Permisos por persona: RR. HH. sin «relacion» ni «citas» (pedido de Cesar, 06-nov)
update public.miembros set permisos_portal = '{descargas}' where usuario_id = '00000000-0000-0000-0000-0000000000a3';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'sin permiso «relacion» no ve los atendidos (debe 0): ' || count(*) from public.relacion_mensual('20000000-0000-0000-0000-00000000000a','2026-11-01','2026-11-30');
select 'conserva «descargas» (debe 1): ' || public.permiso_portal('10000000-0000-0000-0000-000000000001','descargas')::int;
do $$ begin
  insert into public.citas (org_id,empresa_id,trabajador_id,fecha,estado,origen,solicitada_por) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-000000000231','2026-11-20','solicitada','portal','00000000-0000-0000-0000-0000000000a3');
  raise notice 'FALLA: pidió cita sin permiso';
exception when others then raise notice 'sin permiso «citas» no pide consultas (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el servicio (sin lista) conserva todo (debe 1): ' || public.permiso_portal('10000000-0000-0000-0000-000000000001','relacion')::int;
reset role;
do $$ begin
  update public.miembros set permisos_portal = '{ver_diagnosticos}' where usuario_id = '00000000-0000-0000-0000-0000000000a3';
  raise notice 'FALLA: aceptó un permiso inventado';
exception when check_violation then raise notice 'solo permisos conocidos (debe 1): 1';
end $$;
update public.miembros set permisos_portal = null where usuario_id = '00000000-0000-0000-0000-0000000000a3';
-- Quién cambia los permisos: el administrador sí, RR. HH. no se los da a sí misma
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ declare n int; begin
  update public.miembros set permisos_portal = '{citas}' where usuario_id = '00000000-0000-0000-0000-0000000000a3';
  get diagnostics n = row_count;
  raise notice 'RR. HH. no cambia sus propios permisos (debe 0): %', n;
exception when insufficient_privilege then raise notice 'RR. HH. no cambia sus propios permisos (debe 0): 0';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.miembros set permisos_portal = '{citas}' where usuario_id = '00000000-0000-0000-0000-0000000000a3';
select 'el administrador sí los cambia (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000a3' and permisos_portal = '{citas}';
-- Un rol de empresa nunca recibe acceso clínico
do $$ begin
  update public.miembros set acceso_clinico = true where usuario_id = '00000000-0000-0000-0000-0000000000a3';
  raise notice 'FALLA: RR. HH. quedó con acceso clínico';
exception when check_violation then raise notice 'RR. HH. no recibe acceso clínico (debe 1): 1';
end $$;
update public.miembros set acceso_clinico = true where usuario_id = '00000000-0000-0000-0000-0000000000a2';
do $$ begin
  update public.miembros set rol = 'gerente_empresa' where usuario_id = '00000000-0000-0000-0000-0000000000a2';
  raise notice 'FALLA: un médico pasó a RR. HH. con acceso clínico';
exception when check_violation then raise notice 'pasar a rol de empresa con «Clínico» marcado se rechaza (debe 1): 1';
end $$;
update public.miembros set acceso_clinico = false where usuario_id = '00000000-0000-0000-0000-0000000000a2';
-- Aunque el constraint faltara, los atajos ignoran «Clínico» en roles de empresa
reset role;
alter table public.miembros drop constraint miembros_empresa_sin_clinico;
update public.miembros set acceso_clinico = true where usuario_id = '00000000-0000-0000-0000-0000000000a3';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. con «Clínico» colado no es clínico (debe 0): ' || cardinality(public.orgs_con(p_clinico => true)) + cardinality(public.pares_limitados(p_clinico => true)) + public.es_clinico('10000000-0000-0000-0000-000000000001')::int;
reset role;
update public.miembros set acceso_clinico = false where usuario_id = '00000000-0000-0000-0000-0000000000a3';
alter table public.miembros add constraint miembros_empresa_sin_clinico
  check (not (acceso_clinico and rol in ('gerente_empresa', 'trabajador', 'supervisor', 'delegado_prevencion', 'auditor')));
-- La invitación lleva los permisos a la cuenta nueva
reset role;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000d3','rrhh-permisos@x');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.invitaciones (id,org_id,empresa_id,token_hash,permisos_portal) values
 ('7a000000-0000-0000-0000-000000000223','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',sha256(convert_to('token-permisos','UTF8')),'{relacion}');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d3',false) \g /dev/null
select 'acepta la invitación con permisos (debe 1): ' || count(*) from public.aceptar_invitacion('token-permisos');
select 'entra solo con «relacion» (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000d3' and permisos_portal = '{relacion}';
reset role;
update public.miembros set permisos_portal = null where usuario_id = '00000000-0000-0000-0000-0000000000a3';
delete from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000d3';
delete from public.invitaciones where id = '7a000000-0000-0000-0000-000000000223';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d3';
delete from public.cobros where id = '7c000000-0000-0000-0000-000000000231';
delete from public.ordenes_evaluacion where solicitante in ('rrhhA', 'RR. HH. B');
delete from public.citas where id::text like '6c000000-0000-0000-0000-00000000023%';
delete from clinico.consultas where id::text like '40000000-0000-0000-0000-00000000023%';
delete from public.trabajadores where id::text like '30000000-0000-0000-0000-00000000023%';
