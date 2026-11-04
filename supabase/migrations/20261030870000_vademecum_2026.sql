-- zamorApp Ocupacional · Vademécum 2026 (pedido de Cesar, 03-nov-2026)
-- Pone al día el catálogo de medicinas con fármacos comercializados hoy en Venezuela, con su presentación y una
-- indicación sugerida (concentración, vía, dosis, frecuencia, duración, nota) que el médico cambia en cada consulta.
-- Fuentes (consultadas el 04-nov-2026):
--   · Calox International, catálogo de genéricos y OTC 2026: https://calox.com/productos/genericos
--   · Grupo LETI / Genven, listado de productos 2026: https://grupoleti.com/listado-de-productos
--   · Cavefar y Cifar: más vendidos (diclofenac, acetaminofén, omeprazol, cardiometabólicos), Bitácora Económica,
--     09-ago-2025: https://bitacoraeconomica.com/diclofenac-es-el-medicamento-mas-comprado-en-venezuela/
-- Las dosis son las habituales del adulto según la ficha técnica de cada principio activo; son SUGERENCIAS.
--
-- Reglas:
--   · Solo AGREGA. No toca consultas escritas, ni medicinas que el servicio ya tiene, ni lo que borró a propósito
--     (no usa copiar_listas_base, que repondría lo borrado).
--   · «marcas: …» en el texto se busca en la consulta (escribir «Atamel» encuentra Paracetamol); no se imprime.
--   · Las copias de la organización solo reciben las marcas si nadie editó esa medicina (texto igual al de base).
--   · En la PC no corre: las filas llegan por la réplica con los ids de la nube.

do $$
declare o record;
begin
  if public.es_base_local() then return; end if;

  -- ─── 1. Presentaciones, vías, frecuencias y duraciones que faltaban ───
  insert into public.lista_items (lista, codigo, nombre, orden)
  select v.lista, v.codigo, v.nombre, v.orden
  from (values
    ('presentacion_medicina', 'tab_rec', 'Tableta recubierta', 18),
    ('presentacion_medicina', 'tab_lp', 'Tableta de liberación prolongada', 19),
    ('presentacion_medicina', 'tab_mast', 'Tableta masticable', 20),
    ('presentacion_medicina', 'tab_efer', 'Tableta efervescente', 21),
    ('presentacion_medicina', 'tab_sl', 'Tableta sublingual', 22),
    ('presentacion_medicina', 'cap_blanda', 'Cápsula blanda', 23),
    ('presentacion_medicina', 'cap_lp', 'Cápsula de liberación prolongada', 24),
    ('presentacion_medicina', 'sol_oral', 'Solución oral', 25),
    ('presentacion_medicina', 'gotas_orales', 'Gotas orales', 26),
    ('presentacion_medicina', 'polvo_susp', 'Polvo para suspensión', 27),
    ('presentacion_medicina', 'sol_iny', 'Solución inyectable', 28),
    ('presentacion_medicina', 'jeringa', 'Jeringa prellenada', 29),
    ('presentacion_medicina', 'ovulo', 'Óvulo', 30),
    ('presentacion_medicina', 'crema_vag', 'Crema vaginal', 31),
    ('presentacion_medicina', 'locion', 'Loción', 32),
    ('presentacion_medicina', 'unguento_of', 'Ungüento oftálmico', 33),
    ('presentacion_medicina', 'pomada', 'Pomada', 34),
    ('via_administracion', 'transd', 'Transdérmica', 13),
    ('frecuencia_dosis', 'segun_esquema', 'Según esquema', 11),
    ('frecuencia_dosis', 'c24h_manana', 'Cada 24 horas (mañana)', 12),
    ('duracion_tratamiento', '15d', '15 días', 6),
    ('duracion_tratamiento', '60d', '60 días', 8),
    ('duracion_tratamiento', '6m', '6 meses', 9),
    ('duracion_tratamiento', 'segun_esquema', 'Según esquema', 11)
  ) v (lista, codigo, nombre, orden)
  where not exists (
    select 1 from public.lista_items b
    where b.org_id is null and b.lista = v.lista
      and (b.codigo = v.codigo or lower(translate(btrim(b.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = lower(translate(v.nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))));

  -- ─── 2. Medicinas nuevas (principio activo, DCI) ───
  create temporary table _v (nombre text, conc text, pres text, via text, dosis text, frec text, dur text, obs text, marcas text) on commit drop;
  insert into _v values
    -- Analgésicos, antiinflamatorios y relajantes (lo más vendido en Venezuela: Cavefar 2025)
    ('Paracetamol + tramadol', '325/37,5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'Máximo 8 tabletas al día; puede causar somnolencia, no conducir', null),
    ('Dexketoprofeno', '25 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '3 días', 'Máximo 75 mg al día; tomar con alimentos', null),
    ('Dexketoprofeno', '25 mg/10 ml', 'Sobre', 'Oral', '1 sobre', 'Cada 8 horas', '3 días', 'Solución oral lista para tomar; máximo 3 sobres al día', null),
    ('Dexketoprofeno', '50 mg/2 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null, null),
    ('Ketoprofeno', '50 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 8 horas', '5 días', 'Tomar después de las comidas', null),
    ('Ketoprofeno', '2,5 %', 'Gel', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '7 días', 'No exponer la zona al sol', null),
    ('Ketorolaco', '30 mg', 'Tableta sublingual', 'Sublingual', '1 tableta', 'Cada 8 horas', '2 días', 'No más de 5 días en total', null),
    ('Aceclofenaco', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '5 días', 'Tomar después de las comidas', null),
    ('Nimesulida', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '5 días', 'Tomar después de las comidas; máximo 15 días', null),
    ('Meloxicam', '7,5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '7 días', 'Tomar después de las comidas', null),
    ('Meloxicam', '15 mg/1,5 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null, null),
    ('Diclofenaco sódico', '100 mg', 'Tableta de liberación prolongada', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', 'Tomar después de las comidas; no partir', null),
    ('Ibuprofeno', '800 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '5 días', 'Tomar después de las comidas; máximo 2.400 mg al día', null),
    ('Ibuprofeno + tiocolchicósido', '400/4 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '5 días', 'Tomar después de las comidas', null),
    ('Tramadol', '100 mg/2 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', 'Puede causar náuseas y somnolencia', null),
    ('Tizanidina', '2 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '7 días', 'Puede causar somnolencia; no conducir', null),
    ('Diacereína', '50 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '3 meses', 'Con las comidas; puede oscurecer la orina', 'Artrodar'),
    ('Glucosamina sulfato', '1.500 mg', 'Sobre', 'Oral', '1 sobre', 'Cada 24 horas', '3 meses', 'Disolver en un vaso de agua', null),
    ('Pregabalina', '150 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 12 horas', '30 días', 'Puede causar somnolencia; no suspender bruscamente', null),
    ('Capsaicina', '0,075 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '30 días', 'Lavarse las manos después; no aplicar en heridas', null),
    -- Antiinfecciosos
    ('Cefixima', '400 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', '7 días', 'Completar el tratamiento', null),
    ('Cefuroxima', '500 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 12 horas', '7 días', 'Con alimentos; completar el tratamiento', null),
    ('Moxifloxacina', '400 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', '7 días', 'Completar el tratamiento', 'Axokine'),
    ('Tinidazol', '500 mg', 'Tableta', 'Oral', '4 tabletas', 'Dosis única', '1 día', 'No consumir alcohol hasta 3 días después', null),
    ('Aciclovir', '200 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 4 horas', '5 días', '5 veces al día (sin la toma de la madrugada)', null),
    ('Aciclovir', '400 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '7 días', null, null),
    ('Aciclovir', '5 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 4 horas', '5 días', '5 veces al día desde los primeros síntomas', null),
    ('Terbinafina', '250 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '14 días', 'Onicomicosis: 12 semanas', null),
    ('Itraconazol', '100 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 24 horas', '15 días', 'Con las comidas', null),
    ('Miconazol', '2 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '14 días', 'Continuar 1 semana después de desaparecer las lesiones', null),
    ('Clotrimazol', '1 %', 'Crema vaginal', 'Vaginal', '1 aplicador', 'En la noche', '7 días', null, null),
    ('Nistatina', '100.000 UI', 'Óvulo', 'Vaginal', '1 óvulo', 'En la noche', '14 días', null, null),
    ('Metronidazol', '500 mg', 'Óvulo', 'Vaginal', '1 óvulo', 'En la noche', '7 días', null, null),
    ('Gentamicina', '0,1 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '7 días', null, null),
    ('Gentamicina', '0,3 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en el ojo afectado', 'Cada 6 horas', '7 días', null, null),
    ('Tobramicina', '0,3 %', 'Ungüento oftálmico', 'Oftálmica', 'Aplicar 1 cm en el ojo afectado', 'Cada 8 horas', '7 días', null, null),
    ('Tobramicina + dexametasona', '0,3/0,1 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en el ojo afectado', 'Cada 6 horas', '7 días', 'No pasar de 10 días sin control oftalmológico', null),
    -- Alergia, respiratorio y ojos
    ('Bilastina', '20 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '7 días', 'En ayunas: 1 hora antes o 2 horas después de comer', null),
    ('Rupatadina', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', '7 días', null, null),
    ('Fexofenadina', '120 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', '5 días', null, null),
    ('Hidroxicina', '25 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '5 días', 'Puede causar somnolencia; no conducir', null),
    ('Levodropropizina', '60 mg/10 ml', 'Jarabe', 'Oral', '10 ml', 'Cada 8 horas', '5 días', 'Tos seca', 'Antux'),
    ('Guaifenesina', '100 mg/5 ml', 'Jarabe', 'Oral', '10 ml', 'Cada 6 horas', '5 días', 'Tomar abundante agua', null),
    ('Bromuro de ipratropio', '20 mcg/dosis', 'Inhalador', 'Inhalada', '2 inhalaciones', 'Cada 6 horas', '7 días', null, null),
    ('Salmeterol + fluticasona', '25/250 mcg/dosis', 'Inhalador', 'Inhalada', '2 inhalaciones', 'Cada 12 horas', '30 días', 'Enjuagar la boca después de usar', null),
    ('Fluticasona', '50 mcg/dosis', 'Spray nasal', 'Nasal', '2 aplicaciones por fosa', 'Cada 24 horas', '14 días', null, null),
    ('Dexametasona', '8 mg/2 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null, null),
    ('Ketotifeno', '0,025 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en cada ojo', 'Cada 12 horas', '14 días', null, null),
    ('Carboximetilcelulosa', '0,5 %', 'Gotas oftálmicas', 'Oftálmica', '1 gota en cada ojo', 'Cada 6 horas', '30 días', 'Ojo seco por pantallas: pausas cada 20 minutos', null),
    -- Gastrointestinal
    ('Lansoprazol', '30 mg', 'Cápsula', 'Oral', '1 cápsula', 'En ayunas', '14 días', '30 minutos antes del desayuno', null),
    ('Esomeprazol', '20 mg', 'Tableta', 'Oral', '1 tableta', 'En ayunas', '14 días', '30 minutos antes del desayuno', null),
    ('Famotidina', '40 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '14 días', null, null),
    ('Sucralfato', '1 g', 'Tableta', 'Oral', '1 tableta', 'Cada 6 horas', '14 días', '1 hora antes de las comidas y al acostarse', null),
    ('Bromuro de pinaverio', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '14 días', 'Con agua, sentado, durante las comidas', null),
    ('Racecadotrilo', '100 mg', 'Cápsula', 'Oral', '1 cápsula', 'Cada 8 horas', '3 días', 'Con sales de rehidratación oral', null),
    ('Metoclopramida', '10 mg/2 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Dosis única', '1 día', null, null),
    -- Cardiovascular, renal y metabólico (segundo grupo más vendido: Cavefar/Cifar 2025)
    ('Amlodipino', '10 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Losartán potásico', '100 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Losartán + hidroclorotiazida', '50/12,5 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', 'Tratamiento continuo', null, null),
    ('Irbesartán', '150 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Irbesartán', '300 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Irbesartán + hidroclorotiazida', '150/12,5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', 'Tratamiento continuo', null, null),
    ('Candesartán', '8 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Candesartán', '16 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Telmisartán', '40 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Enalapril', '20 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', 'Si aparece tos seca persistente, avisar', null),
    ('Lercanidipino', '10 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', 'Tratamiento continuo', '15 minutos antes del desayuno', null),
    ('Nifedipino', '30 mg', 'Tableta de liberación prolongada', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', 'No partir ni masticar', null),
    ('Bisoprolol', '5 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', 'Tratamiento continuo', 'No suspender bruscamente', null),
    ('Propranolol', '40 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', 'No suspender bruscamente', null),
    ('Atenolol', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', 'No suspender bruscamente', null),
    ('Clonidina', '0,150 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', 'No suspender bruscamente', null),
    ('Furosemida', '40 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', 'Tratamiento continuo', null, null),
    ('Espironolactona', '25 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Clopidogrel', '75 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Rivaroxabán', '20 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', 'Con la cena; vigilar sangrados', 'Asarap'),
    ('Atorvastatina', '40 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'En la noche', 'Tratamiento continuo', null, null),
    ('Rosuvastatina', '20 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'En la noche', 'Tratamiento continuo', null, null),
    ('Simvastatina', '20 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', 'Tratamiento continuo', null, null),
    ('Gemfibrozilo', '600 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', '30 minutos antes del desayuno y de la cena', null),
    ('Ciprofibrato', '100 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Metformina', '500 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', 'Con las comidas', null),
    ('Metformina', '1.000 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 12 horas', 'Tratamiento continuo', 'Con las comidas', null),
    ('Glimepirida', '2 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', 'Tratamiento continuo', 'Antes del desayuno; no saltar comidas', null),
    ('Sitagliptina', '100 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Dapagliflozina', '10 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', 'Tratamiento continuo', 'Buena hidratación', null),
    ('Levotiroxina', '100 mcg', 'Tableta', 'Oral', '1 tableta', 'En ayunas', 'Tratamiento continuo', '30 minutos antes del desayuno', null),
    ('Diosmina + hesperidina', '450/50 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 12 horas', '60 días', 'Con las comidas', null),
    ('Sulodexida', '250 LSU', 'Cápsula blanda', 'Oral', '1 cápsula', 'Cada 12 horas', '60 días', 'Lejos de las comidas', 'Angioflux'),
    ('Citicolina', '500 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 12 horas', '30 días', null, null),
    -- Urológico
    ('Finasterida', '5 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', 'Tratamiento continuo', null, null),
    ('Dutasterida', '0,5 mg', 'Cápsula blanda', 'Oral', '1 cápsula', 'Cada 24 horas', 'Tratamiento continuo', 'Tragar entera', 'Amprovil'),
    ('Flavoxato', '200 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 8 horas', '7 días', null, null),
    -- Sistema nervioso (ver aptitud: los sedantes limitan trabajos en altura, manejo y maquinaria)
    ('Escitalopram', '10 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', '30 días', null, null),
    ('Escitalopram', '20 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'Cada 24 horas', '30 días', null, null),
    ('Paroxetina', '20 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 24 horas (mañana)', '30 días', null, null),
    ('Venlafaxina', '75 mg', 'Cápsula de liberación prolongada', 'Oral', '1 cápsula', 'Cada 24 horas', '30 días', 'Con el desayuno; no suspender bruscamente', null),
    ('Mirtazapina', '30 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '30 días', 'Puede causar somnolencia', null),
    ('Trazodona', '50 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '30 días', 'Puede causar somnolencia', null),
    ('Clonazepam', '0,5 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '15 días', 'Somnolencia: no conducir ni operar maquinaria', null),
    ('Alprazolam', '0,5 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '7 días', 'Somnolencia: no conducir ni operar maquinaria', null),
    ('Bromazepam', '3 mg', 'Tableta', 'Oral', '1 tableta', 'En la noche', '7 días', 'Somnolencia: no conducir ni operar maquinaria', null),
    ('Zolpidem', '10 mg', 'Tableta recubierta', 'Oral', '1 tableta', 'En la noche', '7 días', 'Al acostarse; no conducir al día siguiente si durmió menos de 7 horas', null),
    ('Cinarizina', '75 mg', 'Cápsula', 'Oral', '1 cápsula', 'En la noche', '14 días', 'Puede causar somnolencia', null),
    ('Flunarizina', '10 mg', 'Cápsula', 'Oral', '1 cápsula', 'En la noche', '30 días', 'Puede causar somnolencia', null),
    ('Sumatriptán', '50 mg', 'Tableta', 'Oral', '1 tableta', 'Si hay dolor (SOS)', '3 días', 'Repetir a las 2 horas si vuelve el dolor; máximo 200 mg al día', null),
    ('Ergotamina + cafeína', '1/100 mg', 'Tableta', 'Oral', '2 tabletas al inicio, luego 1 cada 30 min', 'Si hay dolor (SOS)', '1 día', 'Máximo 6 tabletas por crisis', null),
    ('Carbamazepina', '200 mg', 'Tableta', 'Oral', '1 tableta', 'Cada 12 horas', '30 días', 'Puede causar somnolencia', null),
    ('Complejo B (B1, B6, B12)', '100/100/1 mg/3 ml', 'Ampolla', 'Intramuscular', '1 ampolla', 'Cada 24 horas', '3 días', null, null),
    -- Vitaminas y suplementos
    ('Vitamina D3 (colecalciferol)', '50.000 UI', 'Cápsula blanda', 'Oral', '1 cápsula', 'Una vez por semana', '60 días', 'Con una comida que tenga grasa', null),
    ('Hierro polimaltosado', '100 mg', 'Tableta masticable', 'Oral', '1 tableta', 'Cada 24 horas', '3 meses', 'Con las comidas', null),
    ('Omega 3', '1 g', 'Cápsula blanda', 'Oral', '1 cápsula', 'Cada 24 horas', '3 meses', 'Con las comidas', null),
    ('Vitamina E', '400 UI', 'Cápsula blanda', 'Oral', '1 cápsula', 'Cada 24 horas', '30 días', null, null),
    -- Piel (dermatitis de contacto y lesiones laborales)
    ('Clobetasol', '0,05 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '7 días', 'No usar en cara ni pliegues; máximo 2 semanas', null),
    ('Mometasona', '0,1 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 24 horas', '7 días', null, null),
    ('Urea', '10 %', 'Crema', 'Tópica', 'Aplicar capa fina', 'Cada 12 horas', '30 días', 'Dermatitis de manos: usar guantes en el trabajo', null),
    ('Calamina', '8 %', 'Loción', 'Tópica', 'Aplicar capa fina', 'Cada 8 horas', '5 días', null, null),
    -- Vacunas y profilaxis del trabajador
    ('Vacuna contra hepatitis B', '20 mcg/1 ml', 'Vial', 'Intramuscular', '1 ml', 'Según esquema', 'Según esquema', 'Esquema 0, 1 y 6 meses, en el deltoides', null),
    ('Toxoide tetánico y diftérico (Td)', '0,5 ml', 'Ampolla', 'Intramuscular', '0,5 ml', 'Según esquema', 'Según esquema', 'Esquema 0, 1 y 6 a 12 meses; refuerzo cada 10 años', null),
    ('Vacuna contra la influenza', '0,5 ml', 'Jeringa prellenada', 'Intramuscular', '0,5 ml', 'Dosis única', '1 día', 'Una vez al año', null),
    ('Vacuna contra la fiebre amarilla', '0,5 ml', 'Vial', 'Subcutánea', '0,5 ml', 'Dosis única', '1 día', 'Una sola dosis de por vida; 10 días antes de viajar a zona de riesgo', null),
    ('Inmunoglobulina antitetánica', '250 UI', 'Ampolla', 'Intramuscular', '250 UI', 'Dosis única', '1 día', 'Heridas de riesgo sin esquema de vacunación completo', null);

  insert into public.lista_items (lista, codigo, nombre, texto, orden, datos)
  select 'medicina', s.codigo, v.nombre,
         concat_ws(E'\n',
           'concentracion: ' || v.conc, 'presentacion: ' || v.pres, 'via: ' || v.via, 'dosis: ' || v.dosis,
           'frecuencia: ' || v.frec, 'duracion: ' || v.dur, 'observacion: ' || v.obs, 'marcas: ' || v.marcas),
         300 + row_number() over (), '{"vademecum": "2026"}'::jsonb
  from _v v
  cross join lateral (select lower(regexp_replace(translate(v.nombre || '_' || coalesce(v.conc, '') || '_' || v.pres, 'ÁÉÍÓÚÑáéíóúñ', 'AEIOUNaeioun'), '[^a-zA-Z0-9]+', '_', 'g')) as codigo) s
  where not exists (select 1 from public.lista_items b where b.org_id is null and b.lista = 'medicina' and b.codigo = s.codigo);

  -- ─── 3. Marcas venezolanas en medicinas que ya estaban (catálogos Calox y Grupo LETI 2026) ───
  -- Solo copias sin editar: su texto es idéntico al de la base. Lo que el médico cambió queda como lo dejó.
  create temporary table _marcas (nombre text, conc text, marcas text) on commit drop;
  insert into _marcas values ('Paracetamol', '500 mg', 'Atamel'), ('Paracetamol', '650 mg', 'Atamel Forte'), ('Ácido acetilsalicílico', '81 mg', 'Asaprol');
  for o in select b.id, b.texto, m.marcas from public.lista_items b
           join _marcas m on m.nombre = b.nombre and substring(b.texto from 'concentracion: ([^\n]*)') = m.conc
           where b.org_id is null and b.lista = 'medicina' and b.texto not like '%marcas:%' loop
    update public.lista_items c set texto = o.texto || E'\nmarcas: ' || o.marcas
    where c.lista = 'medicina' and c.org_id is not null and c.base_id = o.id and c.texto = o.texto;
    update public.lista_items set texto = o.texto || E'\nmarcas: ' || o.marcas where id = o.id;
  end loop;
end $$;

-- ─── 4. Copia editable en cada organización, sin reponer lo que borró ni duplicar lo que ya tiene ───
create or replace function public.sembrar_vademecum_2026(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.es_base_local() then return 0; end if;
  insert into public.lista_items (lista, org_id, codigo, nombre, grupo, texto, orden, activo, datos, base_id)
  select b.lista, p_org, b.codigo, b.nombre, b.grupo, b.texto, b.orden, b.activo, b.datos, b.id
  from public.lista_items b
  where b.org_id is null
    and ((b.lista = 'medicina' and b.datos ->> 'vademecum' = '2026')
      or (b.lista = 'presentacion_medicina' and b.codigo in ('tab_rec', 'tab_lp', 'tab_mast', 'tab_efer', 'tab_sl', 'cap_blanda', 'cap_lp', 'sol_oral', 'gotas_orales', 'polvo_susp', 'sol_iny', 'jeringa', 'ovulo', 'crema_vag', 'locion', 'unguento_of', 'pomada'))
      or (b.lista = 'via_administracion' and b.codigo = 'transd')
      or (b.lista = 'frecuencia_dosis' and b.codigo in ('segun_esquema', 'c24h_manana'))
      or (b.lista = 'duracion_tratamiento' and b.codigo in ('15d', '60d', '6m', 'segun_esquema')))
    and not exists (
      select 1 from public.lista_items o
      where o.org_id = p_org and o.lista = b.lista
        and (o.base_id = b.id or o.codigo = b.codigo
          -- medicinas: el mismo principio activo con la misma concentración ya creado a mano cuenta como existente
          or (b.lista = 'medicina' and lower(translate(btrim(o.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = lower(translate(b.nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))
              and substring(o.texto from 'concentracion: ([^\n]*)') = substring(b.texto from 'concentracion: ([^\n]*)'))
          -- presentaciones, vías, frecuencias y duraciones: el mismo nombre ya creado a mano cuenta como existente
          or (b.lista <> 'medicina' and lower(translate(btrim(o.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = lower(translate(b.nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')))));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sembrar_vademecum_2026(uuid) from public, anon, authenticated;

select public.sembrar_vademecum_2026(id) from public.organizaciones;  -- en la PC devuelve 0
