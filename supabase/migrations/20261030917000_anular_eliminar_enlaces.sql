-- Enlaces del paciente: anular en cualquier momento y eliminar (Cesar, 06-nov-2026: «anular los enlaces y eliminarlos»).
-- 1. Anular ya no exige que el paciente no lo haya llenado: un enlace ACEPTADO sigue sirviendo 30 días para descargar
--    hojas y subir resultados, y Cesar puede cortarlo al instante. Lo que ya llegó a la ficha no se toca. Un enlace
--    «por revisar» no se anula: se acepta o se descarta (descartar ya lo corta).
-- 2. Eliminar (no si está «por revisar») borra el enlace y lo que el paciente escribió en él (datos, hojas elegidas, reservas de subida). NO toca la
--    ficha, la cita ni los resultados que subió (viven en clinico.adjuntos, aparte) ni los respaldos.
-- 3. La limpieza vacía al momento las hojas elegidas de un enlace anulado.
-- 4. La bitácora de estos enlaces deja de guardar «documentos» (datos de salud) y se le retiran a las filas que ya había.

-- ===== 1. Anular también un enlace ya aceptado =====
do $$
declare
  -- Sin \r: en producción la función quedó con saltos de Windows (se aplicó pegada en el editor SQL) y el texto exacto
  -- con saltos de Unix no aparecía; quitarlos no cambia lo que hace la función
  v_def text := replace(pg_get_functiondef('public.validar_solicitud_paciente()'::regprocedure), chr(13), '');
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
-- Un enlace «por revisar» no se elimina: se descarta (Descartar tiene Deshacer y los datos se vacían solos a los 30 días)
create or replace function public.eliminar_solicitud_paciente(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v public.solicitudes_paciente;
begin
  select * into v from public.solicitudes_paciente
   where id = p_id
     and org_id = any (public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))
   for update;
  if v.id is null then return 'Ese enlace ya no está. Recarga la pantalla.'; end if;
  if v.recibido_en is not null and v.resultado is null then
    return 'Ese paciente está por revisar: acéptalo o descártalo primero.';
  end if;
  delete from public.solicitudes_paciente where id = v.id;
  return 'ok';
end $$;

-- La bitácora también anota quién eliminó, sin los datos del paciente ni el token. Y desde ahora tampoco guarda
-- «documentos» (exámenes pedidos, dieta, temas de bienestar): la lee el auditor de la empresa (Analizar, 06-nov).
create or replace function public.bitacora_solicitud_paciente()
returns trigger language plpgsql security definer set search_path = public as $$
declare quitar text[] := array['datos', 'documentos', 'token_hash', 'nombre', 'telefono'];
begin
  if tg_op = 'DELETE' then
    insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
    values (old.org_id, 'public.solicitudes_paciente', old.id, tg_op, to_jsonb(old) - quitar, null);
    return old;
  end if;
  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  values (new.org_id, 'public.solicitudes_paciente', new.id, tg_op,
          case when tg_op = 'UPDATE' then to_jsonb(old) - quitar end, to_jsonb(new) - quitar);
  return new;
end $$;
revoke execute on function public.bitacora_solicitud_paciente() from public, anon, authenticated;
drop trigger if exists bit_solicitudes_paciente on public.solicitudes_paciente;
create trigger bit_solicitudes_paciente after insert or update or delete on public.solicitudes_paciente
  for each row execute function public.bitacora_solicitud_paciente();
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

-- ===== 4. Retiro de datos de salud de la bitácora =====
-- No es una purga: las filas se quedan (quién, qué y cuándo); solo se les quita «documentos», que nunca debió verlo el
-- auditor de la empresa. public.bitacora no tiene triggers ni reglas que bloqueen el update (revisado 06-nov).
update public.bitacora set antes = antes - 'documentos', despues = despues - 'documentos'
 where tabla = 'public.solicitudes_paciente' and (antes ? 'documentos' or despues ? 'documentos');
