-- zamorApp Ocupacional · Última aptitud por trabajador, ya resuelta en la base
-- Con miles de trabajadores (datos del Integral) la app no puede pedir la aptitud trabajador por trabajador.
create or replace view public.ultima_aptitud with (security_invoker = false) as
  select distinct on (a.trabajador_id) a.trabajador_id, a.org_id, c.empresa_id, c.fecha, a.clasificacion, a.vigente_hasta
  from clinico.aptitudes a
  join clinico.consultas c on c.id = a.consulta_id
  where public.puede_ver_empresa(a.org_id, c.empresa_id)
  order by a.trabajador_id, c.fecha desc, a.emitida_en desc;

grant select on public.ultima_aptitud to authenticated;
revoke all on public.ultima_aptitud from anon;

create index if not exists aptitudes_trabajador on clinico.aptitudes (trabajador_id);
create index if not exists consultas_trabajador_fecha on clinico.consultas (trabajador_id, fecha desc);
create index if not exists trabajadores_org_apellidos on public.trabajadores (org_id, apellidos);
