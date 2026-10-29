-- zamorApp Ocupacional · Fase B del «local primero»: números de historia por bloques reservados por equipo.
-- trabajadores.numero_historia es serial: una PC sin internet no puede pedirle el siguiente a la nube. La nube
-- reserva bloques (sync.bloques) a cada equipo registrado; la PC numera desde su bloque (escritorio/base/40_bloques.sql)
-- y pide otro cuando le quedan pocos. Así el número de una historia abierta sin internet es definitivo desde el
-- primer momento (condición 7 de Analizar: ningún impreso legal lleva un número provisional).
-- Desde la web el número sigue dándolo la nube: todo nextval pasa por el mismo cerrojo que la reserva de bloques,
-- para que un bloque nunca se solape con un número entregado a la web en el mismo instante.

create table if not exists sync.bloques (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  equipo_id uuid not null references public.equipos (id) on delete cascade,
  desde bigint not null,
  hasta bigint not null check (hasta >= desde),
  creado_en timestamptz not null default now()
);
create index if not exists bloques_equipo on sync.bloques (equipo_id, desde);
revoke all on sync.bloques from anon, authenticated;

-- El siguiente número para la web o un cargador: nextval bajo el cerrojo de la numeración
create or replace function public.numero_historia_siguiente()
returns bigint language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('zamorapp.numero_historia'));
  return nextval(pg_get_serial_sequence('public.trabajadores', 'numero_historia'));
end $$;
revoke all on function public.numero_historia_siguiente() from public;
grant execute on function public.numero_historia_siguiente() to authenticated, service_role;
-- Sin default: el número lo pone el disparador de abajo (un default correría antes y el disparador no sabría si el
-- número vino de la PC o de la secuencia)
alter table public.trabajadores alter column numero_historia drop default;

-- Un equipo registrado (con su secreto) reserva un bloque contiguo; la secuencia de la nube salta por encima
create or replace function public.reservar_bloque(p_equipo uuid, p_secreto text, p_tamano int default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_seq text; v_desde bigint; v_hasta bigint;
begin
  v_org := sync.equipo_valido(p_equipo, p_secreto);
  if p_tamano < 1 or p_tamano > 500 then
    raise exception 'El bloque debe tener entre 1 y 500 números';
  end if;
  v_seq := pg_get_serial_sequence('public.trabajadores', 'numero_historia');
  perform pg_advisory_xact_lock(hashtext('zamorapp.numero_historia'));
  v_desde := nextval(v_seq);
  v_hasta := v_desde + p_tamano - 1;
  perform setval(v_seq, v_hasta);
  insert into sync.bloques (org_id, equipo_id, desde, hasta) values (v_org, p_equipo, v_desde, v_hasta);
  return jsonb_build_object('desde', v_desde, 'hasta', v_hasta);
end $$;
revoke all on function public.reservar_bloque(uuid, text, int) from public;
grant execute on function public.reservar_bloque(uuid, text, int) to authenticated;

-- El número que trae una fila: desde un equipo (bandeja) tiene que estar en un bloque suyo; desde la web lo da la
-- nube aunque el cliente mande uno; y nunca se cambia después (es el número de la historia impresa).
create or replace function sync.numero_de_bloque()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_eq uuid := nullif(current_setting('sync.equipo_id', true), '')::uuid;
begin
  if tg_op = 'UPDATE' then
    if new.numero_historia is distinct from old.numero_historia and auth.role() = 'authenticated' then
      new.numero_historia := old.numero_historia;
    end if;
    return new;
  end if;
  if v_eq is null then
    -- web (authenticated): siempre el de la nube; cargadores (service_role) pueden traer el suyo
    if new.numero_historia is null or auth.role() = 'authenticated' then new.numero_historia := public.numero_historia_siguiente(); end if;
    return new;
  end if;
  if new.numero_historia is null then
    new.numero_historia := public.numero_historia_siguiente();
  elsif not exists (select 1 from sync.bloques b where b.equipo_id = v_eq and new.numero_historia between b.desde and b.hasta) then
    raise exception 'El número de historia % no pertenece a un bloque reservado por este equipo', new.numero_historia
      using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists numero_de_bloque on public.trabajadores;
create trigger numero_de_bloque before insert or update of numero_historia on public.trabajadores
  for each row execute function sync.numero_de_bloque();
