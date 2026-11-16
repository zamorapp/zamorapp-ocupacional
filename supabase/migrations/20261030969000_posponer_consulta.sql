-- zamorApp Ocupacional · «Posponer» una consulta pendiente (pedido de Cesar, 16-nov-2026)
-- La cita vuelve a «Citados» en otra fecha. Hasta hoy, al volver a «citado» RR. HH. recibía «Cita confirmada»,
-- aunque fuera una cita que ya estaba en espera o en consulta y se movió de día. Ahora, si la cita no venía de una
-- solicitud de la empresa y cambió su día u hora, el aviso dice «Cita reprogramada» (con la fecha nueva).
-- Parche EN VIVO sobre la función que haya (nunca copiarla de una migración vieja). Se puede repetir.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.avisar_cita()'::regprocedure), chr(13), '');  -- sin retornos de carro
  v_viejo constant text := 'when ''citado'' then ''Cita confirmada''';
  v_nuevo constant text := 'when ''citado'' then case when old.estado is distinct from ''solicitada'' and (new.fecha, new.hora) is distinct from (old.fecha, old.hora) then ''Cita reprogramada'' else ''Cita confirmada'' end';
  v_veces int;
begin
  if position('''Cita reprogramada'' else ''Cita confirmada''' in v_def) > 0 then return; end if;
  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_veces <> 1 then
    raise exception 'avisar_cita: se esperaba 1 vez «%», hay %', v_viejo, v_veces;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
