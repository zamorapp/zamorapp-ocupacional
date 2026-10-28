-- zamorApp Ocupacional · Entrar con un usuario corto (p. ej. «cesar») en vez del correo, como en el SAME.
--   · El administrador lo asigna en Configuración > Usuarios; queda ligado a la cuenta real (auth.users).
--   · La clave es la misma de la cuenta: el usuario corto solo reemplaza al correo al escribirlo.
--   · correo_para_ingreso devuelve el correo SOLO si usuario y clave son correctos: quien no sabe la clave
--     no averigua si el usuario existe ni cuál es su correo. Con freno de intentos (por usuario y global).
--   · Después se entra con el correo por Supabase Auth como siempre: la verificación en dos pasos no se salta.

create table if not exists public.usuarios_ingreso (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  usuario text not null check (usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  cambiado_en timestamptz not null default now(),
  cambiado_por uuid default auth.uid()
);
create unique index if not exists usuarios_ingreso_usuario on public.usuarios_ingreso (usuario);
alter table public.usuarios_ingreso enable row level security;
revoke all on public.usuarios_ingreso from public, anon, authenticated;

-- Freno a quien prueba claves por esta vía (se cuenta también lo que no existe, para no delatar a los que sí)
create table if not exists public.ingreso_usuario_intentos (
  usuario text primary key,
  fallos int not null default 0,
  hasta timestamptz,
  actualizado timestamptz not null default now()
);
alter table public.ingreso_usuario_intentos enable row level security;
revoke all on public.ingreso_usuario_intentos from public, anon, authenticated;

-- Usuario corto normalizado: minúsculas, sin espacios
create or replace function public.normalizar_usuario(p text)
returns text language sql immutable as $$ select lower(trim(coalesce(p, ''))) $$;

-- Correo de la cuenta si usuario y clave son correctos; null en cualquier otro caso (mismo tiempo de respuesta).
-- Error «demasiados_intentos» tras 5 fallos seguidos del mismo usuario (15 min, se duplica hasta 1 h)
-- o 100 fallos entre todos en 10 min.
create or replace function public.correo_para_ingreso(p_usuario text, p_clave text)
returns text language plpgsql volatile security definer set search_path = public, extensions, auth as $$
declare
  v_usuario text := public.normalizar_usuario(p_usuario);
  v_hash text;
  v_correo text;
  v_ok boolean := false;
  v_freno public.ingreso_usuario_intentos;
  v_global public.ingreso_usuario_intentos;
begin
  if v_usuario = '' or length(v_usuario) > 30 or coalesce(p_clave, '') = '' then return null; end if;

  select * into v_freno from public.ingreso_usuario_intentos where usuario = v_usuario;
  select * into v_global from public.ingreso_usuario_intentos where usuario = '*';
  if v_freno.hasta > now() or v_global.hasta > now() then
    raise exception 'demasiados_intentos' using errcode = 'P0429',
      hint = ceil(extract(epoch from greatest(v_freno.hasta, v_global.hasta) - now()) / 60)::text;
  end if;

  select u.encrypted_password, u.email into v_hash, v_correo
  from public.usuarios_ingreso i join auth.users u on u.id = i.usuario_id
  where i.usuario = v_usuario and u.deleted_at is null and (u.banned_until is null or u.banned_until < now());

  begin
    -- Si el usuario no existe se calcula igual un bcrypt (mismo tiempo de respuesta)
    v_ok := v_hash is not null and crypt(p_clave, v_hash) = v_hash;
    if v_hash is null then perform crypt(p_clave, gen_salt('bf', 10)); end if;
  exception when others then v_ok := false; -- hash de otro tipo: no entra por aquí (sí con el correo)
  end;

  if v_ok then
    delete from public.ingreso_usuario_intentos where usuario = v_usuario;
    return v_correo;
  end if;

  insert into public.ingreso_usuario_intentos as f (usuario, fallos) values (v_usuario, 1)
  on conflict (usuario) do update set fallos = f.fallos + 1, actualizado = now(),
    hasta = case when f.fallos + 1 >= 5 then now() + least(interval '1 hour', interval '15 minutes' * 2 ^ (f.fallos + 1 - 5)) end;
  insert into public.ingreso_usuario_intentos as f (usuario, fallos) values ('*', 1)
  on conflict (usuario) do update set
    fallos = case when f.actualizado < now() - interval '10 minutes' then 1 else f.fallos + 1 end,
    actualizado = case when f.actualizado < now() - interval '10 minutes' then now() else f.actualizado end,
    hasta = case when f.actualizado >= now() - interval '10 minutes' and f.fallos + 1 >= 100 then now() + interval '10 minutes' end;
  -- Limpieza: los intentos de hace más de un día ya no frenan a nadie
  delete from public.ingreso_usuario_intentos where usuario <> '*' and actualizado < now() - interval '1 day' and (hasta is null or hasta < now());
  return null;
end $$;
revoke execute on function public.correo_para_ingreso(text, text) from public;
grant execute on function public.correo_para_ingreso(text, text) to anon, authenticated;

-- El administrador asigna, cambia o quita (vacío) el usuario corto de alguien de su organización
create or replace function public.asignar_usuario_ingreso(p_usuario_id uuid, p_usuario text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_usuario text := public.normalizar_usuario(p_usuario);
  v_org uuid;
  v_antes text;
begin
  select m.org_id into v_org from public.miembros m
  where m.usuario_id = p_usuario_id and public.es_admin(m.org_id) limit 1;
  if v_org is null then raise exception 'Solo el administrador asigna usuarios de su organización' using errcode = '42501'; end if;
  select usuario into v_antes from public.usuarios_ingreso where usuario_id = p_usuario_id;

  if v_usuario = '' then
    delete from public.usuarios_ingreso where usuario_id = p_usuario_id;
  else
    if v_usuario !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
      raise exception 'El usuario debe tener de 3 a 30 letras o números (sin espacios, tildes ni @)' using errcode = '22023';
    end if;
    if exists (select 1 from public.usuarios_ingreso where usuario = v_usuario and usuario_id <> p_usuario_id) then
      raise exception 'Ese usuario ya está en uso' using errcode = '23505';
    end if;
    insert into public.usuarios_ingreso (usuario_id, usuario) values (p_usuario_id, v_usuario)
    on conflict (usuario_id) do update set usuario = excluded.usuario, cambiado_en = now(), cambiado_por = auth.uid();
  end if;
  delete from public.ingreso_usuario_intentos where usuario in (v_antes, v_usuario);

  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  values (v_org, 'usuarios_ingreso', p_usuario_id, case when v_usuario = '' then 'DELETE' when v_antes is null then 'INSERT' else 'UPDATE' end,
          case when v_antes is not null then jsonb_build_object('usuario', v_antes) end,
          case when v_usuario <> '' then jsonb_build_object('usuario', v_usuario) end);
  return nullif(v_usuario, '');
end $$;
revoke execute on function public.asignar_usuario_ingreso(uuid, text) from public, anon;
grant execute on function public.asignar_usuario_ingreso(uuid, text) to authenticated;

-- El propio usuario corto (el escritorio lo guarda para poder entrar con él sin internet)
create or replace function public.mi_usuario_ingreso()
returns text language sql stable security definer set search_path = public as $$
  select usuario from public.usuarios_ingreso where usuario_id = auth.uid()
$$;
revoke execute on function public.mi_usuario_ingreso() from public, anon;
grant execute on function public.mi_usuario_ingreso() to authenticated;

-- La lista de usuarios muestra el usuario corto solo al administrador y al propio usuario (columna nueva al
-- final: las versiones viejas la ignoran) y respeta el alcance de cada rol (RR. HH. no ve usuarios de otras empresas)
drop function if exists public.miembros_con_correo();
create function public.miembros_con_correo()
returns table (id uuid, usuario_id uuid, correo text, nombre text, rol public.rol_usuario, activo boolean, acceso_clinico boolean, empresas uuid[], usuario text)
language sql stable security definer set search_path = public, auth as $$
  select m.id, m.usuario_id, u.email::text, p.nombre_completo, m.rol, m.activo, m.acceso_clinico, m.empresas_permitidas,
         case when m.usuario_id = auth.uid() or public.es_admin(m.org_id) then i.usuario end
  from public.miembros m
  join auth.users u on u.id = m.usuario_id
  left join public.perfiles p on p.id = m.usuario_id
  left join public.usuarios_ingreso i on i.usuario_id = m.usuario_id
  where m.org_id in (select public.mis_orgs()) and public.ve_miembro(m.org_id, m.usuario_id)
  order by p.nombre_completo
$$;
revoke execute on function public.miembros_con_correo() from public, anon;
grant execute on function public.miembros_con_correo() to authenticated;
