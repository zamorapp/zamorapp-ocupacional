-- zamorApp Ocupacional · Seguridad clínica (auditoría 2026-10-26)
-- 1) La empresa solo ve la aptitud de consultas cerradas o firmadas. Antes la veía (y recibía el aviso
--    "Aptitud emitida") apenas el médico guardaba un borrador.
-- 2) El aviso a la empresa sale una sola vez, cuando la consulta queda cerrada con su aptitud.
-- 3) Diagnósticos, aptitudes, reposos, adjuntos, historia laboral y archivos respetan las empresas
--    asignadas al usuario (antes bastaba con tener acceso clínico en la organización).
-- 4) Depurar nómina solo actúa sobre las empresas asignadas.
-- 5) Una consulta firmada no se puede borrar.

-- ─── 1. Aptitud visible para la empresa solo al cerrar ─────────
create or replace view public.aptitud_trabajadores
with (security_invoker = false) as
  select a.id, a.org_id, c.empresa_id, a.trabajador_id, c.fecha, c.motivo_id,
         a.clasificacion, a.restricciones, a.vigente_hasta
  from clinico.aptitudes a
  join clinico.consultas c on c.id = a.consulta_id
  where c.estado in ('cerrada', 'firmada')
    and public.puede_ver_empresa(a.org_id, c.empresa_id);

create or replace view public.ultima_aptitud with (security_invoker = false) as
  select distinct on (a.trabajador_id) a.trabajador_id, a.org_id, c.empresa_id, c.fecha, a.clasificacion, a.vigente_hasta
  from clinico.aptitudes a
  join clinico.consultas c on c.id = a.consulta_id
  where c.estado in ('cerrada', 'firmada')
    and public.puede_ver_empresa(a.org_id, c.empresa_id)
  order by a.trabajador_id, c.fecha desc, a.emitida_en desc;

-- ─── 2. Aviso "Aptitud emitida" una sola vez, al cerrar ────────
alter table clinico.aptitudes add column if not exists avisada_en timestamptz;
-- Las aptitudes ya existentes (incluidas las traídas del Integral) se dan por avisadas
update clinico.aptitudes set avisada_en = emitida_en where avisada_en is null;

drop trigger if exists avisar_aptitud on clinico.aptitudes;

create or replace function public.avisar_aptitud()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_empresa uuid;
begin
  if new.avisada_en is not null then return new; end if;
  if not exists (select 1 from clinico.consultas c where c.id = new.consulta_id and c.estado in ('cerrada', 'firmada')) then
    return new;
  end if;
  select t.nombres || ' ' || t.apellidos, t.empresa_id into v_nombre, v_empresa from public.trabajadores t where t.id = new.trabajador_id;
  perform public.notificar(new.org_id, v_empresa, 'empresa', 'Aptitud emitida', v_nombre, '/portal');
  new.avisada_en := now();
  return new;
end $$;

create trigger avisar_aptitud before insert or update on clinico.aptitudes
  for each row execute function public.avisar_aptitud();

-- Al cerrar una consulta que ya tenía aptitud, se dispara el aviso pendiente
create or replace function public.avisar_aptitud_al_cerrar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update clinico.aptitudes set avisada_en = null where consulta_id = new.id and avisada_en is null;
  return new;
end $$;

drop trigger if exists avisar_aptitud_al_cerrar on clinico.consultas;
create trigger avisar_aptitud_al_cerrar after update of estado on clinico.consultas
  for each row when (new.estado in ('cerrada', 'firmada') and old.estado not in ('cerrada', 'firmada'))
  execute function public.avisar_aptitud_al_cerrar();

revoke execute on function public.avisar_aptitud() from authenticated;
revoke execute on function public.avisar_aptitud_al_cerrar() from authenticated;

-- ─── 3. Datos clínicos limitados a las empresas asignadas ──────
-- Sin empresas asignadas (null) el usuario ve todas las de su organización, como hasta ahora.
create or replace function public.ve_consulta(p_org uuid, p_consulta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros m
    where m.usuario_id = auth.uid() and m.org_id = p_org and m.activo
      and (m.empresas_permitidas is null
           or exists (select 1 from clinico.consultas c where c.id = p_consulta and c.empresa_id = any (m.empresas_permitidas)))
  )
$$;

create or replace function public.ve_trabajador(p_org uuid, p_trabajador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros m
    where m.usuario_id = auth.uid() and m.org_id = p_org and m.activo
      and (m.empresas_permitidas is null
           or exists (select 1 from public.trabajadores t where t.id = p_trabajador and t.empresa_id = any (m.empresas_permitidas)))
  )
$$;

drop policy if exists diagnosticos_empresa on clinico.diagnosticos;
create policy diagnosticos_empresa on clinico.diagnosticos as restrictive for all
  using (public.ve_consulta(org_id, consulta_id)) with check (public.ve_consulta(org_id, consulta_id));

drop policy if exists aptitudes_empresa on clinico.aptitudes;
create policy aptitudes_empresa on clinico.aptitudes as restrictive for all
  using (public.ve_consulta(org_id, consulta_id)) with check (public.ve_consulta(org_id, consulta_id));

drop policy if exists reposos_empresa on clinico.reposos;
create policy reposos_empresa on clinico.reposos as restrictive for all
  using (case when consulta_id is null then public.ve_trabajador(org_id, trabajador_id) else public.ve_consulta(org_id, consulta_id) end)
  with check (case when consulta_id is null then public.ve_trabajador(org_id, trabajador_id) else public.ve_consulta(org_id, consulta_id) end);

drop policy if exists adjuntos_empresa on clinico.adjuntos;
create policy adjuntos_empresa on clinico.adjuntos as restrictive for all
  using (public.ve_trabajador(org_id, trabajador_id)) with check (public.ve_trabajador(org_id, trabajador_id));

drop policy if exists historia_laboral_empresa on clinico.historia_laboral;
create policy historia_laboral_empresa on clinico.historia_laboral as restrictive for all
  using (public.ve_trabajador(org_id, trabajador_id)) with check (public.ve_trabajador(org_id, trabajador_id));

-- Archivos: ruta <org_id>/<trabajador_id>/<archivo>
drop policy if exists adjuntos_empresa on storage.objects;
create policy adjuntos_empresa on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'adjuntos'
         or public.ve_trabajador(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid))
  with check (bucket_id <> 'adjuntos'
         or public.ve_trabajador(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid));

-- ─── 4. Depurar nómina dentro de las empresas asignadas ────────
create or replace function public.depurar_nomina(p_empresa uuid, p_desde date, p_aplicar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_org uuid;
begin
  select org_id into v_org from public.miembros where usuario_id = auth.uid() and activo order by creado_en limit 1;
  if v_org is null or not (public.es_admin(v_org) or public.es_clinico(v_org)) then
    raise exception 'Sin permiso para depurar la nómina';
  end if;
  if p_empresa is not null and not public.puede_ver_empresa(v_org, p_empresa) then
    raise exception 'Sin permiso sobre esa empresa';
  end if;

  create temp table _salen on commit drop as
    select t.id from public.trabajadores t
    where t.org_id = v_org
      and (p_empresa is null or t.empresa_id = p_empresa)
      and public.puede_ver_empresa(v_org, t.empresa_id)
      and t.estado in ('activo', 'reposo', 'aspirante')
      and (t.creado_en::date < p_desde or t.origen is not null)
      and not exists (select 1 from clinico.consultas c where c.trabajador_id = t.id and c.fecha >= p_desde);

  if p_aplicar then
    update public.trabajadores t set estado = 'egresado', fecha_egreso = coalesce(t.fecha_egreso, current_date)
    where t.id in (select id from _salen);
  end if;
  select count(*) into n from _salen;
  drop table _salen;
  return n;
end $$;

-- ─── 5. Consulta firmada: tampoco se borra ─────────────────────
drop policy if exists consultas_firmadas_no_borrar on clinico.consultas;
create policy consultas_firmadas_no_borrar on clinico.consultas as restrictive for delete
  using (estado <> 'firmada');
