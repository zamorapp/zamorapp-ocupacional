-- zamorApp Ocupacional · Quién puede firmar una consulta
-- La firma es del médico: la hace el autor de la consulta, o el gerente médico / administrador con acceso
-- clínico (p. ej. consultas sin autor). Enfermería y otros médicos no firman consultas ajenas.
-- Vale por cualquier vía (botón «Firmar» o cambio directo de estado) y siempre deja la fecha de firma.
create or replace function public.validar_firma()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario := public.mi_rol(new.org_id);
begin
  if new.estado = 'firmada' and old.estado is distinct from 'firmada' then
    if auth.uid() is not null and not (
         public.es_clinico(new.org_id) and v_rol is distinct from 'enfermeria'
         and (new.medico_id is null or new.medico_id = auth.uid() or v_rol in ('gerente_medico', 'administrador'))) then
      raise exception 'Solo el médico que atendió (o el gerente médico) puede firmar esta consulta.';
    end if;
    new.firmada_en := coalesce(new.firmada_en, now());
  end if;
  return new;
end $$;
revoke execute on function public.validar_firma() from authenticated;

drop trigger if exists validar_firma on clinico.consultas;
create trigger validar_firma before update of estado on clinico.consultas
  for each row execute function public.validar_firma();
