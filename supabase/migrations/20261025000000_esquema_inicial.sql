-- zamorApp Ocupacional · Esquema inicial
-- Multiempresa: una organización proveedora (p. ej. TIPURO SERVI MEDIC) atiende
-- a varias empresas clientes. Cada fila lleva org_id y las reglas RLS aíslan
-- los datos por organización. La historia clínica vive en el esquema "clinico"
-- y solo la abren los roles clínicos (médico y enfermería).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tipos
-- ─────────────────────────────────────────────────────────────
create type public.rol_usuario as enum (
  'administrador',      -- configuración, usuarios, catálogos
  'gerente_medico',     -- dirige el servicio, ve todo lo clínico
  'medico',             -- consultas, aptitud, reposos
  'enfermeria',         -- triaje, signos vitales
  'recepcion',          -- citas y cola, sin datos clínicos
  'coordinador_sst',    -- riesgos, puestos, accidentes
  'gerente_empresa',    -- empleador: tableros y aptitud, nunca diagnósticos
  'supervisor',
  'delegado_prevencion',
  'trabajador',
  'auditor'
);

create type public.estado_trabajador as enum ('aspirante', 'activo', 'reposo', 'egresado', 'inactivo');
create type public.tipo_contrato as enum ('propio', 'contratista', 'temporal', 'pasante', 'aprendiz');
create type public.sexo as enum ('F', 'M');

-- ─────────────────────────────────────────────────────────────
-- Organización proveedora y usuarios
-- ─────────────────────────────────────────────────────────────
create table public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rif text,
  direccion text,
  telefono text,
  logo_url text,
  creado_en timestamptz not null default now()
);

-- Perfil de cada usuario de Supabase Auth
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null default '',
  cedula text,
  telefono text,
  -- Datos profesionales que exigen los documentos (Res. MPPS 028)
  mpps text,
  colegio_medicos text,
  registro_inpsasel text,
  firma_url text,
  sello_url text,
  creado_en timestamptz not null default now()
);

-- Pertenencia de un usuario a una organización con su rol.
-- empresas_permitidas null = todas las empresas de la organización.
create table public.miembros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol public.rol_usuario not null,
  empresas_permitidas uuid[],
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (org_id, usuario_id)
);

-- ─────────────────────────────────────────────────────────────
-- Empresas clientes y estructura
-- ─────────────────────────────────────────────────────────────
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  razon_social text not null,
  nombre_comercial text,
  rif text not null,
  nil text,                          -- número de identificación laboral
  actividad_economica text,
  sector text,
  estado text,
  municipio text,
  parroquia text,
  direccion text,
  telefono text,
  correo text,
  -- Registro del Servicio de SST y del PSST (informe trimestral, bloque 1)
  servicio_sst_tipo text check (servicio_sst_tipo in ('propio', 'mancomunado', 'tercerizado')),
  servicio_sst_fecha_registro date,
  psst_fecha_registro date,
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (org_id, rif)
);

create table public.sedes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null,
  direccion text,
  activa boolean not null default true
);

create table public.dependencias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  sede_id uuid references public.sedes (id) on delete set null,
  nombre text not null,
  activa boolean not null default true
);

-- Puesto de trabajo (cargo) con sus riesgos por los 6 grupos
create table public.puestos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  dependencia_id uuid references public.dependencias (id) on delete set null,
  codigo text,
  nombre text not null,
  descripcion text,
  turno text,
  riesgos jsonb not null default '{}'::jsonb, -- {fisico:[], quimico:[], biologico:[], mecanico:[], disergonomico:[], psicosocial:[]}
  activo boolean not null default true
);

-- ─────────────────────────────────────────────────────────────
-- Listas configurables (maestros)
-- Un solo par de tablas para todos los catálogos editables:
-- motivos de consulta, tipos de paciente, clasificación de aptitud,
-- causas de reposo, limitaciones, recomendaciones, etc.
-- org_id null = valor base del sistema, visible para todos.
-- ─────────────────────────────────────────────────────────────
create table public.listas (
  codigo text primary key,           -- p. ej. 'motivo_consulta'
  nombre text not null,
  descripcion text,
  editable boolean not null default true
);

create table public.lista_items (
  id uuid primary key default gen_random_uuid(),
  lista text not null references public.listas (codigo) on delete cascade,
  org_id uuid references public.organizaciones (id) on delete cascade,
  codigo text,
  nombre text not null,
  grupo text,                        -- p. ej. 'preventivo' / 'no_preventivo'
  texto text,                        -- texto largo (recomendaciones, plantillas)
  orden int not null default 0,
  activo boolean not null default true,
  datos jsonb not null default '{}'::jsonb
);
create index on public.lista_items (lista, org_id);

-- ─────────────────────────────────────────────────────────────
-- Trabajadores (expediente único, datos no clínicos)
-- ─────────────────────────────────────────────────────────────
create table public.trabajadores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete restrict,
  sede_id uuid references public.sedes (id) on delete set null,
  dependencia_id uuid references public.dependencias (id) on delete set null,
  puesto_id uuid references public.puestos (id) on delete set null,
  numero_historia serial,
  cedula text not null,
  nombres text not null,
  apellidos text not null,
  sexo public.sexo,
  fecha_nacimiento date,
  lugar_nacimiento text,
  nivel_educativo text,
  profesion text,
  tipo_paciente_id uuid references public.lista_items (id),
  tipo_contrato public.tipo_contrato default 'propio',
  ficha text,
  fecha_ingreso date,
  fecha_egreso date,
  turno text,
  grupo_sanguineo text,
  lateralidad text check (lateralidad in ('diestro', 'zurdo', 'ambidiestro')),
  discapacidad boolean not null default false,
  telefono text,
  correo text,
  direccion text,
  foto_url text,
  estado public.estado_trabajador not null default 'activo',
  autoriza_envio_resultados boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (org_id, cedula)
);
create index on public.trabajadores (empresa_id);
create index on public.trabajadores using gin (to_tsvector('spanish', nombres || ' ' || apellidos || ' ' || cedula));

-- ─────────────────────────────────────────────────────────────
-- Bitácora (todo cambio queda registrado)
-- ─────────────────────────────────────────────────────────────
create table public.bitacora (
  id bigint generated always as identity primary key,
  org_id uuid,
  usuario_id uuid default auth.uid(),
  tabla text not null,
  registro_id uuid,
  accion text not null,              -- INSERT / UPDATE / DELETE
  antes jsonb,
  despues jsonb,
  en timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Funciones de acceso
-- ─────────────────────────────────────────────────────────────
create or replace function public.mis_orgs()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from public.miembros where usuario_id = auth.uid() and activo
$$;

create or replace function public.mi_rol(p_org uuid)
returns public.rol_usuario language sql stable security definer set search_path = public as $$
  select rol from public.miembros where usuario_id = auth.uid() and org_id = p_org and activo
$$;

create or replace function public.puede_ver_empresa(p_org uuid, p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros
    where usuario_id = auth.uid() and org_id = p_org and activo
      and (empresas_permitidas is null or p_empresa = any (empresas_permitidas))
  )
$$;

create or replace function public.es_clinico(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol(p_org) in ('gerente_medico', 'medico', 'enfermeria'), false)
$$;

create or replace function public.es_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol(p_org) = 'administrador', false)
$$;

-- ─────────────────────────────────────────────────────────────
-- Esquema clínico (separado). Solo personal de salud.
-- Recuerda añadir "clinico" en Supabase › Settings › API › Exposed schemas.
-- ─────────────────────────────────────────────────────────────
create schema if not exists clinico;
grant usage on schema clinico to authenticated;

create table clinico.consultas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  trabajador_id uuid not null references public.trabajadores (id) on delete restrict,
  medico_id uuid references auth.users (id) default auth.uid(),
  fecha date not null default current_date,
  hora_inicio timestamptz not null default now(),
  hora_cierre timestamptz,
  tipo text not null default 'primera' check (tipo in ('primera', 'sucesiva', 'derivada')),
  motivo_id uuid references public.lista_items (id),
  -- Contexto laboral heredado del trabajador al momento de la consulta
  dependencia_id uuid references public.dependencias (id),
  puesto_id uuid references public.puestos (id),
  motivo_texto text,
  enfermedad_actual text,
  habitos jsonb not null default '{}'::jsonb,
  examen_funcional jsonb not null default '[]'::jsonb,
  examen_fisico jsonb not null default '[]'::jsonb,
  signos_vitales jsonb not null default '{}'::jsonb,  -- {ta, fc, fr, temp, peso, talla, imc}
  paraclinicos jsonb not null default '[]'::jsonb,
  conclusiones text,
  recomendaciones_empresa text,
  recomendaciones_trabajador text,
  observacion_privada text,
  autoriza_paciente boolean not null default false,   -- si no autoriza, la empresa solo recibe la aptitud
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrada', 'firmada')),
  firmada_en timestamptz,
  duplicada_de uuid references clinico.consultas (id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on clinico.consultas (trabajador_id, fecha desc);
create index on clinico.consultas (empresa_id, fecha);

create table clinico.diagnosticos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  consulta_id uuid not null references clinico.consultas (id) on delete cascade,
  cie10 text not null,
  descripcion text not null,
  sistema text,
  origen text not null default 'comun' check (origen in ('comun', 'ocupacional', 'accidente_comun', 'accidente_laboral')),
  principal boolean not null default false
);

-- Aptitud: lo único que ve la empresa cliente
create table clinico.aptitudes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  consulta_id uuid not null unique references clinico.consultas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id),
  clasificacion text not null check (clasificacion in (
    'elegible', 'elegible_con_restricciones', 'no_elegible', 'espera_resultados', 'diferido')),
  observacion text,
  restricciones text[],
  vigente_hasta date,
  emitida_en timestamptz not null default now()
);

create table clinico.reposos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  consulta_id uuid references clinico.consultas (id) on delete set null,
  trabajador_id uuid not null references public.trabajadores (id),
  causa text not null check (causa in (
    'enfermedad_comun', 'enfermedad_ocupacional', 'accidente_comun', 'accidente_laboral',
    'prenatal', 'postnatal', 'paternidad', 'lactancia')),
  ente_emisor text not null default 'servicio_medico',  -- servicio médico, IVSS, particular, hospital, CDI…
  desde date not null,
  hasta date not null,
  reintegro date,
  dias int generated always as ((hasta - desde) + 1) stored,
  cie10 text,
  validado_ivss boolean not null default false,
  creado_en timestamptz not null default now(),
  check (hasta >= desde)
);

-- Vista segura de aptitud para roles no clínicos (sin diagnóstico)
create or replace view public.aptitud_trabajadores
with (security_invoker = false) as
  select a.id, a.org_id, c.empresa_id, a.trabajador_id, c.fecha, c.motivo_id,
         a.clasificacion, a.restricciones, a.vigente_hasta
  from clinico.aptitudes a
  join clinico.consultas c on c.id = a.consulta_id
  where public.puede_ver_empresa(a.org_id, c.empresa_id);

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.organizaciones enable row level security;
alter table public.perfiles enable row level security;
alter table public.miembros enable row level security;
alter table public.empresas enable row level security;
alter table public.sedes enable row level security;
alter table public.dependencias enable row level security;
alter table public.puestos enable row level security;
alter table public.listas enable row level security;
alter table public.lista_items enable row level security;
alter table public.trabajadores enable row level security;
alter table public.bitacora enable row level security;
alter table clinico.consultas enable row level security;
alter table clinico.diagnosticos enable row level security;
alter table clinico.aptitudes enable row level security;
alter table clinico.reposos enable row level security;

create policy org_leer on public.organizaciones for select using (id in (select public.mis_orgs()));
create policy org_editar on public.organizaciones for update using (public.es_admin(id));

create policy perfil_propio on public.perfiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy perfil_colegas on public.perfiles for select using (
  id in (select usuario_id from public.miembros where org_id in (select public.mis_orgs())));

create policy miembros_leer on public.miembros for select using (org_id in (select public.mis_orgs()));
create policy miembros_admin on public.miembros for all using (public.es_admin(org_id)) with check (public.es_admin(org_id));

create policy empresas_leer on public.empresas for select using (public.puede_ver_empresa(org_id, id));
create policy empresas_admin on public.empresas for all using (public.es_admin(org_id)) with check (public.es_admin(org_id));

create policy sedes_leer on public.sedes for select using (public.puede_ver_empresa(org_id, empresa_id));
create policy sedes_admin on public.sedes for all using (public.es_admin(org_id)) with check (public.es_admin(org_id));
create policy dependencias_leer on public.dependencias for select using (public.puede_ver_empresa(org_id, empresa_id));
create policy dependencias_admin on public.dependencias for all using (public.es_admin(org_id)) with check (public.es_admin(org_id));
create policy puestos_leer on public.puestos for select using (public.puede_ver_empresa(org_id, empresa_id));
create policy puestos_editar on public.puestos for all
  using (public.mi_rol(org_id) in ('administrador', 'coordinador_sst', 'gerente_medico'))
  with check (public.mi_rol(org_id) in ('administrador', 'coordinador_sst', 'gerente_medico'));

create policy listas_leer on public.listas for select using (auth.role() = 'authenticated');
create policy items_leer on public.lista_items for select using (org_id is null or org_id in (select public.mis_orgs()));
create policy items_admin on public.lista_items for all
  using (org_id is not null and public.mi_rol(org_id) in ('administrador', 'gerente_medico'))
  with check (org_id is not null and public.mi_rol(org_id) in ('administrador', 'gerente_medico'));

create policy trabajadores_leer on public.trabajadores for select using (public.puede_ver_empresa(org_id, empresa_id));
create policy trabajadores_editar on public.trabajadores for all
  using (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'coordinador_sst'))
  with check (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'coordinador_sst'));

create policy bitacora_leer on public.bitacora for select
  using (public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'auditor'));

-- Clínico: solo personal de salud de la organización y de la empresa permitida.
create policy consultas_clinico on clinico.consultas for all
  using (public.es_clinico(org_id) and public.puede_ver_empresa(org_id, empresa_id))
  with check (public.es_clinico(org_id) and public.puede_ver_empresa(org_id, empresa_id));
-- Una consulta firmada no se modifica
create policy consultas_no_firmadas on clinico.consultas as restrictive for update
  using (estado <> 'firmada');
create policy diagnosticos_clinico on clinico.diagnosticos for all
  using (public.es_clinico(org_id)) with check (public.es_clinico(org_id));
create policy aptitudes_clinico on clinico.aptitudes for all
  using (public.es_clinico(org_id)) with check (public.es_clinico(org_id));
create policy reposos_clinico on clinico.reposos for all
  using (public.es_clinico(org_id)) with check (public.es_clinico(org_id));

grant select, insert, update, delete on all tables in schema clinico to authenticated;
grant select on public.aptitud_trabajadores to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Disparadores: bitácora, fecha de actualización y perfil al registrarse
-- ─────────────────────────────────────────────────────────────
create or replace function public.registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare fila jsonb;
begin
  fila := to_jsonb(coalesce(new, old));
  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  values ((fila ->> 'org_id')::uuid, tg_table_schema || '.' || tg_table_name, (fila ->> 'id')::uuid, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;

create trigger bit_empresas after insert or update or delete on public.empresas for each row execute function public.registrar_bitacora();
create trigger bit_trabajadores after insert or update or delete on public.trabajadores for each row execute function public.registrar_bitacora();
create trigger bit_miembros after insert or update or delete on public.miembros for each row execute function public.registrar_bitacora();
create trigger bit_consultas after insert or update or delete on clinico.consultas for each row execute function public.registrar_bitacora();
create trigger bit_aptitudes after insert or update or delete on clinico.aptitudes for each row execute function public.registrar_bitacora();
create trigger bit_reposos after insert or update or delete on clinico.reposos for each row execute function public.registrar_bitacora();

create trigger upd_trabajadores before update on public.trabajadores for each row execute function public.tocar_actualizado();
create trigger upd_consultas before update on clinico.consultas for each row execute function public.tocar_actualizado();

create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre_completo', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger al_registrar_usuario after insert on auth.users
  for each row execute function public.crear_perfil();
