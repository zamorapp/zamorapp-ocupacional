-- Corrección de las fechas que nacieron adelantadas por el default viejo (UTC): corrige solo lo que
-- cumple el criterio exacto y deja constancia de cada cambio. Empresa D propia de esta prueba.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.empresas (id,org_id,razon_social,rif) values
 ('20000000-0000-0000-0000-0000000000d9','10000000-0000-0000-0000-000000000001','D','J-108');
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,estado) values
 ('3d000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d9','d1','Nocturna','D','activo');
-- d1: creada a las 21:30 de Caracas del 26/10 con fecha 27/10 (adelantada), aptitud = fecha + 12 meses
-- d2: creada a las 21:30 pero con su fecha correcta · d3: adelantada pero viene del SAME (origen) · d4: de día
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,creado_en,origen) values
 ('4d000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d9','3d000000-0000-0000-0000-0000000000d1','cerrada','2026-10-27','2026-10-27 01:30+00',null),
 ('4d000000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d9','3d000000-0000-0000-0000-0000000000d1','cerrada','2026-10-26','2026-10-27 01:30+00',null),
 ('4d000000-0000-0000-0000-0000000000d3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d9','3d000000-0000-0000-0000-0000000000d1','cerrada','2026-10-27','2026-10-27 01:30+00','same'),
 ('4d000000-0000-0000-0000-0000000000d4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d9','3d000000-0000-0000-0000-0000000000d1','cerrada','2026-10-27','2026-10-27 15:00+00',null);
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion,vigente_hasta,avisada_en) values
 ('10000000-0000-0000-0000-000000000001','4d000000-0000-0000-0000-0000000000d1','3d000000-0000-0000-0000-0000000000d1','elegible','2027-10-27',now()),
 ('10000000-0000-0000-0000-000000000001','4d000000-0000-0000-0000-0000000000d4','3d000000-0000-0000-0000-0000000000d1','elegible','2027-10-27',now());
insert into public.cobros (id,org_id,empresa_id,fecha,creado_en) values
 ('5d000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d9','2026-10-27','2026-10-27 02:00+00');
insert into public.notificaciones_riesgo (id,org_id,empresa_id,trabajador_id,puesto,entregada_en,firmada_en,creado_en) values
 ('6d000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d9','3d000000-0000-0000-0000-0000000000d1','Operador','2026-10-27','2026-10-27','2026-10-27 03:00+00');

begin;
\i supabase/migrations/20261028110000_corregir_fechas_adelantadas.sql
commit;

select 'consulta nocturna adelantada vuelve al 26/10 (debe 1): ' || (fecha = '2026-10-26')::int from clinico.consultas where id = '4d000000-0000-0000-0000-0000000000d1';
select 'su vigencia pasa a fecha + 12 meses (debe 1): ' || (vigente_hasta = '2027-10-26')::int from clinico.aptitudes where consulta_id = '4d000000-0000-0000-0000-0000000000d1';
select 'la que ya estaba bien no cambia (debe 1): ' || (fecha = '2026-10-26')::int from clinico.consultas where id = '4d000000-0000-0000-0000-0000000000d2';
select 'la del SAME no se toca (debe 1): ' || (fecha = '2026-10-27')::int from clinico.consultas where id = '4d000000-0000-0000-0000-0000000000d3';
select 'la de día no se toca (debe 1): ' || (c.fecha = '2026-10-27' and a.vigente_hasta = '2027-10-27')::int from clinico.consultas c join clinico.aptitudes a on a.consulta_id = c.id where c.id = '4d000000-0000-0000-0000-0000000000d4';
select 'nota de cobro corregida (debe 1): ' || (fecha = '2026-10-26')::int from public.cobros where id = '5d000000-0000-0000-0000-0000000000d1';
select 'notificación firmada corregida (debe 1): ' || (entregada_en = '2026-10-26')::int from public.notificaciones_riesgo where id = '6d000000-0000-0000-0000-0000000000d1';
select 'constancia de los 4 cambios (debe 4): ' || count(*) from public.correccion_fechas
 where registro_id in ('4d000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000d1','6d000000-0000-0000-0000-0000000000d1')
    or registro_id in (select id from clinico.aptitudes where consulta_id = '4d000000-0000-0000-0000-0000000000d1');
select 'la bitácora registró el cambio de la consulta (debe 1): ' || count(*) from public.bitacora
 where registro_id = '4d000000-0000-0000-0000-0000000000d1' and accion = 'UPDATE' and despues ->> 'fecha' = '2026-10-26';
select 'la validación de notificaciones sigue activa (debe 1): ' || (tgenabled = 'O')::int from pg_trigger where tgname = 'validar_notificacion_riesgo';
select 'repetirla no cambia nada más (debe 0): ' || count(*) from clinico.consultas c
 where c.origen is null and c.fecha = public.fecha_caracas(c.creado_en) + 1 and c.fecha = (c.creado_en at time zone 'UTC')::date and c.empresa_id = '20000000-0000-0000-0000-0000000000d9';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  perform 1 from public.correccion_fechas;
  raise notice 'un usuario de la app lee la constancia técnica: FALLA';
exception when insufficient_privilege then raise notice 'la constancia no la lee la app (ok)'; end $$;
reset role;
