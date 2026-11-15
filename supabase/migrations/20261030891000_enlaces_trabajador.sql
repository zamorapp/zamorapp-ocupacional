-- zamorApp Ocupacional · Documentos personales al trabajador por WhatsApp (pedido de Cesar, 05-nov-2026)
-- El servicio médico manda al teléfono del trabajador su récipe, órdenes, referencias, informe, constancia de atención,
-- control de tensión, plan de alimentación y hoja de bienestar. Igual que los enlaces a la empresa (/e/<token>):
--   · token aleatorio de 32 bytes guardado como sha256; vence a los 7 días; revocable; cada apertura queda anotada;
--   · el PDF se arma en el servidor con la sesión clínica y vive aquí solo hasta que el enlace vence o se anula;
--   · solo el personal de salud que ve esa consulta crea, lee o anula enlaces. RR. HH. y la empresa nunca los ven;
--   · los documentos clínicos (récipe, orden, referencia, informe, constancia de atención) exigen la consulta firmada;
--     las hojas educativas (tensión, dieta, bienestar) salen también durante la consulta;
--   · si una consulta firmada se reabre para corregirla, sus enlaces se anulan solos.
-- Tablas solo de la nube (no entran en sync.tablas): el escritorio las lee y escribe en la nube; sin internet no se envía.

create table if not exists public.enlaces_trabajador (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id), -- la de la consulta (la pone el trigger): alcance rápido en la RLS
  consulta_id uuid not null references clinico.consultas (id) on delete cascade,
  documento text not null check (documento in ('recipe', 'orden', 'referencia', 'informe-trabajador', 'atencion', 'control-ta', 'dieta', 'bienestar')),
  ruta text not null check (length(ruta) <= 9000),
  con_cambios boolean not null default false, -- la hoja llevaba textos editados por el médico (?c=)
  telefono text not null check (telefono ~ '^[0-9]{10,15}$'),
  token_hash bytea not null unique check (length(token_hash) = 32),
  vence timestamptz not null default public.ahora() + interval '7 days',
  revocado_en timestamptz,
  revocado_por uuid references auth.users (id),
  enviado_por uuid not null references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default public.ahora()
);
create index if not exists enlaces_trabajador_consulta on public.enlaces_trabajador (consulta_id, creado_en desc);
create index if not exists enlaces_trabajador_trabajador on public.enlaces_trabajador (trabajador_id, creado_en desc);

create table if not exists public.enlaces_trabajador_archivos (
  enlace_id uuid primary key references public.enlaces_trabajador (id) on delete cascade,
  nombre text not null check (length(nombre) <= 200),
  contenido bytea not null check (length(contenido) <= 5242880)
);
create table if not exists public.enlaces_trabajador_aperturas (
  id bigserial primary key,
  enlace_id uuid not null references public.enlaces_trabajador (id) on delete cascade,
  en timestamptz not null default public.ahora(),
  agente text
);
create index if not exists enlaces_trabajador_aperturas_enlace on public.enlaces_trabajador_aperturas (enlace_id);

alter table public.enlaces_trabajador enable row level security;
alter table public.enlaces_trabajador_archivos enable row level security;
alter table public.enlaces_trabajador_aperturas enable row level security;

drop policy if exists et_leer on public.enlaces_trabajador;
drop policy if exists et_crear on public.enlaces_trabajador;
drop policy if exists et_anular on public.enlaces_trabajador;
drop policy if exists eta_crear on public.enlaces_trabajador_archivos;
drop policy if exists etp_leer on public.enlaces_trabajador_aperturas;
-- Personal de salud de la organización, o limitado a la empresa de la consulta (como ve_consulta; patrón rápido C14)
create policy et_leer on public.enlaces_trabajador for select
  using (org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
create policy et_crear on public.enlaces_trabajador for insert
  with check (public.es_clinico(org_id) and public.ve_consulta(org_id, consulta_id) and enviado_por = auth.uid());
create policy et_anular on public.enlaces_trabajador for update
  using (org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]))
  with check (true);
create policy eta_crear on public.enlaces_trabajador_archivos for insert
  with check (exists (select 1 from public.enlaces_trabajador l
                      where l.id = enlaces_trabajador_archivos.enlace_id and l.enviado_por = auth.uid() and l.revocado_en is null));
create policy etp_leer on public.enlaces_trabajador_aperturas for select
  using (exists (select 1 from public.enlaces_trabajador l where l.id = enlaces_trabajador_aperturas.enlace_id));

revoke all on public.enlaces_trabajador, public.enlaces_trabajador_archivos, public.enlaces_trabajador_aperturas from anon;
revoke all on public.enlaces_trabajador_archivos, public.enlaces_trabajador_aperturas from authenticated;
revoke delete, truncate, update on public.enlaces_trabajador from authenticated;
grant select, insert on public.enlaces_trabajador to authenticated;
grant update (revocado_en) on public.enlaces_trabajador to authenticated;
grant insert on public.enlaces_trabajador_archivos to authenticated;
grant select on public.enlaces_trabajador_aperturas to authenticated;
revoke all on sequence public.enlaces_trabajador_aperturas_id_seq from anon, authenticated;

-- Reglas que la RLS sola no cubre. Al crear: el trabajador es el de la consulta, la ruta es exactamente la del documento
-- de esa consulta, y lo clínico va solo con la consulta firmada. Después solo cambia la anulación (una vez); al anular
-- se borra el PDF.
create or replace function public.validar_enlace_trabajador()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_consulta record;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.enviado_por := auth.uid(); end if;
    new.creado_en := now();
    new.revocado_en := null;
    new.revocado_por := null;
    if new.vence > now() + interval '7 days' then new.vence := now() + interval '7 days'; end if;
    select c.org_id, c.empresa_id, c.trabajador_id, c.estado into v_consulta from clinico.consultas c where c.id = new.consulta_id;
    new.empresa_id := v_consulta.empresa_id;
    if v_consulta.org_id is distinct from new.org_id or v_consulta.trabajador_id is distinct from new.trabajador_id then
      raise exception 'El documento no es de este trabajador';
    end if;
    if new.ruta !~ ('^/imprimir/' || new.documento || '/' || new.consulta_id::text || '(\?[A-Za-z0-9=&,._%-]*)?$') then
      raise exception 'La ruta no corresponde al documento';
    end if;
    new.con_cambios := new.ruta ~ '[?&]c=';
    if new.documento in ('recipe', 'orden', 'referencia', 'informe-trabajador', 'atencion') and v_consulta.estado <> 'firmada' then
      raise exception 'Firma la consulta antes de enviar este documento';
    end if;
    return new;
  end if;
  if (new.id, new.org_id, new.empresa_id, new.trabajador_id, new.consulta_id, new.documento, new.ruta, new.con_cambios, new.telefono, new.token_hash,
      new.vence, new.enviado_por, new.creado_en)
     is distinct from (old.id, old.org_id, old.empresa_id, old.trabajador_id, old.consulta_id, old.documento, old.ruta, old.con_cambios, old.telefono,
      old.token_hash, old.vence, old.enviado_por, old.creado_en)
     or old.revocado_en is not null or new.revocado_en is null then
    raise exception 'Un enlace solo se puede anular';
  end if;
  new.revocado_en := now();
  new.revocado_por := auth.uid();
  delete from public.enlaces_trabajador_archivos where enlace_id = new.id;
  return new;
end $$;
revoke execute on function public.validar_enlace_trabajador() from public, anon, authenticated;
drop trigger if exists validar_enlace_trabajador on public.enlaces_trabajador;
create trigger validar_enlace_trabajador before insert or update on public.enlaces_trabajador
  for each row execute function public.validar_enlace_trabajador();
drop trigger if exists bit_enlaces_trabajador on public.enlaces_trabajador;
create trigger bit_enlaces_trabajador after insert or update on public.enlaces_trabajador
  for each row execute function public.registrar_bitacora();

-- Abre un enlace sin sesión (ruta /t/<token>): devuelve el PDF solo si está vigente y anota la apertura.
-- Si el enlace existe pero venció o se anuló, devuelve solo el nombre y el teléfono del servicio (sin PDF) para que el
-- trabajador sepa a quién pedírselo de nuevo. De paso borra los PDF de enlaces vencidos.
create or replace function public.abrir_enlace_trabajador(p_token text, p_agente text default null)
returns table (nombre text, contenido_base64 text, servicio text, telefono_servicio text)
language plpgsql security definer set search_path = public as $$
declare v_enlace public.enlaces_trabajador;
begin
  delete from public.enlaces_trabajador_archivos a using public.enlaces_trabajador l where l.id = a.enlace_id and l.vence < now();
  if p_token is null or length(p_token) < 40 then return; end if;
  select * into v_enlace from public.enlaces_trabajador where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v_enlace.id is null then return; end if;
  if v_enlace.revocado_en is not null or v_enlace.vence < now() then
    return query select null::text, null::text, o.nombre, o.telefono from public.organizaciones o where o.id = v_enlace.org_id;
    return;
  end if;
  insert into public.enlaces_trabajador_aperturas (enlace_id, agente) values (v_enlace.id, left(p_agente, 300));
  return query select a.nombre, encode(a.contenido, 'base64'), o.nombre, o.telefono
    from public.enlaces_trabajador_archivos a join public.organizaciones o on o.id = v_enlace.org_id
   where a.enlace_id = v_enlace.id;
end $$;
revoke execute on function public.abrir_enlace_trabajador(text, text) from public;
-- Pública a propósito (como abrir_enlace): el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.abrir_enlace_trabajador(text, text) to anon, authenticated;

-- Consulta firmada que se reabre: sus enlaces al trabajador se anulan (el PDF ya no sería el definitivo)
create or replace function public.revocar_enlaces_trabajador_consulta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.enlaces_trabajador_archivos a using public.enlaces_trabajador l
   where l.id = a.enlace_id and l.consulta_id = new.id and l.revocado_en is null;
  update public.enlaces_trabajador set revocado_en = now()
   where consulta_id = new.id and revocado_en is null;
  return null;
end $$;
revoke execute on function public.revocar_enlaces_trabajador_consulta() from public, anon, authenticated;
drop trigger if exists revocar_enlaces_trabajador_consulta on clinico.consultas;
create trigger revocar_enlaces_trabajador_consulta after update of estado on clinico.consultas
  for each row when (old.estado = 'firmada' and new.estado <> 'firmada')
  execute function public.revocar_enlaces_trabajador_consulta();

-- Mantenimiento: igual que en 20261030640000_purgar_invitaciones.sql, más los PDF vencidos o anulados del trabajador
create or replace function public.mantenimiento_purgar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pdf integer; v_pdf_trab integer; v_registros integer; v_invitaciones integer;
begin
  delete from public.envio_archivos a using public.envio_enlaces l
   where l.id = a.enlace_id and (l.vence < now() or l.revocado_en is not null);
  get diagnostics v_pdf = row_count;
  delete from public.enlaces_trabajador_archivos a using public.enlaces_trabajador l
   where l.id = a.enlace_id and (l.vence < now() or l.revocado_en is not null);
  get diagnostics v_pdf_trab = row_count;
  delete from public.respaldos where fecha < now() - interval '1 year';
  get diagnostics v_registros = row_count;
  delete from public.invitaciones
   where usada_en is null
     and coalesce(revocada_en, vence) < now() - interval '30 days';
  get diagnostics v_invitaciones = row_count;
  return jsonb_build_object('pdf_enlaces_vencidos', v_pdf, 'pdf_trabajador_vencidos', v_pdf_trab,
                            'registros_respaldo_viejos', v_registros, 'invitaciones_viejas', v_invitaciones);
end $$;
revoke execute on function public.mantenimiento_purgar() from public, anon, authenticated;
