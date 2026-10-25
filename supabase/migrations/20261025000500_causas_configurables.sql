-- Las causas de reposo vienen de la lista configurable "causa_reposo";
-- se quita la restricción fija para aceptar causas nuevas de cada organización.
alter table clinico.reposos drop constraint if exists reposos_causa_check;

-- La lista de usuarios muestra también el acceso clínico
drop function if exists public.miembros_con_correo();
create function public.miembros_con_correo()
returns table (id uuid, usuario_id uuid, correo text, nombre text, rol public.rol_usuario, activo boolean, acceso_clinico boolean)
language sql stable security definer set search_path = public, auth as $$
  select m.id, m.usuario_id, u.email::text, p.nombre_completo, m.rol, m.activo, m.acceso_clinico
  from public.miembros m
  join auth.users u on u.id = m.usuario_id
  left join public.perfiles p on p.id = m.usuario_id
  where m.org_id in (select public.mis_orgs())
  order by p.nombre_completo
$$;
grant execute on function public.miembros_con_correo() to authenticated;
