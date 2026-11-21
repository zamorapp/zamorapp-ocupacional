-- Registro de médicos especialistas para las referencias (pedido de Cesar, 19-nov-2026):
-- nombre y apellido, especialidad, dirección del consultorio (si se tiene) y contacto.
-- Al referir, la carta sale «Estimado(a) colega Dr(a). …, Especialista en …:» con su consultorio.
create table public.especialistas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  nombres text not null,
  apellidos text not null,
  especialidad text not null,
  direccion text,
  telefono text,
  correo text,
  notas text,
  activo boolean not null default true,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default public.ahora()
);

create index especialistas_org on public.especialistas (org_id);

alter table public.especialistas enable row level security;

-- Leer: todo el personal de la organización (la referencia la escribe quien atiende)
create policy especialistas_leer on public.especialistas for select using (org_id in (select public.mis_orgs()));

-- Gestionar: gerencia y recepción (los contactos los lleva quien agenda)
create or replace function public.puede_gestionar_especialistas(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol(p_org) in ('administrador', 'gerente_medico', 'recepcion'), false)
$$;
grant execute on function public.puede_gestionar_especialistas(uuid) to authenticated;
revoke execute on function public.puede_gestionar_especialistas(uuid) from public, anon;

create policy especialistas_editar on public.especialistas for all
  using (public.puede_gestionar_especialistas(org_id)) with check (public.puede_gestionar_especialistas(org_id));

create trigger bit_especialistas after insert or update or delete on public.especialistas
  for each row execute function public.registrar_bitacora();

-- Escritorio: baja con la copia (las referencias se escriben también sin internet)
insert into sync.tablas (nombre, clinica, subible) values ('public.especialistas', false, true)
  on conflict (nombre) do nothing;
alter table public.especialistas add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.especialistas;
create trigger sync_version before insert or update on public.especialistas for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.especialistas;
create trigger sync_anotar after insert or update or delete on public.especialistas for each row execute function sync.anotar();
