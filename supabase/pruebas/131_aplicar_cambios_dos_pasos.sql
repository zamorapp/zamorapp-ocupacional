-- Fase A (local primero): subir cambios desde una PC exige el segundo paso cumplido.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.path','/rpc/aplicar_cambios',false) \g /dev/null
select set_config('request.headers','{}',false) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
-- administrador con solo la clave (aal1): no sube nada
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1","amr":[{"method":"password","timestamp":1}]}',false) \g /dev/null
do $$ begin
  perform public.aplicar_cambios('00000000-0000-0000-0000-000000000000', 'x', '[]'::jsonb);
  raise notice 'admin aal1 sube cambios: FALLA';
exception when insufficient_privilege then
  if sqlerrm like '%dos pasos%' then raise notice 'admin aal1 no sube cambios (ok)';
  else raise notice 'admin aal1 frenado por otra razón (%): FALLA', sqlerrm; end if;
end $$;
-- con el segundo paso (aal2) pasa la comprobación del segundo paso (y lo frena después el equipo inexistente)
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
do $$ begin
  perform public.aplicar_cambios('00000000-0000-0000-0000-000000000000', 'x', '[]'::jsonb);
  raise notice 'equipo inexistente sube cambios: FALLA';
exception when insufficient_privilege then
  if sqlerrm like '%dos pasos%' then raise notice 'admin aal2 frenado por dos pasos: FALLA';
  else raise notice 'admin aal2 pasa el segundo paso y lo frena el equipo (ok)'; end if;
end $$;
-- el médico (sin dos pasos obligatorios) tampoco se ve afectado
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
do $$ begin
  perform public.aplicar_cambios('00000000-0000-0000-0000-000000000000', 'x', '[]'::jsonb);
  raise notice 'equipo inexistente sube cambios: FALLA';
exception when insufficient_privilege then
  if sqlerrm like '%dos pasos%' then raise notice 'médico aal1 frenado por dos pasos: FALLA';
  else raise notice 'médico aal1 pasa el segundo paso (ok)'; end if;
end $$;
-- «duplicado» solo si es la misma fila con el mismo contenido; con contenido distinto es conflicto (Analizar, 29-oct)
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select 'misma fila igual es duplicado (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000131","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","nombres":"Carla María","apellidos":"Castro"}}]')) x where x->>'estado'='duplicado';
select 'misma fila distinta es conflicto (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000132","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","nombres":"Otra","apellidos":"Persona"}}]')) x where x->>'estado'='conflicto';
select 'no se pisó (debe 1): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-0000000000c3' and nombres='Carla María';
select 'conflicto anotado (debe 1): ' || count(*) from sync.conflictos where cambio->>'id'='c0000000-0000-0000-0000-000000000132' and tipo='version';
reset role;
