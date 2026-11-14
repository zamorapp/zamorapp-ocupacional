-- Puerta para agentes: las llaves apagadas o vencidas ya no se acumulan un año.
-- Pedido del dueño (13-nov-2026): «que se borren las llaves creadas para que no se acumulen, con limpieza automática».
--   · Llave apagada o vencida que NUNCA se usó: se borra al día siguiente.
--   · Llave apagada o vencida que sí se usó: se borra a los 7 días.
-- El registro («tal llave hizo tal cosa») NO cambia: se guarda el plazo de «agentes_registro» (un año por defecto) con el
-- nombre de la llave (agentes_registro.llave_nombre; llave_id queda en null al borrar la llave). Lo que el agente creó no se toca.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.limpieza_correr(boolean)'::regprocedure), chr(13), '');
  v_viejo text := 'where least(l.vence_en, coalesce(l.revocada_en, ''infinity'')) < public.ahora() - public.limpieza_dias(''agentes_registro'');';
  v_nuevo text := 'where least(l.vence_en, coalesce(l.revocada_en, ''infinity'')) < public.ahora() - case when l.usos = 0 then interval ''1 day'' else interval ''7 days'' end;';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'limpieza_correr cambió: revisar 20261030947000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
