-- zamorApp Ocupacional · Stock de textos frecuentes por motivo de consulta
-- En las listas de recomendaciones, "grupo" guarda los códigos de motivo separados por coma
-- (PRE, PER, EGR…). Vacío = sirve para cualquier motivo.

update public.lista_items set grupo = 'PRE'  where lista = 'recomendacion_aptitud' and codigo = 'preempleo';
update public.lista_items set grupo = 'POSV' where lista = 'recomendacion_aptitud' and codigo = 'postvacacional';
update public.lista_items set grupo = 'EGR'  where lista = 'recomendacion_aptitud' and codigo = 'egreso';
update public.lista_items set grupo = 'PER'  where lista = 'recomendacion_aptitud' and codigo = 'apto';

insert into public.lista_items (lista, codigo, nombre, grupo, texto, orden) values
  -- ── Recomendaciones de aptitud ──
  ('recomendacion_aptitud', 'pre_restriccion', 'Pre-empleo con restricciones', 'PRE', 'Apto para el cargo con las restricciones indicadas. La empresa debe adecuar las tareas del puesto antes del inicio de labores.', 10),
  ('recomendacion_aptitud', 'pre_espera', 'Pre-empleo en espera de resultados', 'PRE', 'La aptitud queda en espera de los resultados de los exámenes paraclínicos solicitados. No debe iniciar labores hasta su entrega.', 11),
  ('recomendacion_aptitud', 'pre_induccion', 'Inducción y notificación de riesgos', 'PRE', 'Antes del inicio de labores debe recibir la inducción y la notificación de riesgos del puesto (LOPCYMAT art. 53 y 56).', 12),
  ('recomendacion_aptitud', 'per_sin_cambios', 'Periódico sin cambios', 'PER', 'Sin cambios en su condición de salud respecto a la evaluación anterior. Continúa apto para el cargo.', 20),
  ('recomendacion_aptitud', 'per_control', 'Periódico con control', 'PER', 'Continúa apto para el cargo. Requiere control médico de los hallazgos señalados en la próxima evaluación.', 21),
  ('recomendacion_aptitud', 'prev_apto', 'Pre vacacional', 'PREV', 'Se evalúa el estado de salud antes del periodo vacacional como referencia para la evaluación de retorno.', 30),
  ('recomendacion_aptitud', 'posv_hallazgos', 'Post vacacional con hallazgos', 'POSV', 'Presenta hallazgos no atribuibles a las condiciones de trabajo. Puede reincorporarse con control por su médico tratante.', 31),
  ('recomendacion_aptitud', 'rei_apto', 'Reintegro post reposo', 'REI', 'Culminado el reposo, se encuentra en condiciones de reincorporarse a sus labores habituales.', 40),
  ('recomendacion_aptitud', 'rei_gradual', 'Reintegro progresivo', 'REI', 'Puede reincorporarse con las limitaciones indicadas de forma temporal, con revisión médica al vencer su vigencia.', 41),
  ('recomendacion_aptitud', 'egr_sin_hallazgos', 'Egreso sin hallazgos', 'EGR', 'Al momento del egreso no se evidencian alteraciones de salud relacionadas con el trabajo.', 50),
  ('recomendacion_aptitud', 'egr_con_hallazgos', 'Egreso con hallazgos', 'EGR', 'Al momento del egreso presenta los hallazgos descritos, de los cuales se deja constancia en su historia.', 51),
  ('recomendacion_aptitud', 'cam_apto', 'Cambio de puesto', 'CAM,REU', 'Apto para el nuevo perfil de riesgo del cargo. Debe recibir la notificación de riesgos del nuevo puesto.', 60),

  -- ── Recomendaciones para la empresa ──
  ('recomendacion_empresa', 'emp_notificacion', 'Notificación de riesgos', 'PRE,CAM,REU', 'Notificar por escrito los riesgos del puesto y las medidas de prevención antes del inicio de labores.', 1),
  ('recomendacion_empresa', 'emp_induccion', 'Inducción en SST', 'PRE', 'Cumplir la inducción en seguridad y salud en el trabajo y dejar constancia firmada.', 2),
  ('recomendacion_empresa', 'emp_epp', 'Dotación de EPP', 'PRE,PER,CAM', 'Dotar y supervisar el uso del equipo de protección personal según la matriz de riesgos del puesto.', 3),
  ('recomendacion_empresa', 'emp_pausas', 'Pausas activas', '', 'Implementar pausas activas de 5 a 10 minutos cada 2 horas en tareas repetitivas o de postura mantenida.', 4),
  ('recomendacion_empresa', 'emp_cargas', 'Manejo de cargas', '', 'Evitar el levantamiento manual de cargas mayores a 23 kg; usar ayudas mecánicas y trabajo en equipo.', 5),
  ('recomendacion_empresa', 'emp_ruido', 'Conservación auditiva', 'PER', 'Mantener el programa de conservación auditiva y la audiometría anual en puestos con exposición a ruido.', 6),
  ('recomendacion_empresa', 'emp_periodico', 'Programar examen periódico', 'PRE,PER,POSV,REI', 'Programar la próxima evaluación médica periódica según la vigencia indicada.', 7),
  ('recomendacion_empresa', 'emp_restricciones', 'Respetar restricciones', 'REI,REU,ADP', 'Respetar las limitaciones indicadas durante su vigencia y notificar cualquier cambio de puesto al servicio médico.', 8),
  ('recomendacion_empresa', 'emp_reubicacion', 'Evaluar reubicación', 'REU,ADP', 'Evaluar la reubicación temporal en un puesto compatible con las limitaciones señaladas.', 9),
  ('recomendacion_empresa', 'emp_egreso', 'Archivo de egreso', 'EGR', 'Archivar la constancia de egreso en el expediente del trabajador como evidencia de su estado de salud al salir.', 10),

  -- ── Recomendaciones para el trabajador ──
  ('recomendacion_paciente', 'pac_epp', 'Uso de EPP', 'PRE,PER', 'Usar en todo momento el equipo de protección personal asignado.', 1),
  ('recomendacion_paciente', 'pac_higiene_postural', 'Higiene postural', '', 'Mantener higiene postural: espalda recta, flexionar rodillas al levantar objetos y evitar giros del tronco con carga.', 2),
  ('recomendacion_paciente', 'pac_hidratacion', 'Hidratación', '', 'Mantener hidratación adecuada, al menos 2 litros de agua al día.', 3),
  ('recomendacion_paciente', 'pac_dieta', 'Alimentación balanceada', '', 'Alimentación balanceada, baja en grasas, azúcares y sal.', 4),
  ('recomendacion_paciente', 'pac_ejercicio', 'Actividad física', '', 'Realizar actividad física regular de al menos 30 minutos, 5 días a la semana.', 5),
  ('recomendacion_paciente', 'pac_ta', 'Control de tensión arterial', '', 'Control periódico de la tensión arterial y consulta con medicina interna o cardiología.', 6),
  ('recomendacion_paciente', 'pac_glicemia', 'Glicemia alterada', '', 'Control de glicemia y evaluación por medicina interna. Reducir el consumo de azúcares.', 7),
  ('recomendacion_paciente', 'pac_lipidos', 'Dislipidemia', '', 'Control de colesterol y triglicéridos; dieta baja en grasas y actividad física.', 8),
  ('recomendacion_paciente', 'pac_obesidad', 'Sobrepeso u obesidad', '', 'Plan de reducción de peso con orientación nutricional y actividad física.', 9),
  ('recomendacion_paciente', 'pac_tabaco', 'Cese del tabaco', '', 'Abandonar el hábito tabáquico; puede solicitar orientación en el servicio médico.', 10),
  ('recomendacion_paciente', 'pac_reposo', 'Cumplir el reposo', 'MOR,ACL,ACC,REI', 'Cumplir el reposo y el tratamiento indicados; acudir a control antes del reintegro.', 11),
  ('recomendacion_paciente', 'pac_paraclinicos', 'Consignar paraclínicos', 'PRE', 'Consignar los resultados de los exámenes paraclínicos solicitados en el servicio médico.', 12),
  ('recomendacion_paciente', 'pac_control', 'Control con especialista', '', 'Acudir a la consulta del especialista indicado y traer el informe al servicio médico.', 13);

-- Copia los textos nuevos a cada organización y alinea los grupos de las copias existentes
select public.copiar_listas_base(id) from public.organizaciones;
update public.lista_items o set grupo = b.grupo
from public.lista_items b
where o.base_id = b.id and o.lista like 'recomendacion_%' and o.grupo is distinct from b.grupo;
