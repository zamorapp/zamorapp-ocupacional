-- Si se pierde el teléfono del código de dos pasos (Cesar es el único administrador):
-- 1) 10 códigos de respaldo de un solo uso, que se ven una sola vez al crearlos. Usar uno borra el teléfono
--    viejo y lleva a escanear un QR nuevo; no abre los datos por sí solo (la base sigue pidiendo el código nuevo).
-- 2) Otro administrador de la misma organización puede reiniciar la verificación de alguien.
-- En la base solo queda el hash de cada código (sha256 con el id del usuario), nunca el código.

create table if not exists public.codigos_respaldo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  hash text not null unique,
  creado_en timestamptz not null default now(),
  usado_en timestamptz
);
create index if not exists codigos_respaldo_usuario on public.codigos_respaldo (usuario_id);
alter table public.codigos_respaldo enable row level security; -- sin políticas: solo las funciones
revoke all on public.codigos_respaldo from anon, authenticated;

-- Intentos fallidos: 5 en 15 minutos y hay que esperar (un código tiene 50 bits, pero no se regalan intentos)
create table if not exists public.intentos_codigo_respaldo (
  usuario_id uuid not null,
  en timestamptz not null default now()
);
create index if not exists intentos_codigo_respaldo_usuario on public.intentos_codigo_respaldo (usuario_id, en);
alter table public.intentos_codigo_respaldo enable row level security;
revoke all on public.intentos_codigo_respaldo from anon, authenticated;

create or replace function public.hash_codigo_respaldo(p_usuario uuid, p_codigo text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_usuario::text || ':' || upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g')), 'UTF8')), 'hex')
$$;
revoke execute on function public.hash_codigo_respaldo(uuid, text) from public, anon, authenticated;

-- Crea 10 códigos nuevos (borra los anteriores). Solo con el segundo paso hecho en esta sesión (aal2).
create or replace function public.generar_codigos_respaldo()
returns text[] language plpgsql volatile security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin 0/O ni 1/I: no se confunden al copiarlos
  v_bytes bytea;
  v_codigo text;
  v_codigos text[] := '{}';
begin
  if v_usuario is null or nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal' is distinct from 'aal2' then
    raise exception 'Escribe primero el código de tu teléfono para crear los códigos de respaldo' using errcode = '42501';
  end if;
  delete from public.codigos_respaldo where usuario_id = v_usuario;
  for i in 1..10 loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_codigo := '';
    for j in 0..9 loop
      v_codigo := v_codigo || substr(v_letras, (get_byte(v_bytes, j) % 32) + 1, 1);
    end loop;
    v_codigo := substr(v_codigo, 1, 5) || '-' || substr(v_codigo, 6, 5);
    insert into public.codigos_respaldo (usuario_id, hash) values (v_usuario, public.hash_codigo_respaldo(v_usuario, v_codigo));
    v_codigos := v_codigos || v_codigo;
  end loop;
  return v_codigos;
end $$;
revoke execute on function public.generar_codigos_respaldo() from anon;

create or replace function public.codigos_respaldo_restantes()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.codigos_respaldo where usuario_id = auth.uid() and usado_en is null
$$;
revoke execute on function public.codigos_respaldo_restantes() from anon;

-- Borra el teléfono (factores TOTP), los equipos de confianza y los códigos de respaldo de un usuario.
create or replace function public.borrar_segundo_paso(p_usuario uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  delete from auth.mfa_factors where user_id = p_usuario;
  delete from public.equipos_confianza where usuario_id = p_usuario;
  delete from public.codigos_respaldo where usuario_id = p_usuario;
end $$;
revoke execute on function public.borrar_segundo_paso(uuid) from public, anon, authenticated;

-- Con la contraseña (aal1) y un código de respaldo: borra el teléfono viejo para activar uno nuevo.
-- Devuelve 'ok', 'incorrecto' o 'espera' (no lanza error, para que el intento fallido quede contado).
create or replace function public.usar_codigo_respaldo(p_codigo text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_usuario uuid := auth.uid();
  v_id uuid;
begin
  if v_usuario is null then raise exception 'Sin sesión' using errcode = '42501'; end if;
  if (select count(*) from public.intentos_codigo_respaldo
      where usuario_id = v_usuario and en > now() - interval '15 minutes') >= 5 then
    return 'espera';
  end if;
  update public.codigos_respaldo set usado_en = now()
  where usuario_id = v_usuario and usado_en is null and hash = public.hash_codigo_respaldo(v_usuario, p_codigo)
  returning id into v_id;
  if v_id is null then
    insert into public.intentos_codigo_respaldo (usuario_id) values (v_usuario);
    return 'incorrecto';
  end if;
  delete from auth.mfa_factors where user_id = v_usuario;
  delete from public.equipos_confianza where usuario_id = v_usuario;
  delete from public.intentos_codigo_respaldo where usuario_id = v_usuario;
  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  select m.org_id, 'dos_pasos', v_usuario, 'CODIGO_RESPALDO', null, jsonb_build_object('quedan',
    (select count(*) from public.codigos_respaldo where usuario_id = v_usuario and usado_en is null))
  from public.miembros m where m.usuario_id = v_usuario and m.activo;
  return 'ok';
end $$;
revoke execute on function public.usar_codigo_respaldo(text) from anon;

-- Otro administrador de la misma organización reinicia la verificación de alguien (perdió el teléfono y los
-- códigos). Nadie se reinicia a sí mismo por aquí: para eso están los códigos de respaldo.
create or replace function public.reiniciar_dos_pasos(p_usuario uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_usuario = auth.uid() then
    raise exception 'No puedes reiniciar tu propia verificación: usa un código de respaldo' using errcode = '42501';
  end if;
  select m.org_id into v_org from public.miembros m
  where m.usuario_id = p_usuario and public.es_admin(m.org_id) limit 1;
  if v_org is null then raise exception 'Solo un administrador de su organización puede reiniciarla' using errcode = '42501'; end if;
  if not public.dos_pasos_cumplido() then
    raise exception 'Confirma tu propia verificación en dos pasos antes de reiniciar la de otro' using errcode = '42501';
  end if;
  perform public.borrar_segundo_paso(p_usuario);
  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  values (v_org, 'dos_pasos', p_usuario, 'REINICIO', null, null);
end $$;
revoke execute on function public.reiniciar_dos_pasos(uuid) from anon;

-- El freno deja pasar, con solo la contraseña, lo necesario para usar un código de respaldo
create or replace function public.verificar_dos_pasos()
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_ruta text := current_setting('request.path', true);
begin
  if public.dos_pasos_cumplido() then return; end if;
  if v_ruta in ('/rpc/requiere_dos_pasos', '/rpc/falta_segundo_paso', '/rpc/dias_equipo_confianza',
                '/rpc/usar_codigo_respaldo', '/rpc/cambios_desde', '/rpc/instantanea', '/rpc/aplicar_cambios')
     or (v_ruta = '/miembros' and current_setting('request.method', true) = 'GET') then
    return;
  end if;
  raise exception using
    errcode = 'PGRST',
    message = json_build_object('code', 'dos_pasos', 'message', 'Confirma la verificación en dos pasos para continuar.', 'details', null, 'hint', null)::text,
    detail = json_build_object('status', 403, 'headers', json_build_object())::text;
end $$;
