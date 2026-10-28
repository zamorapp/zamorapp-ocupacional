-- zamorApp Ocupacional · «Hoy» siempre es la fecha de Caracas
-- Supabase corre en UTC: current_date daba la fecha de MAÑANA entre las 20:00 y las 24:00 de Caracas
-- (consultas, constancias, notas de cobro y notificaciones de riesgo nacían con la fecha adelantada).
-- Regla: ninguna fecha de negocio usa current_date, now()::date ni timestamptz::date; todas usan
-- public.fecha_caracas() / public.hoy_caracas(). La prueba 107 falla si vuelve a aparecer uno.
-- No se cambia la zona horaria de la base (alter database … set timezone): cambiaría el formato de
-- todas las horas que leen la web y la réplica del escritorio, y no protege a la réplica local.
-- Datos ya grabados: NO se tocan aquí (ver al final la consulta para ubicarlos).

create or replace function public.fecha_caracas(p_momento timestamptz default now())
returns date language sql stable parallel safe set search_path = '' as $$
  select (p_momento at time zone 'America/Caracas')::date
$$;

create or replace function public.hoy_caracas()
returns date language sql stable parallel safe set search_path = '' as $$
  select (now() at time zone 'America/Caracas')::date
$$;

grant execute on function public.fecha_caracas(timestamptz), public.hoy_caracas() to anon, authenticated, service_role;

-- ─── 1. Fechas por defecto ───────────────────────────────────
alter table clinico.consultas alter column fecha set default public.hoy_caracas();
alter table public.cobros alter column fecha set default public.hoy_caracas();
alter table public.notificaciones_riesgo alter column entregada_en set default public.hoy_caracas();

-- ─── 2. Depurar nómina: fecha de egreso y fecha de alta en Caracas ───
create or replace function public.depurar_nomina(p_empresa uuid, p_desde date, p_aplicar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_org uuid;
begin
  select org_id into v_org from public.miembros where usuario_id = auth.uid() and activo order by creado_en limit 1;
  if v_org is null or not (public.es_admin(v_org) or public.es_clinico(v_org)) then
    raise exception 'Sin permiso para depurar la nómina';
  end if;
  if p_empresa is not null and not public.puede_ver_empresa(v_org, p_empresa) then
    raise exception 'Sin permiso sobre esa empresa';
  end if;

  create temp table _salen on commit drop as
    select t.id from public.trabajadores t
    where t.org_id = v_org
      and (p_empresa is null or t.empresa_id = p_empresa)
      and public.puede_ver_empresa(v_org, t.empresa_id)
      and t.estado in ('activo', 'reposo', 'aspirante')
      and (public.fecha_caracas(t.creado_en) < p_desde or t.origen is not null)
      and not exists (select 1 from clinico.consultas c where c.trabajador_id = t.id and c.fecha >= p_desde);

  if p_aplicar then
    update public.trabajadores t set estado = 'egresado', fecha_egreso = coalesce(t.fecha_egreso, public.hoy_caracas())
    where t.id in (select id from _salen);
  end if;
  select count(*) into n from _salen;
  drop table _salen;
  return n;
end $$;

-- ─── 3. Recordatorio de resultados: días contados en Caracas ───
create or replace function public.recordar_resultados()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select c.id, c.org_id, c.empresa_id, c.fecha, public.paraclinicos_pendientes(c.paraclinicos) as faltan,
           t.nombres || ' ' || t.apellidos as nombre
    from clinico.consultas c
    join public.miembros m on m.org_id = c.org_id and m.usuario_id = v_uid and m.activo
      and m.rol in ('administrador', 'gerente_medico', 'medico')
    join public.organizaciones o on o.id = c.org_id
    join public.trabajadores t on t.id = c.trabajador_id
    left join public.recordatorios_resultados x on x.consulta_id = c.id and x.usuario_id = v_uid
    cross join lateral (select case when o.ajustes ->> 'recordatorio_resultados_dias' ~ '^[0-9]{1,3}$' then (o.ajustes ->> 'recordatorio_resultados_dias')::int else 3 end as dias) a
    where c.medico_id = v_uid
      and c.origen is null
      and c.estado in ('borrador', 'cerrada')
      and a.dias > 0
      and c.fecha <= v_hoy - a.dias
      and c.fecha >= v_hoy - 60
      and public.paraclinicos_pendientes(c.paraclinicos) > 0
      and not coalesce(x.ignorado, false)
      and (x.ultimo_aviso is null or x.ultimo_aviso <= now() - make_interval(days => a.dias))
    order by c.fecha
    limit 20
  loop
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    values (r.org_id, v_uid, r.empresa_id, 'Resultados por recibir',
      r.nombre || ' · ' || case when r.faltan = 1 then 'falta 1 resultado' else 'faltan ' || r.faltan || ' resultados' end
        || ' (consulta del ' || to_char(r.fecha, 'DD/MM/YYYY') || ')',
      '/atencion/' || r.id || '?paso=paraclinicos');
    insert into public.recordatorios_resultados (consulta_id, usuario_id, org_id, ultimo_aviso)
    values (r.id, v_uid, r.org_id, now())
    on conflict (consulta_id, usuario_id) do update set ultimo_aviso = excluded.ultimo_aviso;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- ─── 4. reporte_listado: vigencia de limitaciones, edad del padrón y evento cercano ───
-- La función es muy larga (y la regla de Reportes es no recrearla a mano): se reescriben solo
-- los textos exactos y se aborta si alguno no aparece las veces esperadas.
do $$
declare
  v_def text := pg_get_functiondef('public.reporte_listado(text, uuid, date, date, jsonb)'::regprocedure);
  v_par text[];
  v_n int;
begin
  foreach v_par slice 1 in array array[
    ['a.vigente_hasta >= current_date', 'a.vigente_hasta >= public.hoy_caracas()', '1'],
    ['age(current_date, t.fecha_nacimiento)', 'age(public.hoy_caracas(), t.fecha_nacimiento)', '1'],
    ['ev.fecha_hora::date', 'public.fecha_caracas(ev.fecha_hora)', '2']
  ] loop
    v_n := (length(v_def) - length(replace(v_def, v_par[1], ''))) / length(v_par[1]);
    if v_n <> v_par[3]::int then
      raise exception 'reporte_listado: «%» aparece % veces (se esperaban %)', v_par[1], v_n, v_par[3];
    end if;
    v_def := replace(v_def, v_par[1], v_par[2]);
  end loop;
  execute v_def;
end $$;

-- ─── Datos ya grabados (solo lectura; corregir únicamente con el sí de Cesar) ───
-- Consultas creadas en la app (origen null) cuya fecha quedó un día por delante de la hora de
-- Caracas en que se crearon. La fecha no se edita en pantalla, así que esa diferencia solo pudo
-- venir del default viejo:
--   select c.id, c.fecha, c.estado, c.creado_en
--   from clinico.consultas c
--   where c.origen is null and c.fecha = public.fecha_caracas(c.creado_en) + 1
--     and c.fecha = (c.creado_en at time zone 'UTC')::date;
-- Lo mismo vale para cobros.fecha y notificaciones_riesgo.entregada_en (comparando con creado_en).
