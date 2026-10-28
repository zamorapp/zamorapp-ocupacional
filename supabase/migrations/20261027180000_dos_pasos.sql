-- zamorApp Ocupacional · Verificación en dos pasos para administradores y gerentes médicos.
-- 1. requiere_dos_pasos(): la persona que entró es administrador o gerente médico (activo) en alguna organización.
-- 2. La app (web y escritorio) pide el código de 6 dígitos (app autenticadora, TOTP de Supabase Auth) antes de abrir
--    el panel.
-- 3. La base frena, antes de cada pedido a la API (db-pre-request), a quien la necesita y aún no la confirmó (sesión
--    aal1): una contraseña robada no basta ni llamando la API directamente. Pasan solo: preguntar si hace falta, la
--    sincronía del escritorio (exige además el secreto del equipo) y leer la propia fila de miembros (la puerta
--    local consulta el rol al entrar). Los archivos (storage) siguen la misma regla.
-- 4. Registrar una PC le da copia de todos los datos: exige el segundo paso aunque el freno se apague.
-- Las sesiones sin "aal" (la puerta local del escritorio, el simulador de pruebas) no se frenan: ahí decide la puerta.

create table if not exists public.ajustes_seguridad (
  clave text primary key,
  valor boolean not null default false
);
alter table public.ajustes_seguridad enable row level security; -- sin políticas: solo las funciones la leen
revoke all on public.ajustes_seguridad from anon, authenticated;
insert into public.ajustes_seguridad (clave, valor) values ('dos_pasos_en_base', true) on conflict (clave) do nothing;

create or replace function public.requiere_dos_pasos()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros
    where usuario_id = auth.uid() and activo and rol in ('administrador', 'gerente_medico')
  )
$$;
revoke execute on function public.requiere_dos_pasos() from anon;

-- Falso solo para quien necesita el segundo paso, entró con aal1 y el freno está encendido.
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
  return not public.requiere_dos_pasos();
end $$;

-- Se ejecuta antes de cada pedido de PostgREST. Un error aquí corta el pedido con 403.
create or replace function public.verificar_dos_pasos()
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_ruta text := current_setting('request.path', true);
begin
  if public.dos_pasos_cumplido() then return; end if;
  if v_ruta in ('/rpc/requiere_dos_pasos', '/rpc/cambios_desde', '/rpc/instantanea', '/rpc/aplicar_cambios')
     or (v_ruta = '/miembros' and current_setting('request.method', true) = 'GET') then
    return;
  end if;
  raise exception using
    errcode = 'PGRST',
    message = json_build_object('code', 'dos_pasos', 'message', 'Confirma la verificación en dos pasos para continuar.', 'details', null, 'hint', null)::text,
    detail = json_build_object('status', 403, 'headers', json_build_object())::text;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.verificar_dos_pasos''';
  end if;
end $$;
notify pgrst, 'reload config';

-- Archivos adjuntos (firmas, exámenes escaneados): la API de storage no pasa por el freno de PostgREST
drop policy if exists dos_pasos on storage.objects;
create policy dos_pasos on storage.objects as restrictive for all to authenticated
  using (public.dos_pasos_cumplido()) with check (public.dos_pasos_cumplido());

-- Alta de una PC: además del rol de administrador, el segundo paso (independiente del freno)
create or replace function public.registrar_equipo(p_org uuid, p_nombre text, p_serie text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_secreto text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); v_id uuid;
begin
  if not public.es_admin(p_org) then raise exception 'Solo el administrador registra equipos' using errcode = '42501'; end if;
  if nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal' = 'aal1' and public.requiere_dos_pasos() then
    raise exception 'Confirma la verificación en dos pasos para registrar una PC' using errcode = '42501';
  end if;
  insert into public.equipos (org_id, nombre, serie, secreto_hash)
  values (p_org, p_nombre, upper(p_serie), encode(sha256(convert_to(v_secreto, 'UTF8')), 'hex'))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'secreto', v_secreto);
end $$;
