-- Sincronía del programa de escritorio: subida idempotente con versión, conflictos, firmada, RLS y bajada filtrada.
\pset tuples_only on
-- equipos de prueba con secreto conocido (en producción los crea registrar_equipo)
insert into public.equipos (id,org_id,nombre,serie,secreto_hash) values
 ('e0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','PC consultorio','A',encode(sha256('s1'::bytea),'hex'));
insert into public.equipos (id,org_id,nombre,serie,activo,secreto_hash) values
 ('e0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','PC vieja','B',false,encode(sha256('s2'::bytea),'hex'));
set role authenticated;
-- el administrador registra una PC y recibe su secreto una sola vez
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'admin recibe secreto (debe 1): ' || count(*) from (select public.registrar_equipo('10000000-0000-0000-0000-000000000001','Laptop','c') r) x
 where length(r->>'secreto') = 64;
select 'en la nube solo queda el hash (debe 1): ' || count(*) from public.equipos where serie='C' and length(secreto_hash) = 64;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.registrar_equipo('10000000-0000-0000-0000-000000000001','Mía','D');
  raise notice 'médico registró equipo: FALLA'; exception when others then raise notice 'solo el admin registra equipos (ok)'; end $$;
select 'médico no ve equipos (debe 0): ' || count(*) from public.equipos;
-- alta de trabajador desde la PC, y el mismo lote reenviado
select 'alta aplicada (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000001","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":"20000000-0000-0000-0000-00000000000a","cedula":"33","nombres":"Carla","apellidos":"C"}}]')) x
 where x->>'estado'='aplicado' and (x->>'version')::int=1;
select 'reenvío no duplica (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000001","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"I","datos":{}}]')) x
 where x->>'estado'='duplicado';
select 'una sola fila (debe 1): ' || count(*) from public.trabajadores where cedula='33';
-- edición con versión al día
select 'edición aplicada v2 (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000002","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"U","version_base":1,"datos":{"nombres":"Carla María"}}]')) x
 where x->>'estado'='aplicado' and (x->>'version')::int=2;
-- otra PC desfasada (base 1) cambia otro campo: se combina
select 'campo distinto se combina (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000003","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"U","version_base":1,"datos":{"apellidos":"Castro"}}]')) x
 where x->>'estado'='aplicado';
select 'combinado sin perder nada (debe 1): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-0000000000c3' and nombres='Carla María' and apellidos='Castro';
-- mismo campo desfasado: conflicto, no pisa
select 'mismo campo es conflicto (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000004","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"U","version_base":1,"datos":{"nombres":"Karla"}}]')) x
 where x->>'estado'='conflicto';
select 'no se pisó (debe 1): ' || count(*) from public.trabajadores where id='30000000-0000-0000-0000-0000000000c3' and nombres='Carla María';
-- id, org_id y versión no se pueden forzar desde la PC
select 'org_id y versión ignorados (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000005","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"U","version_base":3,"datos":{"org_id":"10000000-0000-0000-0000-000000000099","version":99,"cedula":"34"}}]')) x
 where x->>'estado'='aplicado' and (x->>'version')::int=4;
-- clínico: consulta nueva, edición al día, y edición desfasada de otro campo = conflicto (nunca gana el último)
select 'consulta creada (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000006","tabla":"clinico.consultas","fila_id":"40000000-0000-0000-0000-0000000000c3","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":"20000000-0000-0000-0000-00000000000a","trabajador_id":"30000000-0000-0000-0000-0000000000c3","estado":"borrador","fecha":"2026-10-26"}}]')) x
 where x->>'estado'='aplicado';
select 'consulta editada (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000007","tabla":"clinico.consultas","fila_id":"40000000-0000-0000-0000-0000000000c3","op":"U","version_base":1,"datos":{"conclusiones":"uno"}}]')) x
 where x->>'estado'='aplicado';
select 'clínico desfasado es conflicto (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000008","tabla":"clinico.consultas","fila_id":"40000000-0000-0000-0000-0000000000c3","op":"U","version_base":1,"datos":{"enfermedad_actual":"otra"}}]')) x
 where x->>'estado'='conflicto';
-- borrar algo editado en otro lado: gana la edición
select 'borrar desfasado no borra (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000009","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"D","version_base":1}]')) x
 where x->>'estado'='conflicto';
-- permisos: empresa B no está permitida para este médico; miembros no se cambian desde una PC
select 'empresa ajena rechazada (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-00000000000a","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c4","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":"20000000-0000-0000-0000-00000000000b","cedula":"44","nombres":"X","apellidos":"Y"}}]')) x
 where x->>'estado'='rechazado';
select 'miembros solo baja (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-00000000000b","tabla":"public.miembros","fila_id":"30000000-0000-0000-0000-0000000000c5","op":"U","version_base":1,"datos":{"rol":"administrador"}}]')) x
 where x->>'estado'='rechazado';
select 'conflictos guardados con su cambio (debe 5): ' || count(*) from sync.conflictos where cambio ? 'datos' or cambio->>'op'='D';
select 'campo desconocido rechazado sin perder el cambio (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-00000000000d","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-0000000000c3","op":"U","version_base":4,"datos":{"apellidos":"Z","campo_nuevo":1}}]')) x
 where x->>'estado'='rechazado' and x->>'motivo' like 'Campos desconocidos%';
-- consulta firmada en la nube: el servidor rechaza cambios desde la PC
reset role;
update clinico.consultas set estado='firmada' where id='40000000-0000-0000-0000-0000000000c3';
set role authenticated;
select 'firmada rechazada (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 (select format('[{"id":"c0000000-0000-0000-0000-00000000000c","tabla":"clinico.consultas","fila_id":"40000000-0000-0000-0000-0000000000c3","op":"U","version_base":%s,"datos":{"conclusiones":"cambiada"}}]', version)
  from clinico.consultas where id='40000000-0000-0000-0000-0000000000c3')::jsonb)) x
 where x->>'estado' in ('rechazado','conflicto');
select 'firmada intacta (debe 1): ' || count(*) from clinico.consultas where id='40000000-0000-0000-0000-0000000000c3' and conclusiones='uno';
-- bajada: solo lo visible
select 'baja su trabajador (debe 1): ' || least(count(*),1) from jsonb_array_elements(public.cambios_desde('e0000000-0000-0000-0000-000000000001','s1',0,2000)->'cambios') x
 where x->>'fila_id'='30000000-0000-0000-0000-0000000000c3' and x->'fila'->>'nombres'='Carla María';
select 'no baja empresa B (debe 0): ' || count(*) from jsonb_array_elements(public.cambios_desde('e0000000-0000-0000-0000-000000000001','s1',0,2000)->'cambios') x
 where x->>'fila_id' in ('30000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-00000000000b');
select 'cursor avanza (debe 1): ' || count(*) where (public.cambios_desde('e0000000-0000-0000-0000-000000000001','s1',0,5)->>'hasta')::bigint >= 5;
-- equipos desactivados o inexistentes
do $$ begin perform public.cambios_desde('e0000000-0000-0000-0000-000000000002','s2',0);
  raise notice 'equipo desactivado aceptado: FALLA'; exception when others then raise notice 'equipo desactivado rechazado (ok)'; end $$;
do $$ begin perform public.aplicar_cambios('e0000000-0000-0000-0000-0000000000ff','x','[]');
  raise notice 'equipo desconocido aceptado: FALLA'; exception when others then raise notice 'equipo desconocido rechazado (ok)'; end $$;
do $$ begin perform public.cambios_desde('e0000000-0000-0000-0000-000000000001','robado',0);
  raise notice 'secreto equivocado aceptado: FALLA'; exception when others then raise notice 'secreto equivocado rechazado (ok)'; end $$;
-- conflictos: no se fabrican resueltos ni se resuelven a nombre de otro
do $$ begin insert into sync.conflictos (org_id,tabla,tipo,cambio,resuelto_por) values ('10000000-0000-0000-0000-000000000001','x','rechazado','{}','00000000-0000-0000-0000-0000000000a1');
  raise notice 'conflicto nació resuelto: FALLA'; exception when others then raise notice 'conflicto resuelto a mano rechazado (ok)'; end $$;
do $$ begin update sync.conflictos set resuelto_por='00000000-0000-0000-0000-0000000000a1';
  raise notice 'resuelto_por editado a mano: FALLA'; exception when others then raise notice 'resolución directa rechazada (ok)'; end $$;
select public.resolver_conflicto((select id from sync.conflictos where autor='00000000-0000-0000-0000-0000000000a2' limit 1),'ignorado') \g /dev/null
select 'resuelto a su nombre (debe 1): ' || count(*) from sync.conflictos where resuelto_por='00000000-0000-0000-0000-0000000000a2';
-- la PC no puede escribir el registro ni la versión directamente
do $$ begin insert into sync.registro (org_id,tabla,fila_id,op) values ('10000000-0000-0000-0000-000000000001','x','30000000-0000-0000-0000-0000000000c3','U');
  raise notice 'registro escrito a mano: FALLA'; exception when others then raise notice 'registro protegido (ok)'; end $$;
-- auditoría de accesos
select public.registrar_acceso('30000000-0000-0000-0000-0000000000c3', null, 'e0000000-0000-0000-0000-000000000001') \g /dev/null
select 'acceso del médico registrado (debe 1): ' || count(*) from public.accesos where usuario_id='00000000-0000-0000-0000-0000000000a2' and equipo_id is not null;
do $$ begin update public.accesos set en = now() - interval '1 year';
  if found then raise notice 'acceso editado: FALLA'; end if; exception when others then null; end $$;
-- RR. HH. de la empresa: no baja nada ni deja rastro de acceso
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform public.cambios_desde('e0000000-0000-0000-0000-000000000001','s1',0);
  raise notice 'RR. HH. sincronizó: FALLA'; exception when others then raise notice 'RR. HH. no sincroniza, portal solo web (ok)'; end $$;
select public.registrar_acceso('30000000-0000-0000-0000-0000000000c3') \g /dev/null
select 'RR. HH. ve conflictos ajenos (debe 0): ' || count(*) from sync.conflictos;
-- médico limitado a la empresa A no anota accesos de B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.registrar_acceso('30000000-0000-0000-0000-00000000000b') \g /dev/null
reset role;
select 'solo queda el acceso legítimo (debe 1): ' || count(*) from public.accesos;
select 'bitácora anota el equipo (debe 1): ' || least(count(*),1) from public.bitacora where equipo_id='e0000000-0000-0000-0000-000000000001';
