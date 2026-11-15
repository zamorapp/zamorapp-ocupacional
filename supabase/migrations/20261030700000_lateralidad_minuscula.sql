-- zamorApp Ocupacional · Lateralidad sin importar mayúsculas (30/10/2026)
-- Incidente: la ficha del trabajador mandaba «Diestro» y la base solo acepta 'diestro' (check de la tabla). El update
-- completo se rechazaba y con él se perdían cargo, dependencia, nivel educativo y el resto de la ficha. La pantalla ya
-- manda minúsculas; esto deja la base a prueba de cualquier cliente (escritorio viejo, bandeja, importaciones).

create or replace function public.lateralidad_normal()
returns trigger language plpgsql set search_path = public as $$
declare l text := lower(btrim(coalesce(new.lateralidad, '')));
begin
  new.lateralidad := case
    when l = '' then null
    when l in ('diestro', 'diestra', 'derecho', 'derecha', 'd') then 'diestro'
    when l in ('zurdo', 'zurda', 'izquierdo', 'izquierda', 'z', 'i') then 'zurdo'
    when l in ('ambidiestro', 'ambidiestra', 'ambidextro', 'ambidextra', 'a') then 'ambidiestro'
    else l -- otro valor: lo rechaza el check y la pantalla lo explica
  end;
  return new;
end $$;

drop trigger if exists lateralidad_normal on public.trabajadores;
create trigger lateralidad_normal before insert or update of lateralidad on public.trabajadores
  for each row execute function public.lateralidad_normal();
