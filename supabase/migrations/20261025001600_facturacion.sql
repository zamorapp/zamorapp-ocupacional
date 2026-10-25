-- zamorApp Ocupacional · Servicios, tasa BCV, pacientes atendidos y notas de cobro
-- La nota de cobro NO es factura fiscal: la factura ante el SENIAT requiere imprenta autorizada
-- o sistema homologado; aquí se deja lista la información para emitirla.

-- ─── Catálogo de servicios (baremo) ──────────────────────────
create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  codigo text,
  nombre text not null,
  categoria text not null default 'otro'
    check (categoria in ('consulta', 'evaluacion', 'paraclinico', 'informe', 'asesoria', 'evaluacion_puesto', 'formacion', 'otro')),
  unidad text not null default 'servicio' check (unidad in ('servicio', 'hora', 'trabajador', 'mes')),
  precio_usd numeric(12, 2) not null default 0,
  motivos text,                 -- códigos de motivo de consulta que se cobran con este servicio (PRE,PER…)
  activo boolean not null default true,
  orden int not null default 0
);

-- Precio especial de un servicio para una empresa cliente
create table public.precios_empresa (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  servicio_id uuid not null references public.servicios (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  precio_usd numeric(12, 2) not null,
  primary key (empresa_id, servicio_id)
);

create table public.tasas_bcv (
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  fecha date not null,
  tasa numeric(14, 4) not null check (tasa > 0),
  primary key (org_id, fecha)
);

-- ─── Notas de cobro ─────────────────────────────────────────
create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  numero serial,
  fecha date not null default current_date,
  desde date,
  hasta date,
  estado text not null default 'borrador' check (estado in ('borrador', 'emitida', 'pagada', 'anulada')),
  tasa_bcv numeric(14, 4),
  iva_pct numeric(5, 2) not null default 0,       -- servicios médico-asistenciales suelen estar exentos
  igtf_pct numeric(5, 2) not null default 0,      -- 3 % si se paga en divisas
  observacion text,
  numero_factura_fiscal text,
  fecha_pago date,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);

create table public.cobro_items (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references public.cobros (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  servicio_id uuid references public.servicios (id) on delete set null,
  consulta_id uuid references clinico.consultas (id) on delete set null,
  descripcion text not null,
  detalle text,                 -- paciente y cédula, sin datos clínicos
  cantidad numeric(10, 2) not null default 1,
  precio_usd numeric(12, 2) not null default 0,
  orden int not null default 0
);
create unique index cobro_items_consulta_unica on public.cobro_items (consulta_id) where consulta_id is not null;

-- ─── Seguridad ───────────────────────────────────────────────
create or replace function public.puede_facturar(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol(p_org) in ('administrador', 'gerente_medico', 'recepcion'), false)
$$;

alter table public.servicios enable row level security;
alter table public.precios_empresa enable row level security;
alter table public.tasas_bcv enable row level security;
alter table public.cobros enable row level security;
alter table public.cobro_items enable row level security;

create policy servicios_leer on public.servicios for select using (org_id in (select public.mis_orgs()));
create policy servicios_editar on public.servicios for all using (public.puede_facturar(org_id)) with check (public.puede_facturar(org_id));
create policy precios_leer on public.precios_empresa for select using (org_id in (select public.mis_orgs()));
create policy precios_editar on public.precios_empresa for all using (public.puede_facturar(org_id)) with check (public.puede_facturar(org_id));
create policy tasas_leer on public.tasas_bcv for select using (org_id in (select public.mis_orgs()));
create policy tasas_editar on public.tasas_bcv for all using (public.puede_facturar(org_id)) with check (public.puede_facturar(org_id));
create policy cobros_todo on public.cobros for all
  using (public.puede_facturar(org_id) and public.puede_ver_empresa(org_id, empresa_id))
  with check (public.puede_facturar(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy cobro_items_todo on public.cobro_items for all using (public.puede_facturar(org_id)) with check (public.puede_facturar(org_id));

create trigger bit_cobros after insert or update or delete on public.cobros for each row execute function public.registrar_bitacora();

-- Atenciones para facturar: sin diagnósticos, solo lo administrativo. Accesible a quien factura.
create or replace view public.atenciones with (security_invoker = false) as
  select c.id, c.org_id, c.empresa_id, c.trabajador_id, c.fecha, c.estado, c.tipo,
         c.motivo_id, m.nombre as motivo, m.codigo as motivo_codigo,
         t.nombres || ' ' || t.apellidos as paciente, t.cedula, p.nombre as cargo,
         a.clasificacion as aptitud,
         (select ci.cobro_id from public.cobro_items ci where ci.consulta_id = c.id limit 1) as cobro_id
  from clinico.consultas c
  join public.trabajadores t on t.id = c.trabajador_id
  left join public.lista_items m on m.id = c.motivo_id
  left join public.puestos p on p.id = c.puesto_id
  left join clinico.aptitudes a on a.consulta_id = c.id
  where public.puede_ver_empresa(c.org_id, c.empresa_id)
    and (public.puede_facturar(c.org_id) or public.es_clinico(c.org_id));

grant select on public.atenciones to authenticated;
revoke all on public.atenciones from anon;

-- ─── Servicios de ejemplo (editables; precios en 0 para que el servicio fije los suyos) ───
insert into public.servicios (org_id, codigo, nombre, categoria, unidad, motivos, orden)
select o.id, s.codigo, s.nombre, s.categoria, s.unidad, s.motivos, s.orden
from public.organizaciones o
cross join (values
  ('EV-PRE', 'Evaluación médica pre-empleo', 'evaluacion', 'trabajador', 'PRE', 1),
  ('EV-PER', 'Evaluación médica periódica', 'evaluacion', 'trabajador', 'PER', 2),
  ('EV-VAC', 'Evaluación pre y post vacacional', 'evaluacion', 'trabajador', 'PREV,POSV', 3),
  ('EV-EGR', 'Evaluación de egreso', 'evaluacion', 'trabajador', 'EGR', 4),
  ('EV-REI', 'Evaluación de reintegro', 'evaluacion', 'trabajador', 'REI,CAM,REU,RIN,ADP', 5),
  ('CON-MOR', 'Consulta de morbilidad', 'consulta', 'servicio', 'MOR,CTR,EME,ACL,ACC,TEL,CRE,PRN,PSN,VIG', 6),
  ('INF-VIG', 'Informe de vigilancia epidemiológica', 'informe', 'servicio', null, 10),
  ('ASE-ML', 'Asesoría médico-legal', 'asesoria', 'hora', null, 11),
  ('EVP-ERG', 'Evaluación de puesto de trabajo (ergonómica)', 'evaluacion_puesto', 'servicio', null, 12),
  ('FOR-SST', 'Charla o formación en SST', 'formacion', 'hora', null, 13),
  ('SSM-MES', 'Servicio médico ocupacional (iguala mensual)', 'otro', 'mes', null, 14)
) as s(codigo, nombre, categoria, unidad, motivos, orden);
