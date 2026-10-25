-- zamorApp Ocupacional · Horas hombre trabajadas e índices de accidentalidad (COVENIN 474:1997)
-- IFN = lesiones con tiempo perdido × 1.000.000 / HHT · IFB = lesiones totales × 1.000.000 / HHT
-- IS = (días perdidos + días cargados) × 1.000.000 / HHT · TIEO = casos de enfermedad ocupacional × 1.000.000 / HHT

create table public.horas_trabajadas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  mes date not null,                                       -- primer día del mes
  horas numeric(12, 1) not null check (horas >= 0),
  trabajadores int,
  metodo text not null default 'estimado' check (metodo in ('nomina', 'estimado')),
  unique (empresa_id, mes)
);

alter table public.horas_trabajadas enable row level security;
create policy hht_leer on public.horas_trabajadas for select using (public.puede_ver_empresa(org_id, empresa_id));
create policy hht_editar on public.horas_trabajadas for all
  using (public.mi_rol(org_id) in ('administrador', 'coordinador_sst', 'gerente_medico'))
  with check (public.mi_rol(org_id) in ('administrador', 'coordinador_sst', 'gerente_medico'));

create or replace function public.indices_accidentalidad(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with ev as (
  select * from public.eventos
  where (p_empresa is null or empresa_id = p_empresa)
    and fecha_hora >= p_desde and fecha_hora < p_hasta + 1
),
hht as (
  select coalesce(sum(horas), 0) as horas,
         count(*) as meses,
         bool_or(metodo = 'estimado') as hay_estimado
  from public.horas_trabajadas
  where (p_empresa is null or empresa_id = p_empresa)
    and mes between date_trunc('month', p_desde)::date and p_hasta
)
select jsonb_build_object(
  'hht', (select horas from hht),
  'meses_con_horas', (select meses from hht),
  'hay_estimado', (select coalesce(hay_estimado, false) from hht),
  'accidentes', (select count(*) from ev where tipo = 'accidente'),
  'con_tiempo_perdido', (select count(*) from ev where tipo = 'accidente' and con_tiempo_perdido),
  'incidentes', (select count(*) from ev where tipo = 'incidente'),
  'enfermedades', (select count(*) from ev where tipo = 'enfermedad'),
  'dias_perdidos', (select coalesce(sum(dias_perdidos), 0) from ev where tipo = 'accidente'),
  'dias_cargados', (select coalesce(sum(dias_cargados), 0) from ev where tipo = 'accidente'),
  'declarados_a_tiempo', (select count(*) from ev where tipo <> 'incidente' and fecha_declaracion is not null
     and fecha_declaracion <= coalesce(case when tipo = 'enfermedad' then fecha_diagnostico end, fecha_hora) + interval '24 hours'),
  'por_declarar', (select count(*) from ev where tipo <> 'incidente' and fecha_declaracion is null)
)
$$;

grant execute on function public.indices_accidentalidad(uuid, date, date) to authenticated;
