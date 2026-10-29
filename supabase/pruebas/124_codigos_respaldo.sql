-- Códigos de respaldo y reinicio de la verificación en dos pasos por otro administrador.
\pset tuples_only on
reset role;
insert into auth.mfa_factors (user_id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');
insert into auth.mfa_challenges (factor_id) select id from auth.mfa_factors;
set role authenticated;
select set_config('request.path','/clinico/consultas',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
-- Crear códigos exige el código del teléfono en esta sesión
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}',false) \g /dev/null
do $$ begin
  perform public.generar_codigos_respaldo();
  raise notice 'admin crea códigos solo con la clave: FALLA';
exception when insufficient_privilege then raise notice 'crear códigos pide el segundo paso (ok)'; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
select set_config('prueba.codigos', array_to_string(public.generar_codigos_respaldo(), ','), false) \g /dev/null
select 'se crean 10 (debe 10): ' || public.codigos_respaldo_restantes();
select 'formato XXXXX-XXXXX (debe 10): ' || count(*) from unnest(string_to_array(current_setting('prueba.codigos'), ',')) c where c ~ '^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$';
select 'no se repiten (debe 10): ' || count(distinct c) from unnest(string_to_array(current_setting('prueba.codigos'), ',')) c;
select set_config('prueba.uno', split_part(current_setting('prueba.codigos'), ',', 1), false) \g /dev/null
select set_config('prueba.dos', split_part(current_setting('prueba.codigos'), ',', 2), false) \g /dev/null
-- Nadie con sesión lee la tabla ni llama las funciones internas
do $$ begin
  perform 1 from public.codigos_respaldo;
  raise notice 'un usuario lee los hash: FALLA';
exception when insufficient_privilege then raise notice 'los hash no se leen (ok)'; end $$;
do $$ begin
  perform public.borrar_segundo_paso('00000000-0000-0000-0000-0000000000a2');
  raise notice 'un usuario borra el teléfono de otro directo: FALLA';
exception when insufficient_privilege then raise notice 'borrar_segundo_paso no es llamable (ok)'; end $$;
reset role;
select 'en la base solo hay hash, no el código (debe 0): ' || count(*) from public.codigos_respaldo where hash = current_setting('prueba.uno') or hash like '%-%';
set role authenticated;

-- Usarlo con solo la contraseña (aal1): el freno lo deja pasar
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select set_config('request.path','/rpc/usar_codigo_respaldo',false) \g /dev/null
select 'el freno deja usar un código con la clave (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;
select 'código ajeno o inventado (debe 1): ' || (public.usar_codigo_respaldo('AAAAA-AAAAA') = 'incorrecto')::int;
select 'en minúsculas y sin guion sirve (debe 1): ' || (public.usar_codigo_respaldo(lower(replace(current_setting('prueba.uno'), '-', ''))) = 'ok')::int;
select 'el mismo código no sirve dos veces (debe 1): ' || (public.usar_codigo_respaldo(current_setting('prueba.uno')) = 'incorrecto')::int;
select 'quedan 9 (debe 9): ' || public.codigos_respaldo_restantes();
reset role;
select 'borró el teléfono del admin (debe 0): ' || count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a1';
select 'no tocó el del médico (debe 1): ' || count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a2';
select 'queda en la bitácora (debe 1): ' || count(*) from public.bitacora where tabla = 'dos_pasos' and accion = 'CODIGO_RESPALDO';
set role authenticated;
-- Tras usarlo, sigue sin abrir datos: hay que activar el teléfono nuevo
select set_config('request.path','/clinico/consultas',false) \g /dev/null
do $$ begin
  perform public.verificar_dos_pasos();
  raise notice 'el código de respaldo abre datos sin teléfono nuevo: FALLA';
exception when others then
  if sqlstate = 'PGRST' then raise notice 'el código de respaldo no abre datos por sí solo (ok)'; else raise notice '%: FALLA', sqlerrm; end if;
end $$;
-- Fuerza bruta: 5 fallos en 15 minutos y espera, aun con un código bueno
select public.usar_codigo_respaldo('BBBBB-BBBBB') from generate_series(1, 5) \g /dev/null
select 'tras 5 fallos pide esperar, aun con uno bueno (debe 1): ' || (public.usar_codigo_respaldo(current_setting('prueba.dos')) = 'espera')::int;

-- Reinicio por otro administrador
reset role;
insert into auth.mfa_factors (user_id) values ('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
do $$ begin
  perform public.reiniciar_dos_pasos('00000000-0000-0000-0000-0000000000a1');
  raise notice 'admin se reinicia a sí mismo: FALLA';
exception when insufficient_privilege then raise notice 'nadie se reinicia a sí mismo (ok)'; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}',false) \g /dev/null
do $$ begin
  perform public.reiniciar_dos_pasos('00000000-0000-0000-0000-0000000000a2');
  raise notice 'admin sin su código reinicia a otro: FALLA';
exception when insufficient_privilege then raise notice 'reiniciar a otro pide el segundo paso propio (ok)'; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.reiniciar_dos_pasos('00000000-0000-0000-0000-0000000000a1');
  raise notice 'un médico reinicia al admin: FALLA';
exception when insufficient_privilege then raise notice 'un médico no reinicia a nadie (ok)'; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.reiniciar_dos_pasos('00000000-0000-0000-0000-0000000000a2') \g /dev/null
reset role;
select 'admin reinició al médico (debe 0): ' || count(*) from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000a2';
select 'reinicio en la bitácora (debe 1): ' || count(*) from public.bitacora where tabla = 'dos_pasos' and accion = 'REINICIO';
delete from auth.mfa_factors;
