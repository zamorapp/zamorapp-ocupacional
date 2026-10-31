-- Trabajadores inactivos sin egreso (Cesar, 31-oct): salen de conteos y estadísticas sin borrar nada; Deshacer los
-- devuelve; el reingreso empieza de cero (sin la aptitud ni las alertas del período anterior) y deja historial.
\pset tuples_only on
reset role;
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado, fecha_ingreso, origen) values
  ('30000000-0000-0000-0000-000000000180', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'V-180180', 'Elsa', 'Same', 'activo', '2015-03-01', 'integral'),
  ('30000000-0000-0000-0000-000000000181', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'V-181181', 'Fito', 'Same', 'reposo', '2016-03-01', 'integral');
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha) values
  ('40000000-0000-0000-0000-000000000180', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000180', 'firmada', '2023-05-10');
insert into clinico.aptitudes (org_id, consulta_id, trabajador_id, clasificacion) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000180', 'elegible');
insert into clinico.alertas_clinicas (id, org_id, empresa_id, trabajador_id, consulta_id, texto, revisar_antes, creada_en) values
  ('50000000-0000-0000-0000-000000000180', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000180', '40000000-0000-0000-0000-000000000180', 'Control de tensión', public.hoy_caracas(), '2023-05-10');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table antes180 as select (public.resumen_panel('20000000-0000-0000-0000-00000000000a') ->> 'activos')::int as n;
select 'candidatos sin consulta desde 2024 (debe 2): ' || count(*) from public.candidatos_inactivar('20000000-0000-0000-0000-00000000000a', '2024-01-01')
 where id in ('30000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000181');
select 'la lista trae su última consulta (debe 1): ' || count(*) from public.candidatos_inactivar('20000000-0000-0000-0000-00000000000a', '2024-01-01')
 where id = '30000000-0000-0000-0000-000000000180' and ultima_consulta = '2023-05-10';
create temp table hechos180 as select public.inactivar_trabajadores(array['30000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000181']::uuid[], public.hoy_caracas(), 'No está en nómina (RR. HH.)') as h;
select 'inactivados con su estado anterior (debe 2): ' || jsonb_array_length(h) from hechos180;
select 'quedan inactivos, no egresados (debe 2): ' || count(*) from public.trabajadores where id in ('30000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000181') and estado = 'inactivo' and fecha_egreso is null and fecha_inactivo = public.hoy_caracas();
select 'el Inicio deja de contarlos (debe 2): ' || ((select n from antes180) - (public.resumen_panel('20000000-0000-0000-0000-00000000000a') ->> 'activos')::int);
select 'ya no son candidatos (debe 0): ' || count(*) from public.candidatos_inactivar('20000000-0000-0000-0000-00000000000a', '2024-01-01') where id = '30000000-0000-0000-0000-000000000180';
select 'su consulta sigue en la base (debe 1): ' || count(*) from clinico.consultas where id = '40000000-0000-0000-0000-000000000180';
select 'queda el período cerrado en el historial (debe 1): ' || count(*) from public.trabajador_periodos where trabajador_id = '30000000-0000-0000-0000-000000000180' and cierre = 'inactivo' and desde = '2015-03-01' and motivo like 'No está%';
select 'vigilancia: cuenta en la población de un período anterior (debe 1): ' || (pg_get_functiondef('public.reporte_vigilancia(uuid, date, date)'::regprocedure) like '%estado = ''inactivo'' and coalesce(fecha_inactivo, p_hasta) >= p_desde%')::int;
select 'campana: sin alertas de inactivos (debe 1): ' || (pg_get_functiondef('public.recordar_alertas()'::regprocedure) like '%t.estado not in (''inactivo'', ''egresado'')%')::int;
select public.recordar_alertas() \g /dev/null
select 'la campana no avisa su alerta (debe 0): ' || count(*) from public.notificaciones where enlace = '/pacientes/30000000-0000-0000-0000-000000000180';

-- RR. HH. no puede reingresar (cambiar el inicio del período) ni usar la depuración
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform public.candidatos_inactivar(null, '2024-01-01');
  raise notice 'RR. HH. ve candidatos a inactivar: FALLA';
exception when insufficient_privilege then raise notice 'RR. HH. no ve candidatos a inactivar (ok)'; end $$;
do $$ begin perform public.inactivar_trabajadores(array['30000000-0000-0000-0000-000000000181']::uuid[], public.hoy_caracas());
  raise notice 'RR. HH. inactiva en grupo: FALLA';
exception when insufficient_privilege then raise notice 'RR. HH. no inactiva en grupo (ok)'; end $$;
do $$ begin update public.trabajadores set estado = 'activo' where id = '30000000-0000-0000-0000-000000000181';
  if found then raise notice 'RR. HH. reactiva a un inactivo: FALLA'; end if;
exception when insufficient_privilege then raise notice 'RR. HH. no reactiva a un inactivo (ok)'; end $$;
do $$ begin update public.trabajadores set periodo_desde = public.hoy_caracas() where id = '30000000-0000-0000-0000-000000000181';
  if found then raise notice 'RR. HH. cambia el inicio del período: FALLA'; end if;
exception when insufficient_privilege then raise notice 'RR. HH. no cambia el inicio del período (ok)'; end $$;
reset role;
select 'RR. HH. no lo reactivó y el cierre sigue (debe 1): ' || count(*) from public.trabajador_periodos where trabajador_id = '30000000-0000-0000-0000-000000000181';
select 'RR. HH. no cambió el período (debe 0): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000181' and periodo_desde is not null;

-- Deshacer: vuelven a su estado anterior y se borra el cierre
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'deshacer devuelve a los dos (debe 2): ' || public.deshacer_inactivar((select h from hechos180), public.hoy_caracas());
select 'cada uno a su estado (debe 2): ' || count(*) from public.trabajadores where (id = '30000000-0000-0000-0000-000000000180' and estado = 'activo') or (id = '30000000-0000-0000-0000-000000000181' and estado = 'reposo');
select 'sin fecha de inactivo (debe 0): ' || count(*) from public.trabajadores where id in ('30000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000181') and fecha_inactivo is not null;
select 'sin cierre en el historial (debe 0): ' || count(*) from public.trabajador_periodos where trabajador_id in ('30000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000181');
select 'deshacer no sirve para activar a otro (debe 0): ' || public.deshacer_inactivar('[{"id":"30000000-0000-0000-0000-00000000000a","estado":"activo"}]', public.hoy_caracas());

-- Reingreso: lo que hace la app (otra empresa o la misma) con periodo_desde = hoy
select public.inactivar_trabajadores(array['30000000-0000-0000-0000-000000000180']::uuid[], public.hoy_caracas()) \g /dev/null
select 'antes del reingreso conserva su aptitud anterior (debe 1): ' || count(*) from public.ultima_aptitud where trabajador_id = '30000000-0000-0000-0000-000000000180';
update public.trabajadores set estado = 'activo', periodo_desde = public.hoy_caracas(), fecha_ingreso = public.hoy_caracas()
 where id = '30000000-0000-0000-0000-000000000180';
select 'reingresa activo (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000180' and estado = 'activo' and fecha_inactivo is null;
select 'empieza sin evaluar: no arrastra la aptitud anterior (debe 0): ' || count(*) from public.ultima_aptitud where trabajador_id = '30000000-0000-0000-0000-000000000180';
select 'el período anterior queda en el historial (debe 1): ' || count(*) from public.trabajador_periodos where trabajador_id = '30000000-0000-0000-0000-000000000180';
select public.recordar_alertas() \g /dev/null
select 'la alerta del período anterior no se avisa (debe 0): ' || count(*) from public.notificaciones where enlace = '/pacientes/30000000-0000-0000-0000-000000000180';
select 'sus datos personales siguen (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000180' and cedula = 'V-180180' and nombres = 'Elsa';

-- Traslado directo (pasar de una empresa inactiva a otra): cierra el período anterior; su «Deshacer» lo quita
update public.trabajadores set empresa_id = '20000000-0000-0000-0000-00000000000b', estado = 'aspirante', periodo_desde = public.hoy_caracas()
 where id = '30000000-0000-0000-0000-000000000181';
select 'el traslado deja el período anterior cerrado (debe 1): ' || count(*) from public.trabajador_periodos where trabajador_id = '30000000-0000-0000-0000-000000000181' and cierre = 'traslado' and desde = '2016-03-01';
update public.trabajadores set empresa_id = '20000000-0000-0000-0000-00000000000a', estado = 'reposo', periodo_desde = null
 where id = '30000000-0000-0000-0000-000000000181';
select 'deshacer el traslado lo quita del historial (debe 0): ' || count(*) from public.trabajador_periodos where trabajador_id = '30000000-0000-0000-0000-000000000181';
-- Deshacer un reingreso: vuelve a inactivo con su fecha, sin un cierre repetido
update public.trabajadores set estado = 'inactivo', periodo_desde = null, fecha_inactivo = public.hoy_caracas() - 1
 where id = '30000000-0000-0000-0000-000000000180';
select 'deshacer el reingreso no repite el cierre (debe 1): ' || count(*) from public.trabajador_periodos where trabajador_id = '30000000-0000-0000-0000-000000000180';
select 'vuelve a inactivo con su fecha (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000180' and estado = 'inactivo' and fecha_inactivo = public.hoy_caracas() - 1;

-- Deja la base como estaba
reset role;
delete from public.notificaciones where enlace = '/pacientes/30000000-0000-0000-0000-000000000180';
delete from clinico.alertas_clinicas where id = '50000000-0000-0000-0000-000000000180';
delete from clinico.aptitudes where consulta_id = '40000000-0000-0000-0000-000000000180';
delete from clinico.consultas where id = '40000000-0000-0000-0000-000000000180';
delete from public.trabajador_periodos where trabajador_id in ('30000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000181');
delete from public.trabajadores where id in ('30000000-0000-0000-0000-000000000180', '30000000-0000-0000-0000-000000000181');
