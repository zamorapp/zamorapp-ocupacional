-- Enlaces del paciente: anular en cualquier momento y eliminar (Cesar, 06-nov-2026: «anular los enlaces y eliminarlos»).
-- 1. Anular ya no exige que el paciente no lo haya llenado: un enlace ACEPTADO sigue sirviendo 30 días para descargar
--    hojas y subir resultados, y Cesar puede cortarlo al instante. Lo que ya llegó a la ficha no se toca. Un enlace
--    «por revisar» no se anula: se acepta o se descarta (descartar ya lo corta).
-- 2. Eliminar borra el enlace y lo que el paciente escribió en él (datos, hojas elegidas, reservas de subida). NO toca la
--    ficha, la cita ni los resultados que subió (viven en clinico.adjuntos, aparte) ni los respaldos.
-- 3. La limpieza vacía al momento las hojas elegidas de un enlace anulado.

-- ===== 1. Anular también un enlace ya aceptado =====
do $$
declare
  v_def text := pg_get_functiondef('public.validar_solicitud_paciente()'::regprocedure);
  v_viejo text := 'if old.anulado_en is not null or old.recibido_en is not null or new.resultado is distinct from old.resultado then
      raise exception ''Solo se anula un enlace que el paciente todavía no llenó'';';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'validar_solicitud_paciente cambió: revisar 20261030917000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, 'if old.anulado_en is not null or new.resultado is distinct from old.resultado then
      raise exception ''Ese enlace ya estaba anulado'';
    end if;
    if old.recibido_en is not null and old.resultado is null then
      raise exception ''Ese paciente está por revisar: acéptalo o descártalo'';');
end $$;

-- ===== 2. Eliminar =====
create or replace function public.eliminar_solicitud_paciente(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.solicitudes_paciente
   where id = p_id
     and org_id = any (public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true));
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'Ese enlace ya no está. Recarga la pantalla.' end;
end $$;
revoke execute on function public.eliminar_solicitud_paciente(uuid) from public, anon;
grant execute on function public.eliminar_solicitud_paciente(uuid) to authenticated;

-- ===== 3. Limpieza: un enlace anulado ya no guarda las hojas elegidas =====
create or replace function public.purgar_solicitudes_paciente()
returns void language plpgsql security definer set search_path = public as $$
declare v_orgs uuid[] := public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true);
begin
  update public.solicitudes_paciente set datos = '{}'::jsonb
   where org_id = any (v_orgs) and resultado = 'descartada' and revisado_en < now() - interval '30 days' and datos <> '{}'::jsonb;
  update public.solicitudes_paciente set documentos = '{}'::jsonb
   where org_id = any (v_orgs) and documentos <> '{}'::jsonb
     and (descarga_hasta < public.ahora() or recibido_en < public.ahora() - interval '7 days' or anulado_en is not null);
end $$;
revoke execute on function public.purgar_solicitudes_paciente() from public, anon;
grant execute on function public.purgar_solicitudes_paciente() to authenticated;
