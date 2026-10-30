-- Lateralidad: «Diestro» (como lo mandaba la ficha) se guarda como 'diestro' y no tumba el resto de la ficha.
\pset tuples_only on
reset role;
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos) values
 ('17400000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','1740001','Uno','U');
update public.trabajadores set lateralidad = 'Diestro', nivel_educativo = 'Bachiller', estado_civil = 'Casado(a)'
 where id = '17400000-0000-0000-0000-0000000000a1';
select 'guarda la ficha con «Diestro» (debe 1): ' || count(*) from public.trabajadores
 where id = '17400000-0000-0000-0000-0000000000a1' and lateralidad = 'diestro' and nivel_educativo = 'Bachiller' and estado_civil = 'Casado(a)';
update public.trabajadores set lateralidad = ' Izquierda ' where id = '17400000-0000-0000-0000-0000000000a1';
select 'sinónimo izquierda queda zurdo (debe 1): ' || count(*) from public.trabajadores where id = '17400000-0000-0000-0000-0000000000a1' and lateralidad = 'zurdo';
update public.trabajadores set lateralidad = '' where id = '17400000-0000-0000-0000-0000000000a1';
select 'vacío queda sin definir (debe 1): ' || count(*) from public.trabajadores where id = '17400000-0000-0000-0000-0000000000a1' and lateralidad is null;
do $$ begin
  update public.trabajadores set lateralidad = 'otra cosa' where id = '17400000-0000-0000-0000-0000000000a1';
  raise notice 'FALLA: aceptó una lateralidad inventada';
exception when check_violation then raise notice 'un valor inventado se sigue rechazando (debe 1): 1';
end $$;
delete from public.trabajadores where id = '17400000-0000-0000-0000-0000000000a1';
