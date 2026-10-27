-- zamorApp Ocupacional · Verificación en dos pasos para administradores y gerentes médicos.
-- 1. requiere_dos_pasos(): la persona que entró es administrador o gerente médico (activo) en alguna organización.
-- 2. La app web pide el código de 6 dígitos (app autenticadora, TOTP de Supabase Auth) antes de abrir el panel.
-- 3. Además la base frena, antes de cada pedido a la API, a quien la necesita y aún no la confirmó (sesión aal1):
--    así una contraseña robada no basta ni llamando la API directamente. Este freno queda listo pero APAGADO
--    (ajustes_seguridad.dos_pasos_en_base) hasta que el programa de escritorio pase el segundo paso a la nube:
--    hoy la PC sincroniza con la sesión de la persona, que sin ese paso es aal1, y quedaría sin sincronía.
--    Las sesiones sin "aal" (las de la puerta local del escritorio) no se frenan aquí: las controla la puerta.

create table if not exists public.ajustes_seguridad (
  clave text primary key,
  valor boolean not null default false
);
alter table public.ajustes_seguridad enable row level security; -- sin políticas: solo las funciones la leen
revoke all on public.ajustes_seguridad from anon, authenticated;
insert into public.ajustes_seguridad (clave, valor) values ('dos_pasos_en_base', false) on conflict (clave) do nothing;

create or replace function public.requiere_dos_pasos()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros
    where usuario_id = auth.uid() and activo and rol in ('administrador', 'gerente_medico')
  )
$$;
revoke execute on function public.requiere_dos_pasos() from anon;

-- Se ejecuta antes de cada pedido de PostgREST (db-pre-request). Un error aquí corta el pedido con 403.
create or replace function public.verificar_dos_pasos()
returns void language plpgsql stable security definer set search_path = public as $$
declare
  c jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if c is null or c ->> 'aal' is null or c ->> 'role' is distinct from 'authenticated' or c ->> 'aal' = 'aal2' then
    return;
  end if;
  if not coalesce((select valor from public.ajustes_seguridad where clave = 'dos_pasos_en_base'), false) then
    return;
  end if;
  -- La app pregunta esto para saber si debe pedir el código
  if current_setting('request.path', true) = '/rpc/requiere_dos_pasos' or not public.requiere_dos_pasos() then
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
