-- zamorApp Ocupacional · Médicos que atendieron en el SAME y no usan zamorApp
-- Solo identifican al autor de las consultas importadas: no tienen cuenta, firma ni sello,
-- así que ningún documento puede firmarse a su nombre.
create table if not exists public.medicos_historicos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  nombre_completo text not null,
  cedula text,
  mpps text,
  colegio_medicos text,
  especialidad text,
  origen text,
  codigo_origen text,
  creado_en timestamptz not null default now()
);
create unique index if not exists medicos_historicos_origen on public.medicos_historicos (org_id, origen, codigo_origen) where origen is not null;

alter table public.medicos_historicos enable row level security;
-- Lo ve el personal de la organización que atiende (como el nombre del médico en la consulta); lo edita el administrador
drop policy if exists medicos_historicos_leer on public.medicos_historicos;
create policy medicos_historicos_leer on public.medicos_historicos for select
  using (public.es_clinico(org_id) or public.es_admin(org_id));
drop policy if exists medicos_historicos_admin on public.medicos_historicos;
create policy medicos_historicos_admin on public.medicos_historicos for all
  using (public.es_admin(org_id)) with check (public.es_admin(org_id));
revoke all on public.medicos_historicos from anon;
grant select, insert, update, delete on public.medicos_historicos to authenticated;

alter table clinico.consultas add column if not exists medico_historico_id uuid references public.medicos_historicos (id) on delete set null;
create index if not exists consultas_medico_historico on clinico.consultas (medico_historico_id) where medico_historico_id is not null;

-- La vista «select *» fija sus columnas al crearse: se recrea para exponer la nueva
create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;
