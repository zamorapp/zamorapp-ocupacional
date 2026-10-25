-- zamorApp Ocupacional · Portal de empresas y notificaciones
-- Usuarios con rol "gerente_empresa" (RR. HH., gerentes) limitados a sus empresas por miembros.empresas_permitidas:
-- ven sus trabajadores y la aptitud (nunca diagnósticos), cargan nómina y solicitan citas.

-- ─── 1. Citas solicitadas por la empresa ────────────────────
alter table public.citas drop constraint if exists citas_estado_check;
alter table public.citas add constraint citas_estado_check
  check (estado in ('solicitada', 'citado', 'en_espera', 'en_consulta', 'atendido', 'no_asistio', 'cancelada'));
alter table public.citas
  add column if not exists nota_empresa text,
  add column if not exists solicitada_por uuid references auth.users (id);
alter table public.citas drop constraint if exists citas_origen_check;
alter table public.citas add constraint citas_origen_check check (origen in ('individual', 'lote', 'portal'));

create or replace function public.es_empresa(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol(p_org) = 'gerente_empresa', false)
$$;

-- La empresa solicita y puede cancelar sus solicitudes pendientes
create policy citas_empresa_solicitar on public.citas for insert
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id) and estado = 'solicitada' and origen = 'portal');
create policy citas_empresa_cancelar on public.citas for update
  using (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id) and estado = 'solicitada')
  with check (estado in ('solicitada', 'cancelada'));

-- La empresa carga y corrige su nómina (y crea dependencias y cargos al importar)
create policy trabajadores_empresa on public.trabajadores for insert
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy trabajadores_empresa_editar on public.trabajadores for update
  using (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id))
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy dependencias_empresa on public.dependencias for insert
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy puestos_empresa on public.puestos for insert
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy items_empresa_tipo on public.lista_items for insert
  with check (public.es_empresa(org_id) and lista = 'tipo_paciente');

-- ─── 2. Notificaciones ──────────────────────────────────────
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete cascade,
  titulo text not null,
  texto text,
  enlace text,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);
create index on public.notificaciones (usuario_id, leida, creado_en desc);

alter table public.notificaciones enable row level security;
create policy notif_propias on public.notificaciones for select using (usuario_id = auth.uid());
create policy notif_marcar on public.notificaciones for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Avisa a los usuarios de la empresa (RR. HH.) o al personal del servicio
create or replace function public.notificar(p_org uuid, p_empresa uuid, p_para text, p_titulo text, p_texto text, p_enlace text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
  select p_org, m.usuario_id, p_empresa, p_titulo, p_texto, p_enlace
  from public.miembros m
  where m.org_id = p_org and m.activo
    and (
      (p_para = 'empresa' and m.rol = 'gerente_empresa' and p_empresa = any (m.empresas_permitidas))
      or (p_para = 'servicio' and m.rol in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion')
          and (m.empresas_permitidas is null or p_empresa = any (m.empresas_permitidas)))
    );
end $$;

create or replace function public.avisar_cita()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
  v_cuando text;
begin
  select nombres || ' ' || apellidos into v_nombre from public.trabajadores where id = new.trabajador_id;
  v_cuando := to_char(new.fecha, 'DD/MM/YYYY') || coalesce(' ' || to_char(new.hora, 'HH24:MI'), '');

  if tg_op = 'INSERT' and new.estado = 'solicitada' then
    perform public.notificar(new.org_id, new.empresa_id, 'servicio', 'Nueva solicitud de cita', v_nombre || ' · ' || v_cuando, '/atencion?dia=' || new.fecha);
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    perform public.notificar(new.org_id, new.empresa_id, 'empresa',
      case new.estado
        when 'citado' then 'Cita confirmada'
        when 'en_espera' then 'Trabajador en el servicio médico'
        when 'en_consulta' then 'Trabajador en consulta'
        when 'atendido' then 'Evaluación terminada'
        when 'no_asistio' then 'El trabajador no asistió'
        when 'cancelada' then 'Cita cancelada'
        else 'Cita actualizada' end,
      v_nombre || ' · ' || v_cuando,
      '/portal');
  elsif tg_op = 'UPDATE' and (new.fecha, new.hora) is distinct from (old.fecha, old.hora) then
    perform public.notificar(new.org_id, new.empresa_id, 'empresa', 'Cita reprogramada', v_nombre || ' · ' || v_cuando, '/portal');
  end if;
  return new;
end $$;

drop trigger if exists avisar_cita on public.citas;
create trigger avisar_cita after insert or update on public.citas for each row execute function public.avisar_cita();

-- Constancia disponible: avisa a la empresa cuando se emite la aptitud
create or replace function public.avisar_aptitud()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nombre text; v_empresa uuid;
begin
  select t.nombres || ' ' || t.apellidos, t.empresa_id into v_nombre, v_empresa from public.trabajadores t where t.id = new.trabajador_id;
  perform public.notificar(new.org_id, v_empresa, 'empresa', 'Aptitud emitida', v_nombre, '/portal');
  return new;
end $$;

drop trigger if exists avisar_aptitud on clinico.aptitudes;
create trigger avisar_aptitud after insert on clinico.aptitudes for each row execute function public.avisar_aptitud();
