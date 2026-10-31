-- Empresas inactivas (Cesar, 31-oct): el Inicio y la campana dejan de contarlas; sus datos quedan intactos y un
-- trabajador suyo que vuelve como candidato pasa a otra empresa conservando su historia.
\pset tuples_only on
reset role;
insert into public.empresas (id, org_id, razon_social, rif) values
  ('20000000-0000-0000-0000-000000000178', '10000000-0000-0000-0000-000000000001', 'Forum de prueba', 'J-178');
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado) values
  ('30000000-0000-0000-0000-000000000178', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000178', 'V-178178', 'Carla', 'Forum', 'activo');
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha) values
  ('40000000-0000-0000-0000-000000000178', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000178', '30000000-0000-0000-0000-000000000178', 'firmada', '2026-01-15');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table antes178 as select (public.resumen_panel(null) ->> 'activos')::int as n, (public.resumen_panel(null) ->> 'aspirantes')::int as asp;

reset role;
update public.empresas set activa = false where id = '20000000-0000-0000-0000-000000000178';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'Inicio («todas») deja de contar a la inactiva (debe 1): ' || ((select n from antes178) - (public.resumen_panel(null) ->> 'activos')::int);
select 'pedida por su id sí se cuenta (debe 1): ' || (public.resumen_panel('20000000-0000-0000-0000-000000000178') ->> 'activos');
select 'vencimientos sin la inactiva (debe 0): ' || count(*) from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'id' = '20000000-0000-0000-0000-000000000178';
select 'el trabajador sigue en la base (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000178';
select 'su consulta sigue en la base (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000178';
reset role;
select 'campana sin alertas de inactivas (debe 1): ' || (pg_get_functiondef('public.recordar_alertas()'::regprocedure) like '%coalesce(e.activa, true)%')::int;
select 'campana sin resultados de inactivas (debe 1): ' || (pg_get_functiondef('public.recordar_resultados()'::regprocedure) like '%coalesce(e.activa, true)%')::int;

-- Candidato: el administrador lo pasa a la empresa A (lo que hace pasarAEmpresa en la app)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.trabajadores set empresa_id = '20000000-0000-0000-0000-00000000000a', puesto_id = null, dependencia_id = null, sede_id = null,
  estado = 'aspirante', fecha_ingreso = null, fecha_egreso = null
 where id = '30000000-0000-0000-0000-000000000178';
select 'pasó a la empresa activa (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000178' and empresa_id = '20000000-0000-0000-0000-00000000000a' and estado = 'aspirante';
select 'su consulta anterior sigue a nombre de la inactiva (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000178' and empresa_id = '20000000-0000-0000-0000-000000000178';
select 'ahora el Inicio sí lo cuenta (como aspirante) (debe 1): ' || ((public.resumen_panel(null) ->> 'aspirantes')::int - (select asp from antes178));

-- Deja la base como estaba
reset role;
delete from clinico.consultas where id = '40000000-0000-0000-0000-000000000178';
delete from public.trabajadores where id = '30000000-0000-0000-0000-000000000178';
delete from public.empresas where id = '20000000-0000-0000-0000-000000000178';
