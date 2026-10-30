-- Deshacer «Quitar cargo»: vuelve a sus trabajadores (los que siguen sin cargo), solo el administrador, solo en la nube.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.puestos (id,org_id,empresa_id,nombre) values
 ('17300000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Operador de equipo pesado');
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,puesto_id) values
 ('17300000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','1730001','Uno','U','17300000-0000-0000-0000-00000000000a'),
 ('17300000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','1730002','Dos','D','17300000-0000-0000-0000-00000000000a');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.quitar_cargos(array['17300000-0000-0000-0000-00000000000a']::uuid[]) \g /dev/null
select 'sale en la lista de quitados (debe 1): ' || count(*) from public.cargos_quitados() where id = '17300000-0000-0000-0000-00000000000a';
reset role;
-- A uno de los dos ya le pusieron otro cargo a mano: ese se respeta
update public.trabajadores set puesto_id = (select id from public.puestos where empresa_id = '20000000-0000-0000-0000-00000000000a' and activo and id <> '17300000-0000-0000-0000-00000000000a' limit 1)
 where id = '17300000-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.restaurar_cargo_quitado('17300000-0000-0000-0000-00000000000a');
  raise notice 'FALLA: un médico deshizo';
exception when insufficient_privilege then raise notice 'el médico no deshace (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select set_config('zamorapp.local', 'on', false) \g /dev/null
do $$ begin
  perform public.restaurar_cargo_quitado('17300000-0000-0000-0000-00000000000a');
  raise notice 'FALLA: deshizo en la base local';
exception when feature_not_supported then raise notice 'en la PC sin nube no se deshace (debe 1): 1';
end $$;
select set_config('zamorapp.local', '', false) \g /dev/null
select 'deshacer devuelve el cargo al que sigue sin cargo (debe 1): ' || (public.restaurar_cargo_quitado('17300000-0000-0000-0000-00000000000a') ->> 'trabajadores');
select 'ya no sale en quitados (debe 0): ' || count(*) from public.cargos_quitados() where id = '17300000-0000-0000-0000-00000000000a';
reset role;
select 'el cargo vuelve a estar activo y con su trabajador (debe 1): ' || count(*) from public.trabajadores t join public.puestos p on p.id = t.puesto_id
 where t.id = '17300000-0000-0000-0000-0000000000a1' and p.id = '17300000-0000-0000-0000-00000000000a' and p.activo;
select 'al que le pusieron otro cargo no se le toca (debe 0): ' || count(*) from public.trabajadores where id = '17300000-0000-0000-0000-0000000000a2' and puesto_id = '17300000-0000-0000-0000-00000000000a';
select 'queda en la bitácora (debe 1): ' || count(*) from public.bitacora where accion = 'RESTAURAR CARGO' and registro_id = '17300000-0000-0000-0000-00000000000a';
