-- Pacientes particulares sin empresa (Cesar, 05-nov): la «empresa» PARTICULAR pasa a ser la bolsa de particulares,
-- sin mover pacientes ni consultas; fuera de vigilancia, Inicio y RR. HH.; con Deshacer.
\pset tuples_only on
reset role;
insert into public.empresas (id, org_id, razon_social, rif) values
  ('20000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000001', 'PARTICULAR', 'PARTICULR');
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado) values
  ('30000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000203', 'V-203203', 'Pedro', 'Particular', 'activo');
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha) values
  ('40000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000203', '30000000-0000-0000-0000-000000000203', 'firmada', public.hoy_caracas());

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table antes203 as select (public.resumen_panel(null) ->> 'activos')::int as n;

-- Lo mismo que hace el paso 2 de la migración en la nube
reset role;
update public.empresas set es_particular = true, razon_social = 'Pacientes particulares', ignorar_alerta_legal = true,
  avisos_apagados = '{vencimientos,post_vacacional}' where id = '20000000-0000-0000-0000-000000000203';
insert into public.bitacora (org_id, accion, tabla, registro_id, despues) values
  ('10000000-0000-0000-0000-000000000001', 'marcar_particulares', 'empresas', '20000000-0000-0000-0000-000000000203', '{"nombre_anterior":"PARTICULAR"}');

select 'una sola bolsa por organización (debe 1): ' || (select count(*) from pg_indexes where indexname = 'empresas_una_particular');
select 'nada se movió: paciente (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000203' and empresa_id = '20000000-0000-0000-0000-000000000203';
select 'nada se movió: consulta (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000203' and empresa_id = '20000000-0000-0000-0000-000000000203';
select 'vista pública trae es_particular (debe 1): ' || count(*) from information_schema.columns where table_schema = 'public' and table_name = 'empresas' and column_name = 'es_particular';

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'Inicio «todas» no cuenta particulares (debe 1): ' || ((select n from antes203) - (public.resumen_panel(null) ->> 'activos')::int);
select 'la bolsa pedida por su id sí se cuenta (debe 1): ' || (public.resumen_panel('20000000-0000-0000-0000-000000000203') ->> 'activos');
select 'vencimientos sin la bolsa (debe 0): ' || count(*) from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'id' = '20000000-0000-0000-0000-000000000203';
select 'vigilancia «todas» sin particulares (debe 1): ' || (pg_get_functiondef('public.reporte_vigilancia(uuid,date,date)'::regprocedure) like '%ep.es_particular%')::int;
select 'series «todas» sin particulares (debe 1): ' || (pg_get_functiondef('public.vigilancia_series(uuid,date,date)'::regprocedure) like '%ep.es_particular%')::int;
select 'complemento «todas» sin particulares (debe 1): ' || (pg_get_functiondef('public.vigilancia_complemento(uuid,date,date)'::regprocedure) like '%ep.es_particular%')::int;
select 'empresa_particulares devuelve la bolsa (debe 1): ' || (public.empresa_particulares() = '20000000-0000-0000-0000-000000000203')::int;

-- RR. HH. no entra a la bolsa
reset role;
do $$ begin
  begin
    update public.miembros set empresas_permitidas = '{20000000-0000-0000-0000-000000000203}' where usuario_id = '00000000-0000-0000-0000-0000000000a3';
    raise notice 'FALLA: RR. HH. quedó con la bolsa de particulares';
  exception when check_violation then null; end;
end $$;
select 'RR. HH. sigue solo con A (debe 1): ' || count(*) from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000a3' and empresas_permitidas = '{20000000-0000-0000-0000-00000000000a}';
with u as (update public.miembros set empresas_permitidas = empresas_permitidas || '{20000000-0000-0000-0000-000000000203}'::uuid[]
    where usuario_id = '00000000-0000-0000-0000-0000000000a2' returning 1)
select 'el médico sí puede tenerla (debe 1): ' || count(*) from u;
update public.miembros set empresas_permitidas = '{20000000-0000-0000-0000-00000000000a}' where usuario_id = '00000000-0000-0000-0000-0000000000a2';

-- Deshacer: solo el administrador; vuelve el nombre anterior
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  begin perform public.quitar_particulares('20000000-0000-0000-0000-000000000203'); raise notice 'FALLA: el médico deshizo la bolsa';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'Deshacer devuelve el nombre (debe 1): ' || (public.quitar_particulares('20000000-0000-0000-0000-000000000203') ->> 'nombre' = 'PARTICULAR')::int;
reset role;
select 'vuelve a ser empresa común (debe 1): ' || count(*) from public.empresas where id = '20000000-0000-0000-0000-000000000203' and not es_particular and razon_social = 'PARTICULAR';
select 'Deshacer quedó en la bitácora (debe 1): ' || count(*) from public.bitacora where registro_id = '20000000-0000-0000-0000-000000000203' and accion = 'quitar_particulares';

-- Sin bolsa: empresa_particulares la crea una sola vez
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'crea la bolsa si falta (debe 1): ' || (public.empresa_particulares() = public.empresa_particulares())::int;
reset role;
select 'una sola bolsa (debe 1): ' || count(*) from public.empresas where org_id = '10000000-0000-0000-0000-000000000001' and es_particular;

-- Deja la base como estaba
reset role;
delete from public.empresas where org_id = '10000000-0000-0000-0000-000000000001' and es_particular;
delete from clinico.consultas where id = '40000000-0000-0000-0000-000000000203';
delete from public.trabajadores where id = '30000000-0000-0000-0000-000000000203';
delete from public.empresas where id = '20000000-0000-0000-0000-000000000203';
