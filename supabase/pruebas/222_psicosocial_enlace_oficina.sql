-- Psicosocial: un enlace para toda la oficina (tope = plantilla) y perfiles anónimos solo para el servicio
-- (Cesar, 06-nov, migración 20261030924000).
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.evaluaciones_psicosociales (id, org_id, empresa_id, titulo, minimo_grupo) values
 ('22200000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Oficina 2026', 3);
do $$ begin
  perform public.enlace_oficina_psicosocial('22200000-0000-0000-0000-0000000000e1');
  raise notice 'enlace sin acuerdo del Comité: FALLA';
exception when check_violation then null; end $$;
update public.evaluaciones_psicosociales set acuerdo_fecha = '2026-11-06' where id='22200000-0000-0000-0000-0000000000e1';
do $$ begin
  perform public.enlace_oficina_psicosocial('22200000-0000-0000-0000-0000000000e1');
  raise notice 'enlace sin plantilla (sin tope): FALLA';
exception when check_violation then null; end $$;
update public.evaluaciones_psicosociales set trabajadores = 5 where id='22200000-0000-0000-0000-0000000000e1';
-- Un papelito impreso antes: ocupa un lugar de la plantilla y el enlace nunca lo entrega
select 'un código para papelito (debe 1): ' || public.generar_codigos_psicosociales('22200000-0000-0000-0000-0000000000e1', 1);
select 'el servicio crea el enlace (debe 32): ' || length(public.enlace_oficina_psicosocial('22200000-0000-0000-0000-0000000000e1'));
select 'pedirlo otra vez da el mismo (debe 1): ' || (public.enlace_oficina_psicosocial('22200000-0000-0000-0000-0000000000e1') = (select token from public.enlaces_psicosociales where evaluacion_id='22200000-0000-0000-0000-0000000000e1'))::int;
reset role;
create temp table t222 as select token from public.enlaces_psicosociales where evaluacion_id='22200000-0000-0000-0000-0000000000e1';
create temp table k222 (codigo text);
grant select on t222 to anon, authenticated;
grant select, insert on k222 to anon, authenticated;

-- RR. HH. no ve el enlace ni puede crearlo
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve el enlace (debe 0): ' || count(*) from public.enlaces_psicosociales;
do $$ begin
  perform public.enlace_oficina_psicosocial('22200000-0000-0000-0000-0000000000e1');
  raise notice 'RR. HH. crea el enlace: FALLA';
exception when insufficient_privilege then null; end $$;

-- Trabajadores sin sesión: 4 cupos
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'enlace vigente (debe 1): ' || count(*) from public.ver_enlace_psicosocial((select token from t222)) where estado='vigente';
select 'enlace inventado no existe (debe 0): ' || count(*) from public.ver_enlace_psicosocial(repeat('a', 32));
select 'token mal formado no entrega código (debe 1): ' || (public.tomar_codigo_psicosocial('xyz') is null)::int;
insert into k222 select public.tomar_codigo_psicosocial((select token from t222)) from generate_series(1, 4);
select 'cuatro teléfonos, cuatro códigos distintos (debe 4): ' || count(distinct codigo) from k222 where codigo is not null;
reset role;
select 'el enlace nunca entrega el código del papelito (debe 0): ' || count(*) from k222 join public.codigos_psicosociales k using (codigo) where not k.entregado;
select 'el papelito sigue libre para quien lo tiene (debe 1): ' || count(*) from public.codigos_psicosociales where evaluacion_id='22200000-0000-0000-0000-0000000000e1' and not entregado and not usado;
set role anon;
select 'el quinto no recibe código: 4 del enlace + 1 papelito = plantilla de 5 (debe 1): ' || (public.tomar_codigo_psicosocial((select token from t222)) is null)::int;
select 'enlace agotado (debe 1): ' || count(*) from public.ver_enlace_psicosocial((select token from t222)) where estado='agotado';
select 'responde con el código del enlace (debe 1): ' || (public.enviar_cuestionario_psicosocial((select min(codigo) from k222), null, array_fill(0, array[38])) = 'ok')::int;
select 'responde el segundo (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from k222 order by codigo offset 1 limit 1), null, array_fill(4, array[38])) = 'ok')::int;
select 'responde el tercero (debe 1): ' || (public.enviar_cuestionario_psicosocial((select codigo from k222 order by codigo offset 2 limit 1), null, array_fill(2, array[38])) = 'ok')::int;
do $$ begin
  perform public.perfiles_psicosociales('22200000-0000-0000-0000-0000000000e1');
  raise notice 'anónimo ve perfiles: FALLA';
exception when insufficient_privilege then null; end $$;

-- El servicio: el código entregado por el enlace no sale para papelitos; perfiles solo al cerrar
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'códigos entregados por el enlace (debe 4): ' || count(*) from public.codigos_psicosociales where evaluacion_id='22200000-0000-0000-0000-0000000000e1' and entregado;
select 'abierta: sin perfiles (debe 1): ' || (public.perfiles_psicosociales('22200000-0000-0000-0000-0000000000e1') is null)::int;
select 'cambiar el enlace da otro (debe 1): ' || (public.enlace_oficina_psicosocial('22200000-0000-0000-0000-0000000000e1', true) <> (select token from t222))::int;
reset role;
set role anon;
select 'el enlace viejo ya no existe (debe 0): ' || count(*) from public.ver_enlace_psicosocial((select token from t222));
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.evaluaciones_psicosociales set estado = 'cerrada' where id='22200000-0000-0000-0000-0000000000e1';
select 'cerrada: un perfil por persona (debe 3): ' || jsonb_array_length(public.perfiles_psicosociales('22200000-0000-0000-0000-0000000000e1'));
select 'perfil con 6 niveles (debe 6): ' || jsonb_array_length(public.perfiles_psicosociales('22200000-0000-0000-0000-0000000000e1') -> 0);
select 'ordenados de más a menos rojo (debe 1): ' || ((select count(*) from jsonb_array_elements_text(public.perfiles_psicosociales('22200000-0000-0000-0000-0000000000e1') -> 0) x where x = '2')
   >= (select count(*) from jsonb_array_elements_text(public.perfiles_psicosociales('22200000-0000-0000-0000-0000000000e1') -> 2) x where x = '2'))::int;
reset role;
create temp table t222b as select token from public.enlaces_psicosociales where evaluacion_id='22200000-0000-0000-0000-0000000000e1';
grant select on t222b to anon;
set role anon;
select 'cerrada: el enlace dice cerrado (debe 1): ' || count(*) from public.ver_enlace_psicosocial((select token from t222b)) where estado='cerrado';
select 'cerrada: no entrega códigos (debe 1): ' || (public.tomar_codigo_psicosocial((select token from t222b)) is null)::int;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve perfiles ni de la cerrada (debe 1): ' || (public.perfiles_psicosociales('22200000-0000-0000-0000-0000000000e1') is null)::int;
reset role;
