-- Vigilancia con agentes (20261030953000): casilla propia en la llave, solo totales (sin personas ni diagnósticos
-- confidenciales), propuestas que nadie aplica sin aprobar, aprobar con las reglas de quien aprueba, programas por
-- empresa con su cobertura, y autolimpieza.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Empresa A: dos dependencias, un cargo, cinco trabajadores con consultas en el I trimestre 2025
insert into public.dependencias (id,org_id,empresa_id,nombre) values
 ('25200000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Taller'),
 ('25200000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Oficina');
insert into public.puestos (id,org_id,empresa_id,nombre,riesgos) values
 ('25200000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Mecánico','{"fisico":["Ruido"]}');
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,sexo,dependencia_id,creado_en)
select ('25200000-0000-0000-0000-00000000010' || i)::uuid,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
       'V-7700000' || i,'Persona' || i,'Prueba',(case when i <= 3 then 'M' else 'F' end)::sexo,
       case when i <= 4 then '25200000-0000-0000-0000-0000000000d1'::uuid else '25200000-0000-0000-0000-0000000000d2'::uuid end,'2020-01-01'
from generate_series(1,5) i;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos)
select ('25200000-0000-0000-0000-00000000020' || i)::uuid,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
       ('25200000-0000-0000-0000-00000000010' || i)::uuid,'cerrada','2025-02-10',
       case when i <= 2 then '[{"nombre":"Audiometría tonal"}]'::jsonb else '[]'::jsonb end
from generate_series(1,5) i;
-- Tres lumbagos (se nombran), un resfriado (va a «Otros») y tres depresiones (confidencial: nunca por nombre)
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion)
select '10000000-0000-0000-0000-000000000001',('25200000-0000-0000-0000-00000000020' || i)::uuid,'M54.5','Lumbago' from generate_series(1,3) i;
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion) values
 ('10000000-0000-0000-0000-000000000001','25200000-0000-0000-0000-000000000204','J00','Rinofaringitis');
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion)
select '10000000-0000-0000-0000-000000000001',('25200000-0000-0000-0000-00000000020' || i)::uuid,'F32','Episodio depresivo' from generate_series(3,5) i;

-- ===== Llaves y casilla =====
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Vigila', 'consultar', 30) as l \gset
select (:'l'::jsonb) ->> 'llave' as kv, (:'l'::jsonb) ->> 'id' as kvid \gset
select 'sin la casilla no lee la vigilancia (debe 1): ' || (public.puerta_vigilancia(:'kv', 'vigilancia_cifras', '{"empresa_id":"20000000-0000-0000-0000-00000000000a","anio":2025,"trimestre":1}') ->> 'error' like '%casilla%')::int;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.agentes_llave_vigilancia('10000000-0000-0000-0000-000000000001', (select null::uuid), true);
  raise notice 'FALLA: un médico encendió la casilla';
exception when insufficient_privilege then raise notice 'el médico no enciende la casilla (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador enciende la casilla (debe 1): ' || (public.agentes_llave_vigilancia('10000000-0000-0000-0000-000000000001', :'kvid', true) ->> 'vigilancia')::boolean::int;
select 'agentes_estado muestra la casilla (debe 1): ' || (select count(*) from jsonb_array_elements(public.agentes_estado('10000000-0000-0000-0000-000000000001') -> 'llaves') x where (x ->> 'vigilancia')::boolean);

-- ===== Lo que lee el agente: solo totales =====
reset role;
set role anon;
select public.puerta_vigilancia(:'kv', 'vigilancia_cifras', '{"empresa_id":"20000000-0000-0000-0000-00000000000a","anio":2025,"trimestre":1}') as c \gset
reset role;
select 'un anónimo con llave lee las cifras (debe 1): ' || ((:'c'::jsonb) ->> 'ok')::boolean::int;
select 'el trimestre sale de la gestión de la empresa (debe 1): ' || ((:'c'::jsonb) #>> '{resultado,desde}' = '2025-01-01' and (:'c'::jsonb) #>> '{resultado,hasta}' = '2025-03-31')::int;
select 'el lumbago (3 casos) se nombra (debe 1): ' || ((:'c'::jsonb) #>> '{resultado,morbilidad,primeras_causas}' like '%M54.5%')::int;
select 'la depresión nunca se nombra (debe 0): ' || ((:'c'::jsonb)::text ~* 'F32|depresi')::int;
select 'el resfriado de 1 caso no se nombra (debe 0): ' || ((:'c'::jsonb)::text ~* 'J00|rinofaring')::int;
select 'lo apartado va a «Otros» (debe 1): ' || ((:'c'::jsonb) #>> '{resultado,morbilidad,primeras_causas}' like '%Otros diagnósticos%')::int;
select 'sin cédulas ni nombres de personas (debe 0): ' || ((:'c'::jsonb)::text ~* 'V-7700000|Persona[0-9]')::int;
select 'sin división por sexo con menos de 3 mujeres (debe 0): ' || ((:'c'::jsonb) #> '{resultado,poblacion}' ? 'mujeres')::int;
select 'riesgos de los cargos (debe 1): ' || ((:'c'::jsonb) #>> '{resultado,riesgos_de_los_cargos}' like '%Ruido%')::int;
select 'otra organización: no (debe 0): ' || (public.puerta_vigilancia(:'kv', 'vigilancia_cifras', '{"empresa_id":"20000000-0000-0000-0000-0000000000f2","anio":2025,"trimestre":1}') ->> 'ok')::boolean::int;
select 'llave falsa: no (debe 0): ' || (public.puerta_vigilancia('zk_' || repeat('0', 64), 'ver_programas', '{}') ->> 'ok')::boolean::int;
select 'ningún ayudante lo ejecuta un anónimo ni un usuario (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'agente\_vig\_%' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));

-- ===== Proponer =====
select 'ensayo: no deja nada (debe 0): ' || (select count(*) from public.agentes_propuestas) + 0 * length(public.puerta_vigilancia(:'kv', 'proponer_programa',
  '{"empresa_id":"20000000-0000-0000-0000-00000000000a","nombre":"Conservación auditiva","dependencias":["Taller"],"examenes":[{"nombre":"Audiometría","cada_meses":6}]}', true)::text);
select 'dependencia que no existe: se detiene (debe 1): ' || (public.puerta_vigilancia(:'kv', 'proponer_programa',
  '{"empresa_id":"20000000-0000-0000-0000-00000000000a","nombre":"Conservación auditiva","dependencias":["Patio"]}') ->> 'error' like '%Patio%')::int;
select public.puerta_vigilancia(:'kv', 'proponer_programa',
  '{"empresa_id":"20000000-0000-0000-0000-00000000000a","nombre":"Conservación auditiva","riesgo":"Ruido mayor de 85 dB","dependencias":["Taller"],"examenes":[{"nombre":"Audiometría","cada_meses":6}],"metas":[{"indicador":"Evaluados","meta":"100 %"}]}') -> 'resultado' ->> 'propuesta_id' as pp1 \gset
select public.puerta_vigilancia(:'kv', 'proponer_programa',
  '{"empresa_id":"20000000-0000-0000-0000-00000000000a","nombre":"Conservación auditiva","riesgo":"Ruido mayor de 85 dB","dependencias":["Taller"],"examenes":[{"nombre":"Audiometría","cada_meses":6}],"metas":[{"indicador":"Evaluados","meta":"100 %"}]}') -> 'resultado' ->> 'propuesta_id' as pp \gset
select 'repetir no acumula copias pendientes (debe 1): ' || count(*) from public.agentes_propuestas where tipo = 'programa_vigilancia' and estado = 'pendiente';
select 'proponer no crea el programa (debe 0): ' || count(*) from public.vigilancia_programas;
select public.puerta_vigilancia(:'kv', 'proponer_ajuste_empresa', '{"empresa_id":"20000000-0000-0000-0000-00000000000a","proyecto":"Planta Norte"}') -> 'resultado' ->> 'propuesta_id' as pa \gset
select 'proponer no cambia la empresa (debe 1): ' || (proyecto is null)::int from public.empresas where id = '20000000-0000-0000-0000-00000000000a';
select 'la visión del médico no la escribe el agente (debe 1): ' || (public.puerta_vigilancia(:'kv', 'redactar_informe',
  '{"empresa_id":"20000000-0000-0000-0000-00000000000a","anio":2025,"trimestre":1,"secciones":{"vision_medico":"x"}}') ->> 'error' like '%desconocida%')::int;
select public.puerta_vigilancia(:'kv', 'redactar_informe',
  '{"empresa_id":"20000000-0000-0000-0000-00000000000a","anio":2025,"trimestre":1,"secciones":{"resumen":"Resumen del agente","conclusiones":"Conclusión del agente"},"analisis":{"edad":"Análisis del agente"}}') -> 'resultado' ->> 'propuesta_id' as pi \gset
select 'redactar no toca el informe (debe 0): ' || count(*) from public.informes_vigilancia where empresa_id = '20000000-0000-0000-0000-00000000000a' and desde = '2025-01-01';
select 'cada llamada queda en el registro (debe 1): ' || (count(*) >= 8)::int from public.agentes_registro where llave_id = :'kvid';

-- ===== Quién ve y resuelve =====
select set_config('prueba.pp', :'pp', false) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve las propuestas (debe 0): ' || count(*) from public.agentes_propuestas;
do $$ begin
  perform public.aplicar_propuesta((select current_setting('prueba.pp', true))::uuid);
  raise notice 'RR. HH. no aprueba (debe 1): 0';
exception when others then raise notice 'RR. HH. no aprueba (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico de A ve las de A (debe 4): ' || count(*) from public.agentes_propuestas;
do $$ begin
  insert into public.agentes_propuestas (org_id, llave_nombre, tipo, titulo, propuesto) values ('10000000-0000-0000-0000-000000000001', 'x', 'otro', 'Hecha a mano', '{}');
  raise notice 'FALLA: la app insertó una propuesta';
exception when insufficient_privilege then raise notice 'la app no inserta propuestas (debe 1): 1';
end $$;
do $$ begin
  update public.agentes_propuestas set propuesto = '{}' where tipo = 'ajuste_empresa';
  raise notice 'FALLA: la app cambió lo propuesto';
exception when insufficient_privilege then raise notice 'lo propuesto no se cambia (debe 1): 1';
end $$;
select 'el médico aprueba el programa (debe 1): ' || (public.aplicar_propuesta(:'pp') ->> 'ok')::boolean::int;
select 'el programa quedó con su dependencia (debe 1): ' || count(*) from public.vigilancia_programas where nombre = 'Conservación auditiva' and '25200000-0000-0000-0000-0000000000d1' = any (dependencia_ids);
do $$ begin
  perform public.aplicar_propuesta((select id from public.agentes_propuestas where tipo = 'programa_vigilancia' and estado = 'aprobada'));
  raise notice 'FALLA: se aprobó dos veces';
exception when others then raise notice 'no se aprueba dos veces (debe 1): 1';
end $$;
select 'informe: se aplica solo lo elegido (debe 1): ' || (public.aplicar_propuesta(:'pi', '{"secciones":{"resumen":"Resumen corregido por el médico"},"analisis":{"edad":"Análisis del agente"}}') ->> 'ok')::boolean::int;
select 'el resumen elegido quedó y la conclusión no (debe 1): ' || (resumen = 'Resumen corregido por el médico' and conclusiones is null and analisis ->> 'edad' = 'Análisis del agente')::int
  from public.informes_vigilancia where empresa_id = '20000000-0000-0000-0000-00000000000a' and desde = '2025-01-01';
select 'el médico descarta el ajuste (debe 1): ' || public.descartar_propuesta(:'pa')::int;
select 'quién y cuándo resolvió (debe 1): ' || count(*) from public.agentes_propuestas where id = :'pa' and resuelto_por = '00000000-0000-0000-0000-0000000000a2' and resuelto_en is not null;
select 'cobertura: 4 en la población, 4 evaluados, 2 con audiometría (debe 1): ' ||
  (c ->> 'poblacion' = '4' and c ->> 'evaluados' = '4' and c #>> '{examenes,0,hechos}' = '2')::int
  from (select public.vigilancia_programa_cumplimiento(id, '2025-01-01', '2025-03-31') as c from public.vigilancia_programas) x;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. ve el programa de su empresa (debe 1): ' || count(*) from public.vigilancia_programas;
do $$ begin
  update public.vigilancia_programas set nombre = 'Cambiado por RR. HH.';
  if exists (select 1 from public.vigilancia_programas where nombre = 'Cambiado por RR. HH.') then raise notice 'FALLA: RR. HH. editó el programa'; end if;
  raise notice 'RR. HH. no edita programas (debe 1): 1';
exception when insufficient_privilege then raise notice 'RR. HH. no edita programas (debe 1): 1';
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null

-- ===== El agente ve lo aprobado y lo propuesto =====
select 'ver_programas trae el programa aprobado (debe 1): ' || jsonb_array_length(public.puerta_vigilancia(:'kv', 'ver_programas', '{"empresa_id":"20000000-0000-0000-0000-00000000000a"}') #> '{resultado,programas}');
select 'ver_propuestas trae el estado (debe 1): ' || (public.puerta_vigilancia(:'kv', 'ver_propuestas', '{}')::text like '%aprobada%')::int;
select 'las cifras traen la cobertura del programa (debe 1): ' || (public.puerta_vigilancia(:'kv', 'vigilancia_cifras', '{"empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2025-01-01","hasta":"2025-03-31"}') #>> '{resultado,programas,0,cumplimiento,poblacion}' = '4')::int;

-- ===== Autolimpieza =====
select 'la limpieza conoce las propuestas (debe 1): ' || count(*) from public.limpieza_correr(false) where clave = 'agentes_propuestas';
update public.agentes_propuestas set creado_en = now() - interval '40 days';
select count(*) from public.limpieza_correr(true) \g /dev/null
select 'a los 30 días se borran (debe 0): ' || count(*) from public.agentes_propuestas;
select 'el programa aprobado se queda (debe 1): ' || count(*) from public.vigilancia_programas;
