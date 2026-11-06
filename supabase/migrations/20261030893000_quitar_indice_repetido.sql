-- Índice repetido en clinico.consultas (aviso «duplicate_index» del asesor de Supabase, prueba general 05-nov-2026).
-- consultas_trabajador_id_fecha_idx se creó a mano en la nube (no está en ninguna migración) y es idéntico a
-- consultas_trabajador_fecha (trabajador_id, fecha desc), que es el que la base usa (70.751 lecturas contra 17).
-- Mantener los dos solo hace más lento cada guardado de consulta. «if exists»: en el escritorio y en las pruebas no existe.
drop index if exists clinico.consultas_trabajador_id_fecha_idx;
