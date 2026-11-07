-- Psicosocial: UN enlace para toda la oficina + perfiles anónimos por persona (Cesar, 06-nov-2026).
-- Antes: un código por trabajador (papelito o WhatsApp uno por uno). Ahora, además, un enlace único por evaluación que
-- se manda al grupo: cada teléfono que pulsa «Empezar» recibe un código NUEVO de un solo uso, creado en ese momento.
-- Nunca entrega un código ya generado (pudo imprimirse en un papelito o mandarse por WhatsApp: Analizar, 06-nov). El anonimato no cambia: el enlace no pide nombre ni cédula y la respuesta sigue
-- sin unirse al código.
--   · Tope: plantilla («trabajadores») − códigos ya generados − cuestionarios en papel; así nadie llena 50 veces.
--   · El enlace vive en su propia tabla (no en la evaluación) para que no pase por la bitácora que lee el auditor de
--     la empresa; lo lee solo el servicio. «Cambiar enlace» anula el anterior.
--   · Un código entregado por el enlace no vuelve a salir en papelitos ni en el WhatsApp uno por uno.
-- Perfiles: el médico ve, al CERRAR y con el mínimo de respuestas, el nivel de cada persona en los 6 apartados SIN
-- puesto, sin orden de llegada y sin hora (ordenados por gravedad). RR. HH. no los ve (solo el informe agregado).

alter table public.codigos_psicosociales add column if not exists entregado boolean not null default false;

create table if not exists public.enlaces_psicosociales (
  evaluacion_id uuid primary key references public.evaluaciones_psicosociales (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{32}$')
);
alter table public.enlaces_psicosociales enable row level security;
drop policy if exists enlaces_psicosociales_leer on public.enlaces_psicosociales;
-- Lo lee quien maneja la evaluación (el servicio; la empresa no ve evaluaciones abiertas ni esta tabla)
create policy enlaces_psicosociales_leer on public.enlaces_psicosociales for select using (
  exists (select 1 from public.evaluaciones_psicosociales e where e.id = evaluacion_id));
revoke all on public.enlaces_psicosociales from anon, authenticated;
grant select on public.enlaces_psicosociales to authenticated;

-- Crea (o cambia, con p_nuevo) el enlace de la oficina. Exige el acuerdo con el Comité, como los códigos.
create or replace function public.enlace_oficina_psicosocial(p_evaluacion uuid, p_nuevo boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare e public.evaluaciones_psicosociales; t text;
begin
  e := public.maneja_evaluacion_psicosocial(p_evaluacion);
  if e.id is null then raise exception 'No tienes permiso sobre esta evaluación.' using errcode = '42501'; end if;
  if e.estado <> 'abierta' then raise exception 'La evaluación está cerrada.' using errcode = '42501'; end if;
  if e.acuerdo_fecha is null then
    raise exception 'Primero anota la fecha del acuerdo con el Comité de Seguridad y Salud Laboral (condición de la licencia del método).' using errcode = '23514';
  end if;
  if e.trabajadores is null then
    raise exception 'Anota cuántos trabajadores van a responder: es el tope de respuestas del enlace.' using errcode = '23514';
  end if;
  select token into t from public.enlaces_psicosociales where evaluacion_id = e.id;
  if t is null or coalesce(p_nuevo, false) then
    t := encode(uuid_send(gen_random_uuid()), 'hex');  -- 128 bits al azar (sin pgcrypto)
    insert into public.enlaces_psicosociales (evaluacion_id, org_id, token) values (e.id, e.org_id, t)
      on conflict (evaluacion_id) do update set token = excluded.token;
  end if;
  return t;
end $$;
revoke execute on function public.enlace_oficina_psicosocial(uuid, boolean) from public, anon;
grant execute on function public.enlace_oficina_psicosocial(uuid, boolean) to authenticated;

-- Cupos que aún puede entregar el enlace: lo que falta para llegar a la plantilla, contando TODOS los códigos ya
-- generados (papelitos, WhatsApp uno por uno y los del enlace) y los cuestionarios en papel.
create or replace function public.cupos_enlace_psicosocial(e public.evaluaciones_psicosociales)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(e.trabajadores, 0) - (select count(*) from public.codigos_psicosociales k where k.evaluacion_id = e.id)::int
                     - (select count(*) from public.respuestas_psicosociales r where r.evaluacion_id = e.id and r.origen = 'papel')::int)
$$;
revoke execute on function public.cupos_enlace_psicosocial(public.evaluaciones_psicosociales) from public, anon, authenticated;

-- Lo que ve quien abre el enlace de la oficina (sin sesión). estado: vigente | agotado | cerrado; sin fila = no existe.
create or replace function public.ver_enlace_psicosocial(p_token text)
returns table (estado text, servicio text, empresa text)
language plpgsql stable security definer set search_path = public as $$
declare l public.enlaces_psicosociales; e public.evaluaciones_psicosociales;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return; end if;
  select * into l from public.enlaces_psicosociales where token = p_token;
  if l.token is null then return; end if;
  select * into e from public.evaluaciones_psicosociales where id = l.evaluacion_id;
  return query
    select case when e.estado <> 'abierta' then 'cerrado' when public.cupos_enlace_psicosocial(e) < 1 then 'agotado' else 'vigente' end,
           o.nombre,
           (select coalesce(m.nombre_comercial, m.razon_social) from public.empresas m where m.id = e.empresa_id)
      from public.organizaciones o where o.id = e.org_id;
end $$;
revoke execute on function public.ver_enlace_psicosocial(text) from public;
-- Pública a propósito: el enlace (128 bits) es la llave y solo entrega códigos hasta el tope; en la línea base del guardián
grant execute on function public.ver_enlace_psicosocial(text) to anon, authenticated;

-- Crea y entrega un código de un solo uso al teléfono que pulsa «Empezar». null = enlace no válido, cerrado o sin cupos.
create or replace function public.tomar_codigo_psicosocial(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare l public.enlaces_psicosociales; e public.evaluaciones_psicosociales; c text; b bytea;
        letras constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into l from public.enlaces_psicosociales where token = p_token;
  if l.token is null then return null; end if;
  -- Bloquea la evaluación: dos teléfonos a la vez no pasan el tope
  select * into e from public.evaluaciones_psicosociales where id = l.evaluacion_id for update;
  if e.estado <> 'abierta' or e.acuerdo_fecha is null then return null; end if;
  if public.cupos_enlace_psicosocial(e) < 1 then return null; end if;
  for intento in 1..10 loop
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..7 loop c := c || substr(letras, ((get_byte(b, i) * 256 + get_byte(b, i + 8)) % 31) + 1, 1); end loop;
    insert into public.codigos_psicosociales (evaluacion_id, org_id, codigo, entregado) values (e.id, e.org_id, c, true) on conflict do nothing;
    if found then return c; end if;
  end loop;
  return null;
end $$;
revoke execute on function public.tomar_codigo_psicosocial(text) from public;
-- Pública a propósito: ver arriba (línea base del guardián)
grant execute on function public.tomar_codigo_psicosocial(text) to anon, authenticated;

-- Perfiles anónimos: el nivel (0 verde, 1 amarillo, 2 rojo) de cada persona en los 6 apartados. Solo el servicio que
-- maneja la evaluación, solo cerrada y con el mínimo. Sin puesto, sin hora, sin código y ordenados por gravedad (no
-- por llegada), para que nadie se reconozca por el orden.
create or replace function public.perfiles_psicosociales(p_evaluacion uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.evaluaciones_psicosociales;
begin
  e := public.maneja_evaluacion_psicosocial(p_evaluacion);
  if e.id is null or e.estado <> 'cerrada' then return null; end if;
  if (select count(*) from public.respuestas_psicosociales where evaluacion_id = e.id) < e.minimo_grupo then return null; end if;
  return (
    select coalesce(jsonb_agg(p.niveles order by p.rojos desc, p.amarillos desc, p.niveles::text desc), '[]'::jsonb)
      from (
        select n.niveles,
               (select count(*) from jsonb_array_elements_text(n.niveles) x where x = '2') as rojos,
               (select count(*) from jsonb_array_elements_text(n.niveles) x where x = '1') as amarillos
          from (
            select (select jsonb_agg(public.nivel_istas21_corta(a, r.puntajes[a]) order by a) from generate_series(1, 6) a) as niveles
              from public.respuestas_psicosociales r where r.evaluacion_id = e.id
          ) n
      ) p);
end $$;
revoke execute on function public.perfiles_psicosociales(uuid) from public, anon;
grant execute on function public.perfiles_psicosociales(uuid) to authenticated;
