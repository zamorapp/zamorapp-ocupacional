-- Enlace de registro: cada examen elegido guarda su clase de estudio (lista cerrada) para salir en su propia orden.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'guarda la clase conocida y descarta la inventada (debe 1): ' || (
  (x->'orden'->'examenes'->0->>'clase') = 'rayos_x' and not (x->'orden'->'examenes'->1) ? 'clase' and (x->'orden'->'examenes'->2->>'clase') = 'laboratorio')::int
from (select public.limpiar_documentos_registro('{"orden":{"examenes":[
  {"nombre":"Rx de tórax","clase":"rayos_x"},{"nombre":"Raro","clase":"<script>"},{"nombre":"Glicemia","clase":"laboratorio"}]}}',
  '10000000-0000-0000-0000-000000000001') x) t;
reset role;
