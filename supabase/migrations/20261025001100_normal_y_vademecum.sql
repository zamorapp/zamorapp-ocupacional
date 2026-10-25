-- zamorApp Ocupacional · Ignorar alertas, examen normal descriptivo y vademécum ampliado

-- ─── 1. Ignorar la alerta de datos legales de una empresa ───
alter table public.empresas add column if not exists ignorar_alerta_legal boolean not null default false;

-- ─── 2. Perfiles "normal" con descripción completa (código 'normal') ───
insert into public.lista_items (lista, codigo, nombre, grupo, texto, orden) values
  ('perfil_examen_fisico', 'normal', 'Evaluación física normal', null, E'Piel: Piel normocoloreada, hidratada, sin lesiones aparentes
Cabeza: Normocéfalo, sin lesiones ni masas palpables
Ojos: Pupilas isocóricas, normorreactivas a la luz; conjuntivas rosadas, escleras anictéricas
Oídos: Conductos auditivos permeables, membranas timpánicas íntegras y nacaradas
Nariz: Fosas nasales permeables, mucosa rosada, sin secreciones
Boca y faringe: Mucosa oral húmeda, faringe sin hiperemia ni exudados; ORL sin alteraciones
Cuello: Móvil, sin adenopatías; tiroides no palpable
Tórax: Simétrico, normoexpansible
Cardiovascular: Ruidos cardíacos rítmicos, regulares y normofonéticos, sin soplos ni galopes
Pulmonar: Ruidos respiratorios presentes en ambos campos pulmonares, sin agregados
Abdomen: Plano, blando, depresible, no doloroso a la palpación; ruidos hidroaéreos presentes; sin visceromegalias
Hernias: Se revisan regiones susceptibles de defectos aponeuróticos sin lesiones aparentes ni indicios de defectos de pared
Genitourinario: Puño percusión lumbar negativa bilateral
Columna: Alineada, sin dolor a la palpación; movilidad conservada
Miembros superiores: Simétricos, eutróficos, fuerza y movilidad conservadas; pulsos presentes
Miembros inferiores: Simétricos, eutróficos, sin edema ni várices; fuerza y movilidad conservadas
Neurológico: Consciente, orientado en tiempo, espacio y persona; sin déficit motor ni sensitivo; reflejos conservados
Estado mental: Lenguaje coherente, juicio y pensamiento conservados; afecto adecuado
Sistema linfático: Sin adenopatías palpables', 0),
  ('perfil_examen_funcional', 'normal', 'Evaluación funcional normal', null, E'General: Niega astenia, fiebre o pérdida de peso
Neurológico: Niega cefalea, mareos o parestesias
Órganos de los sentidos: Niega alteraciones visuales, auditivas u olfativas
Cardiovascular: Niega dolor torácico, palpitaciones o disnea de esfuerzo
Respiratorio: Niega tos, expectoración o dificultad respiratoria
Digestivo: Niega dolor abdominal, náuseas o alteraciones del hábito evacuatorio
Genitourinario: Niega disuria, polaquiuria o hematuria
Osteomuscular: Niega dolor articular o muscular, o limitación funcional
Piel y anexos: Niega lesiones, prurito o alteraciones de faneras', 0);

-- ─── 3. Parámetros de tratamiento ───
insert into public.lista_items (lista, codigo, nombre, orden) values
  ('presentacion_medicina', 'susp', 'Suspensión', 7), ('presentacion_medicina', 'ungu', 'Ungüento', 8),
  ('presentacion_medicina', 'gel', 'Gel', 9), ('presentacion_medicina', 'inhal', 'Inhalador', 10),
  ('presentacion_medicina', 'supos', 'Supositorio', 11), ('presentacion_medicina', 'sobre', 'Sobre', 12),
  ('presentacion_medicina', 'gotas_of', 'Gotas oftálmicas', 13), ('presentacion_medicina', 'gotas_ot', 'Gotas óticas', 14),
  ('presentacion_medicina', 'spray', 'Spray nasal', 15), ('presentacion_medicina', 'parche', 'Parche', 16),
  ('presentacion_medicina', 'vial', 'Vial', 17),
  ('via_administracion', 'sc', 'Subcutánea', 7), ('via_administracion', 'oft', 'Oftálmica', 8),
  ('via_administracion', 'otica', 'Ótica', 9), ('via_administracion', 'nasal', 'Nasal', 10),
  ('via_administracion', 'rectal', 'Rectal', 11), ('via_administracion', 'vaginal', 'Vaginal', 12),
  ('frecuencia_dosis', 'c4h', 'Cada 4 horas', 0), ('frecuencia_dosis', 'c48h', 'Cada 48 horas', 6),
  ('frecuencia_dosis', 'semanal', 'Una vez por semana', 7), ('frecuencia_dosis', 'dosis_unica', 'Dosis única', 8),
  ('frecuencia_dosis', 'noche', 'En la noche', 9), ('frecuencia_dosis', 'ayunas', 'En ayunas', 10),
  ('duracion_tratamiento', '1d', '1 día', 0), ('duracion_tratamiento', '2d', '2 días', 1),
  ('duracion_tratamiento', '21d', '21 días', 7), ('duracion_tratamiento', '3m', '3 meses', 8),
  ('duracion_tratamiento', 'cont', 'Tratamiento continuo', 9), ('duracion_tratamiento', 'sos', 'Mientras dure el síntoma', 10);

-- ─── 4. Vademécum por principio activo (DCI) ───
-- "texto" guarda la indicación preestablecida, una línea por campo; el médico la ajusta en cada consulta.
create temporary table _m (nombre text, conc text, pres text, via text, dosis text, frec text, dur text, obs text) on commit drop;
insert into _m values
  -- Analgésicos y antiinflamatorios
  ('Paracetamol', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'No exceder 4 g al día'),
  ('Paracetamol', '650 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', null),
  ('Ibuprofeno', '400 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '5 días', 'Tomar después de las comidas'),
  ('Ibuprofeno', '600 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '5 días', 'Tomar después de las comidas'),
  ('Diclofenaco sódico', '50 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '5 días', 'Tomar después de las comidas'),
  ('Diclofenaco sódico', '75 mg/3 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null),
  ('Diclofenaco potásico', '50 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '5 días', 'Tomar después de las comidas'),
  ('Naproxeno', '550 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '5 días', 'Tomar después de las comidas'),
  ('Ketoprofeno', '100 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '5 días', 'Tomar después de las comidas'),
  ('Ketorolaco', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'No más de 5 días'),
  ('Ketorolaco', '30 mg/ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null),
  ('Meloxicam', '15 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '7 días', 'Tomar después de las comidas'),
  ('Celecoxib', '200 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 24 horas', '7 días', null),
  ('Metamizol sódico', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', null),
  ('Metamizol sódico', '1 g/2 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null),
  ('Tramadol', '50 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 8 horas', '3 días', 'Puede causar somnolencia'),
  ('Ácido acetilsalicílico', '81 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null),
  ('Diclofenaco', '1 %', 'Gel', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '7 días', 'Sobre la zona afectada'),
  ('Piroxicam', '20 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 24 horas', '5 días', 'Tomar después de las comidas'),
  ('Etoricoxib', '90 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', null),
  -- Relajantes musculares
  ('Ciclobenzaprina', '10 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '7 días', 'Puede causar somnolencia'),
  ('Tiocolchicósido', '4 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '5 días', null),
  ('Orfenadrina', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '5 días', null),
  ('Metocarbamol', '750 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '5 días', null),
  -- Antibióticos
  ('Amoxicilina', '500 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 8 horas', '7 días', 'Completar el tratamiento'),
  ('Amoxicilina + ácido clavulánico', '875/125 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '7 días', 'Completar el tratamiento'),
  ('Azitromicina', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '3 días', 'Completar el tratamiento'),
  ('Claritromicina', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '7 días', 'Completar el tratamiento'),
  ('Cefalexina', '500 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 6 horas', '7 días', 'Completar el tratamiento'),
  ('Cefadroxilo', '500 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '7 días', 'Completar el tratamiento'),
  ('Ciprofloxacina', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '7 días', 'Completar el tratamiento'),
  ('Levofloxacina', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '7 días', 'Completar el tratamiento'),
  ('Doxiciclina', '100 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '7 días', 'Evitar exposición solar'),
  ('Trimetoprim + sulfametoxazol', '160/800 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '7 días', 'Completar el tratamiento'),
  ('Nitrofurantoína', '100 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '7 días', null),
  ('Metronidazol', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '7 días', 'No consumir alcohol'),
  ('Clindamicina', '300 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 8 horas', '7 días', null),
  ('Penicilina benzatínica', '2.400.000 UI', 'Vial', 'Intramuscular', '1 vial', 'Dosis única', '1 día', null),
  ('Ceftriaxona', '1 g', 'Vial', 'Intramuscular', '1 vial', 'Cada 24 horas', '3 días', null),
  ('Mupirocina', '2 %', 'Ungüento', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '7 días', null),
  ('Ácido fusídico', '2 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '7 días', null),
  -- Antiparasitarios y antifúngicos
  ('Albendazol', '400 mg', 'Tableta', 'Oral', '1 tableta', 'Dosis única', '1 día', null),
  ('Mebendazol', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '3 días', null),
  ('Nitazoxanida', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '3 días', null),
  ('Secnidazol', '1 g', 'Tableta', 'Oral', '2 tabletas', 'Dosis única', '1 día', 'No consumir alcohol'),
  ('Ivermectina', '6 mg', 'Tableta', 'Oral', 'Según peso', 'Dosis única', '1 día', null),
  ('Fluconazol', '150 mg', 'Cápsula', 'Oral', '1 cápsula', 'Una vez por semana', '14 días', null),
  ('Clotrimazol', '1 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '14 días', null),
  ('Ketoconazol', '2 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '14 días', null),
  ('Terbinafina', '1 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '14 días', null),
  ('Nistatina', '100.000 UI/ml', 'Suspensión', 'Oral', '5 ml', 'Cada 6 horas', '7 días', null),
  -- Respiratorio y alergias
  ('Loratadina', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', null),
  ('Desloratadina', '5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', null),
  ('Cetirizina', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', 'Puede causar somnolencia'),
  ('Levocetirizina', '5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', null),
  ('Fexofenadina', '180 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', null),
  ('Clorfeniramina', '4 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'Puede causar somnolencia'),
  ('Difenhidramina', '50 mg/ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null),
  ('Ambroxol', '30 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '5 días', null),
  ('Ambroxol', '15 mg/5 ml', 'Jarabe', 'Oral', '10 ml', 'Cada 8 horas', '5 días', null),
  ('Acetilcisteína', '600 mg', 'Sobre', 'Oral', '1 sobre', 'Cada 24 horas', '5 días', 'Disolver en agua'),
  ('Dextrometorfano', '15 mg/5 ml', 'Jarabe', 'Oral', '10 ml', 'Cada 8 horas', '5 días', null),
  ('Salbutamol', '100 mcg/dosis', 'Inhalador', 'Inhalada', '2 inhalaciones', 'Cada 6 horas', '5 días', null),
  ('Budesonida', '200 mcg/dosis', 'Inhalador', 'Inhalada', '2 inhalaciones', 'Cada 12 horas', '14 días', 'Enjuagar la boca después de usar'),
  ('Beclometasona', '50 mcg/dosis', 'Spray nasal', 'Nasal', '2 aplicaciones por fosa', 'Cada 12 horas', '14 días', null),
  ('Mometasona', '50 mcg/dosis', 'Spray nasal', 'Nasal', '2 aplicaciones por fosa', 'Cada 24 horas', '14 días', null),
  ('Oximetazolina', '0,05 %', 'Spray nasal', 'Nasal', '2 aplicaciones por fosa', 'Cada 12 horas', '3 días', 'No usar más de 5 días'),
  ('Cloruro de sodio', '0,9 %', 'Spray nasal', 'Nasal', '2 aplicaciones por fosa', 'Cada 8 horas', '7 días', null),
  ('Montelukast', '10 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '30 días', null),
  ('Fenilefrina + clorfeniramina + paracetamol', '10/4/500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'Puede causar somnolencia'),
  -- Gastrointestinal
  ('Omeprazol', '20 mg', 'Cápsula', 'Oral', '1 cápsula', 'En ayunas', '14 días', '30 minutos antes del desayuno'),
  ('Esomeprazol', '40 mg', 'Tableta', 'Oral', '1 tableta', 'En ayunas', '14 días', '30 minutos antes del desayuno'),
  ('Pantoprazol', '40 mg', 'Tableta', 'Oral', '1 tableta', 'En ayunas', '14 días', null),
  ('Ranitidina', '150 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '14 días', null),
  ('Hidróxido de aluminio + magnesio', '200/200 mg/5 ml', 'Suspensión', 'Oral', '10 ml', 'Cada 8 horas', '7 días', 'Después de las comidas'),
  ('Metoclopramida', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'Antes de las comidas'),
  ('Domperidona', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '5 días', 'Antes de las comidas'),
  ('Ondansetrón', '8 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '2 días', null),
  ('Butilbromuro de hioscina', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', null),
  ('Butilbromuro de hioscina', '20 mg/ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null),
  ('Loperamida', '2 mg', 'Tableta', 'Oral', '2 tabletas, luego 1 tras cada evacuación', 'Si hay dolor (SOS)', '2 días', 'Máximo 8 tabletas al día'),
  ('Sales de rehidratación oral', null, 'Sobre', 'Oral', '1 sobre en 1 litro de agua', 'Si hay dolor (SOS)', '3 días', 'Tomar a libre demanda'),
  ('Simeticona', '80 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '5 días', 'Masticar después de las comidas'),
  ('Lactulosa', '3,3 g/5 ml', 'Jarabe', 'Oral', '15 ml', 'Cada 24 horas', '7 días', null),
  ('Bisacodilo', '5 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '3 días', null),
  ('Trimebutina', '200 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '14 días', null),
  ('Probióticos (Saccharomyces boulardii)', '250 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '5 días', null),
  -- Cardiovascular y metabólico
  ('Losartán potásico', '50 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null),
  ('Enalapril', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', null),
  ('Amlodipino', '5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null),
  ('Valsartán', '160 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null),
  ('Hidroclorotiazida', '25 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', 'En la mañana'),
  ('Atenolol', '50 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null),
  ('Carvedilol', '6,25 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', null),
  ('Captopril', '25 mg', 'Tableta', 'Sublingual', '1 tableta', 'Dosis única', '1 día', 'Crisis hipertensiva: control de TA en 30 min'),
  ('Atorvastatina', '20 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', 'Tratamiento continuo', null),
  ('Rosuvastatina', '10 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', 'Tratamiento continuo', null),
  ('Metformina', '850 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', 'Con las comidas'),
  ('Glibenclamida', '5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', 'Antes del desayuno'),
  ('Levotiroxina', '50 mcg', 'Tableta', 'Oral', '1 tableta', 'En ayunas', 'Tratamiento continuo', null),
  ('Alopurinol', '300 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null),
  ('Colchicina', '0,5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '7 días', null),
  -- Corticoides
  ('Prednisona', '20 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', 'En la mañana, con alimentos'),
  ('Prednisona', '5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', 'En la mañana, con alimentos'),
  ('Dexametasona', '4 mg/ml', 'Ampolla', 'Intramuscular', '2 ml', 'Dosis única', '1 día', null),
  ('Betametasona', '4 mg/ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null),
  ('Hidrocortisona', '1 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '7 días', null),
  ('Betametasona', '0,05 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '7 días', null),
  ('Deflazacort', '30 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', null),
  -- Oftálmicos y óticos
  ('Lágrimas artificiales (hipromelosa)', '0,3 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en cada ojo', 'Cada 6 horas', '14 días', null),
  ('Tobramicina', '0,3 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en el ojo afectado', 'Cada 6 horas', '7 días', null),
  ('Ciprofloxacina', '0,3 %', 'Gotas óticas', 'Ótica', '3 gotas en el oído afectado', 'Cada 8 horas', '7 días', null),
  ('Nafazolina', '0,1 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en cada ojo', 'Cada 8 horas', '3 días', null),
  ('Olopatadina', '0,1 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en cada ojo', 'Cada 12 horas', '14 días', null),
  -- Sistema nervioso
  ('Diazepam', '5 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '5 días', 'Puede causar somnolencia; no conducir'),
  ('Alprazolam', '0,25 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '7 días', 'Puede causar somnolencia; no conducir'),
  ('Sertralina', '50 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '30 días', null),
  ('Fluoxetina', '20 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 24 horas', '30 días', 'En la mañana'),
  ('Amitriptilina', '25 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '30 días', null),
  ('Pregabalina', '75 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '30 días', 'Puede causar somnolencia'),
  ('Gabapentina', '300 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 8 horas', '30 días', null),
  ('Betahistina', '16 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '14 días', null),
  ('Dimenhidrinato', '50 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'Puede causar somnolencia'),
  ('Complejo B (B1, B6, B12)', '100/100/1 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '30 días', null),
  -- Genitourinario y otros
  ('Fenazopiridina', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '2 días', 'Colorea la orina'),
  ('Tamsulosina', '0,4 mg', 'Cápsula', 'Oral', '1 cápsula', 'En la noche', '30 días', null),
  ('Sulfato ferroso', '300 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '3 meses', 'Con jugo cítrico, lejos de lácteos'),
  ('Ácido fólico', '5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '3 meses', null),
  ('Calcio + vitamina D', '600 mg/400 UI', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '3 meses', null),
  ('Vitamina C', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '14 días', null),
  ('Óxido de zinc', '20 %', 'Ungüento', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '7 días', null),
  ('Sulfadiazina de plata', '1 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '7 días', 'Quemaduras: cura diaria'),
  ('Permetrina', '5 %', 'Crema', 'Tópica', 'Aplicar en todo el cuerpo', 'Dosis única', '1 día', 'Repetir a los 7 días'),
  ('Lidocaína', '2 %', 'Gel', 'Tópica', 'Aplicar capa fina', 'Si hay dolor (SOS)', '3 días', null),
  ('Toxoide tetánico', '0,5 ml', 'Ampolla', 'Intramuscular', '0,5 ml', 'Dosis única', '1 día', 'Según esquema de vacunación');

insert into public.lista_items (lista, codigo, nombre, texto, orden)
select 'medicina',
       lower(regexp_replace(nombre || '_' || coalesce(conc, ''), '[^a-zA-Z0-9]+', '_', 'g')),
       nombre,
       concat_ws(E'\n',
         'concentracion: ' || conc, 'presentacion: ' || pres, 'via: ' || via, 'dosis: ' || dosis,
         'frecuencia: ' || frec, 'duracion: ' || dur, 'observacion: ' || obs),
       100 + row_number() over ()
from _m;

-- Las 6 medicinas iniciales sin presentación se reemplazan por las nuevas con indicación completa
delete from public.lista_items where lista = 'medicina' and org_id is null and texto is null
  and codigo in ('paracetamol', 'ibuprofeno', 'diclofenaco', 'loratadina', 'omeprazol', 'amoxicilina');
delete from public.lista_items o where o.lista = 'medicina' and o.org_id is not null and o.texto is null
  and o.codigo in ('paracetamol', 'ibuprofeno', 'diclofenaco', 'loratadina', 'omeprazol', 'amoxicilina');

select public.copiar_listas_base(id) from public.organizaciones;
