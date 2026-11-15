-- Segundo paso sin pedir el código en cada entrada (decisión de Cesar, 28-oct): el código queda de respaldo
-- (si falla la huella) y para revalidar cada cierto tiempo.
-- La huella web (llave de acceso) NO cuenta sola como segundo paso: con solo la clave se podría registrar una llave
-- propia y saltarse el código para siempre (revisión de Analizar). Lo que evita repetir el código es el equipo de
-- confianza, que solo se obtiene con el código ya escrito (aal2).
-- Equipo de confianza: tras escribir el código, el navegador recibe un token al azar que la base guarda solo como
--    hash (sha256). Con ese token en la cabecera x-zamorapp-equipo, una sesión aal1 de esa persona cuenta como
--    verificada hasta que venza (días configurables por la organización, 30 por defecto; 0 = pedir siempre).
--    No se puede falsificar: sin el token exacto no hay hash que coincida, y sirve solo a su dueño.

create table if not exists public.equipos_confianza (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  hash text not null unique,
  nombre text not null default '',
  creado_en timestamptz not null default now(),
  vence timestamptz not null,
  usado_en timestamptz
);
create index if not exists equipos_confianza_usuario on public.equipos_confianza (usuario_id);
alter table public.equipos_confianza enable row level security;
revoke all on public.equipos_confianza from anon, authenticated;

-- Días que dura la confianza: el mayor de las organizaciones donde la persona es administrador o gerente médico
create or replace function public.dias_equipo_confianza()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(max(least(90, greatest(0, coalesce((o.ajustes ->> 'dias_equipo_confianza')::int, 30)))), 30)
  from public.miembros m join public.organizaciones o on o.id = m.org_id
  where m.usuario_id = auth.uid() and m.activo and m.rol in ('administrador', 'gerente_medico');
$$;

revoke execute on function public.dias_equipo_confianza() from anon;

-- ¿La cabecera trae un token vigente de esta persona?
create or replace function public.equipo_de_confianza()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  t text := nullif(current_setting('request.headers', true), '')::json ->> 'x-zamorapp-equipo';
begin
  if t is null or length(t) < 40 or auth.uid() is null then return false; end if;
  return exists (select 1 from public.equipos_confianza
                 where hash = encode(sha256(convert_to(t, 'UTF8')), 'hex') and usuario_id = auth.uid() and vence > now());
end $$;
revoke execute on function public.equipo_de_confianza() from anon;

-- Solo con el código ya escrito (aal2) se marca este equipo. Devuelve el token (una sola vez) o null si la
-- organización pide el código siempre.
create or replace function public.confiar_equipo(p_nombre text default '')
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  dias int := public.dias_equipo_confianza();
  t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v timestamptz := now() + make_interval(days => dias);
begin
  if auth.uid() is null or c ->> 'aal' is distinct from 'aal2' then
    raise exception 'Primero escribe el código de verificación en dos pasos' using errcode = '42501';
  end if;
  if dias = 0 then return null; end if;
  delete from public.equipos_confianza where usuario_id = auth.uid() and vence <= now();
  insert into public.equipos_confianza (usuario_id, hash, nombre, vence)
  values (auth.uid(), encode(sha256(convert_to(t, 'UTF8')), 'hex'), left(coalesce(p_nombre, ''), 80), v);
  return json_build_object('token', t, 'vence', v, 'dias', dias);
end $$;
revoke execute on function public.confiar_equipo(text) from anon;

-- «Olvidar mis equipos»: vuelve a pedir el código en todos (p. ej. si perdió una laptop)
create or replace function public.olvidar_equipos()
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  delete from public.equipos_confianza where usuario_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.olvidar_equipos() from anon;

create or replace function public.mis_equipos_confianza()
returns table (id uuid, nombre text, creado_en timestamptz, vence timestamptz)
language sql stable security definer set search_path = public as $$
  select id, nombre, creado_en, vence from public.equipos_confianza
  where usuario_id = auth.uid() and vence > now() order by creado_en desc;
$$;
revoke execute on function public.mis_equipos_confianza() from anon;

create or replace function public.dos_pasos_cumplido()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if c is null or c ->> 'aal' is distinct from 'aal1' or c ->> 'role' is distinct from 'authenticated' then
    return true;
  end if;
  if not coalesce((select valor from public.ajustes_seguridad where clave = 'dos_pasos_en_base'), false) then
    return true;
  end if;
  return not public.requiere_dos_pasos() or public.equipo_de_confianza();
end $$;

-- La app pregunta en una sola consulta si debe pedir el código (en vez de requiere_dos_pasos + equipo)
create or replace function public.falta_segundo_paso()
returns boolean language sql stable security definer set search_path = public as $$
  select not public.dos_pasos_cumplido();
$$;
revoke execute on function public.falta_segundo_paso() from anon;

-- El freno deja pasar también la pregunta «¿falta el segundo paso?» (sin ella la app no sabría si pedir el código)
create or replace function public.verificar_dos_pasos()
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_ruta text := current_setting('request.path', true);
begin
  if public.dos_pasos_cumplido() then return; end if;
  if v_ruta in ('/rpc/requiere_dos_pasos', '/rpc/falta_segundo_paso', '/rpc/dias_equipo_confianza', '/rpc/cambios_desde', '/rpc/instantanea', '/rpc/aplicar_cambios')
     or (v_ruta = '/miembros' and current_setting('request.method', true) = 'GET') then
    return;
  end if;
  raise exception using
    errcode = 'PGRST',
    message = json_build_object('code', 'dos_pasos', 'message', 'Confirma la verificación en dos pasos para continuar.', 'details', null, 'hint', null)::text,
    detail = json_build_object('status', 403, 'headers', json_build_object())::text;
end $$;
