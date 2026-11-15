-- zamorApp · Avisos al celular (Cesar, 30-oct): «notificarme al celular cuando se hagan los registros, porque no siempre
-- tengo la laptop prendida». Notificación push (Web Push) en el celular del personal del servicio cuando RR. HH. entra por
-- la invitación, pide citas, registra trabajadores o hace una solicitud. Sale de la nube (Vercel) con la PC apagada.
-- 1. suscripciones_push: un renglón por celular/navegador. Cada quien ve y quita solo las suyas; nadie más las lee.
-- 2. Quien dispara el aviso es la sesión de RR. HH. (server action en Vercel), que NO puede leer las suscripciones: las
--    pide a suscripciones_para_aviso() con la clave compartida del servidor (derivada de VAPID_PRIVADA, nunca llega al
--    navegador). La base guarda solo su sha256. Sin clave correcta no devuelve nada. Nunca service_role.
-- No baja a la copia local del escritorio (no está en sync.tablas): el celular se suscribe en la web.

create table if not exists public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),
  equipo text check (length(equipo) <= 120),
  creada_en timestamptz not null default public.ahora(),
  ultimo_aviso timestamptz
);
create index if not exists suscripciones_push_org on public.suscripciones_push (org_id);

alter table public.suscripciones_push enable row level security;
revoke all on public.suscripciones_push from anon;
revoke insert, update on public.suscripciones_push from authenticated;
drop policy if exists push_leer_propias on public.suscripciones_push;
drop policy if exists push_quitar_propias on public.suscripciones_push;
create policy push_leer_propias on public.suscripciones_push for select to authenticated using (usuario_id = auth.uid());
create policy push_quitar_propias on public.suscripciones_push for delete to authenticated using (usuario_id = auth.uid());

-- Clave compartida del servidor (solo su sha256). Sin políticas: nadie la lee desde la API.
create table if not exists public.avisos_push_clave (
  org_id uuid primary key references public.organizaciones (id) on delete cascade,
  clave_hash bytea not null
);
alter table public.avisos_push_clave enable row level security;
revoke all on public.avisos_push_clave from anon, authenticated;

-- Activar avisos en este celular: solo el personal del servicio. La clave del servidor la anota (la primera vez o si se
-- renuevan las llaves VAPID) solo el administrador o el gerente médico; los demás activan después.
create or replace function public.guardar_suscripcion_push(p_org uuid, p_endpoint text, p_p256dh text, p_auth text, p_equipo text, p_clave text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_actual bytea;
begin
  if auth.uid() is null or not public.es_servicio(p_org) then
    raise exception 'Solo el personal del servicio activa avisos' using errcode = '42501';
  end if;
  if length(coalesce(p_clave, '')) < 32 then raise exception 'Falta la clave de avisos del servidor'; end if;
  select clave_hash into v_actual from public.avisos_push_clave where org_id = p_org;
  if v_actual is distinct from v_hash then
    -- Anotar la clave (la primera vez o tras renovar las llaves) solo lo hacen el administrador o el gerente médico
    if public.mi_rol(p_org) not in ('administrador', 'gerente_medico') then
      raise exception 'Que el administrador active los avisos primero' using errcode = '42501';
    end if;
    insert into public.avisos_push_clave (org_id, clave_hash) values (p_org, v_hash)
    on conflict (org_id) do update set clave_hash = excluded.clave_hash;
  end if;
  insert into public.suscripciones_push (org_id, usuario_id, endpoint, p256dh, auth, equipo)
  values (p_org, auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(btrim(p_equipo), ''))
  on conflict (endpoint) do update
    set org_id = excluded.org_id, usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth,
        equipo = excluded.equipo, creada_en = public.ahora();
end $$;

-- A quién avisar: los celulares del personal del servicio activo de la organización de esa empresa. La pide la sesión de
-- quien hizo el registro (debe ver esa empresa) junto con la clave del servidor. Anota la hora del aviso.
create or replace function public.suscripciones_para_aviso(p_empresa uuid, p_clave text)
returns table (endpoint text, p256dh text, auth text) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_org uuid;
begin
  select e.org_id into v_org from public.empresas e where e.id = p_empresa;
  if v_org is null or auth.uid() is null or not public.puede_ver_empresa(v_org, p_empresa) then return; end if;
  if not exists (select 1 from public.avisos_push_clave k
                 where k.org_id = v_org and k.clave_hash = sha256(convert_to(coalesce(p_clave, ''), 'UTF8'))) then return; end if;
  return query
    with avisadas as (
      update public.suscripciones_push s set ultimo_aviso = public.ahora()
        from public.miembros m
       where s.org_id = v_org and m.org_id = v_org and m.usuario_id = s.usuario_id and m.activo
         and m.rol in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion')
      returning s.endpoint, s.p256dh, s.auth)
    select a.endpoint, a.p256dh, a.auth from avisadas a;
end $$;

-- El servicio de push dijo que la suscripción ya no existe (410/404): se borra. También con la clave del servidor.
create or replace function public.quitar_suscripcion_vencida(p_empresa uuid, p_endpoint text, p_clave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.suscripciones_push s
   using public.empresas e, public.avisos_push_clave k
   where e.id = p_empresa and s.org_id = e.org_id and k.org_id = e.org_id and s.endpoint = p_endpoint
     and k.clave_hash = sha256(convert_to(coalesce(p_clave, ''), 'UTF8'))
     and auth.uid() is not null and public.puede_ver_empresa(e.org_id, p_empresa);
end $$;

revoke execute on function public.guardar_suscripcion_push(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.suscripciones_para_aviso(uuid, text) from public, anon;
revoke execute on function public.quitar_suscripcion_vencida(uuid, text, text) from public, anon;
grant execute on function public.guardar_suscripcion_push(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.suscripciones_para_aviso(uuid, text) to authenticated;
grant execute on function public.quitar_suscripcion_vencida(uuid, text, text) to authenticated;
