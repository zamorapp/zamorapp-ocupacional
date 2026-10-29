-- zamorApp Ocupacional · Consulta creada y firmada en la PC sin internet
-- La bandeja funde en un solo cambio todo lo que le pasó a una fila mientras no hubo internet: una consulta
-- abierta, cerrada y firmada en la PC llega a la nube como un INSERT ya «firmada», y proteger_autoria lo negaba
-- («no puede crearse ya firmada»), así que la consulta quedaba en Rechazados y nunca subía.
-- Ahora, solo al aplicar la bandeja (sync.cambio_id), se acepta con la misma regla de validar_firma: firma el
-- médico que atendió (o el gerente médico / administrador), nunca enfermería, y la consulta trae su hora de
-- cierre. La hora de firma la decide hora_oficial: si no venía verificada, la nube pone la suya.
create or replace function public.proteger_autoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario;
begin
  if auth.uid() is null then return new; end if;
  v_rol := public.mi_rol(new.org_id);
  if tg_op = 'INSERT' then
    new.medico_id := coalesce(new.medico_id, auth.uid());
    if new.medico_id <> auth.uid() and v_rol is distinct from 'gerente_medico' and v_rol is distinct from 'administrador' then
      raise exception 'La consulta queda a nombre de quien la crea.';
    end if;
    if new.estado = 'firmada' or new.firmada_en is not null then
      if coalesce(current_setting('sync.cambio_id', true), '') = '' or new.estado is distinct from 'firmada'
         or new.hora_cierre is null or new.firmada_en is null then
        raise exception 'Una consulta no puede crearse ya firmada: se firma después de cerrarla.';
      end if;
      if not (public.es_clinico(new.org_id) and v_rol is distinct from 'enfermeria'
              and (new.medico_id = auth.uid() or v_rol in ('gerente_medico', 'administrador'))) then
        raise exception 'Solo el médico que atendió (o el gerente médico) puede firmar esta consulta.';
      end if;
    end if;
  elsif new.medico_id is distinct from old.medico_id
        and v_rol is distinct from 'gerente_medico' and v_rol is distinct from 'administrador' then
    raise exception 'Solo el gerente médico o el administrador cambian el médico de una consulta.';
  end if;
  return new;
end $$;
revoke execute on function public.proteger_autoria() from authenticated, anon, public;
