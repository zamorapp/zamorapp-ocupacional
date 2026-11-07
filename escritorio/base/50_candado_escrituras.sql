-- Candado de escrituras de la PC (06-nov-2026, 40P01 «deadlock detected» al guardar la consulta en el CI de Windows).
-- guardar_consulta toma la consulta y después la aptitud, los diagnósticos o el reposo; la réplica aplicaba un lote
-- de la nube en el orden en que llegó (aptitud… y la consulta al final). Cada uno esperaba lo que tenía el otro.
-- Arreglo de raíz, sin depender del orden de cada función: todo pedido de la app que puede escribir toma este candado
-- COMPARTIDO antes de tocar una fila (db-pre-request de PostgREST); la réplica y la bandeja lo toman EXCLUSIVO al abrir
-- cada transacción (escritorio/puerta/pg-local.mjs, mismo número). Los guardados no se frenan entre sí; la réplica
-- espera a que terminen los que van y los que llegan esperan su lote (milisegundos). Se reaplica en cada arranque.
-- Solo existe en la base local: la nube no tiene réplica ni bandeja.
create schema if not exists pedido;
revoke all on schema pedido from public;
grant usage on schema pedido to authenticated;

create or replace function pedido.antes() returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
  -- Las lecturas (GET, o funciones stable que PostgREST corre en solo lectura) no toman nada
  if coalesce(current_setting('request.method', true), 'GET') in ('GET', 'HEAD')
     or current_setting('transaction_read_only') = 'on' then
    return;
  end if;
  perform pg_advisory_xact_lock_shared(7346298101);
end $$;
revoke execute on function pedido.antes() from public;
grant execute on function pedido.antes() to authenticated;

-- PostgREST lo corre antes de cada pedido, dentro de su misma transacción (ya con el rol del usuario)
alter role authenticator set pgrst.db_pre_request = 'pedido.antes';
notify pgrst, 'reload config';
