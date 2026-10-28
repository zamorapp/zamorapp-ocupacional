-- zamorApp Ocupacional · Corrige las fechas que nacieron un día adelantadas (aprobado por Cesar el 28/10/2026)
-- Hasta la migración 20261028100000, consultas.fecha, cobros.fecha y notificaciones_riesgo.entregada_en
-- tomaban current_date (UTC): lo creado entre las 20:00 y las 24:00 de Caracas quedó con la fecha de mañana.
-- Criterio (certeza): el registro se creó en la app (no viene del SAME/Integral) y su fecha es exactamente
-- la fecha UTC de su creado_en, un día después de la fecha de Caracas. Esa fecha no se edita en pantalla,
-- así que solo pudo ponerla el default viejo. La vigencia de la aptitud se corre igual cuando era
-- «fecha de la consulta + N meses» (la calculada por la app o por la base).
-- Cada cambio queda en public.correccion_fechas (antes/después) y en la bitácora; se puede revertir.

create table if not exists public.correccion_fechas (
  id bigserial primary key,
  tabla text not null,
  registro_id uuid not null,
  columna text not null,
  antes date not null,
  despues date not null,
  corregido_en timestamptz not null default now()
);
-- Sin políticas: es una constancia técnica, solo la lee el dueño de la base
alter table public.correccion_fechas enable row level security;
revoke all on public.correccion_fechas from anon, authenticated;
revoke all on sequence public.correccion_fechas_id_seq from anon, authenticated;

drop table if exists _consultas_adelantadas, _vigencias;
create temp table _consultas_adelantadas as
  select c.id, c.fecha as antes, c.fecha - 1 as despues
  from clinico.consultas c
  where c.origen is null
    and c.fecha = public.fecha_caracas(c.creado_en) + 1
    and c.fecha = (c.creado_en at time zone 'UTC')::date;

-- Vigencia de la aptitud: solo si era exactamente «fecha vieja + N meses» (N de 1 a 60)
create temp table _vigencias as
  select a.id, a.vigente_hasta as antes, (x.despues + make_interval(months => k.n))::date as despues
  from clinico.aptitudes a
  join _consultas_adelantadas x on x.id = a.consulta_id
  cross join lateral (
    select min(g) as n from generate_series(1, 60) g where (x.antes + make_interval(months => g))::date = a.vigente_hasta
  ) k
  where k.n is not null and (x.despues + make_interval(months => k.n))::date <> a.vigente_hasta;

insert into public.correccion_fechas (tabla, registro_id, columna, antes, despues)
select 'clinico.consultas', id, 'fecha', antes, despues from _consultas_adelantadas
union all
select 'clinico.aptitudes', id, 'vigente_hasta', antes, despues from _vigencias;

update clinico.aptitudes a set vigente_hasta = v.despues from _vigencias v where v.id = a.id;
update clinico.consultas c set fecha = x.despues from _consultas_adelantadas x where x.id = c.id;
drop table _consultas_adelantadas, _vigencias;

-- Notas de cobro creadas en la app
with x as (
  update public.cobros c set fecha = c.fecha - 1
  where c.fecha = public.fecha_caracas(c.creado_en) + 1
    and c.fecha = (c.creado_en at time zone 'UTC')::date
  returning c.id, c.fecha + 1 as antes, c.fecha as despues
)
insert into public.correccion_fechas (tabla, registro_id, columna, antes, despues)
select 'public.cobros', id, 'fecha', antes, despues from x;

-- Notificaciones de riesgo: también las que ya tienen el acuse firmado (Cesar: «corregir todas»).
-- Su validación impide cambiar la fecha de entrega de una firmada; se apaga solo ese disparador
-- durante esta transacción (bitácora y sincronía siguen activas).
alter table public.notificaciones_riesgo disable trigger validar_notificacion_riesgo;
with x as (
  update public.notificaciones_riesgo n set entregada_en = n.entregada_en - 1
  where n.entregada_en = public.fecha_caracas(n.creado_en) + 1
    and n.entregada_en = (n.creado_en at time zone 'UTC')::date
  returning n.id, n.entregada_en + 1 as antes, n.entregada_en as despues
)
insert into public.correccion_fechas (tabla, registro_id, columna, antes, despues)
select 'public.notificaciones_riesgo', id, 'entregada_en', antes, despues from x;
alter table public.notificaciones_riesgo enable trigger validar_notificacion_riesgo;

do $$
declare r record;
begin
  for r in select tabla, columna, count(*) n from public.correccion_fechas group by 1, 2 order by 1 loop
    raise notice 'Fechas corregidas: % · % → %', r.tabla, r.columna, r.n;
  end loop;
end $$;
