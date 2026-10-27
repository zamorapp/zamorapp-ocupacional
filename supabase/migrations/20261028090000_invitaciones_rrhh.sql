-- zamorApp Ocupacional · Invitación por enlace para RR. HH. de cada empresa
-- El administrador genera un enlace (vence a los 7 días, un solo uso, revocable) y lo manda por WhatsApp desde su
-- teléfono. Quien lo abre crea su cuenta o ingresa y queda como RR. HH. (gerente_empresa) de esa empresa.
-- El token es aleatorio y la base guarda solo su sha256.

create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  nombre text check (nombre is null or length(nombre) <= 120),   -- a quién se invita (solo referencia)
  telefono text check (telefono is null or length(telefono) <= 30),
  token_hash bytea not null unique check (length(token_hash) = 32),
  vence timestamptz not null default now() + interval '7 days',
  usada_por uuid references auth.users (id),
  usada_en timestamptz,
  revocada_en timestamptz,
  creada_por uuid not null references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists invitaciones_empresa on public.invitaciones (empresa_id, creado_en desc);

alter table public.invitaciones enable row level security;
drop policy if exists invitaciones_admin on public.invitaciones;
create policy invitaciones_admin on public.invitaciones for all
  using (public.es_admin(org_id)) with check (public.es_admin(org_id));
revoke all on public.invitaciones from anon;
revoke update, delete, truncate on public.invitaciones from authenticated;
grant select, insert on public.invitaciones to authenticated;
grant update (revocada_en) on public.invitaciones to authenticated;

create or replace function public.validar_invitacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
      raise exception 'La empresa no pertenece a la organización';
    end if;
    if auth.uid() is not null then new.creada_por := auth.uid(); end if;
    new.creado_en := now();
    new.vence := least(coalesce(new.vence, now() + interval '7 days'), now() + interval '7 days');
    new.usada_por := null; new.usada_en := null; new.revocada_en := null;
    return new;
  end if;
  -- Desde la app solo se revoca (una vez); el uso lo marca aceptar_invitacion
  if current_setting('zamorapp.aceptando_invitacion', true) = old.id::text then return new; end if;
  if auth.uid() is not null and (
       old.revocada_en is not null or new.revocada_en is null
       or (to_jsonb(new) - 'revocada_en') is distinct from (to_jsonb(old) - 'revocada_en')) then
    raise exception 'Una invitación solo se puede anular';
  end if;
  return new;
end $$;
drop trigger if exists validar_invitacion on public.invitaciones;
create trigger validar_invitacion before insert or update on public.invitaciones
  for each row execute function public.validar_invitacion();

-- Lo que ve quien abre el enlace, aun sin cuenta: a qué empresa y servicio lo invitan y si sigue vigente
create or replace function public.ver_invitacion(p_token text)
returns table (empresa text, organizacion text, nombre text, estado text)
language sql stable security definer set search_path = public as $$
  select coalesce(e.nombre_comercial, e.razon_social), o.nombre, i.nombre,
         case when i.revocada_en is not null then 'anulada'
              when i.usada_en is not null then 'usada'
              when i.vence < now() then 'vencida'
              else 'vigente' end
  from public.invitaciones i
  join public.empresas e on e.id = i.empresa_id
  join public.organizaciones o on o.id = i.org_id
  where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
$$;
revoke execute on function public.ver_invitacion(text) from public;
grant execute on function public.ver_invitacion(text) to anon, authenticated;

-- Quien tiene sesión acepta: queda como RR. HH. de esa empresa (o suma la empresa si ya era RR. HH. de otra)
create or replace function public.aceptar_invitacion(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare i public.invitaciones; m public.miembros;
begin
  if auth.uid() is null then raise exception 'Ingresa con tu cuenta para aceptar la invitación'; end if;
  select * into i from public.invitaciones
  where token_hash = sha256(convert_to(p_token, 'UTF8')) for update;
  if i.id is null then raise exception 'El enlace no es válido'; end if;
  if i.revocada_en is not null then raise exception 'Esta invitación fue anulada. Pide un enlace nuevo.'; end if;
  if i.usada_en is not null then
    if i.usada_por = auth.uid() then return i.empresa_id; end if;
    raise exception 'Esta invitación ya se usó. Pide un enlace nuevo.';
  end if;
  if i.vence < now() then raise exception 'Esta invitación venció. Pide un enlace nuevo.'; end if;

  select * into m from public.miembros where org_id = i.org_id and usuario_id = auth.uid();
  if m.id is null then
    insert into public.miembros (org_id, usuario_id, rol, empresas_permitidas)
    values (i.org_id, auth.uid(), 'gerente_empresa', array[i.empresa_id]);
  elsif m.rol = 'gerente_empresa' then
    update public.miembros
    set empresas_permitidas = (select array_agg(distinct x) from unnest(coalesce(m.empresas_permitidas, '{}') || i.empresa_id) x),
        activo = true
    where id = m.id;
  else
    -- Nunca cambia el rol de alguien del servicio médico ni de otro rol de empresa
    raise exception 'Tu cuenta ya tiene otro rol en este servicio médico. Pide al administrador que te agregue la empresa.';
  end if;

  perform set_config('zamorapp.aceptando_invitacion', i.id::text, true);
  update public.invitaciones set usada_por = auth.uid(), usada_en = now() where id = i.id;
  perform set_config('zamorapp.aceptando_invitacion', '', true);
  perform public.notificar(i.org_id, i.empresa_id, 'servicio', 'RR. HH. aceptó la invitación',
    coalesce(i.nombre, 'Una persona') || ' ya entra al portal de la empresa.', '/configuracion/usuarios');
  return i.empresa_id;
end $$;
revoke execute on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;
