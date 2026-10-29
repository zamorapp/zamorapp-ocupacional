-- zamorApp Ocupacional · Hora anclada para el programa de escritorio (local primero)
-- Cesar cambia la fecha de Windows para abrir el SAME. En la PC, now() del PostgreSQL local es esa fecha,
-- así que una consulta abierta o firmada sin internet quedaría con fecha y hora de firma falsas.
-- La puerta local guarda la hora de la nube con un reloj monótono y la manda en cada pedido
-- (cabecera X-Zamorapp-Ahora, o zamorapp.ahora en sus propias conexiones). public.ahora() la usa
-- SOLO en la base local (zamorapp.local = 'on', lo fija escritorio/base/10_ajustes_locales.sql);
-- en la nube devuelve siempre now() y la cabecera no cambia nada.

-- Lee la hora que manda la puerta; null si no hay o no es válida (nunca rompe una escritura)
create or replace function public.ahora_de_la_puerta()
returns timestamptz language plpgsql stable parallel safe set search_path = '' as $$
declare v text;
begin
  v := coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-zamorapp-ahora',
                nullif(current_setting('zamorapp.ahora', true), ''));
  if v is null then return null; end if;
  return v::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.ahora()
returns timestamptz language sql stable parallel safe set search_path = '' as $$
  select case when current_setting('zamorapp.local', true) = 'on'
              then coalesce(public.ahora_de_la_puerta(), now())
              else now() end
$$;

-- Las dos las usa cualquier fecha por defecto (también un alta del portal): solo leen la cabecera del propio pedido
grant execute on function public.ahora_de_la_puerta(), public.ahora() to anon, authenticated, service_role;

-- ─── 1. «Hoy» y las fechas de Caracas usan la hora anclada ───
create or replace function public.fecha_caracas(p_momento timestamptz default public.ahora())
returns date language sql stable parallel safe set search_path = '' as $$
  select (p_momento at time zone 'America/Caracas')::date
$$;

create or replace function public.hoy_caracas()
returns date language sql stable parallel safe set search_path = '' as $$
  select (public.ahora() at time zone 'America/Caracas')::date
$$;

create or replace function public.tocar_actualizado()
returns trigger language plpgsql set search_path = public as $$
begin new.actualizado_en := public.ahora(); return new; end $$;

-- ─── 2. Horas por defecto: toda columna con now() pasa a ahora() (en la nube es lo mismo) ───
do $$
declare r record;
begin
  for r in
    select n.nspname, c.relname, a.attname
    from pg_attrdef d
    join pg_class c on c.oid = d.adrelid and c.relkind = 'r'
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    where n.nspname in ('public', 'clinico') and pg_get_expr(d.adbin, d.adrelid) = 'now()'
  loop
    execute format('alter table %I.%I alter column %I set default public.ahora()', r.nspname, r.relname, r.attname);
  end loop;
end $$;

-- ─── 3. La consulta: apertura, cierre, duplicado y firma ───
-- Funciones largas: se reescriben solo los textos exactos y se aborta si alguno no aparece las veces esperadas.
-- reabrir_consulta (corregir una firmada) sigue solo en la nube: consultas_versiones no sube desde la PC.
do $$
declare
  v_fn record;
  v_def text;
  v_par text[];
  v_n int;
begin
  for v_fn in select * from (values
    ('public.guardar_consulta(uuid, jsonb, jsonb, jsonb, jsonb, boolean)',
      array[['(now() at time zone ''America/Caracas'')::date', 'public.hoy_caracas()', '1'],
            ['then now() else hora_cierre', 'then public.ahora() else hora_cierre', '1']]),
    ('public.duplicar_consulta(uuid)',
      array[['(now() at time zone ''America/Caracas'')::date', 'public.hoy_caracas()', '1']]),
    ('public.firmar_consulta(uuid)',
      array[['firmada_en = now()', 'firmada_en = public.ahora()', '1'],
            -- En la PC, firmar exige la hora verificada de la puerta: con la fecha de Windows (que Cesar cambia por el
            -- SAME) una firma podría quedar con fecha falsa. Sin ancla, la firma espera a que haya internet.
            ['if v_estado <> ''cerrada'' then raise exception ''Cierra la consulta antes de firmarla.''; end if;',
             'if v_estado <> ''cerrada'' then raise exception ''Cierra la consulta antes de firmarla.''; end if;
  if current_setting(''zamorapp.local'', true) = ''on'' and public.ahora_de_la_puerta() is null then
    raise exception ''Para firmar sin internet, esta PC necesita la hora verificada con la nube. Conéctate un momento o firma cuando vuelva internet: la consulta queda cerrada y guardada.'' using errcode = ''P0001'';
  end if;', '1']])
  ) as t(firma, pares)
  loop
    v_def := pg_get_functiondef(v_fn.firma::regprocedure);
    foreach v_par slice 1 in array v_fn.pares loop
      v_n := (length(v_def) - length(replace(v_def, v_par[1], ''))) / length(v_par[1]);
      if v_n <> v_par[3]::int then
        raise exception '%: «%» aparece % veces (se esperaban %)', v_fn.firma, v_par[1], v_n, v_par[3];
      end if;
      v_def := replace(v_def, v_par[1], v_par[2]);
    end loop;
    execute v_def;
  end loop;
end $$;

-- ─── 4. Hora estricta para plazos de seguridad ───
-- En la PC, sin ancla de la nube no hay hora confiable: ahora_verificada() es null y cualquier plazo comparado con
-- ella queda vencido (con la fecha de Windows atrasada alguien podría alargar un «equipo de confianza»).
create or replace function public.ahora_verificada()
returns timestamptz language sql stable parallel safe set search_path = '' as $$
  select case when current_setting('zamorapp.local', true) = 'on' then public.ahora_de_la_puerta() else now() end
$$;
grant execute on function public.ahora_verificada() to anon, authenticated, service_role;

do $$
declare
  v_fn record;
  v_def text;
  v_par text[];
  v_n int;
begin
  for v_fn in select * from (values
    ('public.equipo_de_confianza()', array[['vence > now()', 'vence > public.ahora_verificada()', '1']]),
    ('public.mis_equipos_confianza()', array[['vence > now()', 'vence > public.ahora_verificada()', '1']]),
    ('public.confiar_equipo(text)', array[['now() + make_interval', 'public.ahora_verificada() + make_interval', '1'],
                                          ['vence <= now()', 'vence <= public.ahora_verificada()', '1']])
  ) as t(firma, pares)
  loop
    v_def := pg_get_functiondef(v_fn.firma::regprocedure);
    foreach v_par slice 1 in array v_fn.pares loop
      v_n := (length(v_def) - length(replace(v_def, v_par[1], ''))) / length(v_par[1]);
      if v_n <> v_par[3]::int then
        raise exception '%: «%» aparece % veces (se esperaban %)', v_fn.firma, v_par[1], v_n, v_par[3];
      end if;
      v_def := replace(v_def, v_par[1], v_par[2]);
    end loop;
    execute v_def;
  end loop;
end $$;

-- ─── 5. En la nube: la hora del equipo no es la hora oficial si no venía verificada ───
-- aplicar_cambios deja sync.cambio_id y sync.hora_anclada ('on' si al guardar en la PC había ancla) por cada cambio.
-- Lo que trae el equipo se guarda tal cual en hora_equipo ({columna: hora, verificada}); si no venía verificada,
-- la columna oficial pasa a la hora de recepción de la nube. Impresos: muestran la columna oficial, que es la del
-- equipo cuando venía verificada (el momento real de la firma) y la de la nube cuando no.
alter table clinico.consultas add column if not exists hora_equipo jsonb;
alter table clinico.aptitudes add column if not exists hora_equipo jsonb;

-- hora_equipo la escribe SOLO este disparador: lo que mande un usuario en esa columna se descarta (parte siempre de
-- la fila anterior), así nadie puede marcar una hora como verificada. Una columna con «?» solo se anota (fecha: el día
-- de la consulta no se cambia; si no venía verificado, queda marcado en hora_equipo).
create or replace function public.hora_oficial_de_la_bandeja()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_arg text;
  v_col text;
  v_nueva jsonb := to_jsonb(new);
  v_vieja jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_verificada boolean := coalesce(current_setting('sync.hora_anclada', true), '') = 'on';
  v_equipo jsonb := case when tg_op = 'UPDATE' then old.hora_equipo end;
  v_cambios jsonb := '{}'::jsonb;
begin
  -- En la PC se guarda lo que baja de la nube tal cual (lo que se escriba allí no sube: la nube lo descarta aquí)
  if current_setting('zamorapp.local', true) = 'on' then return new; end if;
  if coalesce(current_setting('sync.cambio_id', true), '') <> '' then
    foreach v_arg in array tg_argv loop
      v_col := rtrim(v_arg, '?');
      if v_nueva ->> v_col is not null and (v_nueva -> v_col) is distinct from (v_vieja -> v_col) then
        v_equipo := coalesce(v_equipo, '{}'::jsonb) || jsonb_build_object(v_col, jsonb_build_object('hora', v_nueva -> v_col, 'verificada', v_verificada));
        if not v_verificada and v_arg = v_col then v_cambios := v_cambios || jsonb_build_object(v_col, now()); end if;
      end if;
    end loop;
  end if;
  new := jsonb_populate_record(new, v_cambios || jsonb_build_object('hora_equipo', v_equipo));
  return new;
end $$;
revoke execute on function public.hora_oficial_de_la_bandeja() from public, anon, authenticated;

drop trigger if exists hora_oficial on clinico.consultas;
create trigger hora_oficial before insert or update on clinico.consultas
  for each row execute function public.hora_oficial_de_la_bandeja('creado_en', 'hora_inicio', 'hora_cierre', 'firmada_en', 'fecha?');
drop trigger if exists hora_oficial on clinico.aptitudes;
create trigger hora_oficial before insert or update on clinico.aptitudes
  for each row execute function public.hora_oficial_de_la_bandeja('emitida_en');
