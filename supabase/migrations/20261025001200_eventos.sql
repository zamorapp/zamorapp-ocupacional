-- zamorApp Ocupacional · Accidentes, incidentes y enfermedades ocupacionales
-- LOPCYMAT art. 69-70 (definiciones), art. 73 (declaración en 24 h), NT-02-2008 (informe en 15 o 30 días),
-- COVENIN 474:1997 (codificación de la lesión, días perdidos y cargados).

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  trabajador_id uuid references public.trabajadores (id),   -- vacío en incidentes sin lesionado
  numero serial,
  tipo text not null check (tipo in ('accidente', 'incidente', 'enfermedad')),
  subtipo text,                                             -- accidente: trabajo / in_itinere
  fecha_hora timestamptz not null,
  lugar text,
  descripcion text,
  testigos text,
  -- Lesión (COVENIN 474)
  parte_cuerpo text,
  naturaleza_lesion text,
  agente text,
  forma text,
  gravedad text check (gravedad in ('leve', 'moderado', 'grave', 'mortal')),
  con_tiempo_perdido boolean not null default false,
  dias_perdidos int not null default 0,
  dias_cargados int not null default 0,
  -- Declaración ante el INPSASEL
  fecha_aviso timestamptz,
  fecha_declaracion timestamptz,
  numero_declaracion text,
  -- Enfermedad ocupacional
  cie10 text,
  diagnostico text,
  fecha_diagnostico timestamptz,
  en_anexo1 boolean not null default true,                  -- lista NT-02: informe en 15 días; fuera de la lista: 30
  fecha_informe_nt02 date,
  estado_certificacion text,
  -- Investigación
  causas_inmediatas text,
  causas_basicas text,
  acciones jsonb not null default '[]'::jsonb,              -- [{descripcion, responsable, fecha, estado}]
  estado text not null default 'abierto' check (estado in ('abierto', 'declarado', 'investigando', 'cerrado')),
  consulta_id uuid references clinico.consultas (id) on delete set null,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on public.eventos (empresa_id, fecha_hora desc);

alter table public.eventos enable row level security;
create policy eventos_leer on public.eventos for select using (public.puede_ver_empresa(org_id, empresa_id));
create policy eventos_editar on public.eventos for all
  using (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'coordinador_sst', 'supervisor', 'delegado_prevencion'))
  with check (public.puede_ver_empresa(org_id, empresa_id)
         and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'coordinador_sst', 'supervisor', 'delegado_prevencion'));

create trigger bit_eventos after insert or update or delete on public.eventos for each row execute function public.registrar_bitacora();
create trigger upd_eventos before update on public.eventos for each row execute function public.tocar_actualizado();

-- ─── Listas configurables (COVENIN 474, Anexo C, categorías generales) ───
insert into public.listas (codigo, nombre, descripcion) values
  ('parte_cuerpo', 'Partes del cuerpo lesionadas', 'COVENIN 474'),
  ('naturaleza_lesion', 'Naturaleza de la lesión', 'COVENIN 474'),
  ('agente_lesion', 'Agente de la lesión', 'COVENIN 474'),
  ('forma_accidente', 'Forma o tipo de accidente', 'COVENIN 474')
on conflict (codigo) do nothing;

insert into public.lista_items (lista, nombre, orden) values
  ('parte_cuerpo', 'Cabeza', 1), ('parte_cuerpo', 'Ojos', 2), ('parte_cuerpo', 'Cara', 3), ('parte_cuerpo', 'Cuello', 4),
  ('parte_cuerpo', 'Tronco - espalda', 5), ('parte_cuerpo', 'Tronco - tórax', 6), ('parte_cuerpo', 'Tronco - abdomen', 7),
  ('parte_cuerpo', 'Hombro', 8), ('parte_cuerpo', 'Brazo y codo', 9), ('parte_cuerpo', 'Antebrazo y muñeca', 10),
  ('parte_cuerpo', 'Mano', 11), ('parte_cuerpo', 'Dedos de la mano', 12), ('parte_cuerpo', 'Cadera', 13),
  ('parte_cuerpo', 'Muslo y rodilla', 14), ('parte_cuerpo', 'Pierna y tobillo', 15), ('parte_cuerpo', 'Pie', 16),
  ('parte_cuerpo', 'Dedos del pie', 17), ('parte_cuerpo', 'Ubicaciones múltiples', 18), ('parte_cuerpo', 'Órganos internos', 19),

  ('naturaleza_lesion', 'Contusión', 1), ('naturaleza_lesion', 'Herida', 2), ('naturaleza_lesion', 'Fractura', 3),
  ('naturaleza_lesion', 'Esguince o torcedura', 4), ('naturaleza_lesion', 'Luxación', 5), ('naturaleza_lesion', 'Quemadura', 6),
  ('naturaleza_lesion', 'Amputación', 7), ('naturaleza_lesion', 'Cuerpo extraño', 8), ('naturaleza_lesion', 'Intoxicación', 9),
  ('naturaleza_lesion', 'Lumbalgia o lesión por esfuerzo', 10), ('naturaleza_lesion', 'Electrocución', 11),
  ('naturaleza_lesion', 'Lesiones múltiples', 12), ('naturaleza_lesion', 'Sin lesión aparente', 13),

  ('agente_lesion', 'Máquinas', 1), ('agente_lesion', 'Herramientas manuales', 2), ('agente_lesion', 'Vehículos', 3),
  ('agente_lesion', 'Materiales y objetos', 4), ('agente_lesion', 'Superficies de trabajo (pisos, escaleras)', 5),
  ('agente_lesion', 'Sustancias químicas', 6), ('agente_lesion', 'Electricidad', 7), ('agente_lesion', 'Calor o fuego', 8),
  ('agente_lesion', 'Animales', 9), ('agente_lesion', 'Esfuerzo físico', 10), ('agente_lesion', 'Otros', 11),

  ('forma_accidente', 'Caída al mismo nivel', 1), ('forma_accidente', 'Caída a distinto nivel', 2),
  ('forma_accidente', 'Golpe contra objeto', 3), ('forma_accidente', 'Golpe por objeto', 4),
  ('forma_accidente', 'Atrapamiento', 5), ('forma_accidente', 'Sobreesfuerzo', 6),
  ('forma_accidente', 'Contacto con temperatura extrema', 7), ('forma_accidente', 'Contacto eléctrico', 8),
  ('forma_accidente', 'Contacto con sustancias', 9), ('forma_accidente', 'Proyección de partículas', 10),
  ('forma_accidente', 'Accidente de tránsito', 11), ('forma_accidente', 'Corte o pinchazo', 12), ('forma_accidente', 'Otro', 13);

select public.copiar_listas_base(id) from public.organizaciones;
