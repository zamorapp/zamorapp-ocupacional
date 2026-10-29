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
