-- zamorApp Ocupacional · Corregir una consulta firmada (pedido de Cesar, 27/10/2026)
-- La firma sigue bloqueando la consulta: nadie la edita ni la borra por la vía normal.
-- Si hubo un error, el médico autor, el gerente médico o el administrador con acceso clínico la «reabren para corregir»
-- con un motivo obligatorio. Antes de reabrir se guarda la versión firmada completa (consulta, diagnósticos, aptitud
-- y reposo) en consultas_versiones, que no se puede editar ni borrar. La consulta vuelve a borrador con la revisión
-- siguiente; los impresos de la revisión anterior quedan reemplazados por los nuevos.

alter table clinico.consultas add column if not exists revision integer not null default 1;

create table if not exists clinico.consultas_versiones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  consulta_id uuid not null references clinico.consultas (id) on delete cascade,
  revision integer not null,
  firmada_en timestamptz,
  contenido jsonb not null,        -- {consulta, diagnosticos, aptitud, reposo} tal como estaban firmados
  motivo text not null check (length(trim(motivo)) >= 10),
  reabierta_por uuid not null default auth.uid(),
  reabierta_en timestamptz not null default now(),
  unique (consulta_id, revision)
);
create index if not exists consultas_versiones_consulta on clinico.consultas_versiones (consulta_id);

alter table clinico.consultas_versiones enable row level security;
create policy consultas_versiones_leer on clinico.consultas_versiones for select
  using (public.es_clinico(org_id) and public.ve_consulta(org_id, consulta_id));
-- Solo lectura para los usuarios: las versiones las escribe reabrir_consulta()
revoke all on clinico.consultas_versiones from anon, authenticated;
grant select on clinico.consultas_versiones to authenticated;

create or replace view public.consultas_versiones with (security_invoker = true) as select * from clinico.consultas_versiones;
revoke all on public.consultas_versiones from anon, authenticated;
grant select on public.consultas_versiones to authenticated;

-- La vista «select *» fija sus columnas al crearse: se recrea para exponer revision
create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;

create or replace function public.reabrir_consulta(p_id uuid, p_motivo text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c clinico.consultas;
  v_rol public.rol_usuario;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Inicia sesión para corregir la consulta.'; end if;
  select * into c from clinico.consultas where id = p_id for update;
  if not found or not public.es_clinico(c.org_id) or not public.ve_consulta(c.org_id, c.id) then
    raise exception 'Consulta no encontrada o sin acceso.';
  end if;
  if c.estado <> 'firmada' then raise exception 'La consulta no está firmada: se edita directamente.'; end if;
  v_rol := public.mi_rol(c.org_id);
  if v_rol is not distinct from 'enfermeria'
     or not (c.medico_id is null or c.medico_id = v_uid or v_rol in ('gerente_medico', 'administrador')) then
    raise exception 'Solo el médico que atendió (o el gerente médico) puede corregir esta consulta.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe el motivo de la corrección (al menos 10 caracteres).';
  end if;

  insert into clinico.consultas_versiones (org_id, consulta_id, revision, firmada_en, contenido, motivo, reabierta_por)
  values (c.org_id, c.id, c.revision, c.firmada_en, jsonb_build_object(
      'consulta', to_jsonb(c),
      'diagnosticos', coalesce((select jsonb_agg(to_jsonb(d) order by d.principal desc, d.cie10) from clinico.diagnosticos d where d.consulta_id = c.id), '[]'),
      'aptitud', (select to_jsonb(a) from clinico.aptitudes a where a.consulta_id = c.id),
      'reposo', (select to_jsonb(r) from clinico.reposos r where r.consulta_id = c.id)),
    trim(p_motivo), v_uid);

  update clinico.consultas
     set estado = 'borrador', firmada_en = null, hora_cierre = null, revision = c.revision + 1
   where id = c.id;
  return c.revision + 1;
end $$;
revoke execute on function public.reabrir_consulta(uuid, text) from anon, public;
grant execute on function public.reabrir_consulta(uuid, text) to authenticated;

-- Si la corrección cambia la aptitud, la empresa recibe el aviso otra vez («Aptitud corregida») al cerrar.
create or replace function public.avisar_aptitud()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_empresa uuid; v_revision integer;
begin
  if tg_op = 'UPDATE' and new.clasificacion is distinct from old.clasificacion then
    new.avisada_en := null;
  end if;
  if new.avisada_en is not null then return new; end if;
  select c.revision into v_revision from clinico.consultas c where c.id = new.consulta_id and c.estado in ('cerrada', 'firmada');
  if not found then return new; end if;
  select t.nombres || ' ' || t.apellidos, t.empresa_id into v_nombre, v_empresa from public.trabajadores t where t.id = new.trabajador_id;
  perform public.notificar(new.org_id, v_empresa, 'empresa', case when v_revision > 1 then 'Aptitud corregida' else 'Aptitud emitida' end, v_nombre, '/portal');
  new.avisada_en := now();
  return new;
end $$;
revoke execute on function public.avisar_aptitud() from authenticated;
