-- Reportes: la consulta importada del SAME que se reasignó a su médico histórico (302 consultas, 26-oct) se cuenta para
-- ese médico, como ya la muestran la consulta y los documentos. Antes «Producción por médico», «Estadística médica» y la
-- relación de atendidos tomaban primero al usuario que hizo la carga (medico_id), y el cuadre B4 con el SAME daba
-- todas las consultas a un solo médico (SAME: 4.178 / 247 / 55).
-- Solo el administrador o la importación asignan medico_historico_id (proteger_medico_historico), así que en una
-- consulta hecha en zamorApp sigue mandando el médico que la atendió.
-- En los reportes salen como «Nombre (histórico)»: ya no trabajan con Cesar (29-oct). No tienen cuenta, así que no se
-- eligen en consultas nuevas, agenda ni firmas; solo quedan como autores de sus consultas pasadas.
-- Como en 20261028100000: no se recrea la función a mano; se cambia el texto exacto y se aborta si no aparece 3 veces.
do $$
declare
  v_def text := pg_get_functiondef('public.reporte_listado(text, uuid, date, date, jsonb)'::regprocedure);
  v_viejo text := 'coalesce(pf.nombre_completo, mh.nombre_completo';
  v_n int := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
begin
  if v_n <> 3 then
    raise exception 'reporte_listado: «%» aparece % veces (se esperaban 3)', v_viejo, v_n;
  end if;
  execute replace(v_def, v_viejo, 'coalesce(mh.nombre_completo || '' (histórico)'', pf.nombre_completo');
end $$;
