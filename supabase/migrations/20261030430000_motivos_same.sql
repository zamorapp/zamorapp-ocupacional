-- zamorApp Ocupacional · Motivos de consulta del SAME para la marcha en paralelo (9 al 23 de noviembre)
-- 1) Los motivos que el SAME tiene y zamorApp no: así cada consulta se registra con el mismo motivo en los dos
--    y «Consultas por motivo» cuadra. Se agregan a la lista base y a cada organización que no tenga ese código.
-- 2) «Adecuación de puesto» pasa a no preventiva, como en la lista de actividad del SAME (pág. 11 del informe);
--    solo si sigue con el grupo de fábrica (si alguien lo cambió en Configuración › Listas, se respeta).

with nuevos (codigo, nombre, grupo, orden) as (values
  ('ANU', 'Anual', 'preventivo', 14),
  ('TRF', 'Transferencia', 'preventivo', 15),
  ('EVE', 'Evaluaciones especiales', 'preventivo', 16),
  ('ESP', 'Consulta especializada', 'no_preventivo', 27),
  ('EXT', 'Consulta externa', 'no_preventivo', 28),
  ('PREOP', 'Preoperatorio', 'no_preventivo', 29),
  ('ENF', 'Enfermería', 'no_preventivo', 30),
  ('URG', 'Urgencia', 'no_preventivo', 31),
  ('ALT', 'Alta médica', 'no_preventivo', 32),
  ('EVO', 'Evolución', 'no_preventivo', 33),
  ('CMV', 'Certificado médico vial', 'no_preventivo', 34),
  ('CMS', 'Certificado médico de salud', 'no_preventivo', 35),
  ('OPS', 'Operativo de salud', 'no_preventivo', 36),
  ('DOM', 'Atención domiciliaria', 'no_preventivo', 37)
),
base as (
  insert into public.lista_items (lista, org_id, codigo, nombre, grupo, orden)
  select 'motivo_consulta', null, n.codigo, n.nombre, n.grupo, n.orden from nuevos n
  where not exists (select 1 from public.lista_items i where i.lista = 'motivo_consulta' and i.org_id is null and i.codigo = n.codigo)
  returning id, codigo, nombre, grupo, orden
)
insert into public.lista_items (lista, org_id, codigo, nombre, grupo, orden, base_id)
select 'motivo_consulta', o.id, b.codigo, b.nombre, b.grupo, b.orden, b.id
from base b cross join public.organizaciones o
where not exists (select 1 from public.lista_items i where i.lista = 'motivo_consulta' and i.org_id = o.id and i.codigo = b.codigo);

update public.lista_items set grupo = 'no_preventivo'
where lista = 'motivo_consulta' and codigo = 'ADP' and grupo = 'preventivo';
