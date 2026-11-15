-- zamorApp Ocupacional · La hora de cierre y la de firma solo las ponen cerrar, firmar y reabrir (Analizar, 30-oct)
-- clinico.consultas admite UPDATE directo del médico (RLS): sin esto, un PATCH podía escribir cualquier firmada_en u
-- hora_cierre. En la nube, para un usuario y fuera de la bandeja (la firma sin internet sube con su hora verificada
-- por la bandeja y se conserva; la réplica hacia la PC corre con replication_role = replica, sin disparadores):
--   · al pasar a cerrada o firmada, la hora es la del servidor (now(), que en la nube es lo mismo que ahora());
--   · al volver a borrador (reabrir o corregir), ambas quedan vacías;
--   · en cualquier otro cambio, quedan como estaban.
-- La bandeja (sync.cambio_id) no pasa por aquí: hora_oficial ya decide si la hora de la PC venía verificada.
-- Corre después de hora_oficial y antes de validar_firma (orden alfabético de los disparadores «before»).
create or replace function public.horas_de_firma_fijas()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(current_setting('sync.cambio_id', true), '') <> '' then return new; end if;
  if new.estado = 'borrador' then
    new.hora_cierre := null;
    new.firmada_en := null;
  elsif new.estado is distinct from old.estado then
    new.hora_cierre := case when old.estado = 'borrador' or old.hora_cierre is null then now() else old.hora_cierre end;
    new.firmada_en := case when new.estado = 'firmada' then now() else null end;
  else
    new.hora_cierre := old.hora_cierre;
    new.firmada_en := old.firmada_en;
  end if;
  return new;
end $$;
revoke execute on function public.horas_de_firma_fijas() from public, anon, authenticated;

drop trigger if exists horas_de_firma_fijas on clinico.consultas;
create trigger horas_de_firma_fijas before update on clinico.consultas
  for each row when (not public.es_base_local()) execute function public.horas_de_firma_fijas();
