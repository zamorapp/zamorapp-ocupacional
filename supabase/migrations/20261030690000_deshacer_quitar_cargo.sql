-- zamorApp Ocupacional · Deshacer «Quitar cargo» (30/10/2026)
-- ERROR del 30-oct: el buscador de «Unir o quitar a mano» encontraba «na» dentro de otros nombres y se quitaron
-- cargos que no debían. La bitácora guardaba los trabajadores de cada cargo, pero no había botón para volver atrás.
-- restaurar_cargo_quitado devuelve el cargo a sus trabajadores (los que siguen sin cargo) y a sus consultas abiertas.
-- Si en la empresa ya hay otro cargo activo con el mismo nombre, vuelven a ese; si no, el cargo se reactiva.
create or replace function public.restaurar_cargo_quitado(p_puesto uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_p public.puestos;
  b public.bitacora;
  v_dest uuid;
  n_t int; n_c int;
  lista jsonb;
begin
  if public.es_base_local() then raise exception 'Deshacer se hace con internet' using errcode = '0A000'; end if;
  select * into v_p from public.puestos where id = p_puesto;
  if v_p.id is null then raise exception 'El cargo ya no existe' using errcode = '22023'; end if;
  if public.mi_rol(v_p.org_id) is distinct from 'administrador' then
    raise exception 'Solo el administrador deshace' using errcode = '42501';
  end if;
  select * into b from public.bitacora
   where accion = 'QUITAR CARGO' and registro_id = p_puesto and org_id = v_p.org_id
   order by en desc, id desc limit 1;
  if b.id is null then raise exception 'Ese cargo no se quitó' using errcode = '22023'; end if;

  select id into v_dest from public.puestos
   where empresa_id = v_p.empresa_id and activo and id <> v_p.id
     and public.clave_cargo(nombre) = public.clave_cargo(v_p.nombre)
   limit 1;
  if v_dest is null then
    update public.puestos set activo = true where id = v_p.id and not activo;
    v_dest := v_p.id;
  end if;

  lista := case jsonb_typeof(b.antes -> 'trabajadores') when 'array' then b.antes -> 'trabajadores' else '[]'::jsonb end;
  update public.trabajadores set puesto_id = v_dest
   where id::text in (select jsonb_array_elements_text(lista)) and puesto_id is null
     and org_id = v_p.org_id and empresa_id = v_p.empresa_id;
  get diagnostics n_t = row_count;
  lista := case jsonb_typeof(b.antes -> 'consultas') when 'array' then b.antes -> 'consultas' else '[]'::jsonb end;
  update clinico.consultas set puesto_id = v_dest
   where id::text in (select jsonb_array_elements_text(lista)) and puesto_id is null and estado <> 'firmada'
     and org_id = v_p.org_id and empresa_id = v_p.empresa_id;
  get diagnostics n_c = row_count;

  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  values (v_p.org_id, 'public.puestos', v_dest, 'RESTAURAR CARGO', b.antes,
          jsonb_build_object('trabajadores', n_t, 'consultas', n_c, 'desde_bitacora', b.id));
  return jsonb_build_object('cargo', (select nombre from public.puestos where id = v_dest), 'trabajadores', n_t, 'consultas', n_c);
end $$;
revoke execute on function public.restaurar_cargo_quitado(uuid) from public, anon;
grant execute on function public.restaurar_cargo_quitado(uuid) to authenticated;

-- Cargos quitados que todavía se pueden deshacer (pantalla «Unir cargos»)
create or replace function public.cargos_quitados()
returns table (id uuid, nombre text, empresa text, trabajadores int, quitado_en timestamptz)
language sql stable security definer set search_path = public as $$
  select distinct on (p.id) p.id, p.nombre, e.razon_social,
         case jsonb_typeof(b.antes -> 'trabajadores') when 'array' then jsonb_array_length(b.antes -> 'trabajadores') else 0 end,
         b.en
    from public.bitacora b
    join public.puestos p on p.id = b.registro_id and not p.activo
    join public.empresas e on e.id = p.empresa_id
   where b.accion = 'QUITAR CARGO' and public.mi_rol(b.org_id) = 'administrador'
     and not exists (select 1 from public.bitacora r where r.accion = 'RESTAURAR CARGO' and r.en > b.en
                       and (r.despues ->> 'desde_bitacora')::bigint = b.id)
   order by p.id, b.en desc
$$;
revoke execute on function public.cargos_quitados() from public, anon;
grant execute on function public.cargos_quitados() to authenticated;
