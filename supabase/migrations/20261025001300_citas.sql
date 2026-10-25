-- zamorApp Ocupacional · Citas y cola de atención
-- Una cita pasa por: citado → en_espera (llegó) → en_consulta → atendido; o no_asistio / cancelada.

create table public.citas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  fecha date not null,
  hora time,
  motivo_id uuid references public.lista_items (id),
  estado text not null default 'citado'
    check (estado in ('citado', 'en_espera', 'en_consulta', 'atendido', 'no_asistio', 'cancelada')),
  llegada timestamptz,
  consulta_id uuid references clinico.consultas (id) on delete set null,
  observacion text,
  origen text not null default 'individual' check (origen in ('individual', 'lote')),
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index on public.citas (org_id, fecha, hora);
create index on public.citas (trabajador_id, fecha);

alter table public.citas enable row level security;
create policy citas_leer on public.citas for select using (public.puede_ver_empresa(org_id, empresa_id));
create policy citas_editar on public.citas for all
  using (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'coordinador_sst'))
  with check (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'coordinador_sst'));

create trigger bit_citas after insert or update or delete on public.citas for each row execute function public.registrar_bitacora();
