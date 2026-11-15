-- Marca «dos_pasos» del token: verdadera solo para administrador y gerente médico activos; respeta los demás datos.
\pset tuples_only on
reset role;
select 'admin lleva la marca (debe 1): ' || (public.marcar_dos_pasos_en_token('{"user_id":"00000000-0000-0000-0000-0000000000a1","claims":{"aal":"aal1","role":"authenticated"}}') -> 'claims' ->> 'dos_pasos')::boolean::int;
select 'médico no la lleva (debe 0): ' || (public.marcar_dos_pasos_en_token('{"user_id":"00000000-0000-0000-0000-0000000000a2","claims":{"aal":"aal1"}}') -> 'claims' ->> 'dos_pasos')::boolean::int;
select 'usuario desconocido no la lleva (debe 0): ' || (public.marcar_dos_pasos_en_token('{"user_id":"00000000-0000-0000-0000-0000000000ff","claims":{}}') -> 'claims' ->> 'dos_pasos')::boolean::int;
select 'conserva los demás datos del token (debe 1): ' || (public.marcar_dos_pasos_en_token('{"user_id":"00000000-0000-0000-0000-0000000000a1","claims":{"aal":"aal1","role":"authenticated"}}') -> 'claims' @> '{"aal":"aal1","role":"authenticated"}')::int;
-- Nadie con sesión puede llamarla para fabricarse una marca
set role authenticated;
do $$ begin
  perform public.marcar_dos_pasos_en_token('{"user_id":"00000000-0000-0000-0000-0000000000a1","claims":{}}');
  raise notice 'un usuario llama la función del token: FALLA';
exception when insufficient_privilege then raise notice 'un usuario no puede llamar la función del token (ok)'; end $$;
reset role;
