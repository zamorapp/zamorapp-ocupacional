-- vigilancia_legal: cumplimiento de periódicos, enfermedades ocupacionales declaradas y resultados por exposición.
-- Deja su propio estado: empresa «E206» (periodicidad 12 meses), su RR. HH. (a6), puesto con ruido y polvo, dos
-- trabajadores, consultas de 2026-2027 y una enfermedad ocupacional. Período probado: 3.er trimestre de 2027.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000002a6','rrhh206@x');
insert into public.empresas (id,org_id,razon_social,rif) values
 ('20000000-0000-0000-0000-000000000206','10000000-0000-0000-0000-000000000001','E206','J-206');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000002a6','gerente_empresa','{20000000-0000-0000-0000-000000000206}');
insert into public.dependencias (id,org_id,empresa_id,nombre) values
 ('50000000-0000-0000-0000-000000000206','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','Pulido');
insert into public.puestos (id,org_id,empresa_id,nombre,riesgos) values
 ('51000000-0000-0000-0000-000000000206','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','Pulidor 206',
  '{"fisico":["Ruido"],"quimico":["Polvo metálico"]}');
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,dependencia_id,puesto_id,sexo,estado) values
 ('30000000-0000-0000-0000-0000000206a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','206001','Uno','Doscientos','50000000-0000-0000-0000-000000000206','51000000-0000-0000-0000-000000000206','M','activo'),
 ('30000000-0000-0000-0000-0000000206a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','206002','Dos','Doscientos','50000000-0000-0000-0000-000000000206','51000000-0000-0000-0000-000000000206','M','activo');
-- Exámenes del año anterior: ambos vencen en el 3.er trimestre de 2027; solo el primero se evalúa (agosto 2027)
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,tipo,paraclinicos) values
 ('40000000-0000-0000-0000-0000000206c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','30000000-0000-0000-0000-0000000206a1','cerrada','2026-07-10','primera','[]'),
 ('40000000-0000-0000-0000-0000000206c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','30000000-0000-0000-0000-0000000206a2','cerrada','2026-08-01','primera','[]'),
 ('40000000-0000-0000-0000-0000000206c3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','30000000-0000-0000-0000-0000000206a1','cerrada','2027-08-05','sucesiva',
  '[{"nombre":"Audiometría tonal","estado":"alterado"},{"nombre":"Espirometría","resultado":"Normal"}]');
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion) values
 ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000206c1','30000000-0000-0000-0000-0000000206a1','elegible'),
 ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000206c2','30000000-0000-0000-0000-0000000206a2','elegible'),
 ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000206c3','30000000-0000-0000-0000-0000000206a1','elegible');
-- Diagnóstico ocupacional sin enfermedad registrada (sospecha) en el primero
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion,sistema,origen) values
 ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000206c3','H83.3','Hipoacusia por ruido','Auditivo','ocupacional');
-- Enfermedad ocupacional del segundo: declarada a las 10 h del diagnóstico, informe NT-02 a los 9 días (Anexo 1)
insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,fecha_diagnostico,fecha_declaracion,fecha_informe_nt02,cie10,diagnostico,en_anexo1) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000206','30000000-0000-0000-0000-0000000206a2','enfermedad',
  '2027-08-01 10:00-04','2027-08-01 10:00-04','2027-08-01 20:00-04','2027-08-10','M75.1','Síndrome del manguito rotador',true);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'periódicos programados en el trimestre (debe 2): ' || (v -> 'examenes' ->> 'programados') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'periódicos realizados (debe 1): ' || (v -> 'examenes' ->> 'realizados') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'periódicos vencidos en Pulido (debe 1): ' || (select x ->> 'vencidos' from jsonb_array_elements(v -> 'examenes' -> 'por_dependencia') x where x ->> 'dependencia' = 'Pulido') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'trimestre anterior: nada programado (debe 0): ' || (v -> 'examenes' ->> 'programados') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-04-01','2027-06-30') v;
select 'enfermedad declarada a tiempo (debe 1): ' || (v -> 'enfermedades' ->> 'a_tiempo') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'informe NT-02 a tiempo (debe 1): ' || (v -> 'enfermedades' ->> 'informe_a_tiempo') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'grupo del Anexo 1 musculoesquelético (debe 1): ' || (select x ->> 'n' from jsonb_array_elements(v -> 'enfermedades' -> 'por_grupo') x where x ->> 'grupo' like '010%') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'sospecha ocupacional sin registrar (debe 1): ' || (v -> 'enfermedades' ->> 'sospechas_sin_registro') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'audiometría alterada en expuestos a ruido (debe 1): ' || (select x ->> 'alterados' from jsonb_array_elements(v -> 'resultados') x where x ->> 'grupo' = 'Expuestos a ruido') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'espirometría normal en expuestos a polvo (debe 1): ' || (select x ->> 'normales' from jsonb_array_elements(v -> 'resultados') x where x ->> 'estudio' = 'Espirometría' and (x ->> 'expuesto')::boolean) from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'expuestos a ruido sin audiometría (debe 1): ' || (v -> 'expuestos_sin_estudio' ->> 'ruido') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
-- «Todas las empresas» no cuenta la bolsa de particulares: se marca E206 como particular un momento
reset role;
update public.empresas set es_particular = true where id = '20000000-0000-0000-0000-000000000206';
set role authenticated;
select 'todas las empresas sin particulares: no cuenta su enfermedad (debe 0): ' || (v -> 'enfermedades' ->> 'registradas') from public.vigilancia_legal(null,'2027-07-01','2027-09-30') v;
select 'pedida por su id, la bolsa sí responde (debe 1): ' || (v -> 'enfermedades' ->> 'registradas') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
reset role;
update public.empresas set es_particular = false where id = '20000000-0000-0000-0000-000000000206';
set role authenticated;
-- RR. HH. de la empresa: ve conteos de enfermedades registradas, pero nunca resultados ni sospechas (datos clínicos)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000002a6',false) \g /dev/null
select 'RR. HH. ve la enfermedad registrada (debe 1): ' || (v -> 'enfermedades' ->> 'registradas') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'RR. HH. sin resultados de estudios (debe 0): ' || jsonb_array_length(v -> 'resultados') from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
select 'RR. HH. sin sospechas ni expuestos sin estudio (debe 0): ' || ((v -> 'enfermedades' ->> 'sospechas_sin_registro')::int + (v -> 'expuestos_sin_estudio' ->> 'ruido')::int) from public.vigilancia_legal('20000000-0000-0000-0000-000000000206','2027-07-01','2027-09-30') v;
reset role;
select 'anon no ejecuta vigilancia_legal (debe 0): ' || has_function_privilege('anon', 'public.vigilancia_legal(uuid,date,date)', 'execute')::int;
