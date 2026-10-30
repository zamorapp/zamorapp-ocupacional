-- zamorApp · Vacaciones y alerta de post vacacional (Cesar, 30-oct): «tener en cuenta cuando se van de vacaciones,
-- cuánto tiempo les corresponde la revaloración para el post vacacional». Y avisos configurables por empresa.
-- 1. public.vacaciones: desde y regreso de cada trabajador. Las anota el servicio o RR. HH. de esa empresa (guardar_vacaciones).
-- 2. empresas.dias_post_vacacional: días que tiene el servicio, desde el regreso, para la evaluación post vacacional.
-- 3. Nuevo tipo de aviso por empresa «post_vacacional» (se apaga en «Avisos de esta empresa», como los otros).
-- 4. recordar_post_vacacional(): campana del personal clínico 2 días antes del regreso y otra vez si se vence el plazo.
--    Se apaga sola al registrar una consulta con motivo «Post vacacional» (POSV) desde el regreso.
-- Las vacaciones bajan a la copia del escritorio (sync.tablas); se escriben en línea.

create table if not exists public.vacaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  desde date not null,
  regreso date not null,
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  check (regreso > desde and regreso <= desde + 120)
);
create index if not exists vacaciones_trabajador on public.vacaciones (trabajador_id, regreso desc);
create index if not exists vacaciones_regreso on public.vacaciones (org_id, regreso);

alter table public.vacaciones enable row level security;
revoke all on public.vacaciones from anon;
revoke insert, update, delete on public.vacaciones from authenticated;
drop policy if exists vacaciones_leer on public.vacaciones;
-- Quien ve la empresa (servicio sin límite, o con esa empresa entre las permitidas, como RR. HH.); forma rápida (C14)
create policy vacaciones_leer on public.vacaciones for select to authenticated using (
  org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]));

insert into sync.tablas (nombre, clinica, subible) values ('public.vacaciones', false, false) on conflict (nombre) do nothing;
alter table public.vacaciones add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.vacaciones;
create trigger sync_version before insert or update on public.vacaciones for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.vacaciones;
create trigger sync_anotar after insert or update or delete on public.vacaciones for each row execute function sync.anotar();

alter table public.empresas add column if not exists dias_post_vacacional integer not null default 5;
alter table public.empresas drop constraint if exists empresas_dias_post_vacacional;
alter table public.empresas add constraint empresas_dias_post_vacacional check (dias_post_vacacional between 0 and 60);
alter table public.empresas drop constraint if exists empresas_avisos_apagados_validos;
alter table public.empresas add constraint empresas_avisos_apagados_validos
  check (avisos_apagados <@ array['vencimientos', 'proxima_evaluacion', 'resultados', 'post_vacacional']::text[]);

-- Anotar (o corregir, con p_id) las vacaciones: el servicio o RR. HH. de la empresa del trabajador
create or replace function public.guardar_vacaciones(p_trabajador uuid, p_desde date, p_regreso date, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_empresa uuid; v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  select t.org_id, t.empresa_id into v_org, v_empresa from public.trabajadores t where t.id = p_trabajador;
  if v_org is null or auth.uid() is null or not public.puede_ver_empresa(v_org, v_empresa)
     or coalesce(public.mi_rol(v_org)::text, '') not in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'gerente_empresa') then
    raise exception 'No puedes anotar vacaciones de este trabajador' using errcode = '42501';
  end if;
  if p_desde is null or p_regreso is null or p_regreso <= p_desde then raise exception 'El regreso debe ser después del inicio'; end if;
  insert into public.vacaciones (id, org_id, empresa_id, trabajador_id, desde, regreso)
  values (v_id, v_org, v_empresa, p_trabajador, p_desde, p_regreso)
  on conflict (id) do update set desde = excluded.desde, regreso = excluded.regreso
    where vacaciones.trabajador_id = p_trabajador;
  return v_id;
end $$;

create or replace function public.quitar_vacaciones(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.vacaciones v
   where v.id = p_id and auth.uid() is not null and public.puede_ver_empresa(v.org_id, v.empresa_id)
     and coalesce(public.mi_rol(v.org_id)::text, '') in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'gerente_empresa');
end $$;

-- Avisos ya dados por cada vacación y usuario (etapa: 'aviso' al acercarse el regreso, 'vencido' si pasa el plazo)
create table if not exists public.recordatorios_vacaciones (
  vacacion_id uuid not null references public.vacaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  etapa text not null check (etapa in ('aviso', 'vencido')),
  primary key (vacacion_id, usuario_id, etapa)
);
alter table public.recordatorios_vacaciones enable row level security;
revoke all on public.recordatorios_vacaciones from anon, authenticated;

create or replace function public.recordar_post_vacacional()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select v.id, v.org_id, v.empresa_id, v.trabajador_id, v.regreso, v.regreso + e.dias_post_vacacional as limite,
           t.nombres || ' ' || t.apellidos as nombre,
           case when v.regreso + e.dias_post_vacacional < v_hoy then 'vencido' else 'aviso' end as etapa
      from public.vacaciones v
      join public.empresas e on e.id = v.empresa_id and e.activa
      join public.trabajadores t on t.id = v.trabajador_id and t.estado in ('activo', 'reposo')
     where v.regreso <= v_hoy + 2 and v.regreso >= v_hoy - 60
       and not ('post_vacacional' = any (coalesce(e.avisos_apagados, '{}')))
       and (v.org_id = any (public.orgs_con(p_clinico => true, p_sin_limite => true))
            or (v.org_id::text || v.empresa_id::text) = any (public.pares_limitados(p_clinico => true)))
       and not exists (select 1 from clinico.consultas c join public.lista_items li on li.id = c.motivo_id and li.codigo = 'POSV'
                        where c.trabajador_id = v.trabajador_id and c.fecha >= v.regreso)
     order by v.regreso
     limit 30
  loop
    insert into public.recordatorios_vacaciones (vacacion_id, usuario_id, etapa) values (r.id, v_uid, r.etapa)
    on conflict do nothing;
    continue when not found;
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace, nivel)
    values (r.org_id, v_uid, r.empresa_id,
      case r.etapa when 'vencido' then 'Post vacacional vencido' else 'Post vacacional pendiente' end,
      r.nombre || case when r.regreso > v_hoy then ' · regresa el ' else ' · regresó el ' end || to_char(r.regreso, 'DD/MM/YYYY')
        || ' · evaluar antes del ' || to_char(r.limite, 'DD/MM/YYYY'),
      '/pacientes/' || r.trabajador_id,
      case r.etapa when 'vencido' then 'aviso' else 'info' end);
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

revoke execute on function public.guardar_vacaciones(uuid, date, date, uuid) from public, anon;
revoke execute on function public.quitar_vacaciones(uuid) from public, anon;
revoke execute on function public.recordar_post_vacacional() from public, anon;
grant execute on function public.guardar_vacaciones(uuid, date, date, uuid) to authenticated;
grant execute on function public.quitar_vacaciones(uuid) to authenticated;
grant execute on function public.recordar_post_vacacional() to authenticated;

-- Pausar o reactivar todos los avisos de una empresa de un toque (empresas con las que no se trabaja por un tiempo)
create or replace function public.pausar_avisos_empresa(p_empresa uuid, p_pausar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.empresas where id = p_empresa;
  if v_org is null or coalesce(public.mi_rol(v_org)::text, '') not in ('administrador', 'gerente_medico') then
    raise exception 'Solo el administrador o el gerente médico pausan avisos' using errcode = '42501';
  end if;
  update public.empresas
     set avisos_apagados = case when p_pausar then array['vencimientos', 'proxima_evaluacion', 'resultados', 'post_vacacional']::text[] else '{}' end
   where id = p_empresa;
end $$;
revoke execute on function public.pausar_avisos_empresa(uuid, boolean) from public, anon;
grant execute on function public.pausar_avisos_empresa(uuid, boolean) to authenticated;
