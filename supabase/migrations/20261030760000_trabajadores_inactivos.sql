-- zamorApp · Trabajadores inactivos sin egreso (Cesar, 31-oct): «tengo muchos trabajadores que me trasladaron del SAME
-- que ya no están en la empresa y nunca se les hizo el egreso. Quiero inactivarlos (no es un egreso) para que no salgan
-- en las estadísticas ni en el conteo de la empresa, sin borrar sus datos; si vuelven (misma u otra empresa) los
-- registro con esos datos y empieza un registro nuevo desde ese momento».
-- Y (11:25): «el reingreso cuenta a partir de ese momento, aunque sea en la misma empresa: su puntaje como activo
-- comienza con la nueva evaluación».
--
--   trabajadores.fecha_inactivo / motivo_inactivo   cuándo y por qué salió de la nómina sin egreso (estado 'inactivo',
--                                                    que existe desde el esquema inicial)
--   trabajadores.periodo_desde                       inicio del período vigente: la aptitud, el próximo examen y las
--                                                    alertas solo miran consultas desde esa fecha (null = desde siempre)
--   trabajador_periodos                              historial de empresas: cada salida (inactivo o egreso) deja su
--                                                    período cerrado (empresa, cargo, desde, hasta, motivo)
--   ultima_aptitud                                   solo consultas del período vigente (reingreso = «Sin evaluar»)
--   reporte_vigilancia / vigilancia_series          un inactivo cuenta en la población solo hasta su fecha de salida
--   recordar_alertas                                 sin alertas de inactivos, egresados ni de un período anterior
--   candidatos_inactivar / inactivar_trabajadores / deshacer_inactivar   depuración en grupo con vista previa y Deshacer
-- NADA se borra: las consultas viejas siguen en la historia y en los reportes de su fecha.

alter table public.trabajadores add column if not exists fecha_inactivo date;
alter table public.trabajadores add column if not exists motivo_inactivo text check (length(motivo_inactivo) <= 200);
alter table public.trabajadores add column if not exists periodo_desde date;
-- trabajadores tiene permisos por columna (20261027210000): toda columna nueva necesita su grant de lectura
grant select (fecha_inactivo, motivo_inactivo, periodo_desde) on public.trabajadores to authenticated;

-- ─── Historial de empresas (como cargos_historial: dato laboral, lo escribe solo el disparador) ───
create table if not exists public.trabajador_periodos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete set null,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  cargo text,
  desde date,
  hasta date not null,
  cierre text not null check (cierre in ('inactivo', 'egresado', 'traslado')),
  motivo text,
  estado_anterior text,
  registrado_por uuid default auth.uid(),
  creado_en timestamptz not null default public.ahora()
);
create index if not exists trabajador_periodos_trabajador on public.trabajador_periodos (trabajador_id, creado_en desc);
alter table public.trabajador_periodos enable row level security;
drop policy if exists trabajador_periodos_leer on public.trabajador_periodos;
create policy trabajador_periodos_leer on public.trabajador_periodos for select
  using ((org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
          or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]))
         and (not org_id = any ((select public.orgs_con('{trabajador}'))::uuid[]) or public.es_mi_ficha(trabajador_id)));
revoke all on public.trabajador_periodos from anon, authenticated;
grant select on public.trabajador_periodos to authenticated;

create or replace function public.periodos_trabajador()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fuera constant text[] := array['inactivo', 'egresado'];
  v_sale boolean := new.estado::text = any (v_fuera) and not (old.estado::text = any (v_fuera));
  v_vuelve boolean := old.estado::text = any (v_fuera) and not (new.estado::text = any (v_fuera));
  -- periodo_desde hacia adelante = período nuevo (reingreso o traslado); hacia atrás = «Deshacer» de ese paso
  v_nuevo boolean := new.periodo_desde is not null and (old.periodo_desde is null or new.periodo_desde > old.periodo_desde);
  v_atras boolean := old.periodo_desde is not null and (new.periodo_desde is null or new.periodo_desde < old.periodo_desde);
begin
  -- El inicio del período cambia la aptitud y los vencimientos: RR. HH. (portal de la empresa) no lo toca
  if new.periodo_desde is distinct from old.periodo_desde and auth.uid() is not null
     and public.es_empresa(old.org_id) and not (public.es_admin(old.org_id) or public.es_clinico(old.org_id)) then
    raise exception 'RR. HH. no puede reingresar a un trabajador' using errcode = '42501';
  end if;
  -- Volver de inactivo o egresado (reingreso o Deshacer) también es del servicio de salud: RR. HH. no lo reactiva
  -- (Analizar #213: volvería con la aptitud y los vencimientos viejos y borraría su cierre del historial)
  if v_vuelve and auth.uid() is not null
     and public.es_empresa(old.org_id) and not (public.es_admin(old.org_id) or public.es_clinico(old.org_id)) then
    raise exception 'El reingreso lo hace el servicio de salud' using errcode = '42501';
  end if;
  if v_atras then
    -- Deshacer un reingreso o traslado: el cierre anterior sigue en el historial; solo se quita el del traslado
    if not (new.estado::text = any (v_fuera)) then
      delete from public.trabajador_periodos
       where id = (select x.id from public.trabajador_periodos x where x.trabajador_id = old.id and x.cierre = 'traslado'
                   order by x.creado_en desc limit 1);
    end if;
  elsif v_sale then
    -- Sale de la nómina: queda su período cerrado en el historial
    if new.estado = 'inactivo' then new.fecha_inactivo := coalesce(new.fecha_inactivo, public.hoy_caracas()); end if;
    insert into public.trabajador_periodos (org_id, empresa_id, trabajador_id, cargo, desde, hasta, cierre, motivo, estado_anterior)
    values (old.org_id, old.empresa_id, old.id, (select p.nombre from public.puestos p where p.id = old.puesto_id),
            coalesce(old.periodo_desde, old.fecha_ingreso),
            case when new.estado = 'inactivo' then new.fecha_inactivo else coalesce(new.fecha_egreso, public.hoy_caracas()) end,
            new.estado::text, case when new.estado = 'inactivo' then new.motivo_inactivo end, old.estado::text);
  elsif v_vuelve then
    -- Vuelve: con período nuevo es un reingreso (empieza de cero); sin él es «Deshacer» del inactivo y se borra el
    -- cierre, solo si es el de esa misma salida y se anotó hoy (un Deshacer de verdad)
    if not v_nuevo then
      delete from public.trabajador_periodos
       where id = (select x.id from public.trabajador_periodos x
                    where x.trabajador_id = old.id and x.cierre = old.estado::text
                      and x.hasta = coalesce(case when old.estado = 'inactivo' then old.fecha_inactivo else old.fecha_egreso end, x.hasta)
                      and public.fecha_caracas(x.creado_en) = public.hoy_caracas()
                    order by x.creado_en desc limit 1);
    end if;
    new.fecha_inactivo := null;
    new.motivo_inactivo := null;
  elsif v_nuevo and not (old.estado::text = any (v_fuera)) then
    -- Pasa directo a un período nuevo (p. ej. de una empresa inactiva a otra): se cierra el anterior como traslado
    insert into public.trabajador_periodos (org_id, empresa_id, trabajador_id, cargo, desde, hasta, cierre, estado_anterior)
    values (old.org_id, old.empresa_id, old.id, (select p.nombre from public.puestos p where p.id = old.puesto_id),
            coalesce(old.periodo_desde, old.fecha_ingreso), new.periodo_desde, 'traslado', old.estado::text);
  end if;
  return new;
end $$;
revoke execute on function public.periodos_trabajador() from public, anon, authenticated;
drop trigger if exists periodos_trabajador on public.trabajadores;
create trigger periodos_trabajador before update of estado, periodo_desde on public.trabajadores
  for each row execute function public.periodos_trabajador();

-- ─── Aptitud vigente: solo consultas del período vigente (misma vista de 20261027203000 + el filtro) ───
create or replace view public.ultima_aptitud with (security_invoker = false) as
  select distinct on (a.trabajador_id) a.trabajador_id, a.org_id, c.empresa_id, c.fecha, a.clasificacion, a.vigente_hasta,
         coalesce(a.vigente_hasta, (c.fecha + make_interval(months => coalesce(e.periodicidad_meses, 12)))::date) as proximo_examen
  from clinico.aptitudes a
  join clinico.consultas c on c.id = a.consulta_id
  join public.trabajadores t on t.id = a.trabajador_id
  left join public.empresas e on e.id = c.empresa_id
  where c.estado in ('cerrada', 'firmada')
    and (t.periodo_desde is null or c.fecha >= t.periodo_desde)
    and public.puede_ver_empresa(a.org_id, c.empresa_id)
  order by a.trabajador_id, c.fecha desc, a.emitida_en desc;

-- ─── Vigilancia y campana: se reescriben sobre su definición vigente (sin copiar 300 líneas) y se verifica el cambio ───
do $$
declare
  v_def text;
  v_nueva text;
  v_fn regprocedure;
begin
  foreach v_fn in array array['public.reporte_vigilancia(uuid, date, date)'::regprocedure, 'public.vigilancia_series(uuid, date, date)'::regprocedure] loop
    v_def := pg_get_functiondef(v_fn);
    if v_def like '%estado = ''inactivo'' and coalesce(fecha_inactivo%' then continue; end if;
    v_nueva := replace(v_def, 'or (estado = ''egresado'' and coalesce(fecha_egreso, p_hasta) >= p_desde)',
      'or (estado = ''egresado'' and coalesce(fecha_egreso, p_hasta) >= p_desde)
     or (estado = ''inactivo'' and coalesce(fecha_inactivo, p_hasta) >= p_desde)');
    -- La población lee t.fecha_egreso de la lista de columnas: se agrega t.fecha_inactivo al lado
    v_nueva := replace(v_nueva, 't.estado, t.fecha_egreso', 't.estado, t.fecha_egreso, t.fecha_inactivo');
    if v_nueva = v_def or v_nueva not like '%t.fecha_inactivo%' then
      raise exception 'No se encontró la población de % para agregar a los inactivos', v_fn;
    end if;
    execute v_nueva;
  end loop;

  v_def := pg_get_functiondef('public.recordar_alertas()'::regprocedure);
  if v_def not like '%t.periodo_desde%' then
    v_nueva := replace(v_def, 'and coalesce(e.activa, true)',
      'and coalesce(e.activa, true)
       and t.estado not in (''inactivo'', ''egresado'')
       and (t.periodo_desde is null or coalesce(c.fecha, public.fecha_caracas(a.creada_en)) >= t.periodo_desde)');
    if v_nueva = v_def then raise exception 'No se encontró el filtro de recordar_alertas'; end if;
    execute v_nueva;
  end if;
end $$;

-- ─── Depurar en grupo ───
-- Candidatos: activos, en reposo o aspirantes sin consulta desde p_desde (los del SAME aunque se crearan después).
-- Solo datos laborales y la fecha de la última consulta (nada clínico).
create or replace function public.candidatos_inactivar(p_empresa uuid, p_desde date)
returns table (id uuid, cedula text, nombres text, apellidos text, empresa text, cargo text, fecha_ingreso date, ultima_consulta date)
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  select m.org_id into v_org from public.miembros m where m.usuario_id = auth.uid() and m.activo order by m.creado_en limit 1;
  if v_org is null or not (public.es_admin(v_org) or public.es_clinico(v_org)) then
    raise exception 'Sin permiso para depurar trabajadores' using errcode = '42501';
  end if;
  if p_empresa is not null and not public.puede_ver_empresa(v_org, p_empresa) then
    raise exception 'Sin permiso sobre esa empresa' using errcode = '42501';
  end if;
  return query
    select t.id, t.cedula, t.nombres, t.apellidos, e.razon_social, p.nombre, t.fecha_ingreso,
           (select max(c.fecha) from clinico.consultas c where c.trabajador_id = t.id)
      from public.trabajadores t
      join public.empresas e on e.id = t.empresa_id
      left join public.puestos p on p.id = t.puesto_id
     where t.org_id = v_org
       and (p_empresa is null or t.empresa_id = p_empresa)
       and public.puede_ver_empresa(v_org, t.empresa_id)
       and t.estado in ('activo', 'reposo', 'aspirante')
       and (public.fecha_caracas(t.creado_en) < p_desde or t.origen is not null)
       and not exists (select 1 from clinico.consultas c where c.trabajador_id = t.id and c.fecha >= p_desde)
     order by e.razon_social, t.apellidos, t.nombres;
end $$;
revoke execute on function public.candidatos_inactivar(uuid, date) from public, anon;
grant execute on function public.candidatos_inactivar(uuid, date) to authenticated;

-- Inactiva los elegidos (la RLS decide sobre cuáles puede escribir). Devuelve [{id, estado}] con el estado anterior
-- de cada uno para «Deshacer».
create or replace function public.inactivar_trabajadores(p_ids uuid[], p_fecha date, p_motivo text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid;
  v_hechos jsonb;
begin
  select m.org_id into v_org from public.miembros m where m.usuario_id = auth.uid() and m.activo order by m.creado_en limit 1;
  if v_org is null or not (public.es_admin(v_org) or public.es_clinico(v_org)) then
    raise exception 'Sin permiso para inactivar trabajadores' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > public.hoy_caracas() then raise exception 'La fecha no puede ser futura' using errcode = '22023'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 10000 then raise exception 'Demasiados trabajadores en un solo paso' using errcode = '22023'; end if;
  with antes as (
    select t.id, t.estado from public.trabajadores t
     where t.id = any (p_ids) and t.org_id = v_org and t.estado in ('activo', 'reposo', 'aspirante')
     for update
  ), hechos as (
    update public.trabajadores t set estado = 'inactivo', fecha_inactivo = p_fecha, motivo_inactivo = nullif(btrim(p_motivo), '')
      from antes where t.id = antes.id
    returning t.id, antes.estado
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'estado', estado)), '[]') into v_hechos from hechos;
  return v_hechos;
end $$;
revoke execute on function public.inactivar_trabajadores(uuid[], date, text) from public, anon;
grant execute on function public.inactivar_trabajadores(uuid[], date, text) to authenticated;

-- Deshacer: vuelve a su estado anterior solo a quien sigue inactivo con esa misma fecha (nadie lo tocó después)
create or replace function public.deshacer_inactivar(p_items jsonb, p_fecha date)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid;
  n integer;
begin
  select m.org_id into v_org from public.miembros m where m.usuario_id = auth.uid() and m.activo order by m.creado_en limit 1;
  if v_org is null or not (public.es_admin(v_org) or public.es_clinico(v_org)) then
    raise exception 'Sin permiso para deshacer' using errcode = '42501';
  end if;
  update public.trabajadores t set estado = x.estado::public.estado_trabajador
    from jsonb_to_recordset(p_items) as x(id uuid, estado text)
   where t.id = x.id and t.org_id = v_org and t.estado = 'inactivo' and t.fecha_inactivo = p_fecha
     and x.estado in ('activo', 'reposo', 'aspirante');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.deshacer_inactivar(jsonb, date) from public, anon;
grant execute on function public.deshacer_inactivar(jsonb, date) to authenticated;

select public.vistas_al_dia();
