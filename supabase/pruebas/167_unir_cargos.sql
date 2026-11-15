-- Unir cargos repetidos: en cada empresa queda uno con el nombre elegido; nada se borra; no nacen repetidos nuevos.
\pset tuples_only on
reset role;
-- La 152 vuelve a correr la 480000 (historial_cargos sin la excepción de unir): se repone esta, que además prueba que se puede repetir
\o /dev/null
\i supabase/migrations/20261030630000_unir_cargos.sql
\o
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'misma clave sin acentos, mayúsculas, signos ni «de» (debe 1): ' ||
  (public.clave_cargo('Administración de Contrato') = public.clave_cargo(' ADMINISTRACION  CONTRATO. '))::int;
select 'cargos distintos no comparten clave (debe 0): ' || (public.clave_cargo('Administrador') = public.clave_cargo('Administración'))::int;

insert into public.puestos (id,org_id,empresa_id,nombre,riesgos) values
 ('16700000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Administración de contrato','{"fisico":["Ruido"]}'),
 ('16700000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Adm. de contrato','{"fisico":["Ruido","Calor"],"quimico":["Polvo"]}'),
 ('16700000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','ADMINISTRACION CONTRATO','{}');
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,puesto_id) values
 ('16700000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','1670001','Uno','U','16700000-0000-0000-0000-00000000000b'),
 ('16700000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','1670002','Dos','D','16700000-0000-0000-0000-00000000000b'),
 ('16700000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','1670003','Tres','T','16700000-0000-0000-0000-00000000000a');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,puesto_id) values
 ('16700000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','16700000-0000-0000-0000-0000000000a1','borrador',public.hoy_caracas(),'16700000-0000-0000-0000-00000000000a'),
 ('16700000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','16700000-0000-0000-0000-0000000000a2','firmada','2024-01-01','16700000-0000-0000-0000-00000000000a');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  insert into public.puestos (org_id,empresa_id,nombre) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Administración de contrato');
  raise notice 'FALLA: creó un cargo repetido';
exception when unique_violation then raise notice 'no se crea un cargo repetido en la misma empresa (debe 1): 1';
end $$;
update public.puestos set riesgos = '{"fisico":["Vibración"]}' where id = '16700000-0000-0000-0000-00000000000a';
select 'editar un cargo ya repetido sí se puede (debe 1): ' || count(*) from public.puestos where id = '16700000-0000-0000-0000-00000000000a' and riesgos ? 'fisico';
select 'la pantalla ve los tres cargos con sus trabajadores (debe 3): ' || count(*) from public.cargos_de_la_org() where id::text like '16700000%';

reset role;
insert into auth.users (id,email) values ('16700000-0000-0000-0000-0000000000f1','rec167@x'),('16700000-0000-0000-0000-0000000000f2','ger167@x');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','16700000-0000-0000-0000-0000000000f1','recepcion',null),
 ('10000000-0000-0000-0000-000000000001','16700000-0000-0000-0000-0000000000f2','gerente_medico',null);
set role authenticated;
do $$
declare u text; n int := 0;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000000a2','16700000-0000-0000-0000-0000000000f1','16700000-0000-0000-0000-0000000000f2'] loop
    perform set_config('request.jwt.claim.sub', u, false);
    begin
      perform public.unir_cargos('Administración de contrato', array['16700000-0000-0000-0000-00000000000a','16700000-0000-0000-0000-00000000000b']::uuid[]);
      raise notice 'FALLA: % unió cargos', u;
    exception when insufficient_privilege then n := n + 1;
    end;
  end loop;
  raise notice 'médico, recepción y gerente médico no unen cargos (debe 3): %', n;
end $$;

-- En la copia de la PC no se une (se hace con internet)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select set_config('zamorapp.local', 'on', false) \g /dev/null
do $$ begin
  perform public.unir_cargos('Administración de contrato', array['16700000-0000-0000-0000-00000000000a','16700000-0000-0000-0000-00000000000b']::uuid[]);
  raise notice 'FALLA: unió en la base local';
exception when feature_not_supported then raise notice 'en la PC sin nube no se une (debe 1): 1';
end $$;
select set_config('zamorapp.local', '', false) \g /dev/null

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'une en 2 empresas, 1 alias, 1 trabajador y 1 consulta abierta (debe 1): ' ||
  (public.unir_cargos('Administración de contrato', array['16700000-0000-0000-0000-00000000000a','16700000-0000-0000-0000-00000000000b','16700000-0000-0000-0000-00000000000c']::uuid[])
   = '{"empresas":2,"trabajadores":1,"consultas":1,"alias":1}'::jsonb)::int;
reset role;
select 'en A queda el que tenía más trabajadores, con el nombre elegido (debe 1): ' || count(*) from public.puestos
 where id = '16700000-0000-0000-0000-00000000000b' and activo and nombre = 'Administración de contrato';
select 'riesgos sumados de los dos (debe 1): ' || count(*) from public.puestos
 where id = '16700000-0000-0000-0000-00000000000b' and riesgos -> 'fisico' @> '["Ruido","Calor","Vibración"]' and riesgos -> 'quimico' @> '["Polvo"]';
select 'el otro queda inactivo como alias, con su nombre (debe 1): ' || count(*) from public.puestos
 where id = '16700000-0000-0000-0000-00000000000a' and not activo and unido_a = '16700000-0000-0000-0000-00000000000b' and nombre = 'Administración de contrato';
select 'en B se renombra (debe 1): ' || count(*) from public.puestos where id = '16700000-0000-0000-0000-00000000000c' and activo and nombre = 'Administración de contrato';
select 'los tres trabajadores en el cargo que queda (debe 3): ' || count(*) from public.trabajadores
 where id::text like '16700000%' and puesto_id = '16700000-0000-0000-0000-00000000000b';
select 'unir no es cambio de cargo: sin historial (debe 0): ' || count(*) from public.cargos_historial where trabajador_id::text like '16700000%';
select 'la consulta abierta pasa al cargo que queda (debe 1): ' || count(*) from clinico.consultas where id = '16700000-0000-0000-0000-0000000000c1' and puesto_id = '16700000-0000-0000-0000-00000000000b';
select 'la firmada no cambia (debe 1): ' || count(*) from clinico.consultas where id = '16700000-0000-0000-0000-0000000000c2' and puesto_id = '16700000-0000-0000-0000-00000000000a';
select 'queda en la bitácora (debe 2): ' || count(*) from public.bitacora where accion = 'UNIR CARGOS' and registro_id::text like '16700000%';
select 'la bitácora guarda el trabajador y la consulta abierta de la variante unida, para deshacer (debe 1): ' || count(*) from public.bitacora
 where accion = 'UNIR CARGOS' and registro_id = '16700000-0000-0000-0000-00000000000b'
   and antes -> 'unidos' @> '[{"id":"16700000-0000-0000-0000-00000000000a","trabajadores":["16700000-0000-0000-0000-0000000000a3"],"consultas":["16700000-0000-0000-0000-0000000000c1"]}]';

-- Quitar un cargo que no es cargo
insert into public.puestos (id,org_id,empresa_id,nombre) values ('16700000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','16/08/2023');
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,puesto_id) values
 ('16700000-0000-0000-0000-0000000000a9','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','1670009','Nueve','N','16700000-0000-0000-0000-0000000000d1');
set role authenticated;
select set_config('request.jwt.claim.sub','16700000-0000-0000-0000-0000000000f2',false) \g /dev/null
do $$ begin
  perform public.quitar_cargos(array['16700000-0000-0000-0000-0000000000d1']::uuid[]);
  raise notice 'FALLA: el gerente médico quitó un cargo';
exception when insufficient_privilege then raise notice 'el gerente médico no quita cargos (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador quita el cargo a 1 trabajador (debe 1): ' || (public.quitar_cargos(array['16700000-0000-0000-0000-0000000000d1']::uuid[]) ->> 'trabajadores');
reset role;
select 'el trabajador queda sin cargo y sin historial falso (debe 1): ' || count(*) from public.trabajadores t
 where t.id = '16700000-0000-0000-0000-0000000000a9' and t.puesto_id is null
   and not exists (select 1 from public.cargos_historial h where h.trabajador_id = t.id);
select 'el cargo queda inactivo con su nombre (debe 1): ' || count(*) from public.puestos where id = '16700000-0000-0000-0000-0000000000d1' and not activo and nombre = '16/08/2023';
select 'la bitácora guarda los trabajadores del cargo quitado (debe 1): ' || count(*) from public.bitacora
 where accion = 'QUITAR CARGO' and registro_id = '16700000-0000-0000-0000-0000000000d1' and antes -> 'trabajadores' @> '["16700000-0000-0000-0000-0000000000a9"]';
