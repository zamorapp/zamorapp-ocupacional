-- zamorApp Ocupacional · Organización inicial y primer administrador
-- El primer usuario que se registra queda como administrador de TIPURO SERVI MEDIC.
-- Los siguientes entran sin rol hasta que un administrador los agregue.

insert into public.organizaciones (nombre)
select 'TIPURO SERVI MEDIC'
where not exists (select 1 from public.organizaciones);

create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre_completo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre_completo', split_part(new.email, '@', 1)));

  if not exists (select 1 from public.miembros) then
    insert into public.miembros (org_id, usuario_id, rol)
    select id, new.id, 'administrador' from public.organizaciones order by creado_en limit 1;
  end if;
  return new;
end $$;
