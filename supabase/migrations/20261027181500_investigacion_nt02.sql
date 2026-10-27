-- zamorApp Ocupacional · Informe de investigación de enfermedad ocupacional (NT-02-2008, Título IV, cap. II, punto 2)
-- y seguimiento de la certificación del INPSASEL (LOPCYMAT arts. 76 a 81).
-- El informe trae criterio clínico y paraclínico: vive en el esquema clínico, solo lo ve el personal de salud.

-- ─── 1) Informe por evento ───
create table if not exists clinico.investigaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  evento_id uuid not null unique references public.eventos (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete restrict,
  -- Partes 2.1 a 2.6 y cierre: {trabajador, gestion, higienico, epidemiologico, clinico, paraclinico, metodologia, conclusiones, propuestas}
  secciones jsonb not null default '{}'::jsonb,
  -- Portada: [{nombre, cedula, cargo, instancia: servicio | comite | delegado | trabajador}]
  participantes jsonb not null default '[]'::jsonb,
  estado text not null default 'borrador' check (estado in ('borrador', 'terminado')),
  terminado_en date,
  elaborado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists investigaciones_trabajador on clinico.investigaciones (trabajador_id);

alter table clinico.investigaciones enable row level security;
drop policy if exists investigaciones_clinico on clinico.investigaciones;
create policy investigaciones_clinico on clinico.investigaciones for all
  using (public.es_clinico(org_id)) with check (public.es_clinico(org_id));
drop policy if exists investigaciones_empresa on clinico.investigaciones;
create policy investigaciones_empresa on clinico.investigaciones as restrictive for all
  using (public.ve_trabajador(org_id, trabajador_id)) with check (public.ve_trabajador(org_id, trabajador_id));
grant select, insert, update, delete on clinico.investigaciones to authenticated;

-- El evento y el trabajador deben ser de la misma organización
create or replace function public.validar_investigacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.eventos e
                 where e.id = new.evento_id and e.org_id = new.org_id and e.trabajador_id = new.trabajador_id) then
    raise exception 'El informe debe ser del mismo evento y trabajador.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.validar_investigacion() from public, authenticated, anon;
drop trigger if exists validar_investigacion on clinico.investigaciones;
create trigger validar_investigacion before insert or update of org_id, evento_id, trabajador_id on clinico.investigaciones
  for each row execute function public.validar_investigacion();

drop trigger if exists upd_investigaciones on clinico.investigaciones;
create trigger upd_investigaciones before update on clinico.investigaciones for each row execute function public.tocar_actualizado();

create or replace view public.investigaciones with (security_invoker = true) as select * from clinico.investigaciones;
grant select, insert, update, delete on public.investigaciones to authenticated;
revoke all on public.investigaciones from anon;

-- ─── 2) Certificación y discapacidad en el evento ───
alter table public.eventos
  add column if not exists potencial_discapacidad boolean not null default false,
  add column if not exists certificacion_fecha date,
  add column if not exists certificacion_numero text,
  add column if not exists discapacidad text check (discapacidad in
    ('temporal', 'parcial_permanente', 'total_permanente', 'absoluta_permanente', 'gran_discapacidad')),
  add column if not exists discapacidad_pct numeric(5, 2) check (discapacidad_pct between 0 and 100);

-- ─── 3) Réplica en el programa de escritorio ───
insert into sync.tablas (nombre, clinica, subible) values ('clinico.investigaciones', true, true)
  on conflict (nombre) do nothing;
alter table clinico.investigaciones add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on clinico.investigaciones;
create trigger sync_version before insert or update on clinico.investigaciones for each row execute function sync.versionar();
drop trigger if exists sync_anotar on clinico.investigaciones;
create trigger sync_anotar after insert or update or delete on clinico.investigaciones for each row execute function sync.anotar();
