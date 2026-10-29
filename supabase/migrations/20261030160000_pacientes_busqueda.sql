-- Pacientes paginado en el servidor (auditoría C2). La pantalla mandaba los 4.200 trabajadores completos
-- (2,4 MB) en cada visita; ahora pide 50 y busca en la base con un índice trigram, sin acentos ni puntos:
-- «gonzalez», «v18456123» o «18456123» encuentran a «González, V-18.456.123».

-- Como en Supabase (donde ya es así): los usuarios pueden usar unaccent y pg_trgm del esquema extensions
grant usage on schema extensions to authenticated;

-- Texto de búsqueda de cada trabajador, mantenido por disparador (unaccent no es inmutable: no sirve como columna generada)
alter table public.trabajadores add column if not exists busqueda text;
-- La tabla tiene permisos por columna (#41): la nueva columna solo repite nombre, cédula e historia, ya visibles
grant select (busqueda) on public.trabajadores to authenticated;

create or replace function public.texto_busqueda_trabajador(p_nombres text, p_apellidos text, p_cedula text, p_historia integer)
returns text language sql immutable set search_path = public, extensions as $$
  select lower(extensions.unaccent(coalesce(p_nombres, '') || ' ' || coalesce(p_apellidos, '') || ' ' || coalesce(p_cedula, '')))
         || ' ' || regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g') || ' h' || coalesce(p_historia::text, '')
$$;

create or replace function public.trabajadores_busqueda_tg() returns trigger language plpgsql set search_path = public as $$
begin
  new.busqueda := public.texto_busqueda_trabajador(new.nombres, new.apellidos, new.cedula, new.numero_historia);
  return new;
end $$;

drop trigger if exists trabajadores_busqueda on public.trabajadores;
create trigger trabajadores_busqueda before insert or update of nombres, apellidos, cedula, numero_historia
  on public.trabajadores for each row execute function public.trabajadores_busqueda_tg();

update public.trabajadores set busqueda = public.texto_busqueda_trabajador(nombres, apellidos, cedula, numero_historia) where busqueda is null;

create index if not exists trabajadores_busqueda_trgm on public.trabajadores using gin (busqueda extensions.gin_trgm_ops);
-- Orden alfabético por organización con filtro de empresa (la página pide 50 por apellidos)
create index if not exists trabajadores_empresa_apellidos on public.trabajadores (empresa_id, apellidos, id);

-- Una página de pacientes con las mismas reglas de acceso del usuario (invoker; RLS decide qué filas ve).
-- Devuelve también el total que coincide, para «Mostrando 50 de 4.209». Lectura: stable (la puerta la
-- atiende desde la copia local sin internet).
create or replace function public.buscar_trabajadores(
  p_q text default null, p_empresa uuid default null, p_estado public.estado_trabajador default null,
  p_desde integer default 0, p_cuantos integer default 50)
returns table (
  id uuid, numero_historia integer, cedula text, nombres text, apellidos text, fecha_nacimiento date,
  estado public.estado_trabajador, empresa_id uuid, empresa text, cargo text,
  aptitud text, aptitud_fecha date, proximo_examen date, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with q as (
    select nullif(lower(extensions.unaccent(regexp_replace(trim(coalesce(p_q, '')), '[%_]', '', 'g'))), '') as texto,
           nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '') as digitos
  ),
  filas as (
    select t.id, t.numero_historia, t.cedula, t.nombres, t.apellidos, t.fecha_nacimiento, t.estado, t.empresa_id, t.apellidos as orden
    from public.trabajadores t, q
    where (p_empresa is null or t.empresa_id = p_empresa)
      and (p_estado is null or t.estado = p_estado)
      and (q.texto is null
           or t.busqueda like '%' || q.texto || '%'
           or (q.digitos is not null and length(q.digitos) >= 3 and t.busqueda like '% ' || q.digitos || '%'))
  ),
  pagina as (
    select f.*, count(*) over () as total from filas f
    order by f.orden, f.nombres, f.id
    limit greatest(1, least(coalesce(p_cuantos, 50), 200)) offset greatest(0, coalesce(p_desde, 0))
  )
  select p.id, p.numero_historia, p.cedula, p.nombres, p.apellidos, p.fecha_nacimiento, p.estado, p.empresa_id,
         e.razon_social as empresa, pu.nombre as cargo,
         u.clasificacion::text as aptitud, u.fecha as aptitud_fecha, u.proximo_examen, p.total
  from pagina p
  left join public.empresas e on e.id = p.empresa_id
  left join public.trabajadores t2 on t2.id = p.id
  left join public.puestos pu on pu.id = t2.puesto_id
  left join public.ultima_aptitud u on u.trabajador_id = p.id
  order by p.orden, p.nombres, p.id
$$;
revoke execute on function public.buscar_trabajadores(text, uuid, public.estado_trabajador, integer, integer) from public, anon;
grant execute on function public.buscar_trabajadores(text, uuid, public.estado_trabajador, integer, integer) to authenticated;
