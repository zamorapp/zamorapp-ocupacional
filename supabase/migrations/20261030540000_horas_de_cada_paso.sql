-- zamorApp Ocupacional · Hora de cada paso de citas y solicitudes (portal de RR. HH.)
-- RR. HH. veía solo el estado actual («Atendido»); ahora ve a qué hora pasó cada paso: confirmada, llegó,
-- en consulta, atendido (o no asistió / cancelada) y, en las solicitudes, en proceso y respondida.
-- Las horas las pone la base al cambiar el estado, con public.ahora() (hora anclada en el escritorio, nunca la
-- fecha de Windows). Un usuario no puede escribirlas: solo se conservan las que llegan por la sincronía del
-- escritorio (aplicar_cambios y la puerta corren con su propio rol, no como authenticated/anon), para que la
-- nube guarde la hora real en que pasó en la PC y no la hora en que subió.

alter table public.citas
  add column if not exists confirmada_en timestamptz,
  add column if not exists en_consulta_en timestamptz,
  add column if not exists atendida_en timestamptz,
  add column if not exists cerrada_en timestamptz;  -- no asistió o cancelada

alter table public.solicitudes
  add column if not exists en_proceso_en timestamptz,
  add column if not exists respondida_en timestamptz;  -- respondida o rechazada

-- La columna de hora que corresponde a cada estado
create or replace function public.columna_hora_cita(p_estado text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case p_estado
    when 'citado' then 'confirmada_en'
    when 'en_espera' then 'llegada'
    when 'en_consulta' then 'en_consulta_en'
    when 'atendido' then 'atendida_en'
    when 'no_asistio' then 'cerrada_en'
    when 'cancelada' then 'cerrada_en'
  end
$$;

-- Sin security definer a propósito: current_user es quien escribe (authenticated en la app; el dueño dentro de
-- aplicar_cambios). Las horas que trae un usuario se descartan.
-- OJO: toda función security definer que actualice citas o solicitudes cuenta como «sincronía» y conserva las horas
-- que traiga; si no viene de la sincronía del escritorio, que no las mande (o que este disparador la distinga).
create or replace function public.horas_cita()
returns trigger language plpgsql set search_path = public as $$
declare
  v_sincronia boolean := current_user not in ('authenticated', 'anon');
  v_col text := public.columna_hora_cita(new.estado);
  v_antes jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_nueva jsonb := to_jsonb(new);
  v_horas jsonb := '{}'::jsonb;
  c text;
begin
  foreach c in array array['confirmada_en', 'en_consulta_en', 'atendida_en', 'cerrada_en'] loop
    -- Por defecto cada hora queda como estaba (en un alta: vacía), salvo que venga de la sincronía
    v_horas := v_horas || jsonb_build_object(c, case when v_sincronia then v_nueva -> c else coalesce(v_antes -> c, 'null') end);
  end loop;
  if v_col is not null and v_col <> 'llegada' and (tg_op = 'INSERT' or new.estado is distinct from old.estado) then
    if not (v_sincronia and (v_nueva ->> v_col) is not null and (v_nueva -> v_col) is distinct from (v_antes -> v_col)) then
      v_horas := v_horas || jsonb_build_object(v_col, public.ahora());
    end if;
  end if;
  new.confirmada_en := (v_horas ->> 'confirmada_en')::timestamptz;
  new.en_consulta_en := (v_horas ->> 'en_consulta_en')::timestamptz;
  new.atendida_en := (v_horas ->> 'atendida_en')::timestamptz;
  new.cerrada_en := (v_horas ->> 'cerrada_en')::timestamptz;
  -- La llegada ya la manda la app (cola de Atención); si un cambio a «en el servicio» no la trae, la pone la base
  if new.estado = 'en_espera' and (tg_op = 'INSERT' or old.estado is distinct from 'en_espera') and new.llegada is null then
    new.llegada := public.ahora();
  end if;
  return new;
end $$;

drop trigger if exists horas_cita on public.citas;
create trigger horas_cita before insert or update on public.citas for each row execute function public.horas_cita();

-- Mismo criterio que horas_cita (ver el aviso sobre las funciones security definer)
create or replace function public.horas_solicitud()
returns trigger language plpgsql set search_path = public as $$
declare
  v_sincronia boolean := current_user not in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if not v_sincronia then new.en_proceso_en := null; new.respondida_en := null; end if;
    return new;
  end if;
  if not v_sincronia then
    new.en_proceso_en := old.en_proceso_en;
    new.respondida_en := old.respondida_en;
  end if;
  if new.estado is distinct from old.estado then
    if new.estado = 'en_proceso' and new.en_proceso_en is not distinct from old.en_proceso_en then
      new.en_proceso_en := public.ahora();
    elsif new.estado in ('respondida', 'rechazada') and new.respondida_en is not distinct from old.respondida_en then
      new.respondida_en := public.ahora();
    elsif new.estado = 'pendiente' then
      new.respondida_en := null;  -- reabierta: la respuesta anterior ya no vale
    end if;
  end if;
  return new;
end $$;

drop trigger if exists horas_solicitud on public.solicitudes;
create trigger horas_solicitud before insert or update on public.solicitudes for each row execute function public.horas_solicitud();

-- Las citas anteriores quedan sin estas horas: no se inventan (el portal muestra solo las que existen)
revoke execute on function public.columna_hora_cita(text) from public, anon;
grant execute on function public.columna_hora_cita(text) to authenticated;
