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

-- Solo la importación (sin sesión) o el administrador asignan un médico histórico, y siempre de la misma organización
create or replace function public.proteger_medico_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.medico_historico_id is null or (tg_op = 'UPDATE' and new.medico_historico_id is not distinct from old.medico_historico_id) then
    return new;
  end if;
  if not exists (select 1 from public.medicos_historicos h where h.id = new.medico_historico_id and h.org_id = new.org_id) then
    raise exception 'El médico histórico no pertenece a esta organización.';
  end if;
  if auth.uid() is not null and not public.es_admin(new.org_id) then
    raise exception 'Solo el administrador asigna un médico histórico a una consulta.';
  end if;
  return new;
end $$;
revoke execute on function public.proteger_medico_historico() from authenticated, anon, public;

drop trigger if exists proteger_medico_historico on clinico.consultas;
create trigger proteger_medico_historico before insert or update of medico_historico_id on clinico.consultas
  for each row execute function public.proteger_medico_historico();

-- La vista «select *» fija sus columnas al crearse: se recrea para exponer la nueva
create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;
