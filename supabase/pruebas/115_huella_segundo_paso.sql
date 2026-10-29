-- Segundo paso: la huella (llave de acceso) cuenta; el equipo de confianza solo con su token exacto y vigente.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.path','/clinico/consultas',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","amr":[{"method":"passkey","timestamp":1}]}',false) \g /dev/null
select 'admin que entró con huella pasa (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","amr":[{"method":"webauthn","timestamp":1}]}',false) \g /dev/null
select 'admin con webauthn pasa (debe 1): ' || public.dos_pasos_cumplido()::int;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","amr":"passkey"}',false) \g /dev/null
select 'amr mal formado no abre (debe 0): ' || public.dos_pasos_cumplido()::int;

-- Equipo de confianza
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin solo con clave: falta el segundo paso (debe 1): ' || public.falta_segundo_paso()::int;
select set_config('request.path','/rpc/falta_segundo_paso',false) \g /dev/null
select 'admin aal1 puede preguntar si falta (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;
select set_config('request.path','/rpc/dias_equipo_confianza',false) \g /dev/null
select 'admin aal1 lee cuántos días dura la confianza (debe 30): ' || public.dias_equipo_confianza() from (select public.verificar_dos_pasos()) x;
select set_config('request.path','/clinico/consultas',false) \g /dev/null
do $$ begin
  perform public.confiar_equipo('PC robada');
  raise notice 'admin aal1 se marca equipo de confianza: FALLA';
exception when insufficient_privilege then raise notice 'admin aal1 no se marca equipo de confianza (ok)'; end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
select set_config('prueba.token', (public.confiar_equipo('PC de Cesar') ->> 'token'), false) \g /dev/null
reset role;
select 'el token se guarda solo como hash (debe 0): ' || count(*) from public.equipos_confianza where hash = current_setting('prueba.token');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}',false) \g /dev/null
select set_config('request.headers', json_build_object('x-zamorapp-equipo', current_setting('prueba.token'))::text, false) \g /dev/null
select 'admin aal1 en su equipo de confianza pasa (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;
select 'y la app no pide el código (debe 0): ' || public.falta_segundo_paso()::int;
select set_config('request.headers', json_build_object('x-zamorapp-equipo', current_setting('prueba.token') || 'x')::text, false) \g /dev/null
select 'token alterado no abre (debe 0): ' || public.dos_pasos_cumplido()::int;
select set_config('request.headers', json_build_object('x-zamorapp-equipo', current_setting('prueba.token'))::text, false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el token de otro no le sirve a nadie más (debe 0): ' || public.equipo_de_confianza()::int;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  perform 1 from public.equipos_confianza;
  raise notice 'un usuario lee los equipos de confianza: FALLA';
exception when insufficient_privilege then raise notice 'los equipos de confianza no se leen desde la API (ok)'; end $$;
select 've su equipo en la lista (debe 1): ' || count(*) from public.mis_equipos_confianza();
-- Vencido: ya no abre
reset role;
update public.equipos_confianza set vence = now() - interval '1 minute';
set role authenticated;
select 'equipo vencido no abre (debe 0): ' || public.dos_pasos_cumplido()::int;
reset role;
update public.equipos_confianza set vence = now() + interval '1 day';
set role authenticated;
select 'olvidar mis equipos borra (debe 1): ' || public.olvidar_equipos();
select 'tras olvidarlos vuelve a pedir el código (debe 0): ' || public.dos_pasos_cumplido()::int;
-- La organización pide el código siempre (0 días): no se marca el equipo
reset role;
update public.organizaciones set ajustes = coalesce(ajustes, '{}'::jsonb) || '{"dias_equipo_confianza": 0}';
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
select 'con 0 días no se guarda el equipo (debe 1): ' || (public.confiar_equipo('x') is null)::int;
reset role;
update public.organizaciones set ajustes = ajustes - 'dias_equipo_confianza';
select set_config('request.jwt.claims','',false) \g /dev/null
select set_config('request.headers','',false) \g /dev/null
select set_config('request.jwt.claim.sub','',false) \g /dev/null
