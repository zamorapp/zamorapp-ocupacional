-- Fase B (local primero): números de historia desde los bloques que la nube reservó a este equipo
-- (migración 20261030340000). Se reaplica en cada arranque. La réplica escribe en modo replica: este disparador no
-- corre para lo que baja de la nube.
create table if not exists local.bloques (
  id serial primary key,
  desde bigint not null,
  hasta bigint not null check (hasta >= desde),
  siguiente bigint not null,
  recibido timestamptz not null default now()
);
revoke all on local.bloques from authenticated;

create or replace function local.numeros_libres() returns bigint language sql stable as $$
  select coalesce(sum(hasta - siguiente + 1), 0) from local.bloques where siguiente <= hasta
$$;

-- Un paciente nuevo toma el siguiente número del bloque más viejo con números; sin bloque, el alta no se guarda en
-- la PC (la puerta la manda a la nube, y sin internet avisa). Nunca un número provisional (condición 7 de Analizar).
create or replace function local.numero_de_bloque()
returns trigger language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if tg_op = 'UPDATE' then
    if new.numero_historia is distinct from old.numero_historia then new.numero_historia := old.numero_historia; end if;
    return new;
  end if;
  select * into b from local.bloques where siguiente <= hasta order by desde limit 1 for update;
  if not found then
    raise exception 'Esta PC no tiene números de historia reservados: para registrar un paciente nuevo necesita internet un momento'
      using errcode = 'P0001';
  end if;
  new.numero_historia := b.siguiente;
  update local.bloques set siguiente = b.siguiente + 1 where id = b.id;
  return new;
end $$;
-- Reemplaza al disparador de la nube del mismo nombre (que aquí no aplica: no hay sync.equipo_id)
drop trigger if exists numero_de_bloque on public.trabajadores;
create trigger numero_de_bloque before insert or update of numero_historia on public.trabajadores
  for each row execute function local.numero_de_bloque();
