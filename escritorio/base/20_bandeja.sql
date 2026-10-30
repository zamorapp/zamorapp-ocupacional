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
  intentos int not null default 0,
  hora_verificada boolean not null default false
);
alter table local.bandeja add column if not exists hora_verificada boolean not null default false;
-- Reloj anclado (condición 4 de Analizar): la puerta manda X-Zamorapp-Ahora solo cuando su hora viene de la nube
create or replace function local.hora_verificada() returns boolean language sql stable as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-zamorapp-ahora', '') is not null
$$;
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

-- Versión de la nube que conoce esta PC por fila (29-oct, conflictos falsos): la columna «version» de la copia la
-- vuelve a subir el disparador local en cada guardado, así que no sirve de base. Aquí queda la última versión que la
-- nube confirmó: la que bajó la réplica o la que devolvió aplicar_cambios para un cambio de esta misma PC. La base de
-- cada cambio nuevo es esta versión; el conflicto lo sigue decidiendo la nube con su version_base, nunca la hora.
create table if not exists local.version_nube (
  tabla text not null,
  fila_id uuid not null,
  version bigint not null,
  primary key (tabla, fila_id)
);
revoke all on local.version_nube from authenticated;
-- Instalaciones que ya tenían copia: la versión de la copia de cada fila sin cambios por subir es la de la nube
do $$
declare t record;
begin
  for t in select s.nombre from sync.tablas s
            where exists (select 1 from information_schema.columns c
                           where c.table_schema || '.' || c.table_name = s.nombre and c.column_name = 'version')
              and exists (select 1 from information_schema.columns c
                           where c.table_schema || '.' || c.table_name = s.nombre and c.column_name = 'id') loop
    execute format($f$insert into local.version_nube (tabla, fila_id, version)
                      select %1$L, x.id, x.version from %1$s x
                       where x.version is not null
                         and not exists (select 1 from local.bandeja b where b.tabla = %1$L and b.fila_id = x.id)
                      on conflict do nothing$f$, t.nombre);
  end loop;
end $$;

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
  -- La base es la versión que la nube confirmó a esta PC; sin registro (fila nunca bajada), la de la copia. Se lee
  -- justo al insertar el cambio (cada sentencia ve lo último confirmado por la bandeja)
  v_base_copia bigint := (viejo ->> 'version')::bigint;
begin
  select * into pend from local.bandeja where tabla = v_tabla and fila_id = v_id and estado = 'pendiente'
   order by orden desc limit 1;

  if tg_op = 'INSERT' then
    v_cols := local.columnas_permitidas(v_tabla, 'INSERT');
    foreach k in array v_cols loop v_datos := v_datos || jsonb_build_object(k, nuevo -> k); end loop;
    -- La nube pide org_id en la fila (para confirmar que es de esta organización) y toma el id de fila_id
    v_datos := v_datos || jsonb_build_object('org_id', nuevo -> 'org_id');
    insert into local.bandeja (tabla, fila_id, op, version_base, datos, autor, hora_verificada) values (v_tabla, v_id, 'I', null, v_datos, auth.uid(), local.hora_verificada());

  elsif tg_op = 'UPDATE' then
    v_cols := local.columnas_permitidas(v_tabla, 'UPDATE');
    foreach k in array v_cols loop
      if nuevo -> k is distinct from viejo -> k then v_datos := v_datos || jsonb_build_object(k, nuevo -> k); end if;
    end loop;
    if v_datos = '{}' then return null; end if;
    if pend.id is not null then
      -- Ya hay algo por subir de esta fila: se funde (una inserción pendiente sigue siendo una inserción, con lo nuevo;
      -- una modificación pendiente conserva la versión que la PC vio en la nube)
      update local.bandeja set datos = datos || v_datos, hora_verificada = hora_verificada and local.hora_verificada()
       where id = pend.id and estado = 'pendiente';
      if not found then
        -- La bandeja la acaba de subir: o la borró (ya está en la nube) o, si se fundió otro guardado mientras subía,
        -- la dejó pendiente con otro id. Se vuelve a buscar para no dejar dos cambios de la misma fila
        select * into pend from local.bandeja where tabla = v_tabla and fila_id = v_id and estado = 'pendiente'
         order by orden desc limit 1;
        if pend.id is not null then
          update local.bandeja set datos = datos || v_datos, hora_verificada = hora_verificada and local.hora_verificada()
           where id = pend.id and estado = 'pendiente';
        end if;
      end if;
    end if;
    -- Sin pendiente, o la bandeja lo acaba de subir y borrar en este instante: cambio nuevo sobre la versión de la nube
    if pend.id is null or not found then
      insert into local.bandeja (tabla, fila_id, op, version_base, datos, autor, hora_verificada)
      values (v_tabla, v_id, 'U', coalesce((select version from local.version_nube where tabla = v_tabla and fila_id = v_id), v_base_copia), v_datos, auth.uid(), local.hora_verificada());
    end if;

  else -- DELETE
    -- Una fila creada en la PC y borrada antes de subir nunca existió para la nube
    delete from local.bandeja where tabla = v_tabla and fila_id = v_id and estado = 'pendiente';
    if pend.op is distinct from 'I' then
      insert into local.bandeja (tabla, fila_id, op, version_base, datos, autor, hora_verificada)
      values (v_tabla, v_id, 'D', coalesce((select version from local.version_nube where tabla = v_tabla and fila_id = v_id), v_base_copia), null, auth.uid(), local.hora_verificada());
    end if;
  end if;
  return null;
end $$;
revoke execute on function local.encolar(), local.columnas_permitidas(text, text) from public, authenticated;

-- ¿La réplica puede escribir esta fila de la nube? No si hay un cambio de la PC por subir, ni si la PC ya subió una
-- versión más nueva. VOLATILE a propósito: cada consulta de adentro toma una foto nueva, así que, usada en el
-- «on conflict do update where» de la réplica, mira la bandeja DESPUÉS de esperar el bloqueo de la fila. Un guardado
-- de la PC que tomó la fila mientras tanto ya está en la bandeja y no se pisa (Windows: «rápido 12» en vez de
-- «rápido 13»). Sin bloqueos extra: no hay abrazos mortales con el guardado.
create or replace function local.replica_puede(p_tabla text, p_id uuid, p_version bigint)
returns boolean language plpgsql volatile set search_path = public as $$
begin
  return not exists (select 1 from local.bandeja b where b.tabla = p_tabla and b.fila_id = p_id and b.estado = 'pendiente')
     and not exists (select 1 from local.version_nube v where v.tabla = p_tabla and v.fila_id = p_id and v.version > p_version);
end $$;
revoke execute on function local.replica_puede(text, uuid, bigint) from public, authenticated;

do $$
declare t record;
begin
  for t in select nombre from sync.tablas where subible loop
    execute format('drop trigger if exists local_encolar on %s', t.nombre);
    execute format('create trigger local_encolar after insert or update or delete on %s for each row execute function local.encolar()', t.nombre);
  end loop;
end $$;

-- Constancias sin internet (bitácora de la lectura de laboratorio, quién abrió la historia): ver config.mjs
create table if not exists local.constancias (
  id uuid primary key default gen_random_uuid(),
  rpc text not null,
  args jsonb not null default '{}',
  autor uuid not null,
  hora timestamptz not null,            -- hora anclada de la puerta al registrarla (o el piso, si no estaba verificada)
  hora_verificada boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'rechazado')),
  motivo text,
  intentos int not null default 0,
  creado timestamptz not null default clock_timestamp()
);
revoke all on local.constancias from public, authenticated;

-- Un cambio sin autor solo puede venir de una migración o un ajuste local (la puerta siempre escribe con
-- la sesión de alguien): nadie puede subirlo y quedaría pendiente para siempre, frenando la réplica de esa
-- fila. Se descarta en cada arranque (Analizar, 30-oct-2026).
delete from local.bandeja where autor is null and estado = 'pendiente';
