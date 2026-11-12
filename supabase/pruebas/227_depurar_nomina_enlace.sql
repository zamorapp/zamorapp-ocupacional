-- Depurar la nómina con RR. HH. por un enlace sin cuenta (Cesar, 12-nov, migración 20261030928000).
\pset tuples_only on
reset role;
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado) values
 ('22700000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-22700001','Uno','Sigue','activo'),
 ('22700000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-22700002','Dos','Se fue','activo'),
 ('22700000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-22700003','Tres','Ya inactivo','inactivo'),
 ('22700000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','V-22700009','Beto','Otra','activo');
-- Dos se fue y ya tiene su evaluación de egreso
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, estado, fecha, motivo_id)
select '22700000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
       '22700000-0000-0000-0000-000000000002','cerrada', public.hoy_caracas(), (select id from public.lista_items where lista='motivo_consulta' and codigo='EGR' limit 1);

-- RR. HH. con cuenta no crea enlaces ni ve la revisión
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000a', 'Daniela Pérez', '0414-1234567');
  raise notice 'RR. HH. crea el enlace: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.revision_depuracion_nomina('20000000-0000-0000-0000-00000000000a');
  raise notice 'RR. HH. ve la revisión: FALLA';
exception when insufficient_privilege then null; end $$;
select 'nadie lee la tabla directo (debe 0): ' || has_table_privilege('authenticated', 'public.depuraciones_nomina', 'select')::int;
-- El médico de A no crea enlaces de B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000b', 'Daniela', '0414-1234567');
  raise notice 'médico de A crea enlace de B: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000a', 'Daniela', '123');
  raise notice 'enlace sin teléfono: FALLA';
exception when check_violation then null; end $$;
select 'el médico crea el enlace de A (debe 32): ' || length(public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000a', 'Daniela Pérez', '0414-1234567'));
select 'pedirlo otra vez da el mismo (debe 1): ' || (public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000a', 'Daniela Pérez', '0414-1234567') = public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000a', 'Daniela Pérez', '0414-1234567'))::int;
reset role;
create temp table t227 as select token from public.depuraciones_nomina where empresa_id='20000000-0000-0000-0000-00000000000a' and anulado_en is null;
grant select on t227 to anon, authenticated;

-- RR. HH. sin sesión: primero la llave (teléfono y un solo aparato)
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'enlace vigente (debe 1): ' || (public.ver_depuracion_nomina((select token from t227)) ->> 'estado' = 'vigente')::int;
select 'sin teléfono no ve la lista (debe 0): ' || jsonb_array_length(public.ver_depuracion_nomina((select token from t227), repeat('a', 64)) -> 'trabajadores');
select 'sin teléfono no marca (debe 1): ' || (public.marcar_depuracion_nomina((select token from t227), repeat('a', 64), '22700000-0000-0000-0000-000000000001', 'si') <> 'ok')::int;
select 'teléfono equivocado (debe 1): ' || (public.abrir_depuracion_nomina((select token from t227), '0412-0000000', repeat('a', 64)) = 'mal:4')::int;
select 'teléfono correcto escrito distinto (debe 1): ' || (public.abrir_depuracion_nomina((select token from t227), '+58 414 123 45 67', repeat('a', 64)) = 'ok')::int;
select 'reenviado: otro aparato con el teléfono correcto no entra (debe 1): ' || (public.abrir_depuracion_nomina((select token from t227), '04141234567', repeat('b', 64)) = 'otro_telefono')::int;
select 'el otro aparato no ve la lista (debe 0): ' || jsonb_array_length(public.ver_depuracion_nomina((select token from t227), repeat('b', 64)) -> 'trabajadores');
select 'el otro aparato no marca (debe 1): ' || (public.marcar_depuracion_nomina((select token from t227), repeat('b', 64), '22700000-0000-0000-0000-000000000001', 'si') <> 'ok')::int;
select 'enlace inventado no existe (debe 1): ' || (public.ver_depuracion_nomina(repeat('a', 32)) is null)::int;
select 've a Uno y Dos de A (debe 2): ' || count(*) from jsonb_array_elements(public.ver_depuracion_nomina((select token from t227), repeat('a', 64)) -> 'trabajadores') x where x ->> 'id' in ('22700000-0000-0000-0000-000000000001','22700000-0000-0000-0000-000000000002');
select 'no ve al inactivo ni a los de B (debe 0): ' || count(*) from jsonb_array_elements(public.ver_depuracion_nomina((select token from t227), repeat('a', 64)) -> 'trabajadores') x where x ->> 'id' in ('22700000-0000-0000-0000-000000000003','22700000-0000-0000-0000-000000000009','30000000-0000-0000-0000-00000000000b');
select 'sin cédula completa: solo 4 números (debe 1): ' || (public.ver_depuracion_nomina((select token from t227), repeat('a', 64)) -> 'trabajadores' @> '[{"ci":"0002"}]')::int;
select 'nada clínico ni de contacto (debe 0): ' || count(*) from jsonb_array_elements(public.ver_depuracion_nomina((select token from t227), repeat('a', 64)) -> 'trabajadores') x, jsonb_object_keys(x) k
  where k not in ('id','nombre','cargo','departamento','ci');
select 'marca que Uno sigue (debe 1): ' || (public.marcar_depuracion_nomina((select token from t227), repeat('a', 64), '22700000-0000-0000-0000-000000000001', 'si') = 'ok')::int;
select 'marca que Dos ya no está (debe 1): ' || (public.marcar_depuracion_nomina((select token from t227), repeat('a', 64), '22700000-0000-0000-0000-000000000002', 'no', 'Renunció') = 'ok')::int;
select 'motivo inventado (debe 1): ' || (public.marcar_depuracion_nomina((select token from t227), repeat('a', 64), '22700000-0000-0000-0000-000000000002', 'no', 'x') <> 'ok')::int;
select 'no marca a alguien de otra empresa (debe 1): ' || (public.marcar_depuracion_nomina((select token from t227), repeat('a', 64), '30000000-0000-0000-0000-00000000000b', 'no') <> 'ok')::int;
select 'no marca a un inactivo (debe 1): ' || (public.marcar_depuracion_nomina((select token from t227), repeat('a', 64), '22700000-0000-0000-0000-000000000003', 'no') <> 'ok')::int;
select 'agrega a quien falta (debe 1): ' || (public.agregar_depuracion_nomina((select token from t227), repeat('a', 64), 'Luis', 'Rivas', 'V-27.845.112', 'Ayudante') = 'ok')::int;
select 'agrega sin cédula (debe 1): ' || (public.agregar_depuracion_nomina((select token from t227), repeat('a', 64), 'Ramón', 'Lugo') = 'ok')::int;
select 'agrega a alguien ya registrado en otra empresa (debe 1): ' || (public.agregar_depuracion_nomina((select token from t227), repeat('a', 64), 'Beto', 'Otra', '22700009') = 'ok')::int;
select 'no repite la cédula (debe 1): ' || (public.agregar_depuracion_nomina((select token from t227), repeat('a', 64), 'Luis', 'Rivas', '27845112') <> 'ok')::int;
select 'sin apellido no agrega (debe 1): ' || (public.agregar_depuracion_nomina((select token from t227), repeat('a', 64), 'Solo', '') <> 'ok')::int;
select 'los demás como «Sigue» (debe 1): ' || (public.marcar_resto_depuracion_nomina((select token from t227), repeat('a', 64)) = 'ok')::int;
select 'no pisa a Dos (debe 1): ' || (public.ver_depuracion_nomina((select token from t227), repeat('a', 64)) -> 'respuestas' -> '22700000-0000-0000-0000-000000000002' ->> 'e' = 'no')::int;
select 'envía (debe 1): ' || (public.enviar_depuracion_nomina((select token from t227), repeat('a', 64)) = 'ok')::int;
do $$ begin
  perform public.revision_depuracion_nomina('20000000-0000-0000-0000-00000000000a');
  raise notice 'anónimo ve la revisión: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.cerrar_depuracion_nomina((select id from public.depuraciones_nomina limit 1), null);
  raise notice 'anónimo cierra: FALLA';
exception when insufficient_privilege then null; end $$;

-- Cesar revisa
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
create temp table r227 as select public.revision_depuracion_nomina('20000000-0000-0000-0000-00000000000a') as r;
select 'enviado (debe 1): ' || ((select r ->> 'enviado_en' from r227) is not null)::int;
select 'siguen todos menos Dos (debe 1): ' || ((select (r ->> 'siguen')::int = (r ->> 'en_nomina')::int - 1 from r227))::int;
select 'ya no está: Dos (debe 1): ' || jsonb_array_length((select r -> 'no_estan' from r227));
select 'con cédula completa y motivo (debe 1): ' || ((select r -> 'no_estan' -> 0 from r227) @> '{"cedula":"V-22700002","motivo":"Renunció"}')::int;
select 'su egreso está hecho (debe 1): ' || ((select r -> 'no_estan' -> 0 -> 'egreso' ->> 'hecha' from r227) = 'true')::int;
select 'tres agregados (debe 3): ' || jsonb_array_length((select r -> 'agregados' from r227));
select 'Beto ya estaba registrado (debe 1): ' || ((select count(*) from r227, jsonb_array_elements(r -> 'agregados') x where x -> 'registrado' ->> 'nombre' = 'Beto Otra' and x -> 'registrado' ->> 'misma_empresa' = 'false') = 1)::int;
select 'Cesar ve a quién se mandó y que ya lo abrieron (debe 1): ' || ((select r ->> 'rrhh_nombre' = 'Daniela Pérez' and r ->> 'telefono_fin' = '4567' and r ->> 'abierto_en' is not null from r227))::int;
-- Cinco intentos fallidos bloquean; Cesar libera
reset role;
create temp table b227 as select public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000b', 'Pedro', '0424-7654321') as token;
grant select on b227 to anon;
set role anon;
select 'cuatro intentos fallidos (debe 4): ' || count(*) from generate_series(1, 4) g where public.abrir_depuracion_nomina((select token from b227), '0412-0000000', repeat('c', 64)) like 'mal:%';
select 'el quinto bloquea (debe 1): ' || (public.abrir_depuracion_nomina((select token from b227), '0412-0000000', repeat('c', 64)) = 'bloqueado')::int;
select 'bloqueado: ni con el correcto (debe 1): ' || (public.abrir_depuracion_nomina((select token from b227), '0424-7654321', repeat('c', 64)) = 'bloqueado')::int;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.liberar_depuracion_nomina((select id from public.depuraciones_nomina d join b227 using (token)));
  raise notice 'médico de A libera enlace de B: FALLA';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
reset role;
create temp table bid227 as select id from public.depuraciones_nomina d join b227 using (token);
grant select on bid227 to authenticated;
set role authenticated;
select public.liberar_depuracion_nomina((select id from bid227)) \g /dev/null
reset role;
set role anon;
select 'liberado: entra con el correcto (debe 1): ' || (public.abrir_depuracion_nomina((select token from b227), '0424-7654321', repeat('c', 64)) = 'ok')::int;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
-- Cambiar el enlace conserva lo marcado y el viejo deja de servir
select 'enlace nuevo (debe 1): ' || (public.crear_depuracion_nomina('20000000-0000-0000-0000-00000000000a', 'Daniela', '0414-1234567', 7, true) <> (select token from t227))::int;
select 'el viejo ya no sirve (debe 1): ' || (public.ver_depuracion_nomina((select token from t227)) ->> 'estado' = 'anulado')::int;
select 'el nuevo trae lo marcado (debe 3): ' || jsonb_array_length(public.revision_depuracion_nomina('20000000-0000-0000-0000-00000000000a') -> 'agregados');
-- Confirmar: inactiva por aplicar_nomina y cierra el enlace
create temp table l227 as select public.aplicar_nomina(null, '20000000-0000-0000-0000-00000000000a', 'Enlace RR. HH.', '[]', '[]', array['22700000-0000-0000-0000-000000000002'::uuid], 'Renunció') as l;
select public.cerrar_depuracion_nomina((public.revision_depuracion_nomina('20000000-0000-0000-0000-00000000000a') ->> 'id')::uuid, ((select l from l227) ->> 'lote')::uuid) \g /dev/null
select 'cerrado (debe 1): ' || (public.revision_depuracion_nomina('20000000-0000-0000-0000-00000000000a') ->> 'estado' = 'aplicado')::int;
reset role;
create temp table c227 as select token from public.depuraciones_nomina where aplicado_en is not null;
grant select on c227 to anon;
select 'Dos quedó inactivo (debe 1): ' || count(*) from public.trabajadores where id='22700000-0000-0000-0000-000000000002' and estado='inactivo';
set role anon;
select 'confirmado: RR. HH. ya no escribe (debe 1): ' || (public.marcar_depuracion_nomina((select token from c227), repeat('a', 64), '22700000-0000-0000-0000-000000000001', 'no') <> 'ok')::int;
reset role;
select 'confirmado: RR. HH. ya no ve nombres (debe 0): ' || jsonb_array_length(public.ver_depuracion_nomina((select token from c227), repeat('a', 64)) -> 'trabajadores');
-- Vencido no sirve
update public.depuraciones_nomina set vence = public.ahora() - interval '1 minute';
set role anon;
select 'vencido (debe 1): ' || (public.agregar_depuracion_nomina((select token from t227), repeat('a', 64), 'Otro', 'Más') <> 'ok')::int;
reset role;
-- Limpieza a los 90 días
update public.depuraciones_nomina set vence = public.ahora() - interval '91 days', aplicado_en = null, anulado_en = null;
select public.purgar_depuraciones_nomina();
select 'purgado (debe 0): ' || count(*) from public.depuraciones_nomina where agregados <> '[]' or respuestas <> '{}';
delete from public.depuraciones_nomina;
delete from public.nomina_actualizaciones where archivo = 'Enlace RR. HH.';
delete from clinico.consultas where id = '22700000-0000-0000-0000-0000000000c1';
delete from public.trabajadores where id::text like '22700000-%';
