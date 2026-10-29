-- zamorApp Ocupacional · Consulta creada y firmada en la PC sin internet
-- La bandeja funde en un solo cambio todo lo que le pasó a una fila mientras no hubo internet: una consulta
-- abierta, cerrada y firmada en la PC llega a la nube como un INSERT ya «firmada», y proteger_autoria lo negaba
-- («no puede crearse ya firmada»), así que la consulta quedaba en Rechazados y nunca subía.
-- Ahora, solo al aplicar la bandeja (sync.cambio_id), se acepta con la misma regla de validar_firma: firma el
-- médico que atendió (o el gerente médico / administrador), nunca enfermería, y la consulta trae su hora de
-- cierre. La hora de firma la decide hora_oficial: si no venía verificada, la nube pone la suya.
-- Sus diagnósticos, aptitud y reposo suben después (en el mismo lote o en el siguiente): consulta_abierta los deja
-- pasar solo si los aplica la bandeja de la misma PC que firmó y nadie tocó la consulta desde entonces.
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

-- El aviso de aptitud a la empresa tampoco depende de que la consulta llegue como UPDATE: si llega ya cerrada o
-- firmada en un INSERT, el mismo aviso corre al crearla (la aptitud que suba después avisa por avisar_aptitud).
drop trigger if exists avisar_aptitud_al_crear_cerrada on clinico.consultas;
create trigger avisar_aptitud_al_crear_cerrada after insert on clinico.consultas
  for each row when (new.estado in ('cerrada', 'firmada') and not public.es_base_local())
  execute function public.avisar_aptitud_al_cerrar();

-- Filas hijas de una consulta firmada en la PC: las sube la bandeja de esa misma PC (sync.equipo_id) y el último
-- cambio de la consulta en la nube es el suyo. Una firma hecha en la web, o un cambio posterior, las sigue negando.
-- Ventana abierta mientras nadie toque la consulta: hoy basta porque la base local niega hijas de una firmada.
create or replace function public.consulta_abierta(p_consulta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select estado <> 'firmada' from clinico.consultas where id = p_consulta), true)
      or (coalesce(current_setting('sync.equipo_id', true), '') <> ''
          and (select r.equipo_id from sync.registro r
                where r.tabla = 'clinico.consultas' and r.fila_id = p_consulta
                order by r.version desc nulls last, r.seq desc limit 1) = nullif(current_setting('sync.equipo_id', true), '')::uuid)
$$;
