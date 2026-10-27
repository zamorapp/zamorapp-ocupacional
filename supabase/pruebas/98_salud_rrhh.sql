-- Grupo sanguíneo y discapacidad: solo el personal del servicio (decisión de Cesar). Bitácora clínica cerrada.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
update public.trabajadores set grupo_sanguineo='O+', discapacidad=true where id='30000000-0000-0000-0000-00000000000a';
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000d1','audA@x'), ('00000000-0000-0000-0000-0000000000d2','sstA@x');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000d1','auditor','{20000000-0000-0000-0000-00000000000a}');
insert into public.miembros (org_id,usuario_id,rol) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000d2','coordinador_sst');
insert into public.equipos (id,org_id,nombre,serie,secreto_hash) values
 ('e0000000-0000-0000-0000-000000000096','10000000-0000-0000-0000-000000000001','PC salud','Z',encode(sha256('s96'::bytea),'hex'))
 on conflict do nothing;
set role authenticated;

-- RR. HH. de la empresa A
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH ve al trabajador (debe 1): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-00000000000a';
do $$ begin perform grupo_sanguineo from public.trabajadores limit 1;
  raise notice 'RRHH lee grupo sanguíneo: FALLA';
exception when insufficient_privilege then raise notice 'RRHH no lee grupo sanguíneo (ok)'; end $$;
do $$ begin perform discapacidad from public.trabajadores limit 1;
  raise notice 'RRHH lee discapacidad: FALLA';
exception when insufficient_privilege then raise notice 'RRHH no lee discapacidad (ok)'; end $$;
do $$ begin perform to_jsonb(t) from public.trabajadores t limit 1;
  raise notice 'RRHH lee la fila entera: FALLA';
exception when insufficient_privilege then raise notice 'RRHH no lee la fila entera (ok)'; end $$;
select 'RRHH no ve la vista de salud (debe 0): ' || count(*) from public.trabajadores_salud;
select 'padrón para RRHH sin grupo ni discapacidad (debe 0): ' || count(*)
  from jsonb_array_elements(public.reporte_listado('pacientes', null, '2026-01-01', '2026-12-31')) x
 where x->>'grupo_sanguineo' is not null or (x->>'discapacidad')::boolean;
select 'vigilancia para RRHH no cuenta discapacidad (debe 0): ' ||
  (public.reporte_vigilancia('20000000-0000-0000-0000-00000000000a', '2026-01-01', '2026-12-31') -> 'poblacion' ->> 'discapacidad');
with x as (update public.trabajadores set turno='Diurno' where id='30000000-0000-0000-0000-00000000000a' returning 1)
select 'RRHH sigue editando la nómina (debe 1): ' || count(*) from x;

-- Coordinador SST y auditor: tampoco
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d2',false) \g /dev/null
select 'SST no ve la vista de salud (debe 0): ' || count(*) from public.trabajadores_salud;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false) \g /dev/null
select 'auditor no ve la vista de salud (debe 0): ' || count(*) from public.trabajadores_salud;

-- Médico de A: sí
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico ve grupo y discapacidad (debe 1): ' || count(*) from public.trabajadores_salud
 where id='30000000-0000-0000-0000-00000000000a' and grupo_sanguineo='O+' and discapacidad;
select 'médico no ve salud de empresa B (debe 0): ' || count(*) from public.trabajadores_salud where empresa_id='20000000-0000-0000-0000-00000000000b';
select 'padrón del médico trae el grupo (debe 1): ' || count(*)
  from jsonb_array_elements(public.reporte_listado('pacientes', null, '2026-01-01', '2026-12-31')) x
 where x->>'id'='30000000-0000-0000-0000-00000000000a' and x->>'grupo_sanguineo'='O+' and (x->>'discapacidad')::boolean;
select 'potencial discapacidad del médico la incluye (debe 1): ' || count(*)
  from jsonb_array_elements(public.reporte_listado('discapacidad', null, '2026-01-01', '2026-12-31')) x
 where x->>'id'='30000000-0000-0000-0000-00000000000a' and x->>'criterios' like '%Discapacidad registrada%';
select 'vigilancia del médico cuenta discapacidad (debe 1): ' ||
  (public.reporte_vigilancia('20000000-0000-0000-0000-00000000000a', '2026-01-01', '2026-12-31') -> 'poblacion' ->> 'discapacidad');

-- Escritorio del administrador: la copia trae las dos columnas
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'copia de escritorio con grupo sanguíneo (debe 1): ' || count(*)
  from jsonb_array_elements(public.instantanea('e0000000-0000-0000-0000-000000000096','s96','public.trabajadores')->'filas') f
 where f->>'id'='30000000-0000-0000-0000-00000000000a' and f->>'grupo_sanguineo'='O+' and (f->>'discapacidad')::boolean;
select 'cambios de escritorio con grupo sanguíneo (debe 1): ' || least(count(*),1)
  from jsonb_array_elements(public.cambios_desde('e0000000-0000-0000-0000-000000000096','s96',0,2000)->'cambios') x
 where x->>'fila_id'='30000000-0000-0000-0000-00000000000a' and x->'fila'->>'grupo_sanguineo'='O+';
select 'cambios de otras tablas siguen bajando (debe 1): ' || least(count(*),1)
  from jsonb_array_elements(public.cambios_desde('e0000000-0000-0000-0000-000000000096','s96',0,2000)->'cambios') x
 where x->>'tabla'='public.empresas';

-- Bitácora: el auditor no lee contenido clínico ni la ficha del trabajador, ni de otras empresas
reset role;
select 'hay bitácora clínica para probar (debe 1): ' || least(count(*),1) from public.bitacora where tabla like 'clinico.%';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000d1',false) \g /dev/null
select 'auditor no lee bitácora clínica (debe 0): ' || count(*) from public.bitacora where tabla like 'clinico.%';
select 'auditor no lee la ficha del trabajador en la bitácora (debe 0): ' || count(*) from public.bitacora where tabla = 'public.trabajadores';
select 'auditor no lee bitácora de empresa B (debe 0): ' || count(*) from public.bitacora
 where coalesce(despues, antes) ->> 'empresa_id' = '20000000-0000-0000-0000-00000000000b';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin clínico lee bitácora clínica (debe 1): ' || least(count(*),1) from public.bitacora where tabla like 'clinico.%';
-- Conteo por empresa sin SELECT sobre toda la tabla: RR. HH. de A solo cuenta su empresa
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A cuenta trabajadores solo de A (debe 1): ' || count(*) from public.trabajadores_por_empresa();
select 'RR. HH. de A no cuenta los de B (debe 0): ' || count(*) from public.trabajadores_por_empresa() where empresa_id='20000000-0000-0000-0000-00000000000b';
select 'RR. HH. de A cuenta por puesto en A (debe 0, nadie con puesto en los datos): ' || count(*) from public.trabajadores_por_puesto('20000000-0000-0000-0000-00000000000a') where total < 0;
reset role;
