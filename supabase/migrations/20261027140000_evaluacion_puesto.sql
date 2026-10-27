-- zamorApp Ocupacional · Informe de evaluación del puesto de trabajo
-- El puesto ya tenía tareas, herramientas y la matriz 5×5 (puestos.evaluacion {"grupo|agente": {p, s, control}}).
-- Se agregan el EPP requerido, las recomendaciones y quién y cuándo hizo la última evaluación, para imprimir el informe.

alter table public.puestos
  add column if not exists epp text,
  add column if not exists recomendaciones text,
  add column if not exists evaluado_por uuid references auth.users (id) on delete set null,
  add column if not exists evaluado_en date;
