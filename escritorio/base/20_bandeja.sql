-- Fase A (local primero): bandeja de salida. Lo que la app guarda en la base local queda aquí y la puerta lo sube
-- a la nube con aplicar_cambios() (misma sesión del usuario, mismas reglas RLS). Se reaplica en cada arranque.
-- La réplica escribe con session_replication_role = replica: estos disparadores no corren para lo que baja de la nube.
create table if not exists local.bandeja (
  id uuid primary key default gen_random_uuid(),
  orden bigserial,
  tabla text not null,
  fila_id uuid not null,
  op char(1) not null check (op in ('I', 'U', 'D')),
  version_base bigint,
  datos jsonb,
  autor uuid,
  creado timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'conflicto', 'rechazado')),
  motivo text,
  intentos int not null default 0
);
create index if not exists bandeja_pendientes on local.bandeja (orden) where estado = 'pendiente';
revoke all on local.bandeja from authenticated;

-- Columnas que la nube deja escribir al rol (sync.columnas hace la misma comprobación allá): así un cambio que la
-- PC permite nunca llega a la nube con un campo que ella rechazaría entero.
create or replace function local.columnas_permitidas(p_tabla text, p_privilegio text)
returns text[] language sql stable as $$
  select coalesce(array_agg(column_name::text order by ordinal_position), '{}')
    from information_schema.columns
   where table_schema || '.' || table_name = p_tabla and is_generated = 'NEVER'
     and column_name not in ('version', 'creado_en', 'actualizado_en')
     and has_column_privilege('authenticated', p_tabla, column_name, p_privilegio)
$$;

create or replace function local.encolar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tabla text := tg_table_schema || '.' || tg_table_name;
  nuevo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  viejo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_id uuid := coalesce(nuevo ->> 'id', viejo ->> 'id')::uuid;
  v_cols text[];
  v_datos jsonb := '{}';
  pend local.bandeja;
  k text;
begin
  select * into pend from local.bandeja where tabla = v_tabla and fila_id = v_id and estado = 'pendiente'
   order by orden desc limit 1;

  if tg_op = 'INSERT' then
    v_cols := local.columnas_permitidas(v_tabla, 'INSERT');
    foreach k in array v_cols loop v_datos := v_datos || jsonb_build_object(k, nuevo -> k); end loop;
    -- La nube pide org_id en la fila (para confirmar que es de esta organización) y toma el id de fila_id
    v_datos := v_datos || jsonb_build_object('org_id', nuevo -> 'org_id');
    insert into local.bandeja (tabla, fila_id, op, version_base, datos, autor) values (v_tabla, v_id, 'I', null, v_datos, auth.uid());

  elsif tg_op = 'UPDATE' then
    v_cols := local.columnas_permitidas(v_tabla, 'UPDATE');
    foreach k in array v_cols loop
      if nuevo -> k is distinct from viejo -> k then v_datos := v_datos || jsonb_build_object(k, nuevo -> k); end if;
    end loop;
    if v_datos = '{}' then return null; end if;
    if pend.id is not null then
      -- Ya hay algo por subir de esta fila: se funde (una inserción pendiente sigue siendo una inserción, con lo nuevo;
      -- una modificación pendiente conserva la versión que la PC vio en la nube)
      update local.bandeja set datos = datos || v_datos where id = pend.id;
    else
      insert into local.bandeja (tabla, fila_id, op, version_base, datos, autor)
      values (v_tabla, v_id, 'U', (viejo ->> 'version')::bigint, v_datos, auth.uid());
    end if;

  else -- DELETE
    -- Una fila creada en la PC y borrada antes de subir nunca existió para la nube
    delete from local.bandeja where tabla = v_tabla and fila_id = v_id and estado = 'pendiente';
    if pend.op is distinct from 'I' then
      insert into local.bandeja (tabla, fila_id, op, version_base, datos, autor)
      values (v_tabla, v_id, 'D', (viejo ->> 'version')::bigint, null, auth.uid());
    end if;
  end if;
  return null;
end $$;
revoke execute on function local.encolar(), local.columnas_permitidas(text, text) from public, authenticated;

do $$
declare t record;
begin
  for t in select nombre from sync.tablas where subible loop
    execute format('drop trigger if exists local_encolar on %s', t.nombre);
    execute format('create trigger local_encolar after insert or update or delete on %s for each row execute function local.encolar()', t.nombre);
  end loop;
end $$;
