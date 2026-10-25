-- zamorApp Ocupacional · Perfiles preestablecidos
-- Examen físico y funcional: "texto" lleva una línea por hallazgo con la forma «Fila: valor».
-- Paraclínicos: "texto" lleva un examen por línea; "grupo" puede guardar la empresa a la que se sugiere.

insert into public.listas (codigo, nombre, descripcion) values
  ('perfil_examen_fisico', 'Perfiles de examen físico', 'Hallazgos que se aplican de una vez. Una línea por fila: «Fila: hallazgo»'),
  ('perfil_examen_funcional', 'Perfiles de examen funcional', 'Síntomas que se aplican de una vez. Una línea por fila: «Fila: síntoma»')
on conflict (codigo) do nothing;

update public.listas set nombre = 'Perfiles de paraclínicos',
  descripcion = 'Grupos de exámenes que se solicitan de una vez (por empresa o por motivo). Un examen por línea.'
where codigo = 'grupo_paraclinicos';

insert into public.lista_items (lista, codigo, nombre, grupo, texto, orden) values
  ('perfil_examen_fisico', 'sindrome_viral', 'Síndrome viral', null,
   E'Nariz: Congestión nasal con rinorrea hialina\nBoca y faringe: Faringe hiperémica\nPiel: Hipertermia al tacto\nPulmonar: Murmullo vesicular audible, sin agregados\nEstado mental: Facies de fatiga, agotamiento', 1),
  ('perfil_examen_fisico', 'lumbalgia', 'Lumbalgia mecánica', null,
   E'Columna: Contractura paravertebral lumbar, dolor a la palpación L4-L5\nMiembros inferiores: Lasègue negativo, fuerza y sensibilidad conservadas', 2),
  ('perfil_examen_funcional', 'sindrome_viral', 'Síndrome viral', null,
   E'General: Malestar general, fatiga, sensación de fiebre\nRespiratorio: Tos húmeda sin expectoración\nÓrganos de los sentidos: Congestión nasal y rinorrea', 1),
  ('perfil_examen_funcional', 'lumbalgia', 'Lumbalgia mecánica', null,
   E'Osteomuscular: Dolor lumbar que aumenta con la flexión y la carga', 2),
  ('grupo_paraclinicos', 'ingreso_cosapi', 'Perfil de ingreso COSAPI', 'COSAPI',
   E'Hematología completa\nGlicemia\nCreatinina\nColesterol total\nTriglicéridos\nHDL\nLDL\nVDRL\nPruebas especiales', 1),
  ('grupo_paraclinicos', 'preempleo_basico', 'Pre-empleo básico', null,
   E'Hematología completa\nGlicemia\nUrea\nCreatinina\nExamen de orina\nExamen de heces\nVDRL\nGrupo sanguíneo y factor Rh', 2);

select public.copiar_listas_base(id) from public.organizaciones;
