-- zamorApp Ocupacional · Atención médica
-- 1) Acceso clínico como permiso aparte del rol (un administrador médico puede tener ambos).
-- 2) Vistas en public sobre el esquema clínico para usarlas desde la API sin exponer "clinico".
--    security_invoker = true: las reglas RLS de las tablas clínicas siguen aplicando.
-- 3) Antecedentes del trabajador.

-- ─── 1. Acceso clínico ─────────────────────────────────────
alter table public.miembros add column if not exists acceso_clinico boolean not null default false;

create or replace function public.es_clinico(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select rol in ('gerente_medico', 'medico', 'enfermeria') or acceso_clinico
    from public.miembros where usuario_id = auth.uid() and org_id = p_org and activo
  ), false)
$$;

-- El primer administrador (dueño del servicio) recibe acceso clínico
update public.miembros set acceso_clinico = true
where id = (select id from public.miembros where rol = 'administrador' order by creado_en limit 1);

-- ─── 2. Campos extra y vistas ──────────────────────────────
alter table clinico.consultas
  add column if not exists antecedentes jsonb not null default '[]'::jsonb,
  add column if not exists tratamiento jsonb not null default '[]'::jsonb,
  add column if not exists indicaciones text,
  add column if not exists interconsultas jsonb not null default '[]'::jsonb;

alter table clinico.aptitudes add column if not exists limitaciones jsonb not null default '[]'::jsonb;

create or replace view public.consultas with (security_invoker = true) as select * from clinico.consultas;
create or replace view public.diagnosticos with (security_invoker = true) as select * from clinico.diagnosticos;
create or replace view public.aptitudes with (security_invoker = true) as select * from clinico.aptitudes;
create or replace view public.reposos with (security_invoker = true) as select * from clinico.reposos;

grant select, insert, update, delete on public.consultas, public.diagnosticos, public.aptitudes, public.reposos to authenticated;
revoke all on public.consultas, public.diagnosticos, public.aptitudes, public.reposos from anon;

-- ─── 3. Último contacto clínico visible sin diagnóstico ────
-- (para la lista de pacientes: fecha y motivo de la última consulta, sin datos médicos)
create or replace view public.ultima_consulta with (security_invoker = false) as
  select distinct on (c.trabajador_id) c.trabajador_id, c.org_id, c.empresa_id, c.fecha, c.motivo_id, c.estado
  from clinico.consultas c
  where public.puede_ver_empresa(c.org_id, c.empresa_id)
  order by c.trabajador_id, c.fecha desc, c.hora_inicio desc;

grant select on public.ultima_consulta to authenticated;
revoke all on public.ultima_consulta from anon;
revoke all on public.aptitud_trabajadores from anon;
