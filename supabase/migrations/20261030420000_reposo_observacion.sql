-- zamorApp · Observación del reposo traída del SAME (Integral.consulta.obsreposo, 45 reposos).
-- Solo lectura en la consulta: guardar_consulta actualiza el reposo en su lugar sin tocar esta columna, así que se conserva.
-- La llena scripts/importar-integral/completar-faltantes.mjs, solo en reposos importados que la tengan vacía.
alter table clinico.reposos add column if not exists observacion text;
comment on column clinico.reposos.observacion is 'Observación escrita en el SAME para este reposo (importada; no se edita en zamorApp)';
