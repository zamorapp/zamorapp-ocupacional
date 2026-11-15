-- Enfermería lee la historia médica sin cambiarla; corrige solo sus atenciones (y queda en la bitácora).
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,fecha,tipo,motivo,registrado_por) values
 ('23200000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-02','evolucion','Evolución','00000000-0000-0000-0000-0000000000a5');
update clinico.atenciones_enfermeria set nota = 'Primera nota', registrado_por = '00000000-0000-0000-0000-0000000000a5' where id = '23200000-0000-0000-0000-0000000000a1';
delete from public.bitacora where registro_id = '23200000-0000-0000-0000-0000000000a1';
-- Consulta propia de la prueba: borrador en A con su aptitud
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('23200000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas());
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values
 ('10000000-0000-0000-0000-000000000001','23200000-0000-0000-0000-00000000000c','30000000-0000-0000-0000-00000000000a','no_elegible');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
-- Lee la consulta borrador de A y su aptitud
select 'la enfermera lee la aptitud de A (debe 1): ' || count(*) from clinico.aptitudes where consulta_id = '23200000-0000-0000-0000-00000000000c';
-- No agrega diagnóstico, no cambia ni borra la aptitud
do $$ begin
  insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','23200000-0000-0000-0000-00000000000c','I10','x');
  raise notice 'FALLA: enfermería agregó un diagnóstico';
exception when insufficient_privilege then null; end $$;
update clinico.aptitudes set clasificacion = 'elegible' where consulta_id = '23200000-0000-0000-0000-00000000000c';
delete from clinico.aptitudes where consulta_id = '23200000-0000-0000-0000-00000000000c';
do $$ begin
  insert into clinico.historia_laboral (org_id,trabajador_id,empresa) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','x');
  raise notice 'FALLA: enfermería agregó historia laboral';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into clinico.adjuntos (org_id,trabajador_id,nombre,ruta,tipo_mime,tamano) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','x','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/prueba-232.pdf','application/pdf',1);
  raise notice 'FALLA: enfermería subió un estudio';
exception when insufficient_privilege then null; end $$;

-- Corrige su evolución; el trabajador y el tipo no se mueven
update public.atenciones_enfermeria set nota = 'Nota corregida', tipo = 'signos', trabajador_id = '30000000-0000-0000-0000-00000000000b' where id = '23200000-0000-0000-0000-0000000000a1';
select 'la autora corrige su evolución (debe 1): ' || count(*) from public.atenciones_enfermeria where id = '23200000-0000-0000-0000-0000000000a1' and nota = 'Nota corregida';
select 'tipo y trabajador quedan fijos (debe 1): ' || count(*) from public.atenciones_enfermeria
 where id = '23200000-0000-0000-0000-0000000000a1' and tipo = 'evolucion' and trabajador_id = '30000000-0000-0000-0000-00000000000a';

-- Otro médico de A no la corrige
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
update public.atenciones_enfermeria set nota = 'Otro' where id = '23200000-0000-0000-0000-0000000000a1';
reset role;
select 'otro médico no corrige lo de la enfermera (debe 1): ' || count(*) from clinico.atenciones_enfermeria where id = '23200000-0000-0000-0000-0000000000a1' and nota = 'Nota corregida';
select 'la aptitud de A sigue igual (debe 1): ' || count(*) from clinico.aptitudes where consulta_id = '23200000-0000-0000-0000-00000000000c' and clasificacion = 'no_elegible';
select 'sin diagnóstico ni historia laboral nuevos (debe 0): ' || (select count(*) from clinico.diagnosticos where consulta_id = '23200000-0000-0000-0000-00000000000c') + (select count(*) from clinico.historia_laboral where empresa = 'x');
select 'la corrección queda en la bitácora con el antes (debe 1): ' || count(*) from public.bitacora
 where registro_id = '23200000-0000-0000-0000-0000000000a1' and accion = 'UPDATE' and antes ->> 'nota' = 'Primera nota' and despues ->> 'nota' = 'Nota corregida';

-- El médico sigue escribiendo la historia (las reglas nuevas solo tocan a enfermería)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','23200000-0000-0000-0000-00000000000c','I10','Prueba 232');
select 'el médico sí agrega diagnóstico (debe 1): ' || count(*) from clinico.diagnosticos where descripcion = 'Prueba 232';
reset role;
delete from clinico.diagnosticos where descripcion = 'Prueba 232';
delete from clinico.atenciones_enfermeria where id::text like '23200000-%';
delete from clinico.aptitudes where consulta_id = '23200000-0000-0000-0000-00000000000c';
delete from clinico.consultas where id = '23200000-0000-0000-0000-00000000000c';
delete from public.bitacora where registro_id = '23200000-0000-0000-0000-0000000000a1';

-- Órdenes del médico: enfermería no las emite ni cambia lo escrito; solo las marca cumplidas (no las anula)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
insert into public.indicaciones (id, org_id, trabajador_id, tipo, indicaciones)
values ('23200000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'enfermeria', 'Colocar complejo B');
insert into public.indicaciones (id, org_id, trabajador_id, tipo, indicaciones)
values ('23200000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'enfermeria', 'Segunda orden');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin
  insert into public.indicaciones (org_id, trabajador_id, tipo, indicaciones) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'enfermeria', 'x');
  raise notice 'FALLA: enfermería emitió una orden';
exception when insufficient_privilege then null; end $$;
update public.indicaciones set indicaciones = 'Otra cosa', tratamiento = '[{"medicina":"X"}]', estado = 'cumplida', nota_cumplimiento = 'Glúteo derecho'
 where id = '23200000-0000-0000-0000-0000000000d1';
select 'la enfermera la marca cumplida sin cambiar lo escrito (debe 1): ' || count(*) from public.indicaciones
 where id = '23200000-0000-0000-0000-0000000000d1' and estado = 'cumplida' and indicaciones = 'Colocar complejo B' and tratamiento = '[]'::jsonb
   and nota_cumplimiento = 'Glúteo derecho' and cumplida_por = '00000000-0000-0000-0000-0000000000a5';
do $$ begin
  update public.indicaciones set estado = 'anulada', motivo_anulacion = 'x' where id = '23200000-0000-0000-0000-0000000000d2';
  raise notice 'FALLA: enfermería anuló una orden';
exception when insufficient_privilege then null; end $$;
select 'la enfermera no anula (debe 1): ' || count(*) from public.indicaciones where id = '23200000-0000-0000-0000-0000000000d2' and estado = 'pendiente';

reset role;
-- La investigación de accidente: ver la prueba 240 (enfermería sí la escribe en su empresa)
delete from clinico.indicaciones where id::text like '23200000-%';
