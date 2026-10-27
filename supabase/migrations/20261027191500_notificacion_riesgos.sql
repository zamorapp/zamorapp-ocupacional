-- zamorApp Ocupacional · Notificación de riesgos por escrito al trabajador (LOPCYMAT arts. 53.1 y 56.3)
-- Cada entrega guarda una copia de lo notificado (tareas, riesgos con su nivel y control, EPP, recomendaciones)
-- tomada de la evaluación del puesto: si el puesto se reevalúa después, la notificación queda desactualizada.

create table if not exists public.notificaciones_riesgo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  puesto_id uuid references public.puestos (id) on delete set null,
  puesto text not null,
  contenido jsonb not null default '{}'::jsonb,
  entregada_en date not null default current_date,
  entregada_por uuid references auth.users (id) on delete set null default auth.uid(),
  firmada_en date,                       -- el trabajador firmó el acuse en papel
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists notificaciones_riesgo_trabajador on public.notificaciones_riesgo (trabajador_id, entregada_en desc);
create index if not exists notificaciones_riesgo_empresa on public.notificaciones_riesgo (empresa_id, entregada_en desc);

alter table public.notificaciones_riesgo enable row level security;
drop policy if exists notificaciones_riesgo_leer on public.notificaciones_riesgo;
create policy notificaciones_riesgo_leer on public.notificaciones_riesgo for select
  using (public.puede_ver_empresa(org_id, empresa_id));
drop policy if exists notificaciones_riesgo_editar on public.notificaciones_riesgo;
create policy notificaciones_riesgo_editar on public.notificaciones_riesgo for all
  using (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'coordinador_sst', 'supervisor', 'delegado_prevencion'))
  with check (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'coordinador_sst', 'supervisor', 'delegado_prevencion'));
grant select, insert, update, delete on public.notificaciones_riesgo to authenticated;
revoke all on public.notificaciones_riesgo from anon;

-- El trabajador y el puesto deben ser de la empresa y organización de la notificación
create or replace function public.validar_notificacion_riesgo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.trabajadores t where t.id = new.trabajador_id and t.org_id = new.org_id and t.empresa_id = new.empresa_id)
     or (new.puesto_id is not null and not exists (select 1 from public.puestos p where p.id = new.puesto_id and p.org_id = new.org_id and p.empresa_id = new.empresa_id)) then
    raise exception 'El trabajador y el puesto deben ser de la misma empresa.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.validar_notificacion_riesgo() from public, authenticated, anon;
drop trigger if exists validar_notificacion_riesgo on public.notificaciones_riesgo;
create trigger validar_notificacion_riesgo before insert or update of org_id, empresa_id, trabajador_id, puesto_id on public.notificaciones_riesgo
  for each row execute function public.validar_notificacion_riesgo();

drop trigger if exists upd_notificaciones_riesgo on public.notificaciones_riesgo;
create trigger upd_notificaciones_riesgo before update on public.notificaciones_riesgo for each row execute function public.tocar_actualizado();
drop trigger if exists bit_notificaciones_riesgo on public.notificaciones_riesgo;
create trigger bit_notificaciones_riesgo after insert or update or delete on public.notificaciones_riesgo for each row execute function public.registrar_bitacora();

-- Réplica en el programa de escritorio
insert into sync.tablas (nombre, clinica, subible) values ('public.notificaciones_riesgo', false, true)
  on conflict (nombre) do nothing;
alter table public.notificaciones_riesgo add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.notificaciones_riesgo;
create trigger sync_version before insert or update on public.notificaciones_riesgo for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.notificaciones_riesgo;
create trigger sync_anotar after insert or update or delete on public.notificaciones_riesgo for each row execute function sync.anotar();
