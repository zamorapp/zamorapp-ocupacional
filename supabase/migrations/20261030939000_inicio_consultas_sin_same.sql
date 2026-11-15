-- zamorApp Ocupacional · Inicio: «Consultas abiertas» y «Por firmar» sin las consultas traídas del SAME
-- 13-nov Cesar vio «3» en el Inicio y al tocar la tarjeta no encontraba esas 3: una era un borrador de 2023 traído
-- del SAME y la tarjeta llevaba a Atención médica (30 días, empresa activa). Ahora el número y la lista
-- (/atencion?ver=abiertas|por-firmar) usan la MISMA regla: estado, sin origen, todas las empresas, solo las mías
-- si el rol no es administrador ni gerente médico.
-- Parche EN VIVO sobre la función que haya (nunca copiarla de una migración vieja: otras la parchean, p. ej. 937).
-- Se puede repetir: si ya tiene el filtro, no hace nada.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.inicio_conteos(uuid, boolean, boolean)'::regprocedure), chr(13), '');  -- sin retornos de carro (pegado desde Windows)
  v_viejo constant text := 'where c.estado in (''cerrada'', ''borrador'')';
  v_nuevo constant text := 'where c.estado in (''cerrada'', ''borrador'') and c.origen is null';
  v_veces int;
begin
  if position(v_nuevo in v_def) > 0 then return; end if;
  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_veces <> 1 then
    raise exception 'inicio_conteos: se esperaba 1 vez «%», hay %', v_viejo, v_veces;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
