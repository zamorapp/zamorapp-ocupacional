-- zamorApp Ocupacional · Plantillas de correo editables y reintentos de envíos
-- 1) Plantillas de asunto y mensaje para los envíos a la empresa: una general y, si hace falta, otra por empresa.
--    Marcas que se reemplazan al enviar: [fecha y hora], [empresa], [fecha], [cantidad].
-- 2) Reintento de un correo fallido (o que quedó «sin confirmar»): es un envío nuevo, idéntico al original
--    y enlazado a él. El registro sigue siendo solo-agregar: el original no se toca.

-- ─── 1. Plantillas ───────────────────────────────────────────
create table if not exists public.plantillas_correo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id), -- null = para todas las empresas
  nombre text not null check (length(trim(nombre)) between 1 and 80),
  asunto text not null check (length(trim(asunto)) between 1 and 200),
  mensaje text not null check (length(trim(mensaje)) between 1 and 4000),
  -- Texto para quien no recibe la consulta médica (RR. HH.); vacío = el mismo sin mencionar la consulta
  mensaje_constancias text check (mensaje_constancias is null or length(mensaje_constancias) <= 4000),
  predeterminada boolean not null default false,
  activo boolean not null default true,
  actualizado_por uuid references auth.users (id) default auth.uid(),
  actualizado_en timestamptz not null default now()
);
-- Una sola predeterminada por empresa (y una general)
create unique index if not exists plantillas_correo_predeterminada on public.plantillas_correo
  (org_id, coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid)) where predeterminada and activo;

alter table public.plantillas_correo enable row level security;
drop policy if exists plantillas_leer on public.plantillas_correo;
drop policy if exists plantillas_editar on public.plantillas_correo;
create policy plantillas_leer on public.plantillas_correo for select
  using (public.puede_enviar(org_id) and (empresa_id is null or public.puede_ver_empresa(org_id, empresa_id)));
create policy plantillas_editar on public.plantillas_correo for all
  using (public.puede_enviar(org_id) and (empresa_id is null or public.puede_ver_empresa(org_id, empresa_id)))
  with check (public.puede_enviar(org_id) and (empresa_id is null or public.puede_ver_empresa(org_id, empresa_id)));
revoke all on public.plantillas_correo from anon;
revoke delete, truncate on public.plantillas_correo from authenticated;
grant select, insert, update on public.plantillas_correo to authenticated;

create or replace function public.validar_plantilla()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.org_id <> old.org_id or new.empresa_id is distinct from old.empresa_id) then
    raise exception 'La plantilla no cambia de organización ni de empresa';
  end if;
  if new.empresa_id is not null and not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
    raise exception 'La empresa no pertenece a la organización';
  end if;
  -- Las plantillas generales solo las cambia quien ve todas las empresas (administrador o gerente médico)
  if new.empresa_id is null and auth.uid() is not null
     and not coalesce(public.es_admin(new.org_id) or public.mi_rol(new.org_id) = 'gerente_medico', false) then
    raise exception 'Solo el gerente médico o el administrador cambia las plantillas generales';
  end if;
  new.nombre := trim(new.nombre);
  new.mensaje_constancias := nullif(trim(new.mensaje_constancias), '');
  if auth.uid() is not null then new.actualizado_por := auth.uid(); end if;
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists validar_plantilla on public.plantillas_correo;
create trigger validar_plantilla before insert or update on public.plantillas_correo
  for each row execute function public.validar_plantilla();

-- Plantilla general de cada organización con el texto de Cesar
insert into public.plantillas_correo (org_id, nombre, asunto, mensaje, predeterminada)
select o.id, 'Evaluaciones del día', 'Evaluaciones médicas · [empresa] · [fecha]',
  'Adjunto las evaluaciones realizadas el día de hoy, [fecha y hora], a los trabajadores. Envío constancia de aptitud y consulta médica. Recuerden resguardar en los expedientes respectivos y la consulta médica en archivos cerrados solo para uso de personal de salud.',
  true
from public.organizaciones o
where not exists (select 1 from public.plantillas_correo p where p.org_id = o.id);

-- ─── 2. Reintentos ───────────────────────────────────────────
alter table public.envios add column if not exists reintento_de uuid references public.envios (id);
-- Cada envío se reintenta una sola vez (si el reintento falla, se reintenta el reintento)
create unique index if not exists envios_reintento on public.envios (reintento_de) where reintento_de is not null;
create index if not exists envios_org_fecha on public.envios (org_id, creado_en desc);

create or replace function public.validar_reintento()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.envios;
begin
  if new.reintento_de is null then return new; end if;
  select * into o from public.envios where id = new.reintento_de;
  if o.id is null or o.canal <> 'correo'
     or not (o.estado = 'fallido' or (o.estado = 'enviando' and o.creado_en < now() - interval '10 minutes')) then
    raise exception 'Solo se reintenta un correo fallido o sin confirmar';
  end if;
  -- El reintento es el mismo envío: mismo lote, destinatario y documentos (las reglas de validar_envio se vuelven a aplicar)
  if (o.org_id, o.empresa_id, o.fecha_lote, o.canal, o.destinatario, o.contacto_id, o.consultas, o.documentos)
     is distinct from (new.org_id, new.empresa_id, new.fecha_lote, new.canal, new.destinatario, new.contacto_id, new.consultas, new.documentos) then
    raise exception 'El reintento debe ser idéntico al envío original';
  end if;
  return new;
end $$;
drop trigger if exists validar_reintento on public.envios;
create trigger validar_reintento before insert on public.envios for each row execute function public.validar_reintento();
