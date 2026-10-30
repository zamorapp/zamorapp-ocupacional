-- zamorApp Ocupacional · Informe de vigilancia: recomendaciones médico-ocupacionales aparte de las de seguridad
-- y salud en el trabajo (recomendaciones). Vacía = el informe usa la sugerida por el analizador.
-- Y la visión personal del médico, que complementa al analizador y a la IA.
-- informes_vigilancia se copia al escritorio por fila completa: la columna nueva viaja sola.
alter table public.informes_vigilancia add column if not exists recomendaciones_medicas text;
-- Visión personal del médico ocupacional: texto propio, sin sugerencia; sale en el informe solo si se escribió
alter table public.informes_vigilancia add column if not exists vision_medico text;
