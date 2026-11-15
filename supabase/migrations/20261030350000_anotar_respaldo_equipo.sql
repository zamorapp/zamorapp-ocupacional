-- Fase C (local primero): zamorApp Escritorio anota en public.respaldos cada respaldo de la PC y cada prueba de
-- restauración (descifrado de la copia externa con la clave de respaldo), con el secreto del equipo. Así el Inicio
-- (estado_respaldo, #116) muestra lo mismo para el respaldo de la PC que para el viejo respaldo por script.
-- La tabla no tiene políticas: solo entra por esta función (security definer) con un equipo válido.
create or replace function public.anotar_respaldo(p_equipo uuid, p_secreto text, p_tipo text, p_estado text,
  p_archivo text default null, p_tamano_kb int default null, p_destinos int default null, p_detalle text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id bigint; v_nombre text;
begin
  v_org := sync.equipo_valido(p_equipo, p_secreto);
  if p_tipo not in ('respaldo', 'restauracion') or p_estado not in ('ok', 'aviso', 'fallo') then
    raise exception 'Tipo o estado de respaldo no válido' using errcode = '22023';
  end if;
  select nombre into v_nombre from public.equipos where id = p_equipo;
  insert into public.respaldos (tipo, estado, archivo, tamano_kb, destinos, detalle, equipo)
  values (p_tipo, p_estado, left(p_archivo, 300), p_tamano_kb, p_destinos, left(p_detalle, 2000), coalesce(v_nombre, p_equipo::text))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.anotar_respaldo(uuid, text, text, text, text, int, int, text) from public, anon;
grant execute on function public.anotar_respaldo(uuid, text, text, text, text, int, int, text) to authenticated;
