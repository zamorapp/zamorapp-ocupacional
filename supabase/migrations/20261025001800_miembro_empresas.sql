-- Alta de usuarios con empresas asignadas (para RR. HH. de una empresa cliente)
drop function if exists public.agregar_miembro(text, public.rol_usuario);

create or replace function public.agregar_miembro(p_correo text, p_rol public.rol_usuario, p_empresas uuid[] default null)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_org uuid; v_usuario uuid; v_id uuid;
begin
  select org_id into v_org from public.miembros
  where usuario_id = auth.uid() and rol = 'administrador' and activo limit 1;
  if v_org is null then raise exception 'Solo un administrador puede agregar usuarios'; end if;
  if p_rol = 'gerente_empresa' and coalesce(array_length(p_empresas, 1), 0) = 0 then
    raise exception 'Elige la empresa a la que pertenece este usuario';
  end if;

  select id into v_usuario from auth.users where lower(email) = lower(trim(p_correo));
  if v_usuario is null then raise exception 'No existe una cuenta con ese correo. Pídele que la cree en la pantalla de ingreso.'; end if;

  insert into public.miembros (org_id, usuario_id, rol, empresas_permitidas) values (v_org, v_usuario, p_rol, p_empresas)
  on conflict (org_id, usuario_id) do update set rol = excluded.rol, empresas_permitidas = excluded.empresas_permitidas, activo = true
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.agregar_miembro(text, public.rol_usuario, uuid[]) to authenticated;

-- La lista de usuarios muestra también sus empresas
drop function if exists public.miembros_con_correo();
create function public.miembros_con_correo()
returns table (id uuid, usuario_id uuid, correo text, nombre text, rol public.rol_usuario, activo boolean, acceso_clinico boolean, empresas uuid[])
language sql stable security definer set search_path = public, auth as $$
  select m.id, m.usuario_id, u.email::text, p.nombre_completo, m.rol, m.activo, m.acceso_clinico, m.empresas_permitidas
  from public.miembros m
  join auth.users u on u.id = m.usuario_id
  left join public.perfiles p on p.id = m.usuario_id
  where m.org_id in (select public.mis_orgs())
  order by p.nombre_completo
$$;
grant execute on function public.miembros_con_correo() to authenticated;
