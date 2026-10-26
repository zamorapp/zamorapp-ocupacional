-- zamorApp Ocupacional · Autoría de la consulta
-- Antes, cualquier clínico podía crear por la API una consulta ya «firmada» a nombre de otro médico, o
-- cambiar el autor de una consulta ajena para luego firmarla. Ahora:
--  · Al crear: el autor es quien la crea (salvo gerente médico o administrador), y nunca nace firmada.
--  · Al editar: solo el gerente médico o el administrador cambian el autor.
-- La carga del Integral (sin sesión de usuario) no se ve afectada.
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
      raise exception 'Una consulta no puede crearse ya firmada: se firma después de cerrarla.';
    end if;
  elsif new.medico_id is distinct from old.medico_id
        and v_rol is distinct from 'gerente_medico' and v_rol is distinct from 'administrador' then
    raise exception 'Solo el gerente médico o el administrador cambian el médico de una consulta.';
  end if;
  return new;
end $$;
revoke execute on function public.proteger_autoria() from authenticated, anon, public;

drop trigger if exists proteger_autoria on clinico.consultas;
create trigger proteger_autoria before insert or update of medico_id on clinico.consultas
  for each row execute function public.proteger_autoria();
