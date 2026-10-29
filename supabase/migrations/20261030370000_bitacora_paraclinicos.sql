-- Catálogo de paraclínicos: cada cambio de un examen de la organización (unidad, rangos, otros nombres, fuente; alta,
-- edición o borrado, a mano o con «Completar con valores sugeridos») queda en la bitácora con quién y cuándo.
-- Un guardado sin cambios no se anota (la versión de sincronía sube sola). Solo los de la organización: los de fábrica (org_id nulo) solo cambian por migración. Las demás listas no se anotan.
create or replace function public.bitacora_paraclinicos()
returns trigger language plpgsql security definer set search_path = public as $$
declare fila public.lista_items := coalesce(new, old);
begin
  if fila.lista = 'paraclinico' and fila.org_id is not null
     and (tg_op <> 'UPDATE' or (to_jsonb(new) - 'version' - 'sync_version') is distinct from (to_jsonb(old) - 'version' - 'sync_version')) then
    insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues, equipo_id)
    values (fila.org_id, 'public.lista_items', fila.id, tg_op,
            case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
            case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
            nullif(current_setting('sync.equipo_id', true), '')::uuid);
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.bitacora_paraclinicos() from public, anon, authenticated;

drop trigger if exists bit_paraclinicos on public.lista_items;
-- En la base local de la PC no se anota: la nube lo anota al recibir la fila (si no, cada cambio sin internet saldría dos veces)
create trigger bit_paraclinicos after insert or update or delete on public.lista_items
  for each row when (not public.es_base_local()) execute function public.bitacora_paraclinicos();
