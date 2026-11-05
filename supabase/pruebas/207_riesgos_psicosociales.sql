-- Riesgos psicosociales CoPsoQ-istas21 versión corta (Cesar, «sí psicosocial», 05-nov): anonimato (respuestas sin
-- dueño, sin hora y sin lectura directa), código de un solo uso, acuerdo con el Comité antes de empezar, resultados
-- solo agregados con mínimo por grupo, la empresa solo ve las cerradas, cerrada inmutable salvo conclusiones/medidas.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'tablas fuera de la réplica de escritorio (debe 0): ' || count(*) from sync.tablas where nombre like 'public.%psicosocial%';
select 'respuestas sin columnas de usuario, hora ni código (debe 0): ' || count(*) from information_schema.columns
 where table_schema='public' and table_name='respuestas_psicosociales'
   and (column_name ~ '(por|_en|fecha|hora|usuario|codigo|trabajador|ip)$' or data_type like 'timestamp%' or data_type = 'date');
select 'corrección del método, todo en la primera opción (debe 1): ' || (public.puntajes_istas21_corta(array_fill(0::smallint, array[38])) = '{20,40,16,36,16,12}')::int;
select 'corrección del método, todo en la última opción (debe 1): ' || (public.puntajes_istas21_corta(array_fill(4::smallint, array[38])) = '{4,0,0,4,0,4}')::int;
select 'cortes: 12 en exigencias = rojo, 26 en trabajo activo = verde, 12 en estima = amarillo (debe 1): '
 || (public.nivel_istas21_corta(1,12) = 2 and public.nivel_istas21_corta(2,26) = 0 and public.nivel_istas21_corta(6,12) = 1 and public.nivel_istas21_corta(1,7) = 0)::int;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.evaluaciones_psicosociales (id, org_id, empresa_id, titulo, grupos, minimo_grupo, creado_por) values
 ('20700000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Psicosocial 2026',
  '[{"id":"g1","nombre":"Cajeras"},{"id":"g2","nombre":"Gerencia"}]', 5, '00000000-0000-0000-0000-0000000000a1');
select 'médico A crea en A y queda como autor aunque mande otro (debe 1): ' || count(*) from public.evaluaciones_psicosociales
 where id='20700000-0000-0000-0000-0000000000e1' and creado_por='00000000-0000-0000-0000-0000000000a2';
do $$ begin
  insert into public.evaluaciones_psicosociales (org_id, empresa_id, titulo) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Otra empresa');
  raise notice 'médico A evalúa en B: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.evaluaciones_psicosociales set grupos = '[{"id":"g1","nombre":""}]' where id='20700000-0000-0000-0000-0000000000e1';
  raise notice 'grupo sin nombre: FALLA';
exception when check_violation then null; end $$;
do $$ begin
  perform public.generar_codigos_psicosociales('20700000-0000-0000-0000-0000000000e1', 10);
  raise notice 'códigos sin acuerdo del Comité: FALLA';
exception when check_violation then null; end $$;
select 'sin acuerdo tampoco se carga papel (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(0, array[38])) <> 'ok')::int;
update public.evaluaciones_psicosociales set acuerdo_fecha = '2026-11-05', acuerdo_nota = 'Comité SSL, acta 12' where id='20700000-0000-0000-0000-0000000000e1';
select 'códigos generados con el acuerdo (debe 10): ' || public.generar_codigos_psicosociales('20700000-0000-0000-0000-0000000000e1', 10);
select 'el servicio ve sus códigos (debe 10): ' || count(*) from public.codigos_psicosociales;
do $$ begin
  insert into public.codigos_psicosociales (evaluacion_id, org_id, codigo) values ('20700000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','ABCDEFGH');
  raise notice 'inventar un código: FALLA';
exception when insufficient_privilege then null; end $$;
select 'resultados con menos del mínimo: no hay cifras (debe 0): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') ->> 'suficiente')::boolean::int;
-- Papel: 4 cuestionarios de Cajeras
select 'papel 1 (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(0, array[38])) = 'ok')::int;
select 'papel 2 (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(4, array[38])) = 'ok')::int;
select 'papel 3 (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(2, array[38])) = 'ok')::int;
select 'papel 4 (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(1, array[38])) = 'ok')::int;
select 'papel incompleto se rechaza (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(1, array[37])) <> 'ok')::int;
select 'papel con puesto inventado se rechaza (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','zz', array_fill(1, array[38])) <> 'ok')::int;
do $$ begin
  perform count(*) from public.respuestas_psicosociales;
  raise notice 'el médico lee respuestas una por una: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.respuestas_psicosociales (evaluacion_id, org_id, respuestas, puntajes, origen)
  values ('20700000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001', array_fill(0::smallint, array[38]), '{0,0,0,0,0,0}', 'papel');
  raise notice 'escribir respuestas sin la función: FALLA';
exception when insufficient_privilege then null; end $$;

-- RR. HH. de A: nada mientras está abierta
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve la evaluación abierta (debe 0): ' || count(*) from public.evaluaciones_psicosociales;
select 'RR. HH. no ve los códigos (debe 0): ' || count(*) from public.codigos_psicosociales;
select 'RR. HH. no ve resultados de la abierta (debe 1): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') is null)::int;
do $$ begin
  perform public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(0, array[38]));
  raise notice 'RR. HH. carga papel: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.generar_codigos_psicosociales('20700000-0000-0000-0000-0000000000e1', 5);
  raise notice 'RR. HH. genera códigos: FALLA';
exception when insufficient_privilege then null; end $$;

-- El trabajador, sin sesión, con un código: 2 de Gerencia por enlace
reset role;
create temp table c207 as select codigo from public.codigos_psicosociales where evaluacion_id='20700000-0000-0000-0000-0000000000e1' order by codigo limit 3;
grant select on c207 to anon, authenticated;
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'código vigente con sus puestos (debe 2): ' || jsonb_array_length(grupos) from public.ver_cuestionario_psicosocial((select lower(codigo) from c207 order by codigo limit 1)) where estado='vigente';
select 'código inventado no existe (debe 0): ' || count(*) from public.ver_cuestionario_psicosocial('ZZZZZZZZ');
select 'incompleto se rechaza (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from c207 order by codigo limit 1), 'g2', array_fill(3, array[30])) <> 'ok')::int;
select 'sin puesto se rechaza (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from c207 order by codigo limit 1), null, array_fill(3, array[38])) <> 'ok')::int;
select 'enviar con el código (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from c207 order by codigo limit 1), 'g2', array_fill(3, array[38])) = 'ok')::int;
select 'el mismo código no sirve dos veces (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from c207 order by codigo limit 1), 'g2', array_fill(3, array[38])) <> 'ok')::int;
select 'el código usado ya no muestra puestos (debe 1): ' || count(*) from public.ver_cuestionario_psicosocial((select codigo from c207 order by codigo limit 1)) where estado='usado' and grupos is null;
select 'otro código (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from c207 order by codigo offset 1 limit 1), 'g2', array_fill(2, array[38])) = 'ok')::int;
do $$ begin
  perform count(*) from public.respuestas_psicosociales;
  raise notice 'anónimo lee respuestas: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1');
  raise notice 'anónimo ve resultados: FALLA';
exception when insufficient_privilege then null; end $$;

-- Resultados: Cajeras (4) no llega a 5 y Gerencia (2) tampoco: van juntas a «Otros puestos» (6)
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'total de respuestas (debe 6): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') ->> 'total');
select 'códigos usados (debe 2): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') ->> 'usados');
select 'grupos pequeños juntos en uno solo (debe 1): ' || jsonb_array_length(public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') -> 'grupos');
select 'ese grupo es «Otros puestos» con 6 (debe 6): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') #>> '{grupos,0,n}')
 || case when public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') #>> '{grupos,0,id}' = '_otros' then '' else ' (no es otros)' end;
-- Un 5.º de Cajeras: Cajeras sale sola (5) y Gerencia (2) queda sin mostrarse
select 'papel 5 (debe 1): ' || (public.cargar_respuesta_psicosocial('20700000-0000-0000-0000-0000000000e1','g1', array_fill(3, array[38])) = 'ok')::int;
select 'solo Cajeras se muestra (debe 1): ' || jsonb_array_length(public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') -> 'grupos');
select 'Gerencia (2) no se muestra: cuenta solo en el total (debe 2): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') ->> 'sin_grupo');
select 'exigencias psicológicas en rojo en el total (debe 4): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') #>> '{dimensiones,0,rojo}');
do $$ begin
  update public.evaluaciones_psicosociales set grupos = '[{"id":"g1","nombre":"Cajeras"}]' where id='20700000-0000-0000-0000-0000000000e1';
  raise notice 'quitar un puesto con respuestas: FALLA';
exception when check_violation then null; end $$;
update public.evaluaciones_psicosociales set grupos = '[{"id":"g1","nombre":"Cajeras y taquilla"},{"id":"g2","nombre":"Gerencia"}]' where id='20700000-0000-0000-0000-0000000000e1';
select 'renombrar un puesto sí (debe 1): ' || count(*) from public.evaluaciones_psicosociales where grupos @> '[{"nombre":"Cajeras y taquilla"}]';
update public.evaluaciones_psicosociales set estado = 'cerrada' where id='20700000-0000-0000-0000-0000000000e1';
select 'cerrada con fecha (debe 1): ' || count(*) from public.evaluaciones_psicosociales where cerrada_en is not null;
do $$ begin
  update public.evaluaciones_psicosociales set titulo = 'Cambiado' where id='20700000-0000-0000-0000-0000000000e1';
  raise notice 'cambiar el título de una cerrada: FALLA';
exception when insufficient_privilege then null; end $$;
update public.evaluaciones_psicosociales set medidas = '[{"id":"m1","apartado":1,"medida":"Ajustar la plantilla en caja","responsable":"RR. HH.","plazo":"30 días"}]' where id='20700000-0000-0000-0000-0000000000e1';
select 'cerrada: las medidas sí cambian (debe 1): ' || jsonb_array_length(medidas) from public.evaluaciones_psicosociales where id='20700000-0000-0000-0000-0000000000e1';
select 'cerrada: el código que queda ya no sirve (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from c207 order by codigo offset 2 limit 1), 'g2', array_fill(2, array[38])) <> 'ok')::int;
do $$ begin
  update public.evaluaciones_psicosociales set estado = 'abierta' where id='20700000-0000-0000-0000-0000000000e1';
  raise notice 'el médico reabre: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  delete from public.evaluaciones_psicosociales where id='20700000-0000-0000-0000-0000000000e1';
  raise notice 'borrar con respuestas: FALLA';
exception when insufficient_privilege then null; end $$;

-- RR. HH. de A, ya cerrada: el informe agregado y la lista, nunca los códigos ni la tabla
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. ve el informe agregado de la cerrada (debe 7): ' || (public.resultados_psicosociales('20700000-0000-0000-0000-0000000000e1') ->> 'total');
select 'RR. HH. la ve en su lista (debe 1): ' || count(*) from public.evaluaciones_psicosociales_rrhh;
select 'RR. HH. sigue sin la tabla ni los códigos (debe 0): ' || (select count(*) from public.evaluaciones_psicosociales) + (select count(*) from public.codigos_psicosociales);

-- El administrador reabre
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.evaluaciones_psicosociales set estado = 'abierta' where id='20700000-0000-0000-0000-0000000000e1';
select 'el administrador reabre (debe 1): ' || count(*) from public.evaluaciones_psicosociales where estado='abierta' and cerrada_en is null;
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
