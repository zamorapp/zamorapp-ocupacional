-- zamorApp Ocupacional · Historia laboral del trabajador (empleos anteriores) y certificado de salud
-- Es información de salud (problemas, accidentes, enfermedades ocupacionales previas): solo personal clínico.
create table if not exists clinico.historia_laboral (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  empresa text not null,
  industria text,
  cargo text,
  descripcion text,
  duracion text,
  horario text,
  condiciones jsonb not null default '{}',  -- ambiente, actividad, traslado, carga
  riesgos jsonb not null default '{}',      -- mismas claves que los puestos: fisico, quimico, biologico, mecanico, disergonomico, psicosocial
  epp text,
  problemas_salud text,
  accidentes text,
  enfermedades text,
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  origen text, codigo_origen text, lote_importacion uuid references public.importaciones (id) on delete set null
);
create index if not exists historia_laboral_trabajador on clinico.historia_laboral (trabajador_id);
create unique index if not exists clinico_historia_laboral_origen on clinico.historia_laboral (org_id, origen, codigo_origen) where origen is not null;

alter table clinico.historia_laboral enable row level security;
drop policy if exists historia_laboral_clinico on clinico.historia_laboral;
create policy historia_laboral_clinico on clinico.historia_laboral for all
  using (public.es_clinico(org_id)) with check (public.es_clinico(org_id));
grant select, insert, update, delete on clinico.historia_laboral to authenticated;

drop trigger if exists upd_historia_laboral on clinico.historia_laboral;
create trigger upd_historia_laboral before update on clinico.historia_laboral for each row execute function public.tocar_actualizado();

create or replace view public.historia_laboral with (security_invoker = true) as select * from clinico.historia_laboral;
grant select, insert, update, delete on public.historia_laboral to authenticated;
revoke all on public.historia_laboral from anon;
