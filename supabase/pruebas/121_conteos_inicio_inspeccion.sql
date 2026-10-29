-- Conteos del Inicio y de Inspección en una sola consulta (C14): mismas cifras que las consultas que reemplazan
-- y nada de otra empresa. Empresa D propia de esta prueba.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.empresas (id,org_id,razon_social,rif) values ('20000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','D','J-120');
insert into public.puestos (id,org_id,empresa_id,nombre,evaluado_en) values
 ('5d000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','Soldador',public.hoy_caracas() - 10),
 ('5d000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','Vacante',null);
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,estado,puesto_id) values
 ('5d000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','d1','Vigente','Uno','activo','5d000000-0000-0000-0000-0000000000a1'),
 ('5d000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','d2','Vieja','Dos','activo','5d000000-0000-0000-0000-0000000000a1'),
 ('5d000000-0000-0000-0000-0000000000b3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','d3','Sin','Tres','reposo','5d000000-0000-0000-0000-0000000000a1'),
 ('5d000000-0000-0000-0000-0000000000b4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','d4','Sinpuesto','Cuatro','activo',null),
 ('5d000000-0000-0000-0000-0000000000b5','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','d5','Egresado','Cinco','egresado','5d000000-0000-0000-0000-0000000000a1');
insert into public.notificaciones_riesgo (org_id,empresa_id,trabajador_id,puesto,puesto_id,entregada_en,firmada_en) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1','Soldador','5d000000-0000-0000-0000-0000000000a1',public.hoy_caracas() - 5,public.hoy_caracas() - 5),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b2','Soldador','5d000000-0000-0000-0000-0000000000a1',public.hoy_caracas() - 20,public.hoy_caracas() - 20);
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('5d000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1','firmada',public.hoy_caracas() - 30);
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion,vigente_hasta) values
 ('10000000-0000-0000-0000-000000000001','5d000000-0000-0000-0000-0000000000c1','5d000000-0000-0000-0000-0000000000b1','elegible',public.hoy_caracas() + 300);
insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,fecha_declaracion,causas_inmediatas,acciones) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1','accidente','2026-07-10 08:00-04','2026-07-10 20:00-04','Piso mojado',
  jsonb_build_array(jsonb_build_object('accion','Señalizar','estado','pendiente','fecha',(public.hoy_caracas() - 1)::text), jsonb_build_object('accion','Secar','estado','cumplida'))),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b2','accidente','2026-08-01 08:00-04','2026-08-03 08:00-04',null,'[]');
-- Enfermedad diagnosticada a las 21:00 de Caracas (ya es el día siguiente en UTC): el plazo de 15 días cuenta desde el día de Caracas
insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,fecha_diagnostico,fecha_informe_nt02) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b3','enfermedad','2026-07-01 21:00-04','2026-07-01 21:00-04','2026-07-17');

set role authenticated;
-- Administrador (acceso clínico): todas las consultas
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'por firmar = consultas cerradas (debe 1): ' || ((public.inicio_conteos(null,false,true) -> 'tareas' ->> 'por_firmar')::int = (select count(*) from public.consultas where estado = 'cerrada'))::int;
select 'abiertas = borradores (debe 1): ' || ((public.inicio_conteos(null,false,true) -> 'tareas' ->> 'abiertas')::int = (select count(*) from public.consultas where estado = 'borrador'))::int;
select 'sin acceso clínico no cuenta consultas (debe 0): ' || ((public.inicio_conteos(null,false,false) -> 'tareas') ? 'por_firmar')::int;
create temp table antes as select public.inicio_conteos(null,false,true) -> 'tareas' as t;
grant select on antes to authenticated;
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,medico_id,estado,fecha,paraclinicos) values
 ('5d000000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2','cerrada',public.hoy_caracas(),
  '[{"nombre":"Hematología","resultado":""},{"nombre":"Glicemia","resultado":" "},{"nombre":"Orina","resultado":"Normal"},{"nombre":"RX","estado":"normal"}]'),
 ('5d000000-0000-0000-0000-0000000000c3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a2','cerrada',public.hoy_caracas() - 90,
  '[{"nombre":"Viejo","resultado":""}]');
insert into public.citas (org_id,empresa_id,trabajador_id,fecha,estado) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b1',public.hoy_caracas(),'en_espera'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b2',public.hoy_caracas() + 3,'solicitada'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','5d000000-0000-0000-0000-0000000000b3',public.hoy_caracas() - 3,'solicitada');
set role authenticated;
select 'por recibir: 2 sin resultado, la de hace 90 días no cuenta (debe 2): ' || ((public.inicio_conteos(null,false,true) -> 'tareas' ->> 'por_recibir')::int - (select (t ->> 'por_recibir')::int from antes));
select 'en espera hoy (debe 1): ' || ((public.inicio_conteos() -> 'tareas' ->> 'en_espera')::int - (select (t ->> 'en_espera')::int from antes));
select 'solicitadas desde hoy, la vencida no (debe 1): ' || ((public.inicio_conteos() -> 'tareas' ->> 'solicitadas')::int - (select (t ->> 'solicitadas')::int from antes));
select 'resumen de D: activos y en reposo (debe 4): ' || (public.inicio_conteos('20000000-0000-0000-0000-0000000000d1') -> 'resumen' ->> 'activos');
select 'vencimientos solo de la empresa activa (debe 1): ' || jsonb_array_length(public.inicio_conteos('20000000-0000-0000-0000-0000000000d1') -> 'vencimientos');
-- Médico: solo sus consultas
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico: por firmar solo las suyas (debe 1): ' || ((public.inicio_conteos(null,true,true) -> 'tareas' ->> 'por_firmar')::int = (select count(*) from public.consultas where estado = 'cerrada' and medico_id = auth.uid()))::int;
-- Inspección de D
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'notificación: total sin el egresado (debe 4): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'notificacion' ->> 'total');
select 'notificación: vigente solo la posterior a la evaluación (debe 1): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'notificacion' ->> 'cumplidos');
select 'pendientes por notificar (debe 3): ' || jsonb_array_length(public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'pendientes');
select 'pendiente sin puesto asignado (debe 1): ' || count(*) from jsonb_array_elements(public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'pendientes') x where not (x ->> 'con_puesto')::boolean;
select 'pendientes en orden de apellido: Cuatro primero (debe 1): ' || ((public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'pendientes' -> 0 ->> 'nombre') = 'Cuatro, Sinpuesto')::int;
select 'evaluación vigente (debe 1): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'evaluacion' ->> 'cumplidos');
select 'puestos con trabajadores: el vacante no cuenta (debe 1): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'puestos' ->> 'total');
select 'declaración en 24 h: una de tres (debe 1): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'declaracion' ->> 'cumplidos');
select 'investigación con causas: una de dos (debe 1): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'investigacion' ->> 'cumplidos');
select 'NT-02: entregado el día 16 desde el diagnóstico en Caracas, fuera de plazo (debe 0): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'nt02' ->> 'cumplidos');
select 'NT-02: una enfermedad en el período (debe 1): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'nt02' ->> 'total');
select 'acciones: la vencida no cumple (debe 1): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'acciones' ->> 'cumplidos');
select 'fuera del período no hay eventos (debe 0): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-01-01','2026-03-31') -> 'declaracion' ->> 'total');
-- RR. HH. de A no ve nada de D
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A: trabajadores de D en inspección (debe 0): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'notificacion' ->> 'total');
select 'RR. HH. de A: eventos de D (debe 0): ' || (public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30') -> 'declaracion' ->> 'total');
select 'RR. HH. de A: resumen de D vacío, como antes (debe 0): ' || coalesce((public.inicio_conteos('20000000-0000-0000-0000-0000000000d1') -> 'resumen' ->> 'activos')::int, 0);
select 'RR. HH. de A: vencimientos de D (debe 0): ' || jsonb_array_length(public.inicio_conteos('20000000-0000-0000-0000-0000000000d1') -> 'vencimientos');
select 'RR. HH. de A no recibe conteos de consultas aunque los pida (debe 0): ' || coalesce((public.inicio_conteos(null,false,true) -> 'tareas' ->> 'por_recibir')::int, 0);
reset role;
set role anon;
do $$ begin perform public.inspeccion_conteos('20000000-0000-0000-0000-0000000000d1','2026-07-01','2026-09-30'); raise notice 'anónimo cuenta inspección: FALLA'; exception when insufficient_privilege then raise notice 'anónimo no cuenta (ok)'; end $$;
reset role;
