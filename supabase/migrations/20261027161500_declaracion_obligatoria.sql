-- zamorApp Ocupacional · Lista de enfermedades ocupacionales (NT-02-2008, Anexo 1, codificación 2007)
-- Lista editable por organización (Configuración › Listas) que la consulta compara por código CIE-10:
-- declaración ante el INPSASEL en 24 h (LOPCYMAT art. 73, Reglamento art. 84) e informe de investigación
-- en 15 días continuos si el diagnóstico está en esta lista y en 30 si no (NT-02, Título IV, cap. II, 5.2.3).
-- La lista epidemiológica del MPPS es diagnostico_declarable (20261027160000).
-- codigo: uno o varios códigos CIE-10 separados por coma; «A15-A19» es un rango y «!Z56.0» excluye.
-- grupo: categoría del Anexo 1.

insert into public.listas (codigo, nombre, descripcion) values
  ('declaracion_ocupacional', 'Enfermedades ocupacionales (NT-02, Anexo 1)', 'Declaración ante el INPSASEL en 24 h; informe NT-02 en 15 días')
on conflict (codigo) do nothing;

insert into public.lista_items (lista, codigo, nombre, grupo, orden) values
  -- 010 Trastornos musculoesqueléticos
  ('declaracion_ocupacional', 'M54.5', 'Lumbago no especificado', '010 Trastornos musculoesqueléticos', 101),
  ('declaracion_ocupacional', 'M50', 'Trastorno del disco intervertebral', '010 Trastornos musculoesqueléticos', 102),
  ('declaracion_ocupacional', 'G56.0', 'Síndrome del túnel del carpo', '010 Trastornos musculoesqueléticos', 103),
  ('declaracion_ocupacional', 'M70', 'Trastornos de los tejidos blandos relacionados con el uso, el uso excesivo y la presión', '010 Trastornos musculoesqueléticos', 104),
  ('declaracion_ocupacional', 'M75', 'Lesiones de hombro', '010 Trastornos musculoesqueléticos', 105),
  ('declaracion_ocupacional', 'M77', 'Epicondilitis', '010 Trastornos musculoesqueléticos', 106),
  ('declaracion_ocupacional', 'M65', 'Sinovitis y tendinitis', '010 Trastornos musculoesqueléticos', 108),
  ('declaracion_ocupacional', 'M50.1', 'Trastorno del disco cervical con radiculopatía', '010 Trastornos musculoesqueléticos', 109),
  ('declaracion_ocupacional', 'M50.8', 'Otros trastornos del disco cervical', '010 Trastornos musculoesqueléticos', 110),
  ('declaracion_ocupacional', 'M51.1', 'Trastornos del disco lumbar con radiculopatía', '010 Trastornos musculoesqueléticos', 111),
  ('declaracion_ocupacional', 'M51.9', 'Trastornos de los discos intervertebrales no específicos', '010 Trastornos musculoesqueléticos', 112),
  ('declaracion_ocupacional', 'M70.1', 'Bursitis de mano', '010 Trastornos musculoesqueléticos', 113),
  ('declaracion_ocupacional', 'M70.2', 'Bursitis del olécranon', '010 Trastornos musculoesqueléticos', 114),
  ('declaracion_ocupacional', 'M70.3', 'Otras bursitis de codo', '010 Trastornos musculoesqueléticos', 115),
  ('declaracion_ocupacional', 'M70.5', 'Bursitis de la rodilla', '010 Trastornos musculoesqueléticos', 116),
  ('declaracion_ocupacional', 'M70.8', 'Otros trastornos de los tejidos blandos relacionados con el uso, el uso excesivo y la presión', '010 Trastornos musculoesqueléticos', 117),
  ('declaracion_ocupacional', 'M75.1', 'Síndrome del manguito rotador', '010 Trastornos musculoesqueléticos', 118),
  ('declaracion_ocupacional', 'M75.5', 'Bursitis de hombro', '010 Trastornos musculoesqueléticos', 119),
  ('declaracion_ocupacional', 'M75.9', 'Lesiones de hombro no especificadas', '010 Trastornos musculoesqueléticos', 120),
  ('declaracion_ocupacional', 'M65.3', 'Dedo en gatillo', '010 Trastornos musculoesqueléticos', 121),
  ('declaracion_ocupacional', 'M65.4', 'Tenosinovitis de estiloides radial (De Quervain)', '010 Trastornos musculoesqueléticos', 122),
  ('declaracion_ocupacional', 'M65.9', 'Sinovitis y tenosinovitis no especificadas', '010 Trastornos musculoesqueléticos', 123),
  -- 020 Afecciones auditivas
  ('declaracion_ocupacional', 'H90.3', 'Hipoacusia neurosensorial bilateral', '020 Afecciones auditivas', 201),
  ('declaracion_ocupacional', 'H60.3', 'Otras otitis externas infecciosas (por exposición ocupacional)', '020 Afecciones auditivas', 202),
  ('declaracion_ocupacional', 'H91.0', 'Hipoacusia ototóxica', '020 Afecciones auditivas', 203),
  ('declaracion_ocupacional', 'H90.4', 'Hipoacusia neurosensorial unilateral con audición irrestricta contralateral', '020 Afecciones auditivas', 204),
  -- 030 Enfermedades de las cuerdas vocales
  ('declaracion_ocupacional', 'R49.0', 'Disfonías', '030 Enfermedades de las cuerdas vocales', 301),
  ('declaracion_ocupacional', 'J38.1', 'Pólipos de las cuerdas vocales', '030 Enfermedades de las cuerdas vocales', 302),
  ('declaracion_ocupacional', 'J38.7', 'Otras enfermedades de las cuerdas vocales', '030 Enfermedades de las cuerdas vocales', 303),
  -- 040 Patologías por exposición a sustancias
  ('declaracion_ocupacional', 'T56.0', 'Patologías por exposición a plomo (inorgánico u orgánico)', '040 Patologías por exposición a sustancias', 401),
  ('declaracion_ocupacional', 'T56.1', 'Patologías por exposición a mercurio', '040 Patologías por exposición a sustancias', 403),
  ('declaracion_ocupacional', 'T56.2', 'Patologías por exposición a cromo', '040 Patologías por exposición a sustancias', 404),
  ('declaracion_ocupacional', 'T56.8', 'Patologías por exposición a otros metales', '040 Patologías por exposición a sustancias', 405),
  ('declaracion_ocupacional', 'T60', 'Patologías por exposición a plaguicidas', '040 Patologías por exposición a sustancias', 406),
  ('declaracion_ocupacional', 'T52', 'Patologías por exposición a solventes', '040 Patologías por exposición a sustancias', 407),
  ('declaracion_ocupacional', 'J68', 'Patologías por exposición a gases y vapores', '040 Patologías por exposición a sustancias', 408),
  -- 050 Afecciones del aparato respiratorio
  ('declaracion_ocupacional', 'J45', 'Asma', '050 Afecciones del aparato respiratorio', 501),
  ('declaracion_ocupacional', 'J67.8', 'Neumonitis debidas a hipersensibilidad a otros polvos orgánicos', '050 Afecciones del aparato respiratorio', 502),
  ('declaracion_ocupacional', 'J64', 'Neumoconiosis no especificada', '050 Afecciones del aparato respiratorio', 504),
  ('declaracion_ocupacional', 'J63.4', 'Siderosis', '050 Afecciones del aparato respiratorio', 505),
  ('declaracion_ocupacional', 'J66.0', 'Bisinosis', '050 Afecciones del aparato respiratorio', 506),
  ('declaracion_ocupacional', 'J39', 'Trastorno de las vías respiratorias superiores', '050 Afecciones del aparato respiratorio', 507),
  ('declaracion_ocupacional', 'J62', 'Silicosis', '050 Afecciones del aparato respiratorio', 508),
  ('declaracion_ocupacional', 'J61', 'Asbestosis', '050 Afecciones del aparato respiratorio', 509),
  ('declaracion_ocupacional', 'J67.1', 'Bagazosis', '050 Afecciones del aparato respiratorio', 510),
  -- 060 Afecciones de la piel
  ('declaracion_ocupacional', 'L23', 'Dermatitis alérgica de contacto', '060 Afecciones de la piel', 601),
  ('declaracion_ocupacional', 'L24', 'Dermatitis de contacto por irritantes', '060 Afecciones de la piel', 602),
  ('declaracion_ocupacional', 'L08.9', 'Infección local de la piel y del tejido subcutáneo no especificada', '060 Afecciones de la piel', 603),
  -- 070 Afecciones por factores psicosociales
  ('declaracion_ocupacional', 'F41', 'Estrés ocupacional', '070 Afecciones por factores psicosociales', 701),
  ('declaracion_ocupacional', 'F43', 'Fatiga laboral', '070 Afecciones por factores psicosociales', 702),
  ('declaracion_ocupacional', 'F45', 'Agotamiento emocional (síndrome de burnout)', '070 Afecciones por factores psicosociales', 703),
  ('declaracion_ocupacional', 'F48, Z56, !Z56.0', 'Respuesta a acoso laboral (mobbing)', '070 Afecciones por factores psicosociales', 704),
  ('declaracion_ocupacional', 'F51', 'Trastornos no orgánicos del sueño', '070 Afecciones por factores psicosociales', 705),
  -- 080 Afecciones por radiaciones
  ('declaracion_ocupacional', 'W88', 'Exposición a radiaciones ionizantes (excepto neoplasias)', '080 Afecciones por radiaciones', 801),
  ('declaracion_ocupacional', null, 'Lesiones por radiaciones térmicas (excepto neoplasias)', '080 Afecciones por radiaciones', 802),
  ('declaracion_ocupacional', 'W90', 'Exposición a radiaciones no ionizantes (excepto neoplasias)', '080 Afecciones por radiaciones', 803),
  -- 090 Neoplasias ocupacionales
  ('declaracion_ocupacional', 'C34.9', 'Tumor maligno de los bronquios o del pulmón, parte no especificada', '090 Neoplasias ocupacionales', 901),
  ('declaracion_ocupacional', 'C32.9', 'Tumor maligno de la laringe, parte no especificada', '090 Neoplasias ocupacionales', 902),
  ('declaracion_ocupacional', 'C44.9', 'Tumor maligno de la piel, sitio no especificado', '090 Neoplasias ocupacionales', 903),
  ('declaracion_ocupacional', 'C96.9', 'Tumor maligno del tejido linfático, hematopoyético y tejidos afines', '090 Neoplasias ocupacionales', 904),
  -- 110 Afecciones por temperaturas extremas
  ('declaracion_ocupacional', 'W92', 'Exposición a calor excesivo de origen artificial', '110 Afecciones por temperaturas extremas', 1101),
  ('declaracion_ocupacional', 'W93', 'Exposición a frío excesivo de origen artificial', '110 Afecciones por temperaturas extremas', 1102),;

-- Cada organización recibe su copia editable
select public.copiar_listas_base(id) from public.organizaciones;
