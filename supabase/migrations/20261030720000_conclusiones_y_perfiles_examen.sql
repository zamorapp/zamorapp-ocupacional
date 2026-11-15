-- zamorApp Ocupacional · Conclusiones frecuentes y perfiles de examen físico (pedido de Cesar, 30/10/2026)
-- 1) Conclusiones: frases cortas de médico ocupacional para el trabajador sano y apto. La consulta las muestra como
--    chips sobre el campo «Conclusiones» (igual que las recomendaciones); «grupo» = motivos (PRE, EGR…), vacío = todos.
-- 2) Perfiles de examen físico: hernia umbilical, anillo umbilical, hernia inguinal y escoliosis. Lo que va entre llaves
--    {derecha|izquierda} se elige al aplicar el perfil; la primera opción es la que se usa si nadie elige (plantillas).
-- Todo queda editable en Configuración › Listas. No toca consultas ya escritas.

-- Las conclusiones son texto clínico: RR. HH. no las lee (misma regla que los perfiles de examen)
create or replace function public.lista_clinica(p_lista text)
returns boolean language sql immutable as $$
  select p_lista in ('grupo_paraclinicos', 'paraclinico', 'perfil_examen_fisico', 'perfil_examen_funcional', 'examen_fisico', 'examen_funcional',
    'medicina', 'presentacion_medicina', 'via_administracion', 'frecuencia_dosis', 'duracion_tratamiento', 'antecedente_medico', 'habito',
    'sistema_organico', 'diagnostico_declarable', 'modelo_informe_libre', 'recomendacion_paciente', 'especialidad', 'conclusion_consulta')
$$;

-- Listas: solo en la nube. En la base local de la PC llegan por la réplica con los ids de la nube.
do $$
begin
  if public.es_base_local() then return; end if;

  insert into public.listas (codigo, nombre, descripcion) values
    ('conclusion_consulta', 'Conclusiones frecuentes', 'Frases que se pegan en «Conclusiones» de la consulta. Grupo: motivos separados por coma (PRE,PER); vacío = todos')
  on conflict (codigo) do nothing;
  update public.listas set descripcion = 'Hallazgos que se aplican de una vez. Una línea por fila: «Fila: hallazgo». Para elegir al aplicar: {derecha|izquierda}'
  where codigo = 'perfil_examen_fisico';

  insert into public.lista_items (lista, codigo, nombre, grupo, texto, orden)
  select v.lista, v.codigo, v.nombre, v.grupo, v.texto, v.orden
  from (values
    ('conclusion_consulta', 'sano_apto', 'Sano, apto sin restricciones', null,
     'Trabajador clínicamente sano al momento de la evaluación. Apto para el cargo sin restricciones.', 1),
    ('conclusion_consulta', 'sin_hallazgos', 'Sin hallazgos patológicos', null,
     'Examen físico y paraclínicos dentro de límites normales, sin hallazgos que contraindiquen el desempeño del cargo.', 2),
    ('conclusion_consulta', 'compatible_riesgos', 'Compatible con los riesgos del puesto', null,
     'Condición de salud compatible con las exigencias físicas y los riesgos del puesto de trabajo.', 3),
    ('conclusion_consulta', 'sin_enfermedad_ocupacional', 'Sin enfermedad ocupacional', null,
     'Sin evidencia clínica de enfermedad de origen ocupacional.', 4),
    ('conclusion_consulta', 'apto_ingreso', 'Apto para ingresar', 'PRE',
     'Apto para ingresar al cargo. Continuar vigilancia médica periódica según los riesgos del puesto.', 5),
    ('conclusion_consulta', 'periodico_estable', 'Estado de salud estable', 'PER,PREV,POSV',
     'Estado de salud estable respecto a la evaluación anterior. Mantiene aptitud para el cargo.', 6),
    ('conclusion_consulta', 'egreso_sin_alteraciones', 'Egreso sin alteraciones', 'EGR',
     'Egresa sin evidencia de enfermedad ocupacional ni secuelas de accidente laboral.', 7),
    ('conclusion_consulta', 'reintegro_recuperado', 'Recuperado, se reintegra', 'REI',
     'Clínicamente recuperado. Apto para reintegrarse a sus labores habituales sin restricciones.', 8),
    ('perfil_examen_fisico', 'hernia_umbilical', 'Hernia umbilical (sugestiva)', null,
     'Hernias: Se palpa en cicatriz umbilical defecto aponeurótico que sugiere hernia umbilical; se recomienda descartar proceso herniario.', 10),
    ('perfil_examen_fisico', 'anillo_umbilical', 'Anillo umbilical sin protrusión', null,
     'Hernias: Se palpa anillo umbilical en cicatriz umbilical, sin protrusión de contenido herniario a la maniobra de Valsalva.', 11),
    ('perfil_examen_fisico', 'hernia_inguinal', 'Hernia inguinal (elegir lado)', null,
     'Hernias: Región inguinal {derecha|izquierda}: se palpa anillo inguinal con defecto aponeurótico y protrusión de contenido intraabdominal a la maniobra de Valsalva, sugestivo de hernia inguinal.', 12),
    ('perfil_examen_fisico', 'escoliosis', 'Escoliosis (elegir nivel)', null,
     'Columna: Escoliosis {dorsal|lumbar|dorsolumbar|cervical} de convexidad {derecha|izquierda}, evidenciada a la inspección y a la flexión anterior del tronco (prueba de Adams).', 13)
  ) v (lista, codigo, nombre, grupo, texto, orden)
  where not exists (select 1 from public.lista_items b where b.org_id is null and b.lista = v.lista and b.codigo = v.codigo);

  -- Cada organización recibe su copia editable (Configuración › Listas)
  perform public.copiar_listas_base(id) from public.organizaciones;
end $$;
