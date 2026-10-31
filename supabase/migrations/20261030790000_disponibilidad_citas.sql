-- zamorApp · Disponibilidad para las citas que pide RR. HH. (Cesar, 31-oct): «que yo pueda colocar la disponibilidad
-- para cada día … a veces chocan con evaluaciones de otra empresa o con otras actividades … y poder enviarles que esa
-- hora no sería, sino a partir de esta hora o en este intervalo».
-- 1. horario_atencion: turnos por día de la semana (desde, hasta, minutos por turno, cupos por turno). Sin horario
--    cargado todo sigue como antes (RR. HH. escribe la hora libre).
-- 2. bloqueos_agenda: un día entero o un rato bloqueado (charla, otra empresa, diligencia). El motivo lo ve solo el servicio.
-- 3. agenda_portal(): horas libres de un día y próximos días con cupo, solo cifras (nunca de qué empresa son las citas).
--    Con horario cargado, la base exige a RR. HH. una hora libre (trigger cita_portal_en_horario).
-- 4. «Proponer otra hora»: columnas propuesta_* en citas (hora exacta, entre dos horas o a partir de una hora, con nota).
--    RR. HH. responde con responder_propuesta(): Aceptar (queda confirmada) o Pedir otra (vuelve al servicio).
-- 5. Avisos: la campana de RR. HH., su celular (ahora RR. HH. también activa avisos; solo de su empresa: citas,
--    propuestas, constancias y solicitudes, nunca diagnósticos), un correo a RR. HH. y a los contactos de la empresa, y
--    un recordatorio a las 24 h si nadie responde. La respuesta de RR. HH. le llega al servicio a la campana y al celular.
-- 6. choques_agenda(): aviso de choque para el servicio al confirmar (solo informa, nunca bloquea).
-- Local primero: horario y bloqueos son «subibles» (se escriben por la tabla en el escritorio, sin internet) y la
-- propuesta es una columna de citas (ya subible). responder_propuesta es solo de RR. HH. (web).

-- ─── 1. Horario semanal ─────────────────────────────────────
create table if not exists public.horario_atencion (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  dia smallint not null check (dia between 1 and 7),            -- 1 lunes … 7 domingo (isodow)
  desde time not null,
  hasta time not null,
  minutos smallint not null default 30 check (minutos between 10 and 240),
  cupos smallint not null default 1 check (cupos between 1 and 50),
  creado_en timestamptz not null default public.ahora(),
  check (hasta > desde)
);
create index if not exists horario_atencion_org on public.horario_atencion (org_id, dia);

-- ─── 2. Bloqueos ────────────────────────────────────────────
create table if not exists public.bloqueos_agenda (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  fecha date not null,
  desde time,                       -- vacío = todo el día
  hasta time,
  motivo text check (length(motivo) <= 200),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  check ((desde is null and hasta is null) or (desde is not null and hasta is not null and hasta > desde))
);
create index if not exists bloqueos_agenda_fecha on public.bloqueos_agenda (org_id, fecha);

do $$
declare t text;
begin
  foreach t in array array['horario_atencion', 'bloqueos_agenda'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    -- Lo edita el servicio (administrador, gerente médico, médico, enfermería, recepción)
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}'))::uuid[]))
      with check (org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}'))::uuid[]))$p$,
      t || '_editar', t);
    execute format('alter table public.%I add column if not exists version bigint not null default 1', t);
    execute format('drop trigger if exists sync_version on public.%I', t);
    execute format('create trigger sync_version before insert or update on public.%I for each row execute function sync.versionar()', t);
    execute format('drop trigger if exists sync_anotar on public.%I', t);
    execute format('create trigger sync_anotar after insert or update or delete on public.%I for each row execute function sync.anotar()', t);
    execute format('drop trigger if exists bit_%s on public.%I', t, t);
    execute format('create trigger bit_%s after insert or update or delete on public.%I for each row execute function public.registrar_bitacora()', t, t);
    execute format('insert into sync.tablas (nombre, clinica, subible) values (%L, false, true) on conflict (nombre) do update set subible = true', 'public.' || t);
  end loop;
end $$;
-- Solo lectura para el resto de la organización (RR. HH. ve el horario, no los bloqueos: su motivo es interno)
drop policy if exists horario_atencion_leer on public.horario_atencion;
create policy horario_atencion_leer on public.horario_atencion for select to authenticated
  using (org_id = any ((select public.orgs_con())::uuid[]));

-- ─── 3. Propuesta de otra hora (en la misma cita) ──────────
alter table public.citas
  add column if not exists propuesta_fecha date,
  add column if not exists propuesta_desde time,
  add column if not exists propuesta_hasta time,
  add column if not exists propuesta_modo text,
  add column if not exists propuesta_nota text,
  add column if not exists propuesta_en timestamptz,
  add column if not exists propuesta_recordada_en timestamptz,
  add column if not exists propuesta_correo_en timestamptz,
  add column if not exists respuesta_empresa text;
alter table public.citas drop constraint if exists citas_propuesta_valida;
alter table public.citas add constraint citas_propuesta_valida check (
  propuesta_fecha is null
  or (propuesta_desde is not null and propuesta_modo in ('exacta', 'rango', 'desde')
      and (propuesta_modo <> 'rango' or propuesta_hasta > propuesta_desde)
      and (propuesta_modo = 'rango' or propuesta_hasta is null)
      and coalesce(length(propuesta_nota), 0) <= 300));
alter table public.citas drop constraint if exists citas_respuesta_empresa;
alter table public.citas add constraint citas_respuesta_empresa check (respuesta_empresa in ('aceptada', 'pidio_otra'));
create index if not exists citas_propuestas on public.citas (org_id, propuesta_fecha) where propuesta_fecha is not null;

-- Turnos de un día con sus cupos libres (interno: sin control de acceso; lo usan agenda_portal y la validación)
create or replace function public.turnos_del_dia(p_org uuid, p_fecha date, p_excluir uuid default null)
returns table (hora time, cupos int, libres int)
language sql stable security definer set search_path = public as $$
  with t as (
    select (h.desde + make_interval(mins => h.minutos * g))::time as hora, h.minutos, h.cupos::int as cupos
      from public.horario_atencion h,
           generate_series(0, floor(extract(epoch from (h.hasta - h.desde)) / 60 / h.minutos)::int - 1) g
     where h.org_id = p_org and h.dia = extract(isodow from p_fecha)
  ), o as (
    -- Una solicitud con propuesta pendiente ocupa el turno propuesto, no el pedido
    select coalesce(c.propuesta_desde, c.hora) as hora, count(*)::int as n
      from public.citas c
     where c.org_id = p_org and coalesce(c.propuesta_fecha, c.fecha) = p_fecha
       and c.estado in ('solicitada', 'citado', 'en_espera', 'en_consulta')
       and (p_excluir is null or c.id <> p_excluir)
     group by 1
  )
  select t.hora, max(t.cupos), greatest(max(t.cupos) - coalesce(max(o.n), 0), 0)
    from t left join o on o.hora = t.hora
   where not exists (select 1 from public.bloqueos_agenda b
                      where b.org_id = p_org and b.fecha = p_fecha
                        and (b.desde is null or (t.hora < b.hasta and t.hora + make_interval(mins => t.minutos) > b.desde)))
     and (p_fecha > public.hoy_caracas()
          or (p_fecha = public.hoy_caracas() and t.hora > (public.ahora() at time zone 'America/Caracas')::time))
   group by t.hora
   order by t.hora
$$;
revoke execute on function public.turnos_del_dia(uuid, date, uuid) from public, anon, authenticated;

-- Lo que ve RR. HH. (y el servicio al proponer): si hay horario, las horas libres del día y los próximos 14 días con cupo.
-- Solo cifras de cupos: nunca de qué empresa ni de quién son las otras citas.
create or replace function public.agenda_portal(p_empresa uuid, p_fecha date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
  v_hoy date := public.hoy_caracas();
begin
  select e.org_id into v_org from public.empresas e where e.id = p_empresa;
  if v_org is null or auth.uid() is null or not public.puede_ver_empresa(v_org, p_empresa) then return null; end if;
  if not exists (select 1 from public.horario_atencion h where h.org_id = v_org) then
    return jsonb_build_object('configurado', false);
  end if;
  return jsonb_build_object(
    'configurado', true,
    'horas', coalesce((select jsonb_agg(jsonb_build_object('hora', to_char(t.hora, 'HH24:MI'), 'libres', t.libres) order by t.hora)
                         from public.turnos_del_dia(v_org, p_fecha) t), '[]'),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', d.f, 'libres', d.libres) order by d.f)
                        from (select f::date as f, (select sum(t.libres) from public.turnos_del_dia(v_org, f::date) t)::int as libres
                                from generate_series(greatest(v_hoy, p_fecha - 3), greatest(v_hoy, p_fecha - 3) + 13, interval '1 day') f) d
                       where d.libres > 0), '[]'));
end $$;
revoke execute on function public.agenda_portal(uuid, date) from public, anon;
grant execute on function public.agenda_portal(uuid, date) to authenticated;

-- RR. HH. solo pide horas libres cuando hay horario (mensajes claros: los lee RR. HH. en la pantalla)
create or replace function public.validar_hora_portal(p_org uuid, p_fecha date, p_hora time, p_excluir uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_libres int;
begin
  -- Solo miembros de esa organización (dentro de responder_propuesta auth.uid() sigue siendo el de RR. HH.)
  if not exists (select 1 from public.miembros m where m.usuario_id = auth.uid() and m.org_id = p_org and m.activo) then
    raise exception 'Sin permiso.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.horario_atencion h where h.org_id = p_org) then return; end if;
  if p_hora is null then
    raise exception 'Elija una de las horas disponibles.' using errcode = '23514';
  end if;
  select t.libres into v_libres from public.turnos_del_dia(p_org, p_fecha, p_excluir) t where t.hora = p_hora;
  if v_libres is null then
    raise exception 'Esa hora no está disponible el %. Elija otra de la lista.', to_char(p_fecha, 'DD/MM/YYYY') using errcode = '23514';
  elsif v_libres < 1 then
    raise exception 'La hora % del % ya se llenó. Elija otra.', to_char(p_hora, 'HH24:MI'), to_char(p_fecha, 'DD/MM/YYYY') using errcode = '23514';
  end if;
end $$;
revoke execute on function public.validar_hora_portal(uuid, date, time, uuid) from public, anon;
grant execute on function public.validar_hora_portal(uuid, date, time, uuid) to authenticated;

-- Lo que escribe RR. HH. por la tabla: hora libre, y la propuesta solo la pone el servicio.
-- Sin security definer a propósito: current_user es quien escribe (authenticated en la app); dentro de
-- responder_propuesta o de la sincronía es el dueño y no se revisa (esas funciones validan por su cuenta).
create or replace function public.cita_portal_en_horario()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user is distinct from 'authenticated' or not public.es_empresa(new.org_id) then return new; end if;
  if tg_op = 'UPDATE' and (new.propuesta_fecha, new.propuesta_desde, new.propuesta_hasta, new.propuesta_modo, new.propuesta_nota)
       is distinct from (old.propuesta_fecha, old.propuesta_desde, old.propuesta_hasta, old.propuesta_modo, old.propuesta_nota) then
    raise exception 'La hora propuesta solo la cambia el servicio médico.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.propuesta_fecha is not null then
    raise exception 'La hora propuesta solo la pone el servicio médico.' using errcode = '42501';
  end if;
  if new.estado = 'solicitada' and (tg_op = 'INSERT' or (new.fecha, new.hora) is distinct from (old.fecha, old.hora)) then
    perform public.validar_hora_portal(new.org_id, new.fecha, new.hora, new.id);
  end if;
  return new;
end $$;
revoke execute on function public.cita_portal_en_horario() from public, anon;
drop trigger if exists cita_portal_en_horario on public.citas;
create trigger cita_portal_en_horario before insert or update on public.citas
  for each row execute function public.cita_portal_en_horario();

-- Al proponer (servicio): se anota cuándo y se reinician recordatorio y correo
create or replace function public.propuesta_de_cita()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.propuesta_fecha is not null and (tg_op = 'INSERT' or (new.propuesta_fecha, new.propuesta_desde, new.propuesta_hasta, new.propuesta_modo)
       is distinct from (old.propuesta_fecha, old.propuesta_desde, old.propuesta_hasta, old.propuesta_modo)) then
    -- Lo que sube del escritorio trae su hora (la de la PC al proponer); en la web la pone la base
    if current_user in ('authenticated', 'anon') or new.propuesta_en is null then new.propuesta_en := public.ahora(); end if;
    new.propuesta_recordada_en := null;
    new.propuesta_correo_en := null;
    new.respuesta_empresa := null;
  elsif new.propuesta_fecha is null then
    new.propuesta_desde := null; new.propuesta_hasta := null; new.propuesta_modo := null; new.propuesta_nota := null;
  end if;
  return new;
end $$;
revoke execute on function public.propuesta_de_cita() from public, anon, authenticated;
drop trigger if exists propuesta_de_cita on public.citas;
create trigger propuesta_de_cita before insert or update on public.citas
  for each row execute function public.propuesta_de_cita();

-- Texto de la propuesta para avisos y correos: «sáb 01/11 entre 8:00 a. m. y 10:00 a. m.»
create or replace function public.texto_propuesta(p_fecha date, p_desde time, p_hasta time, p_modo text)
returns text language sql immutable set search_path = '' as $$
  select (array['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])[extract(isodow from p_fecha)::int] || ' ' || to_char(p_fecha, 'DD/MM')
    || case p_modo
         when 'rango' then ' entre las ' || to_char(p_desde, 'HH12:MI AM') || ' y las ' || to_char(p_hasta, 'HH12:MI AM')
         when 'desde' then ' a partir de las ' || to_char(p_desde, 'HH12:MI AM')
         else ' a las ' || to_char(p_desde, 'HH12:MI AM') end
$$;
revoke execute on function public.texto_propuesta(date, time, time, text) from public, anon;
grant execute on function public.texto_propuesta(date, time, time, text) to authenticated;

-- RR. HH. responde: Aceptar (queda confirmada a esa hora) o Pedir otra (con otro día u hora y una nota)
create or replace function public.responder_propuesta(p_cita uuid, p_aceptar boolean, p_hora time default null,
                                                      p_fecha date default null, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_hora time;
  v_nota text := nullif(left(btrim(coalesce(p_nota, '')), 300), '');
begin
  select * into c from public.citas where id = p_cita for update;
  if not found or auth.uid() is null or not public.es_empresa(c.org_id) or not public.puede_ver_empresa(c.org_id, c.empresa_id)
     then
    raise exception 'Cita no encontrada o sin permiso.' using errcode = '42501';
  end if;
  if c.estado <> 'solicitada' or c.propuesta_fecha is null then
    raise exception 'Esta cita ya no tiene una hora propuesta pendiente.' using errcode = '23514';
  end if;
  if p_aceptar then
    v_hora := case c.propuesta_modo when 'exacta' then c.propuesta_desde else coalesce(p_hora, c.propuesta_desde) end;
    if v_hora < c.propuesta_desde or (c.propuesta_modo = 'rango' and v_hora > c.propuesta_hasta) then
      raise exception 'Elija una hora dentro de la propuesta del servicio médico.' using errcode = '23514';
    end if;
    update public.citas set fecha = c.propuesta_fecha, hora = v_hora, estado = 'citado', confirmada_en = public.ahora(),
           propuesta_fecha = null, respuesta_empresa = 'aceptada', nota_empresa = coalesce(v_nota, nota_empresa)
     where id = p_cita;
  else
    if p_fecha is null or p_fecha < public.hoy_caracas() then
      raise exception 'Indique el día que prefiere.' using errcode = '23514';
    end if;
    perform public.validar_hora_portal(c.org_id, p_fecha, p_hora, c.id);
    update public.citas set fecha = p_fecha, hora = p_hora, propuesta_fecha = null, respuesta_empresa = 'pidio_otra',
           nota_empresa = coalesce(v_nota, nota_empresa)
     where id = p_cita;
  end if;
end $$;
revoke execute on function public.responder_propuesta(uuid, boolean, time, date, text) from public, anon;
grant execute on function public.responder_propuesta(uuid, boolean, time, date, text) to authenticated;

-- Aviso de choque para el servicio (solo informa): otras citas a esa hora, bloqueos o fuera del horario.
-- Con las reglas de quien pregunta (security invoker): funciona igual en el escritorio sin internet.
create or replace function public.choques_agenda(p_fecha date, p_hora time, p_excluir uuid default null)
returns text[] language plpgsql stable set search_path = public as $$
declare
  v_org uuid;
  v_salida text[] := '{}';
  r record;
begin
  if p_fecha is null then return v_salida; end if;
  select c.org_id into v_org from public.citas c where c.id = p_excluir;
  if v_org is null then
    select m.org_id into v_org from public.miembros m where m.usuario_id = auth.uid() and m.activo limit 1;
  end if;
  for r in
    select e.razon_social as empresa, count(*) as n
      from public.citas c join public.empresas e on e.id = c.empresa_id
     where c.org_id = v_org and c.fecha = p_fecha and c.hora = p_hora and (p_excluir is null or c.id <> p_excluir)
       and c.estado in ('solicitada', 'citado', 'en_espera', 'en_consulta')
     group by e.razon_social order by 2 desc limit 4
  loop
    v_salida := v_salida || (r.n || case when r.n = 1 then ' cita' else ' citas' end || ' de ' || r.empresa || ' a esa hora');
  end loop;
  for r in
    select b.motivo, b.desde, b.hasta from public.bloqueos_agenda b
     where b.org_id = v_org and b.fecha = p_fecha and (b.desde is null or p_hora is null or (p_hora >= b.desde and p_hora < b.hasta))
  loop
    v_salida := v_salida || ('Bloqueado' || coalesce(' de ' || to_char(r.desde, 'HH12:MI AM') || ' a ' || to_char(r.hasta, 'HH12:MI AM'), ' todo el día')
                             || coalesce(': ' || r.motivo, ''));
  end loop;
  if p_hora is not null and exists (select 1 from public.horario_atencion h where h.org_id = v_org)
     and not exists (select 1 from public.horario_atencion h where h.org_id = v_org and h.dia = extract(isodow from p_fecha)
                       and p_hora >= h.desde and p_hora < h.hasta) then
    v_salida := v_salida || 'Fuera de su horario de atención'::text;
  end if;
  return v_salida;
end $$;
revoke execute on function public.choques_agenda(date, time, uuid) from public, anon;
grant execute on function public.choques_agenda(date, time, uuid) to authenticated;

-- ─── 4. Avisos de la cita (reemplaza la de 20261025001700, mismo comportamiento + propuestas) ───
create or replace function public.avisar_cita()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
  v_cuando text;
begin
  select nombres || ' ' || apellidos into v_nombre from public.trabajadores where id = new.trabajador_id;
  v_cuando := to_char(new.fecha, 'DD/MM/YYYY') || coalesce(' ' || to_char(new.hora, 'HH12:MI AM'), '');

  if tg_op = 'INSERT' then
    if new.estado = 'solicitada' then
      perform public.notificar(new.org_id, new.empresa_id, 'servicio', 'Nueva solicitud de cita', v_nombre || ' · ' || v_cuando, '/atencion?dia=' || new.fecha);
    end if;
    return new;
  end if;

  -- El servicio propone otra hora → RR. HH.
  if new.propuesta_fecha is not null and (new.propuesta_fecha, new.propuesta_desde, new.propuesta_hasta, new.propuesta_modo)
       is distinct from (old.propuesta_fecha, old.propuesta_desde, old.propuesta_hasta, old.propuesta_modo) then
    perform public.notificar(new.org_id, new.empresa_id, 'empresa', 'Nueva hora propuesta',
      v_nombre || ' · el servicio médico propone ' || public.texto_propuesta(new.propuesta_fecha, new.propuesta_desde, new.propuesta_hasta, new.propuesta_modo)
        || coalesce(' · ' || new.propuesta_nota, '') || ' · toque para aceptar o pedir otra',
      '/portal#propuestas');
    return new;
  end if;

  -- RR. HH. respondió → servicio (campana y celular)
  if old.propuesta_fecha is not null and new.propuesta_fecha is null and new.respuesta_empresa is not null then
    perform public.notificar(new.org_id, new.empresa_id, 'servicio',
      case new.respuesta_empresa when 'aceptada' then 'RR. HH. aceptó la hora' else 'RR. HH. pidió otra hora' end,
      v_nombre || ' · ' || v_cuando || coalesce(' · ' || new.nota_empresa, ''), '/atencion?dia=' || new.fecha);
  end if;

  if new.estado is distinct from old.estado then
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
  elsif (new.fecha, new.hora) is distinct from (old.fecha, old.hora) and new.respuesta_empresa is distinct from 'pidio_otra' then
    perform public.notificar(new.org_id, new.empresa_id, 'empresa', 'Cita reprogramada', v_nombre || ' · ' || v_cuando, '/portal');
  end if;
  return new;
end $$;
revoke execute on function public.avisar_cita() from public, anon, authenticated;

-- Recordatorio a las 24 h sin respuesta: a RR. HH. otra vez y al servicio (una sola vez por propuesta)
create or replace function public.recordar_propuestas()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_total integer := 0;
  r record;
begin
  for r in
    with vencidas as (
      update public.citas c set propuesta_recordada_en = public.ahora()
       where c.estado = 'solicitada' and c.propuesta_fecha is not null and c.propuesta_recordada_en is null
         and c.propuesta_en <= public.ahora() - interval '24 hours' and c.propuesta_fecha >= public.hoy_caracas()
      returning c.org_id, c.empresa_id, c.propuesta_fecha, c.propuesta_desde, c.propuesta_hasta, c.propuesta_modo)
    select org_id, empresa_id, propuesta_fecha, propuesta_desde, propuesta_hasta, propuesta_modo, count(*) as n
      from vencidas group by 1, 2, 3, 4, 5, 6
  loop
    perform public.notificar(r.org_id, r.empresa_id, 'empresa', 'Recordatorio: hora propuesta sin respuesta',
      r.n || case when r.n = 1 then ' trabajador' else ' trabajadores' end || ' · '
        || public.texto_propuesta(r.propuesta_fecha, r.propuesta_desde, r.propuesta_hasta, r.propuesta_modo) || ' · toque para responder',
      '/portal#propuestas');
    perform public.notificar(r.org_id, r.empresa_id, 'servicio', 'RR. HH. no ha respondido',
      (select razon_social from public.empresas where id = r.empresa_id) || ' · ' || r.n || ' con hora propuesta para el '
        || public.texto_propuesta(r.propuesta_fecha, r.propuesta_desde, r.propuesta_hasta, r.propuesta_modo),
      '/atencion?dia=' || r.propuesta_fecha);
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
revoke execute on function public.recordar_propuestas() from public, anon, authenticated;

-- Correo a RR. HH. (sus usuarios activos) y a los contactos activos de la empresa: uno por propuesta, con todos sus
-- trabajadores. Lo pide la ruta de avisos (Vercel) con la clave del servidor; cada propuesta sale una sola vez.
create or replace function public.correos_propuestas_por_enviar(p_clave text)
returns table (para text[], asunto text, texto text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
begin
  if length(coalesce(p_clave, '')) < 32 then return; end if;
  return query
    with marcadas as (
      update public.citas c set propuesta_correo_en = public.ahora()
        from public.avisos_push_clave k
       where k.org_id = c.org_id and k.clave_hash = v_hash
         and c.estado = 'solicitada' and c.propuesta_fecha is not null and c.propuesta_correo_en is null
         and c.propuesta_fecha >= public.hoy_caracas()
      returning c.org_id, c.empresa_id, c.trabajador_id, c.propuesta_fecha, c.propuesta_desde, c.propuesta_hasta, c.propuesta_modo, c.propuesta_nota
    ), grupos as (
      select m.org_id, m.empresa_id, m.propuesta_fecha, m.propuesta_desde, m.propuesta_hasta, m.propuesta_modo, m.propuesta_nota,
             string_agg(t.nombres || ' ' || t.apellidos, ', ' order by t.apellidos) as nombres, count(*) as n
        from marcadas m join public.trabajadores t on t.id = m.trabajador_id
       group by 1, 2, 3, 4, 5, 6, 7
    )
    select array(select distinct x from unnest(
             array(select u.email::text from public.miembros mi join auth.users u on u.id = mi.usuario_id
                    where mi.org_id = g.org_id and mi.activo and mi.rol = 'gerente_empresa' and g.empresa_id = any (mi.empresas_permitidas)
                      and u.email is not null)
             || array(select ec.correo from public.empresa_contactos ec
                       where ec.empresa_id = g.empresa_id and ec.activo and ec.correo is not null)) x),
           'Nueva hora propuesta por el servicio médico · ' || public.texto_propuesta(g.propuesta_fecha, g.propuesta_desde, g.propuesta_hasta, g.propuesta_modo),
           concat_ws(E'\n',
             'Buen día. ' || o.nombre || ' le propone otra hora para ' || case when g.n = 1 then 'la evaluación de ' else 'las evaluaciones de ' end || g.nombres || ':',
             '',
             '  ' || public.texto_propuesta(g.propuesta_fecha, g.propuesta_desde, g.propuesta_hasta, g.propuesta_modo),
             case when g.propuesta_nota is not null then '  Nota: ' || g.propuesta_nota end,
             '',
             'Para aceptarla o pedir otra hora, entre al portal:')
      from grupos g join public.organizaciones o on o.id = g.org_id;
end $$;
revoke execute on function public.correos_propuestas_por_enviar(text) from public;
grant execute on function public.correos_propuestas_por_enviar(text) to anon, authenticated;

-- ─── 5. Avisos al celular también para RR. HH. ─────────────
-- Activar: servicio o un usuario de empresa (la clave del servidor la sigue anotando solo administrador/gerente médico)
create or replace function public.guardar_suscripcion_push(p_org uuid, p_endpoint text, p_p256dh text, p_auth text, p_equipo text, p_clave text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_actual bytea;
begin
  if auth.uid() is null or not (public.es_servicio(p_org) or public.es_empresa(p_org)) then
    raise exception 'Su usuario no puede activar avisos' using errcode = '42501';
  end if;
  if length(coalesce(p_clave, '')) < 32 then raise exception 'Falta la clave de avisos del servidor'; end if;
  select clave_hash into v_actual from public.avisos_push_clave where org_id = p_org;
  if v_actual is distinct from v_hash then
    if public.mi_rol(p_org) not in ('administrador', 'gerente_medico') then
      raise exception 'El servicio médico debe activar los avisos primero' using errcode = '42501';
    end if;
    insert into public.avisos_push_clave (org_id, clave_hash) values (p_org, v_hash)
    on conflict (org_id) do update set clave_hash = excluded.clave_hash;
  end if;
  insert into public.suscripciones_push (org_id, usuario_id, endpoint, p256dh, auth, equipo)
  values (p_org, auth.uid(), p_endpoint, p_p256dh, p_auth, nullif(btrim(p_equipo), ''))
  on conflict (endpoint) do update
    set org_id = excluded.org_id, usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth,
        equipo = excluded.equipo, creada_en = public.ahora();
end $$;
revoke execute on function public.guardar_suscripcion_push(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.guardar_suscripcion_push(uuid, text, text, text, text, text) to authenticated;

-- Al instante: también llama la ruta si hay una propuesta nueva (aunque RR. HH. no tenga celular: sale el correo)
create or replace function public.avisar_al_celular_al_instante()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.es_base_local() or to_regnamespace('net') is null
     or current_setting('zamorapp.latido_avisos', true) = 'on'
     or not exists (select 1 from nuevas n
                     where n.titulo = 'Nueva hora propuesta'
                        or (n.titulo not in ('Nueva solicitud de cita', 'RR. HH. aceptó la invitación', 'Nueva solicitud de la empresa')
                            and exists (select 1 from public.suscripciones_push s where s.usuario_id = n.usuario_id and s.org_id = n.org_id))) then
    return null;
  end if;
  begin
    execute 'select net.http_get($1)' using 'https://zamorapp-ocupacional.vercel.app/api/avisos/campana';
  exception when others then raise warning 'avisar_al_celular_al_instante: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.avisar_al_celular_al_instante() from public, anon, authenticated;

-- El latido avisa también a los celulares de RR. HH. (solo sus notificaciones) y corre el recordatorio de propuestas
create or replace function public.avisos_campana_para_celular(p_clave text)
returns table (endpoint text, p256dh text, auth text, titulo text, cuerpo text, ruta text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_hoy date := public.hoy_caracas();
  v_hora int := extract(hour from public.ahora() at time zone 'America/Caracas')::int;
  u record;
  v_n int;
  v_titulo text;
  v_cuerpo text;
  v_ruta text;
  v_venc int;
  v_por_vencer int;
  v_generar boolean;
begin
  if length(coalesce(p_clave, '')) < 32 then return; end if;
  if not exists (select 1 from public.avisos_push_clave k where k.clave_hash = v_hash) then return; end if;
  -- Freno (solo con la clave correcta, para que una llamada ajena no pueda frenar los avisos)
  insert into public.avisos_push_latido as l (unica, ultima) values (true, public.ahora())
  on conflict (unica) do update set ultima = excluded.ultima where l.ultima <= public.ahora() - interval '2 seconds';
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;
  -- Lo que creen los generadores aquí no vuelve a llamar la ruta (trigger avisar_al_celular_al_instante)
  perform set_config('zamorapp.latido_avisos', 'on', true);
  update public.avisos_push_latido set generado = public.ahora()
   where generado is null or generado <= public.ahora() - interval '10 minutes';
  v_generar := found;
  -- Propuestas de hora sin respuesta en 24 h (20261030790000): una vez por latido, no por usuario
  if v_generar then
    begin perform public.recordar_propuestas(); exception when others then raise warning 'avisos_campana_para_celular: recordar_propuestas falló: %', sqlerrm; end;
  end if;
  for u in
    select distinct s.usuario_id, s.org_id, m.rol
      from public.suscripciones_push s
      join public.avisos_push_clave k on k.org_id = s.org_id and k.clave_hash = v_hash
      join public.miembros m on m.org_id = s.org_id and m.usuario_id = s.usuario_id and m.activo
       and m.rol in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'gerente_empresa')
  loop
    -- Los generadores de la campana, como si este usuario hubiera abierto el Inicio (solo dentro de esta función)
    -- RR. HH. (20261030790000): solo recibe sus notificaciones (las de su empresa), sin generadores ni resumen
    if v_generar and u.rol <> 'gerente_empresa' then
    perform set_config('request.jwt.claim.sub', u.usuario_id::text, true);
    begin perform public.centinela_legal(); exception when others then raise warning 'avisos_campana_para_celular: centinela_legal falló: %', sqlerrm; end;
    begin perform public.recordar_resultados(); exception when others then raise warning 'avisos_campana_para_celular: recordar_resultados falló: %', sqlerrm; end;
    begin perform public.recordar_alertas(); exception when others then raise warning 'avisos_campana_para_celular: recordar_alertas falló: %', sqlerrm; end;
    -- Post vacacional (migración 20261030670000)
    begin perform public.recordar_post_vacacional(); exception when others then raise warning 'avisos_campana_para_celular: recordar_post_vacacional falló: %', sqlerrm; end;
    perform set_config('request.jwt.claim.sub', '', true);
    end if;

    -- Notificaciones nuevas de la campana que todavía no salieron al celular
    with nuevas as (
      select n.id, n.titulo, n.texto, n.enlace, n.creado_en
        from public.notificaciones n
       where n.usuario_id = u.usuario_id and n.org_id = u.org_id and not n.leida
         and n.creado_en >= public.ahora() - interval '2 days'
         and n.titulo not in ('Nueva solicitud de cita', 'RR. HH. aceptó la invitación', 'Nueva solicitud de la empresa')
         and not exists (select 1 from public.avisos_push_enviadas e where e.notificacion_id = n.id)
         -- «Avisos de esta empresa» (610000): un tipo apagado en la empresa no suena en el celular
         and not exists (select 1 from public.empresas x where x.id = n.empresa_id and (
               (n.titulo = 'Resultados por recibir' and 'resultados' = any (x.avisos_apagados))
            or (n.titulo = 'Alerta para la próxima evaluación' and 'proxima_evaluacion' = any (x.avisos_apagados))))
    ), marcadas as (
      insert into public.avisos_push_enviadas (notificacion_id, usuario_id)
      select id, u.usuario_id from nuevas on conflict do nothing
      returning notificacion_id
    )
    select count(*),
           (array_agg(n.titulo order by n.creado_en desc))[1],
           case when count(*) = 1 then max(n.texto)
                else string_agg(n.titulo || coalesce(': ' || n.texto, ''), ' · ' order by n.creado_en desc) end,
           (array_agg(n.enlace order by n.creado_en desc))[1]
      into v_n, v_titulo, v_cuerpo, v_ruta
      from nuevas n join marcadas m on m.notificacion_id = n.id;

    -- Resumen diario de exámenes vencidos y por vencer (desde las 7:00 de Caracas, una vez al día)
    v_venc := 0; v_por_vencer := 0;
    if u.rol <> 'gerente_empresa' and v_hora >= 7 and not exists (select 1 from public.avisos_push_resumen r where r.usuario_id = u.usuario_id and r.dia >= v_hoy) then
      select count(*) filter (where a.proximo_examen < v_hoy),
             count(*) filter (where a.proximo_examen between v_hoy and v_hoy + e.dias_aviso_examen)
        into v_venc, v_por_vencer
        from public.miembros m
        join public.empresas e on e.org_id = m.org_id and e.activa
         and (m.empresas_permitidas is null or e.id = any (m.empresas_permitidas))
         and not ('vencimientos' = any (coalesce(e.avisos_apagados, '{}')))
        join public.trabajadores t on t.empresa_id = e.id and t.estado in ('activo', 'reposo')
        join public.ultima_aptitud a on a.trabajador_id = t.id
       where m.usuario_id = u.usuario_id and m.org_id = u.org_id and m.activo;
      insert into public.avisos_push_resumen (usuario_id, dia) values (u.usuario_id, v_hoy)
      on conflict (usuario_id) do update set dia = excluded.dia;
    end if;

    if v_n = 0 and v_venc + v_por_vencer = 0 then continue; end if;
    if v_n > 1 then
      v_titulo := v_n || ' avisos nuevos';
      v_ruta := '/panel';
    elsif v_n = 0 then
      v_titulo := 'Exámenes por vencer';
      v_cuerpo := null;
      v_ruta := '/reportes/vencimientos';
    end if;
    if v_venc + v_por_vencer > 0 then
      v_cuerpo := concat_ws(' · ', v_cuerpo,
        'Exámenes: ' || concat_ws(' y ', case when v_venc > 0 then v_venc || ' vencido' || case when v_venc > 1 then 's' else '' end end,
                                         case when v_por_vencer > 0 then v_por_vencer || ' por vencer' end));
    end if;

    return query
      select s.endpoint, s.p256dh, s.auth, v_titulo, left(v_cuerpo, 240), coalesce(v_ruta, '/panel')
        from public.suscripciones_push s where s.usuario_id = u.usuario_id and s.org_id = u.org_id;
    update public.suscripciones_push s set ultimo_aviso = public.ahora() where s.usuario_id = u.usuario_id and s.org_id = u.org_id;
  end loop;
end $$;
revoke execute on function public.avisos_campana_para_celular(text) from public;
grant execute on function public.avisos_campana_para_celular(text) to anon, authenticated;

-- Columnas nuevas de citas: vistas al día (prueba 163)
select public.vistas_al_dia();
