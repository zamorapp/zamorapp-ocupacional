-- zamorApp · Observación del reposo traída del SAME (Integral.consulta.obsreposo, 45 reposos).
-- Solo lectura en zamorApp: la llena scripts/importar-integral/completar-faltantes.mjs (con la clave de servicio, solo en
-- reposos importados que la tengan vacía). Con sesión nadie la cambia: guardar_consulta actualiza el reposo en su lugar y
-- la conserva, y el disparador de abajo la deja como estaba en cualquier otro update o la deja vacía en un alta.
-- Quién la ve: lo mismo que el reposo (RLS de clinico.reposos: personal clínico; RR. HH. no).
alter table clinico.reposos add column if not exists observacion text;
comment on column clinico.reposos.observacion is 'Observación escrita en el SAME para este reposo (importada; no se edita en zamorApp)';

create or replace function public.proteger_observacion_reposo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- carga del SAME con la clave de servicio
  new.observacion := case when tg_op = 'UPDATE' then old.observacion end;
  return new;
end $$;
revoke execute on function public.proteger_observacion_reposo() from public, authenticated;

drop trigger if exists proteger_observacion_reposo on clinico.reposos;
create trigger proteger_observacion_reposo before insert or update on clinico.reposos
  for each row execute function public.proteger_observacion_reposo();
