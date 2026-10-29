-- La consulta lista para la bandeja del escritorio: guardar solo toca lo que cambió, la consulta se escribe al
-- final y los avisos corren solo en la nube.
\pset tuples_only on
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado) values
 ('13600000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador'),
 ('13600000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_consulta('13600000-0000-0000-0000-0000000000f1','{"tipo":"primera"}',
  '[{"cie10":"J00","descripcion":"Rinofaringitis","origen":"comun","principal":true},{"cie10":"M54.5","descripcion":"Lumbago","origen":"comun","principal":false}]',
  '{"clasificacion":"elegible","limitaciones":[]}','{"causa":"enfermedad_comun","desde":"2026-01-05","hasta":"2026-01-07"}',false) \g /dev/null
reset role;
create temp table antes as
  select 'd' as t, id, version from clinico.diagnosticos where consulta_id = '13600000-0000-0000-0000-0000000000f1'
  union all select 'a', id, version from clinico.aptitudes where consulta_id = '13600000-0000-0000-0000-0000000000f1'
  union all select 'r', id, version from clinico.reposos where consulta_id = '13600000-0000-0000-0000-0000000000f1';
grant select on antes to authenticated;
set role authenticated;
-- El mismo guardado otra vez (lo normal: el médico pulsa Guardar con otros cambios en la consulta)
select public.guardar_consulta('13600000-0000-0000-0000-0000000000f1','{"tipo":"primera","conclusiones":"x"}',
  '[{"cie10":"J00","descripcion":"Rinofaringitis","origen":"comun","principal":true},{"cie10":"M54.5","descripcion":"Lumbago","origen":"comun","principal":false}]',
  '{"clasificacion":"elegible","limitaciones":[]}','{"causa":"enfermedad_comun","desde":"2026-01-05","hasta":"2026-01-07"}',false) \g /dev/null
reset role;
select 'guardar igual no toca diagnósticos, aptitud ni reposo (debe 4): ' || count(*)
from antes a join (select id, version from clinico.diagnosticos union all select id, version from clinico.aptitudes
                   union all select id, version from clinico.reposos) x using (id, version);
set role authenticated;
-- Cambia un diagnóstico y el reposo: el otro diagnóstico y la aptitud siguen iguales; el reposo conserva su id
select public.guardar_consulta('13600000-0000-0000-0000-0000000000f1','{"tipo":"primera","conclusiones":"x"}',
  '[{"cie10":"J00","descripcion":"Rinofaringitis","origen":"comun","principal":true},{"cie10":"M54.4","descripcion":"Lumbociática","origen":"comun","principal":false}]',
  '{"clasificacion":"elegible","limitaciones":[]}','{"causa":"enfermedad_comun","desde":"2026-01-05","hasta":"2026-01-09"}',false) \g /dev/null
reset role;
select 'un diagnóstico cambiado: siguen 2 (debe 2): ' || count(*) from clinico.diagnosticos where consulta_id = '13600000-0000-0000-0000-0000000000f1';
select 'el diagnóstico que no cambió conserva fila y versión (debe 1): ' || count(*) from antes a join clinico.diagnosticos d using (id, version) where a.t = 'd';
select 'el reposo cambia en su lugar (debe 1): ' || count(*)
from clinico.reposos r join antes a on a.id = r.id and a.t = 'r' where r.hasta = date '2026-01-09' and r.version > a.version;
select 'la aptitud sigue igual (debe 1): ' || count(*) from antes a join clinico.aptitudes x using (id, version) where a.t = 'a';
set role authenticated;
-- Diagnósticos repetidos (mismo texto dos veces) se respetan
select public.guardar_consulta('13600000-0000-0000-0000-0000000000f1','{"tipo":"primera"}',
  '[{"cie10":"J00","descripcion":"Rinofaringitis","origen":"comun","principal":true},{"cie10":"J00","descripcion":"Rinofaringitis","origen":"comun","principal":true}]',
  '{"clasificacion":"elegible","limitaciones":[]}',null,false) \g /dev/null
reset role;
select 'diagnósticos repetidos se respetan (debe 2): ' || count(*) from clinico.diagnosticos where consulta_id = '13600000-0000-0000-0000-0000000000f1';
select 'sin reposo se quita el reposo (debe 0): ' || count(*) from clinico.reposos where consulta_id = '13600000-0000-0000-0000-0000000000f1';

-- Base local: al cerrar, la consulta se anota después de la aptitud y no corre el aviso al portal
select set_config('zamorapp.local', 'on', false) \g /dev/null
set role authenticated;
select public.guardar_consulta('13600000-0000-0000-0000-0000000000f2','{"tipo":"primera"}','[]','{"clasificacion":"elegible","limitaciones":[]}',null,true) \g /dev/null
reset role;
select 'local: el aviso de aptitud no corre en la PC (debe 1): ' || count(*)
from clinico.aptitudes where consulta_id = '13600000-0000-0000-0000-0000000000f2' and avisada_en is null;
select 'local: la consulta se anota después de su aptitud (debe 1): ' ||
  ((select max(seq) from sync.registro where tabla = 'clinico.consultas' and fila_id = '13600000-0000-0000-0000-0000000000f2')
   > (select max(seq) from sync.registro where tabla = 'clinico.aptitudes'
        and fila_id = (select id from clinico.aptitudes where consulta_id = '13600000-0000-0000-0000-0000000000f2')))::int;
select set_config('zamorapp.local', '', false) \g /dev/null
-- En la nube, el cambio de estado que llega después sí avisa (lo que hace aplicar_cambios al recibir la fila)
update clinico.consultas set estado = 'borrador' where id = '13600000-0000-0000-0000-0000000000f2';
update clinico.consultas set estado = 'cerrada' where id = '13600000-0000-0000-0000-0000000000f2';
select 'nube: al recibir el cierre, la aptitud queda avisada (debe 1): ' || count(*)
from clinico.aptitudes where consulta_id = '13600000-0000-0000-0000-0000000000f2' and avisada_en is not null;

delete from clinico.consultas where id in ('13600000-0000-0000-0000-0000000000f1', '13600000-0000-0000-0000-0000000000f2');
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
