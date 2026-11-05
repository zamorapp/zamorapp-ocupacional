-- vigilancia_complemento: morbilidad por dependencia × motivo, causas por cargo y catálogos para filas en cero.
-- Deja su propio estado: empresa B, dependencia «Taller», puesto «Soldador», motivo propio y una consulta de marzo 2027.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.dependencias (id,org_id,empresa_id,nombre) values
 ('50000000-0000-0000-0000-0000000001d7','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Taller');
insert into public.puestos (id,org_id,empresa_id,nombre) values
 ('51000000-0000-0000-0000-0000000001d7','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Soldador');
insert into public.lista_items (id,lista,org_id,codigo,nombre,grupo,orden) values
 ('52000000-0000-0000-0000-0000000001d7','motivo_consulta','10000000-0000-0000-0000-000000000001','P197','Periódico 197','preventivo',1),
 ('52000000-0000-0000-0000-0000000002d7','motivo_consulta','10000000-0000-0000-0000-000000000001','U197','Urgencia 197','no_preventivo',2);
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,dependencia_id,puesto_id,sexo) values
 ('30000000-0000-0000-0000-0000000001d7','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','197','Caso','Ciento','50000000-0000-0000-0000-0000000001d7','51000000-0000-0000-0000-0000000001d7','M');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,tipo,motivo_id) values
 ('40000000-0000-0000-0000-0000000001d7','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-0000000001d7','cerrada','2027-03-10','primera','52000000-0000-0000-0000-0000000001d7');
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion,sistema,origen) values
 ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000001d7','H83.3','Hipoacusia por ruido','Sistema auditivo 197','ocupacional'),
 ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000001d7','M54.5','Lumbago','Osteomuscular 197','comun');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'dependencia × motivo: Taller / Periódico 197 con 1 consulta (debe 1): ' ||
  (select (x ->> 'consultas') from jsonb_array_elements(v -> 'dependencia_motivo') x where x ->> 'dependencia' = 'Taller' and x ->> 'motivo' = 'Periódico 197')
  from public.vigilancia_complemento('20000000-0000-0000-0000-00000000000b','2027-01-01','2027-03-31') v;
select 'dependencia × motivo: 2 diagnósticos en Taller (debe 2): ' ||
  (select (x ->> 'diagnosticos') from jsonb_array_elements(v -> 'dependencia_motivo') x where x ->> 'dependencia' = 'Taller')
  from public.vigilancia_complemento('20000000-0000-0000-0000-00000000000b','2027-01-01','2027-03-31') v;
select 'causas del cargo Soldador (debe 2): ' || jsonb_array_length(v -> 'cargos' -> 'Soldador')
  from public.vigilancia_complemento('20000000-0000-0000-0000-00000000000b','2027-01-01','2027-03-31') v;
select 'catálogo trae el motivo sin casos «Urgencia 197» (debe 1): ' ||
  (select count(*) from jsonb_array_elements(v -> 'motivos') x where x ->> 'nombre' = 'Urgencia 197')
  from public.vigilancia_complemento('20000000-0000-0000-0000-00000000000b','2027-01-01','2027-03-31') v;
select 'fuera del período no hay filas, pero el catálogo de sistemas sigue (debe 1): ' ||
  (jsonb_array_length(v -> 'dependencia_motivo') = 0 and v -> 'sistemas' ? 'Sistema auditivo 197')::int
  from public.vigilancia_complemento('20000000-0000-0000-0000-00000000000b','2027-04-01','2027-06-30') v;
-- RR. HH. no lee diagnósticos: no ve causas por cargo de la empresa B (ni de ninguna)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. sin causas por cargo (debe 0): ' || coalesce(jsonb_array_length(v -> 'cargos' -> 'Soldador'), 0)
  from public.vigilancia_complemento('20000000-0000-0000-0000-00000000000b','2027-01-01','2027-03-31') v;
reset role;
select 'anon no ejecuta vigilancia_complemento (debe 0): ' || has_function_privilege('anon', 'public.vigilancia_complemento(uuid,date,date)', 'execute')::int;
