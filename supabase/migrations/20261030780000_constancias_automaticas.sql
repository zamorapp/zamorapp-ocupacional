-- zamorApp · Constancias de aptitud automáticas para RR. HH. (Cesar, 31-oct-2026)
-- 1. Si RR. HH. pide «Copia de constancia de aptitud» (tipo_solicitud APT) de un trabajador cuya última evaluación ya
--    está firmada, la solicitud se responde sola con el PDF. Si aún no está firmada, se responde sola al firmarla.
--    Al servicio le llega «Respondida automáticamente».
-- 2. Envío al firmar, opcional por empresa: un correo al día a los contactos de la empresa con las constancias firmadas.
-- Solo constancias de aptitud (sin diagnóstico). Informes, reposos y referencias nunca salen solos.
--
-- Sin service_role: el PDF lo arma la sesión clínica al firmar (o en el barrido al abrir Inicio/Solicitudes) y se
-- guarda en constancias_listas. RR. HH. lo baja por constancia_de_solicitud() (mismo alcance que solicitudes_leer). El
-- correo diario lo manda el latido de «Avisos al celular» con la clave del servidor (avisos_push_clave).
-- constancias_listas no baja a la PC (no está en sync.tablas): guarda PDF y se purga sola (cupo de 500 MB).

-- ── 1. PDF listo de la constancia de una consulta firmada ─────────────────────────────────────────────────────────
create table if not exists public.constancias_listas (
  consulta_id uuid primary key references clinico.consultas (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  nombre text not null check (length(nombre) between 5 and 200),
  contenido bytea not null check (octet_length(contenido) between 500 and 3145728),
  generada_por uuid references auth.users (id) default auth.uid(),
  generada_en timestamptz not null default public.ahora(),
  enviada_en timestamptz,                 -- salió en el correo diario de la empresa
  enviada_a text[],
  enviando_en timestamptz                -- reservada por un latido (si el correo falla, se libera a los 10 min)
);
create index if not exists constancias_listas_trabajador on public.constancias_listas (trabajador_id, generada_en desc);
create index if not exists constancias_listas_por_enviar on public.constancias_listas (empresa_id) where enviada_en is null;
alter table public.constancias_listas enable row level security;
-- Nadie la lee ni escribe directo: solo las funciones de abajo
revoke all on public.constancias_listas from public, anon, authenticated;

-- ── 2. Envío automático por empresa (nube; el escritorio lo cambia en línea) ─────────────────────────────────────
create table if not exists public.empresa_envio_auto (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  activo boolean not null default false,
  hora smallint not null default 17 check (hora between 0 and 23), -- hora de Caracas del correo diario
  desde timestamptz,                     -- al activar: solo constancias firmadas desde aquí (no se manda el pasado)
  ultimo_envio date,                     -- día (Caracas) del último correo
  actualizado_por uuid references auth.users (id) default auth.uid(),
  actualizado_en timestamptz not null default public.ahora()
);
alter table public.empresa_envio_auto enable row level security;
drop policy if exists envio_auto_leer on public.empresa_envio_auto;
drop policy if exists envio_auto_crear on public.empresa_envio_auto;
drop policy if exists envio_auto_cambiar on public.empresa_envio_auto;
-- Patrón rápido (C14): el alcance se calcula una vez por consulta, no por fila
create policy envio_auto_leer on public.empresa_envio_auto for select
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,recepcion}'))::text[]));
-- Lo activa quien manda documentos a la empresa con criterio médico: administrador, gerente médico o médico
create policy envio_auto_crear on public.empresa_envio_auto for insert
  with check (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_sin_limite => true))::uuid[])
              or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}'))::text[]));
create policy envio_auto_cambiar on public.empresa_envio_auto for update
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}'))::text[]))
  with check (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_sin_limite => true))::uuid[])
              or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}'))::text[]));
revoke all on public.empresa_envio_auto from public, anon;
revoke delete, truncate on public.empresa_envio_auto from authenticated;
grant select, insert, update on public.empresa_envio_auto to authenticated;

-- Sin security definer: current_user distingue la app (authenticated) de las funciones del latido, que anotan el día
create or replace function public.validar_envio_auto()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
    raise exception 'La empresa no pertenece a la organización';
  end if;
  new.actualizado_por := auth.uid();
  new.actualizado_en := public.ahora();
  if tg_op = 'UPDATE' then
    new.ultimo_envio := old.ultimo_envio;            -- lo pone solo el latido
    if new.activo and not old.activo then new.desde := public.ahora(); elsif new.activo then new.desde := old.desde; end if;
  else
    new.ultimo_envio := null;
    new.desde := case when new.activo then public.ahora() end;
  end if;
  return new;
end $$;
drop trigger if exists validar_envio_auto on public.empresa_envio_auto;
create trigger validar_envio_auto before insert or update on public.empresa_envio_auto for each row execute function public.validar_envio_auto();
drop trigger if exists bit_empresa_envio_auto on public.empresa_envio_auto;
create trigger bit_empresa_envio_auto after insert or update on public.empresa_envio_auto for each row execute function public.registrar_bitacora();

-- ── 3. Solicitudes respondidas solas ─────────────────────────────────────────────────────────────────────────────
alter table public.solicitudes add column if not exists respondida_auto boolean not null default false;
alter table public.solicitudes add column if not exists constancia_consulta_id uuid references clinico.consultas (id) on delete set null;
-- OJO (#154): solicitudes tiene permisos por columna; toda columna nueva necesita su grant select
grant select (respondida_auto, constancia_consulta_id) on public.solicitudes to authenticated;

-- ¿Es una solicitud de copia de constancia de aptitud?
create or replace function public.es_solicitud_constancia(p_tipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lista_items where id = p_tipo and lista = 'tipo_solicitud' and codigo = 'APT')
$$;
revoke execute on function public.es_solicitud_constancia(uuid) from public, anon;
grant execute on function public.es_solicitud_constancia(uuid) to authenticated;

-- Última evaluación con aptitud del trabajador EN ESA EMPRESA (firmada o no): la constancia que pide RR. HH. es la de esa
-- consulta. Si el trabajador cambió de empresa, la evaluación de la anterior nunca responde a la nueva (Analizar, #215).
create or replace function public.ultima_evaluacion(p_trabajador uuid, p_empresa uuid)
returns table (consulta_id uuid, estado text, fecha date)
language sql stable security definer set search_path = public as $$
  select c.id, c.estado, c.fecha
    from clinico.consultas c join clinico.aptitudes a on a.consulta_id = c.id
   where c.trabajador_id = p_trabajador and c.empresa_id = p_empresa
   order by c.fecha desc, c.hora_inicio desc
   limit 1
$$;
revoke execute on function public.ultima_evaluacion(uuid, uuid) from public, anon, authenticated;

-- Responde con la constancia lista una solicitud. Escribe las horas a mano: una función security definer cuenta como
-- «sincronía» para horas_solicitud (ver 20261030540000) y conservaría las que trae.
create or replace function public.responder_con_constancia(p_solicitud uuid, p_consulta uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_fecha date;
begin
  select fecha into v_fecha from clinico.consultas where id = p_consulta;
  update public.solicitudes
     set estado = 'respondida', respondida_auto = true, constancia_consulta_id = p_consulta, solo_salud = false,
         respuesta = 'Respondida automáticamente con la constancia de aptitud del ' || to_char(v_fecha, 'DD/MM/YYYY') || '.',
         respondida_en = public.ahora()
   where id = p_solicitud and estado in ('pendiente', 'en_proceso');
end $$;
revoke execute on function public.responder_con_constancia(uuid, uuid) from public, anon, authenticated;

-- Constancia lista de la última evaluación del trabajador (null si esa evaluación no está firmada o aún no tiene PDF).
-- Solo para quien ve la empresa del trabajador; no dice nada clínico: id y fecha de la consulta.
create or replace function public.constancia_lista_de(p_trabajador uuid, p_empresa uuid)
returns table (consulta_id uuid, fecha date)
language plpgsql stable security definer set search_path = public as $$
declare v_ult record; v_org uuid;
begin
  select e.org_id into v_org from public.empresas e where e.id = p_empresa;
  if v_org is null or not public.puede_ver_empresa(v_org, p_empresa) then return; end if;
  select * into v_ult from public.ultima_evaluacion(p_trabajador, p_empresa);
  if v_ult.consulta_id is null or v_ult.estado <> 'firmada'
     or not exists (select 1 from public.constancias_listas l where l.consulta_id = v_ult.consulta_id) then
    return;
  end if;
  return query select v_ult.consulta_id, v_ult.fecha;
end $$;
revoke execute on function public.constancia_lista_de(uuid, uuid) from public, anon;
grant execute on function public.constancia_lista_de(uuid, uuid) to authenticated;

-- Al registrar la solicitud: si la constancia de la última evaluación ya está lista, sale en el mismo paso.
-- Se llama validar_solicitud_auto para correr DESPUÉS de validar_solicitud (mismo momento: orden alfabético), que deja
-- en «pendiente» lo que crea la empresa. Sin security definer a propósito (como horas_solicitud): current_user dice si
-- es la app (authenticated) o la sincronía del escritorio, que trae filas ya decididas y no se toca.
create or replace function public.validar_solicitud_auto()
returns trigger language plpgsql set search_path = public as $$
declare v_lista record;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.respondida_auto := false;
  new.constancia_consulta_id := null;
  if new.estado <> 'pendiente' or new.trabajador_id is null or not public.es_solicitud_constancia(new.tipo_id) then return new; end if;
  select * into v_lista from public.constancia_lista_de(new.trabajador_id, new.empresa_id);
  if v_lista.consulta_id is null then return new; end if;
  new.estado := 'respondida';
  new.respondida_auto := true;
  new.constancia_consulta_id := v_lista.consulta_id;
  new.solo_salud := false;
  new.respuesta := 'Respondida automáticamente con la constancia de aptitud del ' || to_char(v_lista.fecha, 'DD/MM/YYYY') || '.';
  new.respondida_en := public.ahora();
  return new;
end $$;
drop trigger if exists validar_solicitud_auto on public.solicitudes;
create trigger validar_solicitud_auto before insert on public.solicitudes for each row execute function public.validar_solicitud_auto();

-- Nadie (fuera de las funciones de aquí) marca una respuesta como automática ni le pega una constancia
create or replace function public.proteger_respuesta_auto()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.respondida_auto := old.respondida_auto;
  new.constancia_consulta_id := old.constancia_consulta_id;
  return new;
end $$;
drop trigger if exists proteger_respuesta_auto on public.solicitudes;
create trigger proteger_respuesta_auto before update on public.solicitudes for each row execute function public.proteger_respuesta_auto();

-- Avisos: como antes, más «Respondida automáticamente» al servicio (al registrarla ya respondida o al responderse sola)
create or replace function public.avisar_solicitud()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  select ' · ' || nombres || ' ' || apellidos into v_quien from public.trabajadores where id = new.trabajador_id;
  if tg_op = 'INSERT' and new.estado = 'pendiente' then
    perform public.notificar(new.org_id, new.empresa_id, 'servicio', 'Nueva solicitud de la empresa',
      new.tipo || coalesce(v_quien, ''), '/solicitudes');
  elsif tg_op = 'INSERT' and new.respondida_auto then
    perform public.notificar(new.org_id, new.empresa_id, 'servicio', 'Respondida automáticamente',
      new.tipo || coalesce(v_quien, '') || ': la constancia firmada salió sola', '/solicitudes');
    perform public.notificar(new.org_id, new.empresa_id, 'empresa', 'Solicitud respondida',
      new.tipo || coalesce(v_quien, ''), '/portal#solicitudes');
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    perform public.notificar(new.org_id, new.empresa_id, 'empresa',
      case new.estado when 'en_proceso' then 'Solicitud en proceso' when 'respondida' then 'Solicitud respondida'
        when 'rechazada' then 'Solicitud rechazada' else 'Solicitud actualizada' end,
      new.tipo || coalesce(v_quien, ''), '/portal#solicitudes');
    if new.respondida_auto and not old.respondida_auto then
      perform public.notificar(new.org_id, new.empresa_id, 'servicio', 'Respondida automáticamente',
        new.tipo || coalesce(v_quien, '') || ': salió al firmar la constancia', '/solicitudes');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.avisar_solicitud() from public, authenticated;

-- La vista de respuestas muestra el nombre del documento también cuando es la constancia lista
create or replace view public.solicitudes_respuesta with (security_barrier = true) as
  select s.id, s.respuesta, s.documento_ruta,
         coalesce(s.documento_nombre, case when s.constancia_consulta_id is not null then 'Constancia de aptitud.pdf' end) as documento_nombre
  from public.solicitudes s
  where
    s.org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
    or (s.org_id::text || s.empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[])
    or s.org_id = any ((select public.orgs_con('{administrador}', p_sin_limite => true))::uuid[])
    or (s.org_id::text || s.empresa_id::text) = any ((select public.pares_limitados('{administrador}'))::text[])
    or (not s.solo_salud and (
          s.org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}', p_sin_limite => true))::uuid[])
       or (s.org_id::text || s.empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}'))::text[])));
revoke all on public.solicitudes_respuesta from public, anon;
grant select on public.solicitudes_respuesta to authenticated;

-- RR. HH. solo registra solicitudes pendientes, salvo la que validar_solicitud_auto respondió en el mismo paso
drop policy if exists solicitudes_empresa_crear on public.solicitudes;
create policy solicitudes_empresa_crear on public.solicitudes for insert
  with check (public.es_empresa(org_id) and public.puede_ver_empresa(org_id, empresa_id)
              and (estado = 'pendiente' or (estado = 'respondida' and respondida_auto and constancia_consulta_id is not null)));

-- ── 4. Qué constancias hay que preparar ──────────────────────────────────────────────────────────────────────────
-- Firmadas, con aptitud, sin PDF listo, y que alguien espera: una solicitud abierta de su trabajador (si es su última
-- evaluación), una respuesta automática que apunta a ella (se re-firmó tras corregir) o el envío automático de su
-- empresa (firmada desde que se activó). p_consultas null = barrido de los últimos 30 días.
create or replace function public.constancias_por_preparar(p_consultas uuid[] default null, p_limite int default 10)
returns table (consulta_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id
    from clinico.consultas c
    join clinico.aptitudes a on a.consulta_id = c.id
   where c.estado = 'firmada'
     and public.es_clinico(c.org_id) and public.puede_ver_empresa(c.org_id, c.empresa_id)
     and (p_consultas is null or c.id = any (p_consultas))
     and (p_consultas is not null or c.fecha >= public.hoy_caracas() - 30)
     and not exists (select 1 from public.constancias_listas l where l.consulta_id = c.id)
     and (
       exists (select 1 from public.solicitudes s
                where s.trabajador_id = c.trabajador_id and s.empresa_id = c.empresa_id and s.estado in ('pendiente', 'en_proceso')
                  and public.es_solicitud_constancia(s.tipo_id)
                  and (select u.consulta_id from public.ultima_evaluacion(c.trabajador_id, c.empresa_id) u) = c.id)
       or exists (select 1 from public.solicitudes s where s.constancia_consulta_id = c.id)
       or exists (select 1 from public.empresa_envio_auto e
                   where e.empresa_id = c.empresa_id and e.activo and coalesce(c.firmada_en, c.hora_cierre, c.hora_inicio) >= e.desde)
     )
   order by c.fecha desc
   limit least(greatest(coalesce(p_limite, 10), 1), 50)
$$;
revoke execute on function public.constancias_por_preparar(uuid[], int) from public, anon;
grant execute on function public.constancias_por_preparar(uuid[], int) to authenticated;

-- Guarda el PDF que armó la sesión clínica y responde las solicitudes que lo esperaban. Purga lo viejo (cupo).
create or replace function public.guardar_constancia_lista(p_consulta uuid, p_pdf_base64 text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_pdf bytea;
  v_s record;
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Inicia sesión' using errcode = '42501'; end if;
  select c.id, c.org_id, c.empresa_id, c.trabajador_id, c.estado, c.fecha, t.cedula
    into v_c from clinico.consultas c join public.trabajadores t on t.id = c.trabajador_id where c.id = p_consulta;
  if v_c.id is null or not public.es_clinico(v_c.org_id) or not public.puede_ver_empresa(v_c.org_id, v_c.empresa_id) then
    raise exception 'Solo el personal de salud prepara constancias' using errcode = '42501';
  end if;
  if v_c.estado <> 'firmada' then raise exception 'La consulta no está firmada'; end if;
  if not exists (select 1 from clinico.aptitudes where consulta_id = p_consulta) then raise exception 'La consulta no tiene aptitud'; end if;
  v_pdf := decode(p_pdf_base64, 'base64');
  if substring(v_pdf from 1 for 5) <> '%PDF-'::bytea then raise exception 'El archivo no es un PDF'; end if;

  -- Purga: lo enviado hace más de 7 días que ninguna solicitud usa; todo lo de más de 30 días
  delete from public.constancias_listas l
   where l.generada_en < public.ahora() - interval '30 days'
      or (l.enviada_en < public.ahora() - interval '7 days'
          and not exists (select 1 from public.solicitudes s where s.constancia_consulta_id = l.consulta_id));

  insert into public.constancias_listas (consulta_id, org_id, empresa_id, trabajador_id, nombre, contenido)
  values (v_c.id, v_c.org_id, v_c.empresa_id, v_c.trabajador_id,
          'Constancia de aptitud ' || v_c.cedula || ' ' || to_char(v_c.fecha, 'DD-MM-YYYY') || '.pdf', v_pdf)
  on conflict (consulta_id) do update set contenido = excluded.contenido, nombre = excluded.nombre,
    generada_por = auth.uid(), generada_en = public.ahora();

  -- Solicitudes abiertas de constancia de este trabajador, si esta es su última evaluación
  if (select u.consulta_id from public.ultima_evaluacion(v_c.trabajador_id, v_c.empresa_id) u) = v_c.id then
    for v_s in select s.id from public.solicitudes s
                where s.trabajador_id = v_c.trabajador_id and s.empresa_id = v_c.empresa_id and s.estado in ('pendiente', 'en_proceso')
                  and public.es_solicitud_constancia(s.tipo_id) loop
      perform public.responder_con_constancia(v_s.id, v_c.id);
      v_n := v_n + 1;
    end loop;
  end if;
  return v_n;
end $$;
revoke execute on function public.guardar_constancia_lista(uuid, text) from public, anon;
grant execute on function public.guardar_constancia_lista(uuid, text) to authenticated;

-- Si una consulta firmada se reabre para corregirla, su PDF listo deja de valer (se arma de nuevo al re-firmar)
create or replace function public.olvidar_constancia_lista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.constancias_listas where consulta_id = new.id;
  return null;
end $$;
revoke execute on function public.olvidar_constancia_lista() from public, authenticated;
drop trigger if exists olvidar_constancia_lista on clinico.consultas;
create trigger olvidar_constancia_lista after update of estado on clinico.consultas
  for each row when (old.estado = 'firmada' and new.estado <> 'firmada')
  execute function public.olvidar_constancia_lista();

-- ── 5. RR. HH. (o el servicio) baja la constancia de una solicitud respondida sola ──────────────────────────────
create or replace function public.constancia_de_solicitud(p_solicitud uuid)
returns table (nombre text, contenido_base64 text)
language plpgsql stable security definer set search_path = public as $$
declare v_s record;
begin
  select s.org_id, s.empresa_id, s.constancia_consulta_id, s.solo_salud into v_s from public.solicitudes s where s.id = p_solicitud;
  if v_s.constancia_consulta_id is null or v_s.solo_salud then return; end if;
  if not ((public.es_servicio(v_s.org_id) or public.es_empresa(v_s.org_id)) and public.puede_ver_empresa(v_s.org_id, v_s.empresa_id)) then
    return;
  end if;
  return query select l.nombre, encode(l.contenido, 'base64') from public.constancias_listas l
                where l.consulta_id = v_s.constancia_consulta_id and l.empresa_id = v_s.empresa_id;
end $$;
revoke execute on function public.constancia_de_solicitud(uuid) from public, anon;
grant execute on function public.constancia_de_solicitud(uuid) to authenticated;

-- ── 6. Correo diario (latido sin sesión, con la clave del servidor) ──────────────────────────────────────────────
-- Devuelve, de UNA empresa a la que ya le toca (pasó su hora de hoy y no se le envió hoy), sus constancias por enviar
-- (máx. 15 por correo; el resto sale en el siguiente latido) y los correos de sus contactos activos.
create or replace function public.constancias_del_dia(p_clave text)
returns table (empresa_id uuid, empresa text, destinatarios text[], consulta_id uuid, trabajador text, nombre text, contenido_base64 text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_hoy date := public.hoy_caracas();
  v_hora int := extract(hour from public.ahora() at time zone 'America/Caracas')::int;
  v_e record;
begin
  if length(coalesce(p_clave, '')) < 32 then return; end if;
  for v_e in
    select e.empresa_id, e.org_id, em.razon_social,
           array(select distinct lower(ct.correo) from public.empresa_contactos ct
                  where ct.empresa_id = e.empresa_id and ct.activo and ct.correo is not null) as correos
      from public.empresa_envio_auto e
      join public.empresas em on em.id = e.empresa_id
      join public.avisos_push_clave k on k.org_id = e.org_id and k.clave_hash = v_hash
     where e.activo and coalesce(em.activa, true)
       and v_hora >= e.hora and e.ultimo_envio is distinct from v_hoy
       and exists (select 1 from public.constancias_listas l join clinico.consultas c on c.id = l.consulta_id
                    where l.empresa_id = e.empresa_id and l.enviada_en is null and c.estado = 'firmada'
                      and coalesce(c.firmada_en, c.hora_cierre, c.hora_inicio) >= e.desde
                      and (l.enviando_en is null or l.enviando_en < public.ahora() - interval '10 minutes'))
     order by e.hora, e.empresa_id
     limit 1
  loop
    if cardinality(v_e.correos) = 0 then
      -- Sin a quién mandarlo: se avisa al servicio una vez al día y se marca el día para no insistir
      update public.empresa_envio_auto set ultimo_envio = v_hoy where empresa_id = v_e.empresa_id;
      perform public.notificar(v_e.org_id, v_e.empresa_id, 'servicio', 'Constancias sin enviar',
        v_e.razon_social || ': no tiene contactos con correo para el envío automático', '/envios');
      return;
    end if;
    -- Reserva lo que entrega (dos latidos a la vez nunca mandan la misma constancia)
    return query
      with elegidas as (
        select l.consulta_id
          from public.constancias_listas l
          join clinico.consultas c on c.id = l.consulta_id
          join public.empresa_envio_auto e on e.empresa_id = l.empresa_id
         where l.empresa_id = v_e.empresa_id and l.enviada_en is null and c.estado = 'firmada'
           and coalesce(c.firmada_en, c.hora_cierre, c.hora_inicio) >= e.desde
           and (l.enviando_en is null or l.enviando_en < public.ahora() - interval '10 minutes')
         order by c.fecha, l.consulta_id
         limit 15
         for update of l skip locked
      ), reservadas as (
        update public.constancias_listas l set enviando_en = public.ahora()
          from elegidas x where l.consulta_id = x.consulta_id
        returning l.consulta_id, l.trabajador_id, l.nombre, l.contenido
      )
      select v_e.empresa_id, v_e.razon_social, v_e.correos, r.consulta_id, t.nombres || ' ' || t.apellidos, r.nombre,
             encode(r.contenido, 'base64')
        from reservadas r join public.trabajadores t on t.id = r.trabajador_id;
  end loop;
end $$;
revoke execute on function public.constancias_del_dia(text) from public;
grant execute on function public.constancias_del_dia(text) to anon, authenticated;

-- Tras mandar el correo: marca esas constancias como enviadas y, si no queda ninguna, el día de la empresa.
create or replace function public.marcar_constancias_enviadas(p_clave text, p_empresa uuid, p_consultas uuid[], p_destinatarios text[])
returns int language plpgsql security definer set search_path = public as $$
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_org uuid;
  v_n int;
begin
  if length(coalesce(p_clave, '')) < 32 then return 0; end if;
  select e.org_id into v_org from public.empresa_envio_auto e
    join public.avisos_push_clave k on k.org_id = e.org_id and k.clave_hash = v_hash
   where e.empresa_id = p_empresa;
  if v_org is null then return 0; end if;
  update public.constancias_listas set enviada_en = public.ahora(), enviada_a = p_destinatarios
   where empresa_id = p_empresa and consulta_id = any (p_consultas) and enviada_en is null;
  get diagnostics v_n = row_count;
  if not exists (select 1 from public.constancias_listas l join public.empresa_envio_auto e on e.empresa_id = l.empresa_id
                  join clinico.consultas c on c.id = l.consulta_id
                  where l.empresa_id = p_empresa and l.enviada_en is null and c.estado = 'firmada'
                    and coalesce(c.firmada_en, c.hora_cierre, c.hora_inicio) >= e.desde) then
    update public.empresa_envio_auto set ultimo_envio = public.hoy_caracas() where empresa_id = p_empresa;
  end if;
  if v_n > 0 then
    perform public.notificar(v_org, p_empresa, 'servicio', 'Constancias enviadas solas',
      v_n || ' constancia' || case when v_n = 1 then '' else 's' end || ' a ' || array_to_string(p_destinatarios, ', '), '/envios');
  end if;
  return v_n;
end $$;
revoke execute on function public.marcar_constancias_enviadas(text, uuid, uuid[], text[]) from public;
grant execute on function public.marcar_constancias_enviadas(text, uuid, uuid[], text[]) to anon, authenticated;

-- Lo que el servicio ve en la ficha de la empresa: constancias enviadas solas en los últimos 30 días
create or replace function public.constancias_enviadas_auto(p_empresa uuid)
returns table (consulta_id uuid, trabajador text, fecha date, enviada_en timestamptz, enviada_a text[])
language sql stable security definer set search_path = public as $$
  select l.consulta_id, t.nombres || ' ' || t.apellidos, c.fecha, l.enviada_en, l.enviada_a
    from public.constancias_listas l
    join clinico.consultas c on c.id = l.consulta_id
    join public.trabajadores t on t.id = l.trabajador_id
   where l.empresa_id = p_empresa and l.enviada_en is not null
     and public.es_servicio(l.org_id) and public.puede_ver_empresa(l.org_id, l.empresa_id)
   order by l.enviada_en desc
   limit 50
$$;
revoke execute on function public.constancias_enviadas_auto(uuid) from public, anon;
grant execute on function public.constancias_enviadas_auto(uuid) to authenticated;

-- El latido reconoce la organización por la clave del servidor (avisos_push_clave, la misma de los avisos al celular).
-- Si nadie activó avisos todavía, la anota quien activa el envío automático desde la web (administrador o gerente
-- médico, como en guardar_suscripcion_push).
create or replace function public.anotar_clave_servidor(p_org uuid, p_clave text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
begin
  if auth.uid() is null or length(coalesce(p_clave, '')) < 32 then return false; end if;
  if exists (select 1 from public.avisos_push_clave where org_id = p_org and clave_hash = v_hash) then return true; end if;
  if public.mi_rol(p_org) not in ('administrador', 'gerente_medico') then return false; end if;
  insert into public.avisos_push_clave (org_id, clave_hash) values (p_org, v_hash)
  on conflict (org_id) do update set clave_hash = excluded.clave_hash;
  return true;
end $$;
revoke execute on function public.anotar_clave_servidor(uuid, text) from public, anon;
grant execute on function public.anotar_clave_servidor(uuid, text) to authenticated;

create or replace function public.clave_servidor_anotada(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.es_servicio(p_org) and exists (select 1 from public.avisos_push_clave where org_id = p_org)
$$;
revoke execute on function public.clave_servidor_anotada(uuid) from public, anon;
grant execute on function public.clave_servidor_anotada(uuid) to authenticated;

-- Columnas nuevas en solicitudes: ninguna vista «select *» queda atrasada (prueba 163)
select public.vistas_al_dia();
