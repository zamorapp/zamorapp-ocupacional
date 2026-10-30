-- zamorApp Ocupacional · Unir cargos repetidos (30/10/2026)
-- Del SAME y de la escritura a mano quedaron cargos repetidos con otra forma («Administración de contrato»,
-- «ADMINISTRACION DE CONTRATO», «Adm. de contrato»…). Configuración › Unir cargos los junta: en cada empresa queda
-- UN cargo con el nombre elegido y los trabajadores pasan a él. Nada se borra: el cargo viejo queda inactivo como
-- alias (unido_a) y las consultas firmadas siguen apuntando a él, para que el documento legal no cambie.
-- Y para que no vuelva a pasar: un cargo nuevo con el mismo nombre (sin distinguir mayúsculas, acentos, signos ni
-- «de/del/la…») que otro activo de la misma empresa se rechaza en la nube.

alter table public.puestos add column if not exists unido_a uuid references public.puestos (id) on delete set null;

-- Clave para comparar nombres de cargo. La app usa la misma regla (src/lib/cargos.ts: claveCargo).
-- Las mayúsculas acentuadas se traducen antes de lower(): en una base con locale C, lower('Á') no cambia.
create or replace function public.clave_cargo(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  with n as (
    select btrim(regexp_replace(lower(translate(coalesce(p, ''),
      'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc')),
      '[^a-z0-9]+', ' ', 'g')) as base
  )
  -- Sin «de/del/la…» y en singular (palabras de 5 letras o más que terminan en s): «Operador de equipos» = «Operador equipo»
  select coalesce(nullif(btrim(regexp_replace(regexp_replace(regexp_replace(base,
           '\m(de|del|la|las|el|los|y|e|en|para|al)\M', ' ', 'g'), '\m([a-z]{4,})s\M', '\1', 'g'), '\s+', ' ', 'g')), ''), base)
    from n
$$;
grant execute on function public.clave_cargo(text) to anon, authenticated;

create index if not exists puestos_clave on public.puestos (empresa_id, public.clave_cargo(nombre)) where activo;

-- ─── Ningún cargo repetido nuevo (solo en la nube: la copia de la PC recibe lo que ya hay) ───
create or replace function public.cargo_sin_repetir()
returns trigger language plpgsql set search_path = public as $$
declare otro text;
begin
  if not new.activo or public.es_base_local() then return new; end if;
  -- Editar un cargo que ya estaba repetido (riesgos, tareas…) no se bloquea: solo un nombre nuevo o reactivarlo
  if tg_op = 'UPDATE' and old.activo and public.clave_cargo(new.nombre) = public.clave_cargo(old.nombre) then return new; end if;
  select p.nombre into otro from public.puestos p
   where p.empresa_id = new.empresa_id and p.activo and p.id <> new.id
     and public.clave_cargo(p.nombre) = public.clave_cargo(new.nombre)
   limit 1;
  if otro is not null then
    raise exception 'Ya existe el cargo «%» en esta empresa', otro using errcode = '23505', hint = 'Elige el que ya existe.';
  end if;
  return new;
end $$;
drop trigger if exists cargo_sin_repetir on public.puestos;
create trigger cargo_sin_repetir before insert or update of nombre, activo on public.puestos
  for each row execute function public.cargo_sin_repetir();

-- ─── Historial de cargos: unir cargos no es un cambio de cargo del trabajador ───
create or replace function public.historial_cargos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('zamorapp.uniendo_cargos', true), '') = 'si' then return new; end if;
  if old.puesto_id is not null and new.puesto_id is distinct from old.puesto_id then
    insert into public.cargos_historial (org_id, empresa_id, trabajador_id, puesto_id, cargo, desde, hasta)
    select old.org_id, old.empresa_id, old.id, old.puesto_id, p.nombre, old.fecha_ingreso_cargo,
           public.hoy_caracas()
      from public.puestos p where p.id = old.puesto_id;
    -- Cargo nuevo sin fecha propia: empieza hoy (día de Caracas)
    if new.fecha_ingreso_cargo is not distinct from old.fecha_ingreso_cargo then
      new.fecha_ingreso_cargo := public.hoy_caracas();
    end if;
  end if;
  return new;
end $$;

-- ─── Cargos activos de toda la organización con sus trabajadores (pantalla «Unir cargos») ───
create or replace function public.cargos_de_la_org()
returns table (id uuid, empresa_id uuid, empresa text, nombre text, trabajadores bigint)
language sql stable security invoker set search_path = public as $$
  select p.id, p.empresa_id, e.razon_social, p.nombre,
         (select count(*) from public.trabajadores t where t.puesto_id = p.id)
    from public.puestos p join public.empresas e on e.id = p.empresa_id
   where p.activo
   order by public.clave_cargo(p.nombre), e.razon_social
$$;
revoke execute on function public.cargos_de_la_org() from public, anon;
grant execute on function public.cargos_de_la_org() to authenticated;

-- ─── Unir: en cada empresa queda un solo cargo llamado p_nombre ───
-- Destino por empresa: el que tiene más trabajadores (empate: el de nombre igual, luego el evaluado).
-- Riesgos: se suman los de todos (más protector para el trabajador). Evaluación y textos: los del destino y, si
-- faltan, los del otro (quién firmó la evaluación no se copia: solo la firma quien la hace). Pasan al destino los trabajadores y las consultas sin firmar; las firmadas y el historial
-- de cargos conservan el nombre con que se hicieron.
create or replace function public.unir_cargos(p_nombre text, p_puestos uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_nombre text := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
  v_emp uuid;
  v_dest public.puestos;
  v_origenes uuid[];
  v_riesgos jsonb;
  o public.puestos;
  n_trab int := 0; n_cons int := 0; n_alias int := 0; n_emp int := 0; n int;
begin
  -- En la copia de la PC no: los alias y el traslado de trabajadores se hacen una sola vez, en la nube
  if public.es_base_local() then raise exception 'Unir cargos se hace con internet' using errcode = '0A000'; end if;
  if v_nombre = '' then raise exception 'Escribe el nombre del cargo' using errcode = '22023'; end if;
  if coalesce(array_length(p_puestos, 1), 0) = 0 then raise exception 'Elige los cargos a unir' using errcode = '22023'; end if;
  select min(org_id::text)::uuid into v_org from public.puestos where id = any (p_puestos);
  if v_org is null or exists (select 1 from public.puestos where id = any (p_puestos) and (org_id <> v_org or not activo))
     or (select count(*) from public.puestos where id = any (p_puestos)) <> (select count(distinct x) from unnest(p_puestos) x) then
    raise exception 'Algún cargo ya no existe o ya fue unido. Recarga la página.' using errcode = '22023';
  end if;
  if public.mi_rol(v_org) is distinct from 'administrador' then
    raise exception 'Solo el administrador une cargos' using errcode = '42501';
  end if;

  perform set_config('zamorapp.uniendo_cargos', 'si', true);

  for v_emp in select distinct empresa_id from public.puestos where id = any (p_puestos) loop
    n_emp := n_emp + 1;
    select p.* into v_dest from public.puestos p
     where p.id = any (p_puestos) and p.empresa_id = v_emp
     order by (select count(*) from public.trabajadores t where t.puesto_id = p.id) desc,
              (p.nombre = v_nombre) desc, (p.evaluado_en is not null) desc, p.id
     limit 1;
    select coalesce(array_agg(id), '{}') into v_origenes from public.puestos
     where id = any (p_puestos) and empresa_id = v_emp and id <> v_dest.id;

    select coalesce(jsonb_object_agg(k, arr), '{}'::jsonb) into v_riesgos from (
      select e.k, jsonb_agg(distinct v.a) as arr
        from public.puestos p, jsonb_each(coalesce(p.riesgos, '{}'::jsonb)) e(k, lista),
             jsonb_array_elements(case jsonb_typeof(e.lista) when 'array' then e.lista else '[]'::jsonb end) v(a)
       where p.id = any (v_origenes || v_dest.id)
       group by e.k) r;

    for o in select * from public.puestos where id = any (v_origenes) order by id loop
      update public.puestos set
        evaluacion = coalesce(o.evaluacion, '{}'::jsonb) || coalesce(evaluacion, '{}'::jsonb),
        codigo = coalesce(codigo, o.codigo), descripcion = coalesce(descripcion, o.descripcion),
        tareas = coalesce(tareas, o.tareas), herramientas = coalesce(herramientas, o.herramientas),
        turno = coalesce(turno, o.turno), epp = coalesce(epp, o.epp),
        recomendaciones = coalesce(recomendaciones, o.recomendaciones),
        dependencia_id = coalesce(dependencia_id, o.dependencia_id)
       where id = v_dest.id;
    end loop;

    update public.trabajadores set puesto_id = v_dest.id where puesto_id = any (v_origenes);
    get diagnostics n = row_count; n_trab := n_trab + n;
    update clinico.consultas set puesto_id = v_dest.id where puesto_id = any (v_origenes) and estado <> 'firmada';
    get diagnostics n = row_count; n_cons := n_cons + n;
    -- Alias: inactivos con su nombre de siempre, apuntando al que queda (y los alias de los alias también)
    update public.puestos set unido_a = v_dest.id where unido_a = any (v_origenes);
    update public.puestos set activo = false, unido_a = v_dest.id where id = any (v_origenes);
    get diagnostics n = row_count; n_alias := n_alias + n;
    update public.puestos set nombre = v_nombre, riesgos = v_riesgos where id = v_dest.id;

    insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
    values (v_org, 'public.puestos', v_dest.id, 'UNIR CARGOS',
            jsonb_build_object('nombre', v_dest.nombre, 'unidos', (select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre)) from public.puestos where id = any (v_origenes))),
            jsonb_build_object('nombre', v_nombre));
  end loop;

  perform set_config('zamorapp.uniendo_cargos', '', true);
  return jsonb_build_object('empresas', n_emp, 'trabajadores', n_trab, 'consultas', n_cons, 'alias', n_alias);
end $$;
revoke execute on function public.unir_cargos(text, uuid[]) from public, anon;
grant execute on function public.unir_cargos(text, uuid[]) to authenticated;

-- ─── Quitar un cargo que no es cargo («16/08/2023», «Na»): los trabajadores quedan sin cargo ───
-- Se completa en la próxima consulta («Generales» lo pide en amarillo). El cargo queda inactivo con su nombre; las
-- consultas firmadas lo conservan. No es un cambio de cargo: no va al historial.
create or replace function public.quitar_cargos(p_puestos uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  n_trab int; n_cons int; n_cargos int;
begin
  if public.es_base_local() then raise exception 'Quitar cargos se hace con internet' using errcode = '0A000'; end if;
  if coalesce(array_length(p_puestos, 1), 0) = 0 then raise exception 'Elige los cargos' using errcode = '22023'; end if;
  select min(org_id::text)::uuid into v_org from public.puestos where id = any (p_puestos);
  if v_org is null or exists (select 1 from public.puestos where id = any (p_puestos) and (org_id <> v_org or not activo)) then
    raise exception 'Algún cargo ya no existe o ya fue unido. Recarga la página.' using errcode = '22023';
  end if;
  if public.mi_rol(v_org) is distinct from 'administrador' then
    raise exception 'Solo el administrador quita cargos' using errcode = '42501';
  end if;
  perform set_config('zamorapp.uniendo_cargos', 'si', true);
  update public.trabajadores set puesto_id = null where puesto_id = any (p_puestos);
  get diagnostics n_trab = row_count;
  update clinico.consultas set puesto_id = null where puesto_id = any (p_puestos) and estado <> 'firmada';
  get diagnostics n_cons = row_count;
  update public.puestos set activo = false where id = any (p_puestos);
  get diagnostics n_cargos = row_count;
  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  select v_org, 'public.puestos', id, 'QUITAR CARGO', jsonb_build_object('nombre', nombre), null
    from public.puestos where id = any (p_puestos);
  perform set_config('zamorapp.uniendo_cargos', '', true);
  return jsonb_build_object('cargos', n_cargos, 'trabajadores', n_trab, 'consultas', n_cons);
end $$;
revoke execute on function public.quitar_cargos(uuid[]) from public, anon;
grant execute on function public.quitar_cargos(uuid[]) to authenticated;

select public.vistas_al_dia();
