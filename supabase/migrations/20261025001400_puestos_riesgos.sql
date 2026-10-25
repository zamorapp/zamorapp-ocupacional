-- zamorApp Ocupacional · Puestos de trabajo y matriz de riesgos
-- puestos.riesgos sigue siendo {grupo: [agente]} (lo leen la ficha, la consulta y la constancia).
-- puestos.evaluacion guarda la valoración 5×5 de cada agente: {"grupo|agente": {p, s, control}}.

alter table public.puestos
  add column if not exists evaluacion jsonb not null default '{}'::jsonb,
  add column if not exists tareas text,
  add column if not exists herramientas text;

-- Catálogo de agentes de riesgo por grupo (grupo = fisico, quimico, biologico, mecanico, disergonomico, psicosocial)
insert into public.listas (codigo, nombre, descripcion) values
  ('agente_riesgo', 'Agentes de riesgo', 'Catálogo para la matriz de riesgos del puesto; el grupo es el tipo de riesgo')
on conflict (codigo) do nothing;

insert into public.lista_items (lista, grupo, nombre, orden) values
  ('agente_riesgo', 'fisico', 'Ruido', 1), ('agente_riesgo', 'fisico', 'Vibración', 2), ('agente_riesgo', 'fisico', 'Iluminación deficiente', 3),
  ('agente_riesgo', 'fisico', 'Calor', 4), ('agente_riesgo', 'fisico', 'Frío', 5), ('agente_riesgo', 'fisico', 'Radiación no ionizante (sol, soldadura)', 6),
  ('agente_riesgo', 'fisico', 'Radiación ionizante', 7), ('agente_riesgo', 'fisico', 'Electricidad', 8),
  ('agente_riesgo', 'quimico', 'Polvos', 10), ('agente_riesgo', 'quimico', 'Humos metálicos', 11), ('agente_riesgo', 'quimico', 'Gases y vapores', 12),
  ('agente_riesgo', 'quimico', 'Solventes', 13), ('agente_riesgo', 'quimico', 'Ácidos y álcalis', 14), ('agente_riesgo', 'quimico', 'Plaguicidas', 15),
  ('agente_riesgo', 'quimico', 'Productos de limpieza y desinfección', 16), ('agente_riesgo', 'quimico', 'Combustibles', 17),
  ('agente_riesgo', 'biologico', 'Virus', 20), ('agente_riesgo', 'biologico', 'Bacterias', 21), ('agente_riesgo', 'biologico', 'Hongos', 22),
  ('agente_riesgo', 'biologico', 'Fluidos corporales', 23), ('agente_riesgo', 'biologico', 'Desechos orgánicos', 24), ('agente_riesgo', 'biologico', 'Animales y vectores', 25),
  ('agente_riesgo', 'mecanico', 'Atrapamiento', 30), ('agente_riesgo', 'mecanico', 'Cortes y pinchazos', 31), ('agente_riesgo', 'mecanico', 'Caídas al mismo nivel', 32),
  ('agente_riesgo', 'mecanico', 'Caídas de altura', 33), ('agente_riesgo', 'mecanico', 'Golpes y choques', 34), ('agente_riesgo', 'mecanico', 'Proyección de partículas', 35),
  ('agente_riesgo', 'mecanico', 'Accidente de tránsito', 36), ('agente_riesgo', 'mecanico', 'Caída de objetos', 37), ('agente_riesgo', 'mecanico', 'Incendio y explosión', 38),
  ('agente_riesgo', 'disergonomico', 'Levantamiento manual de cargas', 40), ('agente_riesgo', 'disergonomico', 'Posturas forzadas', 41),
  ('agente_riesgo', 'disergonomico', 'Movimientos repetitivos', 42), ('agente_riesgo', 'disergonomico', 'Bipedestación prolongada', 43),
  ('agente_riesgo', 'disergonomico', 'Sedestación prolongada', 44), ('agente_riesgo', 'disergonomico', 'Uso de pantallas', 45), ('agente_riesgo', 'disergonomico', 'Empuje y arrastre', 46),
  ('agente_riesgo', 'psicosocial', 'Carga mental', 50), ('agente_riesgo', 'psicosocial', 'Turnos nocturnos o rotativos', 51), ('agente_riesgo', 'psicosocial', 'Jornadas extendidas', 52),
  ('agente_riesgo', 'psicosocial', 'Trabajo monótono', 53), ('agente_riesgo', 'psicosocial', 'Atención al público', 54), ('agente_riesgo', 'psicosocial', 'Acoso laboral', 55),
  ('agente_riesgo', 'psicosocial', 'Violencia o inseguridad', 56);

select public.copiar_listas_base(id) from public.organizaciones;
