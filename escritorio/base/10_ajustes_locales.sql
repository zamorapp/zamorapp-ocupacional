-- Ajustes de la base local de la PC (se reaplican en cada arranque; deben ser idempotentes).

-- PostgREST local entra como "authenticator" y cambia a "authenticated" con el token de la puerta. Sin rol anónimo.
do $$ begin create role authenticator noinherit login; exception when duplicate_object then null; end $$;
grant authenticated to authenticator;

-- auth.uid() y auth.role() leyendo el token como lo pasa PostgREST 12 (request.jwt.claims).
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'authenticated')
$$;

-- Fase A (local primero): las tablas que suben a la nube (sync.tablas.subible) conservan los permisos de escritura
-- de la nube, iguales columna por columna, y lo guardado queda en local.bandeja (20_bandeja.sql) para subir.
-- Todo lo demás (sync, catálogos, tablas que se cambian solo en línea) sigue siendo de solo lectura en la PC.
revoke insert, update, delete, truncate on all tables in schema sync from authenticated;
do $$
declare t record;
begin
  for t in select table_schema || '.' || table_name as nombre from information_schema.tables
            where table_schema in ('public', 'clinico') and table_type = 'BASE TABLE'
              and table_schema || '.' || table_name not in (select nombre from sync.tablas where subible) loop
    execute format('revoke insert, update, delete, truncate on %s from authenticated', t.nombre);
  end loop;
end $$;

-- Los avisos y la bitácora oficial corren solo en la nube: en la PC no se disparan.
do $$
declare t record;
begin
  for t in select tgrelid::regclass as tabla, tgname from pg_trigger
            where not tgisinternal and (tgname like 'avisar%' or tgname like 'bit\_%') loop
    execute format('alter table %s disable trigger %I', t.tabla, t.tgname);
  end loop;
end $$;
