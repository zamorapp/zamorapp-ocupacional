-- zamorApp Ocupacional · Plantillas de examen por tipo (pre-empleo, periódico, egreso, reintegro…)
-- Una plantilla por motivo de consulta: al elegir el motivo, la consulta se llena con los perfiles de examen,
-- las recomendaciones preseleccionadas, las conclusiones base y la vigencia de la aptitud.
-- Sin tablas nuevas: lista «plantilla_examen» en lista_items, codigo = código del motivo (PRE, PER…) y en datos:
--   {funcional, fisico: codigo del perfil_examen_*; aptitud, empresa, trabajador: [codigos de recomendacion_*];
--    meses: vigencia de la aptitud; conclusiones: texto base}
-- Se referencian por código (no por id) para que sirvan igual en la copia de cada organización.
-- Los paraclínicos por empresa y tipo de examen son de los perfiles de paraclínicos (grupo_paraclinicos).

insert into public.listas (codigo, nombre, descripcion, editable) values
  ('plantilla_examen', 'Plantillas de examen por tipo', 'Se editan en Configuración › Plantillas de examen', false)
on conflict (codigo) do nothing;

insert into public.lista_items (lista, codigo, nombre, orden, datos)
select 'plantilla_examen', x.codigo, x.nombre, x.orden, x.datos::jsonb
from (values
  ('PRE', 'Pre-empleo', 1, '{"funcional":"normal","fisico":"normal","aptitud":["pre_induccion"],"empresa":["emp_notificacion","emp_induccion","emp_epp","emp_periodico"],"trabajador":["pac_epp","pac_paraclinicos"],"meses":12,"conclusiones":""}'),
  ('PER', 'Periódico', 2, '{"funcional":"normal","fisico":"normal","aptitud":["per_sin_cambios"],"empresa":["emp_epp","emp_periodico"],"trabajador":["pac_epp"],"meses":12,"conclusiones":""}'),
  ('EGR', 'Egreso', 3, '{"funcional":"normal","fisico":"normal","aptitud":["egr_sin_hallazgos"],"empresa":["emp_egreso"],"trabajador":[],"meses":null,"conclusiones":""}'),
  ('REI', 'Reintegro post reposo', 4, '{"funcional":"normal","fisico":"normal","aptitud":["rei_apto"],"empresa":["emp_periodico"],"trabajador":[],"meses":12,"conclusiones":""}')
) as x(codigo, nombre, orden, datos)
where not exists (select 1 from public.lista_items i where i.lista = 'plantilla_examen' and i.org_id is null and i.codigo = x.codigo);

-- Copia las plantillas (y cualquier base pendiente, como los modelos de informe libre) a cada organización
select public.copiar_listas_base(id) from public.organizaciones;
