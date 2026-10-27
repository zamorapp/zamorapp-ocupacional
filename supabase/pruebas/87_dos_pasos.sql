-- Verificación en dos pasos: a quién se le exige y cuándo la base frena el pedido.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'administrador la necesita (debe 1): ' || public.requiere_dos_pasos()::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico no la necesita (debe 0): ' || public.requiere_dos_pasos()::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'empresa no la necesita (debe 0): ' || public.requiere_dos_pasos()::int;
do $$ begin
  perform 1 from public.ajustes_seguridad;
  raise notice 'un usuario lee los ajustes de seguridad: FALLA';
exception when insufficient_privilege then raise notice 'los ajustes de seguridad no se leen desde la API (ok)'; end $$;
select set_config('request.jwt.claim.sub','',false) \g /dev/null

-- Freno en la base: apagado no frena a nadie
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal1"}',false) \g /dev/null
set role authenticated;
select 'apagado: admin aal1 pasa (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;

reset role;
update public.ajustes_seguridad set valor = true where clave = 'dos_pasos_en_base';
set role authenticated;
do $$ begin
  perform public.verificar_dos_pasos();
  raise notice 'admin sin el segundo paso: FALLA';
exception when others then
  if sqlstate = 'PGRST' and sqlerrm like '%dos_pasos%' then raise notice 'admin sin el segundo paso queda frenado (ok)';
  else raise notice 'admin sin el segundo paso, error inesperado %: FALLA', sqlerrm; end if;
end $$;
select set_config('request.path','/rpc/requiere_dos_pasos',false) \g /dev/null
select 'admin aal1 puede preguntar si la necesita (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;
select set_config('request.path','/clinico/consultas',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}',false) \g /dev/null
select 'admin con el segundo paso pasa (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
select 'médico aal1 pasa (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false) \g /dev/null
select 'sesión de la puerta local (sin aal) pasa (debe 1): ' || count(*) from (select public.verificar_dos_pasos()) x;

reset role;
update public.ajustes_seguridad set valor = false where clave = 'dos_pasos_en_base';
select set_config('request.jwt.claims','',false) \g /dev/null
select set_config('request.path','',false) \g /dev/null
