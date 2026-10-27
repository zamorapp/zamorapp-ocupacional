-- zamorApp Ocupacional · Envíos a las empresas y solicitudes extras del portal
-- 1) Contactos de cada empresa para envíos. Solo los marcados «personal de salud» reciben la consulta médica.
-- 2) Registro de envíos: solo se agrega (sin update ni delete). Lo leen el personal clínico y el administrador.
-- 3) Enlaces de WhatsApp: token aleatorio guardado como sha256, vence a los 7 días, revocable; cada apertura queda anotada.
-- 4) Solicitudes extras de la empresa (informes, copias, constancias…) con estado y documento de respuesta privado.

-- Personal del servicio médico (no la empresa cliente ni el trabajador)
create or replace function public.es_servicio(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol(p_org) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion'), false)
$$;

-- Quien puede enviar documentos a la empresa: personal clínico o administrador
create or replace function public.puede_enviar(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_clinico(p_org) or public.es_admin(p_org)
$$;

-- ─── 1. Contactos de la empresa ──────────────────────────────
create table if not exists public.empresa_contactos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null,
  cargo text,
  correo text,
  telefono text,
  recibe_consulta boolean not null default false, -- personal de salud de la empresa: recibe la consulta médica
  activo boolean not null default true,
  creado_por uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  check (coalesce(correo, telefono) is not null),
  check (correo is null or correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create index if not exists empresa_contactos_empresa on public.empresa_contactos (empresa_id) where activo;

alter table public.empresa_contactos enable row level security;
drop policy if exists contactos_leer on public.empresa_contactos;
drop policy if exists contactos_editar on public.empresa_contactos;
create policy contactos_leer on public.empresa_contactos for select
  using (public.es_servicio(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy contactos_editar on public.empresa_contactos for all
  using (public.puede_enviar(org_id) and public.puede_ver_empresa(org_id, empresa_id))
  with check (public.puede_enviar(org_id) and public.puede_ver_empresa(org_id, empresa_id));
revoke all on public.empresa_contactos from anon;

-- Autorizar a alguien para recibir la consulta médica es decisión del gerente médico o del administrador.
-- La empresa del contacto no cambia (un contacto autorizado no se puede mover a otra empresa).
create or replace function public.validar_contacto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
    raise exception 'La empresa no pertenece a la organización';
  end if;
  if tg_op = 'UPDATE' and (new.empresa_id, new.org_id) is distinct from (old.empresa_id, old.org_id) then
    raise exception 'Un contacto no cambia de empresa: crea uno nuevo';
  end if;
  if new.recibe_consulta and (tg_op = 'INSERT' or not old.recibe_consulta or new.correo is distinct from old.correo)
     and auth.uid() is not null and coalesce(public.mi_rol(new.org_id) not in ('administrador', 'gerente_medico'), true) then
    raise exception 'Solo el gerente médico o el administrador autoriza quién recibe la consulta médica';
  end if;
  if new.recibe_consulta and new.correo is null then
    raise exception 'El personal de salud autorizado necesita un correo';
  end if;
  new.correo := lower(trim(new.correo));
  return new;
end $$;
drop trigger if exists validar_contacto on public.empresa_contactos;
create trigger validar_contacto before insert or update on public.empresa_contactos for each row execute function public.validar_contacto();
drop trigger if exists bit_empresa_contactos on public.empresa_contactos;
create trigger bit_empresa_contactos after insert or update or delete on public.empresa_contactos for each row execute function public.registrar_bitacora();

-- ─── 2. Registro de envíos (solo agregar) ────────────────────
-- Una fila por destinatario y canal. La fila se registra ANTES de mandar el correo (estado enviando): si la base la
-- rechaza, el correo no sale. Luego pasa una sola vez a enviado (aceptado por Gmail) o fallido (con el error). WhatsApp: enlace.
create table if not exists public.envios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  fecha_lote date not null,
  canal text not null check (canal in ('correo', 'whatsapp')),
  destinatario text not null,
  contacto_id uuid references public.empresa_contactos (id),
  consultas uuid[] not null check (cardinality(consultas) between 1 and 300),
  documentos text[] not null check (documentos <@ array['constancia', 'consulta'] and cardinality(documentos) > 0),
  asunto text not null,
  mensaje text not null,
  estado text not null check (estado in ('enviando', 'enviado', 'fallido', 'enlace')),
  error text,
  enviado_por uuid not null references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists envios_empresa on public.envios (empresa_id, creado_en desc);
create index if not exists envios_consultas on public.envios using gin (consultas);

alter table public.envios enable row level security;
drop policy if exists envios_leer on public.envios;
drop policy if exists envios_agregar on public.envios;
create policy envios_leer on public.envios for select
  using (public.puede_enviar(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy envios_agregar on public.envios for insert
  with check (public.puede_enviar(org_id) and public.puede_ver_empresa(org_id, empresa_id));
revoke all on public.envios from anon;
revoke update, delete, truncate on public.envios from authenticated;
grant select, insert on public.envios to authenticated;
-- Única edición posible: quien envía cierra su propio envío pendiente (estado y error)
grant update (estado, error) on public.envios to authenticated;
drop policy if exists envios_cerrar on public.envios;
create policy envios_cerrar on public.envios for update
  using (enviado_por = auth.uid() and estado = 'enviando')
  with check (enviado_por = auth.uid() and estado in ('enviado', 'fallido'));

create or replace function public.cerrar_envio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado <> 'enviando' or new.estado not in ('enviado', 'fallido')
     or (auth.uid() is not null and auth.uid() is distinct from old.enviado_por)
     or (to_jsonb(new) - 'estado' - 'error') is distinct from (to_jsonb(old) - 'estado' - 'error') then
    raise exception 'El registro de envíos no se modifica';
  end if;
  new.error := left(new.error, 500);
  return new;
end $$;
drop trigger if exists cerrar_envio on public.envios;
create trigger cerrar_envio before update on public.envios for each row execute function public.cerrar_envio();

-- Reglas que la RLS sola no cubre: el lote es de una sola empresa, todo firmado y visible para quien envía;
-- la consulta médica solo va por correo a un contacto autorizado de esa empresa y solo la envía personal clínico.
create or replace function public.validar_envio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_total int; v_ok int; v_contacto public.empresa_contactos;
begin
  if auth.uid() is not null then new.enviado_por := auth.uid(); end if;
  new.creado_en := now();
  if new.canal = 'correo' and new.estado not in ('enviando', 'fallido') then
    raise exception 'El correo se registra antes de enviarlo (estado enviando)';
  end if;
  if new.canal = 'whatsapp' and new.estado <> 'enlace' then
    raise exception 'Un envío por WhatsApp se registra como enlace';
  end if;
  if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
    raise exception 'La empresa no pertenece a la organización';
  end if;
  select count(distinct x), count(distinct c.id) filter (
           where c.org_id = new.org_id and c.empresa_id = new.empresa_id and c.estado = 'firmada'
             and (auth.uid() is null or public.ve_consulta(c.org_id, c.id)))
    into v_total, v_ok
  from unnest(new.consultas) x left join clinico.consultas c on c.id = x;
  if v_total <> v_ok then
    raise exception 'Solo se envían consultas firmadas de esta empresa que puedas ver';
  end if;
  if new.contacto_id is not null then
    select * into v_contacto from public.empresa_contactos where id = new.contacto_id;
    if v_contacto.id is null or v_contacto.empresa_id <> new.empresa_id or not v_contacto.activo then
      raise exception 'El contacto no pertenece a esta empresa';
    end if;
  end if;
  if 'consulta' = any (new.documentos) then
    if auth.uid() is not null and not public.es_clinico(new.org_id) then
      raise exception 'Solo el personal de salud envía la consulta médica';
    end if;
    if new.canal <> 'correo' or v_contacto.id is null or not v_contacto.recibe_consulta
       or lower(new.destinatario) <> v_contacto.correo then
      raise exception 'La consulta médica solo va por correo al personal de salud autorizado de la empresa';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists validar_envio on public.envios;
create trigger validar_envio before insert on public.envios for each row execute function public.validar_envio();

-- ─── 3. Enlaces seguros para WhatsApp ────────────────────────
create table if not exists public.envio_enlaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  envio_id uuid not null unique references public.envios (id),
  token_hash bytea not null unique check (length(token_hash) = 32),
  vence timestamptz not null default now() + interval '7 days',
  revocado_en timestamptz,
  revocado_por uuid references auth.users (id),
  creado_en timestamptz not null default now()
);
-- El PDF del enlace (solo constancias) vive aquí hasta que el enlace vence o se revoca
create table if not exists public.envio_archivos (
  enlace_id uuid primary key references public.envio_enlaces (id) on delete cascade,
  nombre text not null,
  contenido bytea not null check (length(contenido) <= 15728640)
);
create table if not exists public.envio_aperturas (
  id bigserial primary key,
  enlace_id uuid not null references public.envio_enlaces (id) on delete cascade,
  en timestamptz not null default now(),
  agente text
);

alter table public.envio_enlaces enable row level security;
alter table public.envio_archivos enable row level security;
alter table public.envio_aperturas enable row level security;
drop policy if exists enlaces_leer on public.envio_enlaces;
drop policy if exists enlaces_crear on public.envio_enlaces;
drop policy if exists enlaces_revocar on public.envio_enlaces;
drop policy if exists archivos_crear on public.envio_archivos;
drop policy if exists aperturas_leer on public.envio_aperturas;
create policy enlaces_leer on public.envio_enlaces for select
  using (exists (select 1 from public.envios e where e.id = envio_enlaces.envio_id));
create policy enlaces_crear on public.envio_enlaces for insert
  with check (exists (select 1 from public.envios e where e.id = envio_enlaces.envio_id and e.org_id = envio_enlaces.org_id
                      and e.canal = 'whatsapp' and e.estado = 'enlace' and e.enviado_por = auth.uid()));
create policy enlaces_revocar on public.envio_enlaces for update
  using (exists (select 1 from public.envios e where e.id = envio_enlaces.envio_id)) with check (true);
create policy archivos_crear on public.envio_archivos for insert
  with check (exists (select 1 from public.envio_enlaces l join public.envios e on e.id = l.envio_id
                      where l.id = envio_archivos.enlace_id and e.enviado_por = auth.uid() and l.revocado_en is null));
create policy aperturas_leer on public.envio_aperturas for select
  using (exists (select 1 from public.envio_enlaces l where l.id = envio_aperturas.enlace_id));
revoke all on public.envio_enlaces, public.envio_archivos, public.envio_aperturas from anon;
revoke all on public.envio_archivos, public.envio_aperturas from authenticated;
revoke delete, truncate on public.envio_enlaces from authenticated;
grant select, insert, update on public.envio_enlaces to authenticated;
grant insert on public.envio_archivos to authenticated;
grant select on public.envio_aperturas to authenticated;

-- De un enlace solo cambia la revocación (y una vez revocado no vuelve). Al revocar se borra el PDF.
create or replace function public.validar_enlace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
    new.revocado_en := null;
    new.revocado_por := null;
    if new.vence > now() + interval '7 days' then new.vence := now() + interval '7 days'; end if;
    return new;
  end if;
  if (new.id, new.org_id, new.envio_id, new.token_hash, new.vence, new.creado_en)
     is distinct from (old.id, old.org_id, old.envio_id, old.token_hash, old.vence, old.creado_en)
     or old.revocado_en is not null or new.revocado_en is null then
    raise exception 'Un enlace solo se puede revocar';
  end if;
  new.revocado_en := now();
  new.revocado_por := auth.uid();
  delete from public.envio_archivos where enlace_id = new.id;
  return new;
end $$;
drop trigger if exists validar_enlace on public.envio_enlaces;
create trigger validar_enlace before insert or update on public.envio_enlaces for each row execute function public.validar_enlace();

-- La consulta médica de un enlace solo viaja como constancia: el PDF del enlace nunca lleva la consulta
create or replace function public.validar_archivo_enlace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.envio_enlaces l join public.envios e on e.id = l.envio_id
             where l.id = new.enlace_id and 'consulta' = any (e.documentos)) then
    raise exception 'La consulta médica no se envía por enlace';
  end if;
  return new;
end $$;
drop trigger if exists validar_archivo_enlace on public.envio_archivos;
create trigger validar_archivo_enlace before insert on public.envio_archivos for each row execute function public.validar_archivo_enlace();

-- Abre un enlace sin sesión (lo llama la ruta /e/<token>). Devuelve el PDF (base64) solo si está vigente; anota la apertura.
-- Además limpia los PDF de enlaces vencidos.
create or replace function public.abrir_enlace(p_token text, p_agente text default null)
returns table (nombre text, contenido_base64 text)
language plpgsql security definer set search_path = public as $$
declare v_enlace public.envio_enlaces;
begin
  delete from public.envio_archivos a using public.envio_enlaces l where l.id = a.enlace_id and l.vence < now();
  if p_token is null or length(p_token) < 40 then return; end if;
  select * into v_enlace from public.envio_enlaces where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v_enlace.id is null or v_enlace.revocado_en is not null or v_enlace.vence < now() then return; end if;
  insert into public.envio_aperturas (enlace_id, agente) values (v_enlace.id, left(p_agente, 300));
  return query select a.nombre, encode(a.contenido, 'base64') from public.envio_archivos a where a.enlace_id = v_enlace.id;
end $$;
revoke execute on function public.abrir_enlace(text, text) from public;
grant execute on function public.abrir_enlace(text, text) to anon, authenticated;

-- Si una consulta enviada deja de estar firmada (se reabre para corregirla), sus enlaces se revocan solos
create or replace function public.revocar_enlaces_consulta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.envio_enlaces l set revocado_en = now()
  from public.envios e
  where e.id = l.envio_id and new.id = any (e.consultas) and l.revocado_en is null;
  return null;
end $$;
revoke execute on function public.revocar_enlaces_consulta() from public, authenticated;
drop trigger if exists revocar_enlaces_consulta on clinico.consultas;
create trigger revocar_enlaces_consulta after update of estado on clinico.consultas
  for each row when (old.estado = 'firmada' and new.estado <> 'firmada')
  execute function public.revocar_enlaces_consulta();

-- ─── 4. Solicitudes extras de la empresa ─────────────────────
insert into public.listas (codigo, nombre, descripcion) values
  ('tipo_solicitud', 'Tipos de solicitud de la empresa', 'Lo que la empresa puede pedir desde el portal')
on conflict (codigo) do nothing;
insert into public.lista_items (lista, codigo, nombre, orden)
select 'tipo_solicitud', v.codigo, v.nombre, v.orden
from (values ('INF', 'Informe médico', 1), ('CAT', 'Constancia de atención médica', 2), ('APT', 'Copia de constancia de aptitud', 3),
             ('PUE', 'Evaluación de puesto de trabajo', 4), ('VIG', 'Informe de vigilancia epidemiológica', 5),
             ('REF', 'Referencia o interconsulta', 6), ('OTR', 'Otra solicitud', 9)) v (codigo, nombre, orden)
where not exists (select 1 from public.lista_items i where i.lista = 'tipo_solicitud' and i.org_id is null);

create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo_id uuid references public.lista_items (id),
  tipo text not null,
  trabajador_id uuid references public.trabajadores (id) on delete set null,
  detalle text not null check (length(detalle) between 3 and 2000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'respondida', 'rechazada')),
  respuesta text check (length(respuesta) <= 4000),
  documento_ruta text unique,
  documento_nombre text,
  solicitada_por uuid not null references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  atendida_por uuid references auth.users (id),
  actualizado_en timestamptz
);
create index if not exists solicitudes_empresa on public.solicitudes (empresa_id, creado_en desc);
create index if not exists solicitudes_abiertas on public.solicitudes (org_id, estado) where estado in ('pendiente', 'en_proceso');

alter table public.solicitudes enable row level security;
drop policy if exists solicitudes_leer on public.solicitudes;
drop policy if exists solicitudes_empresa_crear on public.solicitudes;
drop policy if exists solicitudes_servicio_crear on public.solicitudes;
drop policy if exists solicitudes_servicio_atender on public.solicitudes;
create policy solicitudes_leer on public.solicitudes for select
  using ((public.es_servicio(org_id) or public.es_empresa(org_id)) and public.puede_ver_empresa(org_id, empresa_id));
create policy solicitudes_empresa_crear on public.solicitudes for insert
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id) and estado = 'pendiente');
-- El servicio también registra las que llegan por teléfono o correo
create policy solicitudes_servicio_crear on public.solicitudes for insert
  with check (public.es_servicio(org_id) and public.puede_ver_empresa(org_id, empresa_id));
create policy solicitudes_servicio_atender on public.solicitudes for update
  using (public.es_servicio(org_id) and public.puede_ver_empresa(org_id, empresa_id))
  with check (public.es_servicio(org_id) and public.puede_ver_empresa(org_id, empresa_id));
revoke all on public.solicitudes from anon;
revoke delete, truncate on public.solicitudes from authenticated;
grant select, insert, update on public.solicitudes to authenticated;

create or replace function public.validar_solicitud()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.solicitada_por := auth.uid(); end if;
    new.creado_en := now();
    if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
      raise exception 'La empresa no pertenece a la organización';
    end if;
    if new.tipo_id is not null then
      select nombre into new.tipo from public.lista_items
      where id = new.tipo_id and lista = 'tipo_solicitud' and (org_id is null or org_id = new.org_id);
      if new.tipo is null then raise exception 'Tipo de solicitud desconocido'; end if;
    end if;
    if public.es_empresa(new.org_id) then
      new.estado := 'pendiente';
      new.respuesta := null; new.documento_ruta := null; new.documento_nombre := null;
      new.atendida_por := null; new.actualizado_en := null;
    end if;
  else
    -- Lo que pidió la empresa no se reescribe; solo cambian estado, respuesta y documento
    if (new.id, new.org_id, new.empresa_id, new.tipo_id, new.tipo, new.trabajador_id, new.detalle, new.solicitada_por, new.creado_en)
       is distinct from (old.id, old.org_id, old.empresa_id, old.tipo_id, old.tipo, old.trabajador_id, old.detalle, old.solicitada_por, old.creado_en) then
      raise exception 'La solicitud de la empresa no se modifica; responde en su lugar';
    end if;
    new.atendida_por := coalesce(auth.uid(), new.atendida_por);
    new.actualizado_en := now();
  end if;
  if new.trabajador_id is not null and not exists (
    select 1 from public.trabajadores where id = new.trabajador_id and empresa_id = new.empresa_id) then
    raise exception 'El trabajador no pertenece a esa empresa';
  end if;
  if new.documento_ruta is not null and new.documento_ruta not like new.org_id || '/' || new.empresa_id || '/' || new.id || '/%' then
    raise exception 'Ruta de documento inválida';
  end if;
  return new;
end $$;
drop trigger if exists validar_solicitud on public.solicitudes;
create trigger validar_solicitud before insert or update on public.solicitudes for each row execute function public.validar_solicitud();
drop trigger if exists bit_solicitudes on public.solicitudes;
create trigger bit_solicitudes after insert or update on public.solicitudes for each row execute function public.registrar_bitacora();

-- Avisos: al servicio cuando llega una solicitud; a la empresa cuando cambia de estado
create or replace function public.avisar_solicitud()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  select ' · ' || nombres || ' ' || apellidos into v_quien from public.trabajadores where id = new.trabajador_id;
  if tg_op = 'INSERT' and new.estado = 'pendiente' then
    perform public.notificar(new.org_id, new.empresa_id, 'servicio', 'Nueva solicitud de la empresa',
      new.tipo || coalesce(v_quien, ''), '/solicitudes');
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    perform public.notificar(new.org_id, new.empresa_id, 'empresa',
      case new.estado when 'en_proceso' then 'Solicitud en proceso' when 'respondida' then 'Solicitud respondida'
        when 'rechazada' then 'Solicitud rechazada' else 'Solicitud actualizada' end,
      new.tipo || coalesce(v_quien, ''), '/portal#solicitudes');
  end if;
  return new;
end $$;
revoke execute on function public.avisar_solicitud() from public, authenticated;
drop trigger if exists avisar_solicitud on public.solicitudes;
create trigger avisar_solicitud after insert or update on public.solicitudes for each row execute function public.avisar_solicitud();

-- Documento de respuesta: bucket privado «solicitudes», ruta <org>/<empresa>/<solicitud>/<archivo>.
-- Lo leen el servicio y la empresa dueña; lo suben y borran solo el servicio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solicitudes', 'solicitudes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.ruta_solicitud_visible(p_ruta text, p_servicio boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_partes text[] := string_to_array(p_ruta, '/'); v_org uuid; v_emp uuid; v_sol uuid;
begin
  if cardinality(v_partes) <> 4 then return false; end if;
  begin
    v_org := v_partes[1]::uuid; v_emp := v_partes[2]::uuid; v_sol := v_partes[3]::uuid;
  exception when others then return false;
  end;
  if not exists (select 1 from public.solicitudes where id = v_sol and org_id = v_org and empresa_id = v_emp) then return false; end if;
  if not public.puede_ver_empresa(v_org, v_emp) then return false; end if;
  return public.es_servicio(v_org) or (not p_servicio and public.es_empresa(v_org));
end $$;
grant execute on function public.ruta_solicitud_visible(text, boolean) to authenticated;

drop policy if exists solicitudes_leer on storage.objects;
drop policy if exists solicitudes_subir on storage.objects;
drop policy if exists solicitudes_borrar on storage.objects;
create policy solicitudes_leer on storage.objects for select to authenticated
  using (bucket_id = 'solicitudes' and public.ruta_solicitud_visible(name, false));
create policy solicitudes_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'solicitudes' and public.ruta_solicitud_visible(name, true));
create policy solicitudes_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'solicitudes' and public.ruta_solicitud_visible(name, true));
