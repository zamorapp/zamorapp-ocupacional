-- Tasas de la morbilidad de enfermería (pedido de Cesar, 12-nov): tasa de morbilidad (casos por cada 100 trabajadores),
-- prevalencia (% de trabajadores con el motivo) e incidencia (% con un caso nuevo: sin atención previa por ese motivo).
-- APAGADAS por defecto: Cesar está depurando la nómina y sin ella darían cifras falsas. Las activa el administrador o el
-- gerente médico en Enfermería › Tus decisiones (organizaciones.ajustes.enfermeria_tasas). Sin activar, la base ni las calcula.
-- Recrea reporte_enfermeria completa (copia de 20261030927000; único cambio: el bloque «morbilidad» y v_tasas).

create or replace function public.reporte_enfermeria(p_tipo text, p_empresa uuid, p_desde date, p_hasta date, p_opciones jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v jsonb;
  v_agrupar text := nullif(p_opciones ->> 'agrupar', '');
  v_tasas boolean := coalesce((p_opciones ->> 'tasas')::boolean, false);
begin
  case p_tipo
  when 'atenciones' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.empresa, x.paciente nulls last), '[]') into v from (
      select a.id, a.fecha, t.numero_historia as historia, t.cedula, nullif(btrim(coalesce(t.nombres, '') || ' ' || coalesce(t.apellidos, '')), '') as paciente,
             extract(year from age(a.fecha, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
             e.razon_social as empresa, dp.nombre as dependencia,
             a.tipo, coalesce(a.motivo, '') as motivo, a.cie10,
             a.signos ->> 'ta' as ta, a.signos ->> 'fc' as fc, a.signos ->> 'temp' as temp,
             a.signos ->> 'glicemia' as glicemia, a.signos ->> 'spo2' as spo2,
             a.tratamiento, a.referido_medico as referido, a.nota, p.nombre_completo as registrado
      from public.atenciones_enfermeria a
      join public.empresas e on e.id = a.empresa_id
      left join public.trabajadores t on t.id = a.trabajador_id
      left join public.dependencias dp on dp.id = t.dependencia_id
      left join public.perfiles p on p.id = a.registrado_por
      where a.fecha between p_desde and p_hasta and (p_empresa is null or a.empresa_id = p_empresa)
      limit 20000
    ) x;

  -- Control de tensión arterial: cada toma con su clasificación (ESC/ESH 2018), para imprimir por empresa o trabajador
  when 'tension' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.paciente, x.fecha), '[]') into v from (
      select y.*, case when y.sistolica >= 180 or y.diastolica >= 110 then 'Crisis (≥180/110)'
                       when y.sistolica >= 140 or y.diastolica >= 90 then 'Alta (≥140/90)'
                       when y.sistolica >= 130 or y.diastolica >= 85 then 'Normal alta'
                       else 'Normal' end as clasificacion
      from (
        select a.id, a.fecha, t.numero_historia as historia, t.cedula, t.nombres || ' ' || t.apellidos as paciente,
               extract(year from age(a.fecha, t.fecha_nacimiento))::int as edad, t.sexo::text as sexo,
               e.razon_social as empresa, dp.nombre as dependencia, a.signos ->> 'ta' as ta,
               split_part(a.signos ->> 'ta', '/', 1)::int as sistolica, split_part(a.signos ->> 'ta', '/', 2)::int as diastolica,
               a.signos ->> 'fc' as fc, a.tratamiento, a.referido_medico as referido, p.nombre_completo as registrado
        from public.atenciones_enfermeria a
        join public.trabajadores t on t.id = a.trabajador_id
        join public.empresas e on e.id = a.empresa_id
        left join public.dependencias dp on dp.id = t.dependencia_id
        left join public.perfiles p on p.id = a.registrado_por
        where a.signos ->> 'ta' ~ '^[0-9]{2,3}/[0-9]{2,3}$'
          and a.fecha between p_desde and p_hasta and (p_empresa is null or a.empresa_id = p_empresa)
        limit 20000
      ) y
    ) x;

  when 'morbilidad' then
    with ate as (
      select a.trabajador_id, a.fecha, coalesce(a.motivo, 'Sin motivo') as motivo, a.cie10, t.sexo, t.fecha_nacimiento,
             case v_agrupar when 'empresa' then e.razon_social when 'dependencia' then coalesce(dp.nombre, 'Sin dependencia') end as grupo
      from public.atenciones_enfermeria a
      join public.trabajadores t on t.id = a.trabajador_id
      join public.empresas e on e.id = a.empresa_id
      left join public.dependencias dp on dp.id = t.dependencia_id
      where a.tipo not in ('inspeccion', 'evolucion') and a.fecha between p_desde and p_hasta and (p_empresa is null or a.empresa_id = p_empresa)
    ),
    atendidos as (select grupo, count(distinct trabajador_id) as n from ate group by grupo),
    -- Tasas (solo si el médico las activó): misma población que el informe de vigilancia (trabajadores efectivos por
    -- defecto; activos, en reposo o egresados dentro del período). Sin la nómina depurada darían cifras falsas.
    poblacion as (
      select case v_agrupar when 'empresa' then e.razon_social when 'dependencia' then coalesce(dp.nombre, 'Sin dependencia') end as grupo, count(*) as n
      from public.trabajadores t
      join public.empresas e on e.id = t.empresa_id
      left join public.dependencias dp on dp.id = t.dependencia_id
      left join public.organizaciones o on o.id = t.org_id
      left join public.lista_items tp on tp.id = t.tipo_paciente_id
      where v_tasas and (p_empresa is null or t.empresa_id = p_empresa)
        and (coalesce(o.ajustes ->> 'vigilancia_poblacion', 'efectivos') = 'todos'
             or coalesce(tp.grupo = 'efectivo', t.tipo_paciente_id is null and t.estado <> 'aspirante'))
        and (t.estado in ('activo', 'reposo') or (t.estado = 'egresado' and coalesce(t.fecha_egreso, p_hasta) >= p_desde))
      group by 1
    ),
    -- Casos nuevos (incidencia): trabajadores sin una atención anterior por el mismo motivo antes del período
    previos as (
      select distinct a.trabajador_id, lower(coalesce(a.motivo, 'Sin motivo')) as motivo
      from public.atenciones_enfermeria a
      where v_tasas and a.trabajador_id is not null and a.tipo not in ('inspeccion', 'evolucion') and a.fecha < p_desde
        and (p_empresa is null or a.empresa_id = p_empresa)
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.grupo nulls first, x.casos desc, x.descripcion), '[]') into v from (
      select y.*,
             case when y.poblacion > 0 then round(y.casos * 100.0 / y.poblacion, 1) end as tasa_morbilidad,
             case when y.poblacion > 0 then round(y.pacientes * 100.0 / y.poblacion, 1) end as prevalencia,
             case when y.poblacion > 0 then round(y.nuevos * 100.0 / y.poblacion, 1) end as incidencia
      from (
        select a.grupo, min(a.cie10) as cie10, min(a.motivo) as descripcion,
               count(*) as casos, count(distinct a.trabajador_id) as pacientes,
               (select n from atendidos s where s.grupo is not distinct from a.grupo) as atendidos,
               count(distinct a.fecha) as dias,
               count(*) filter (where a.sexo = 'F') as femenino, count(*) filter (where a.sexo = 'M') as masculino,
               count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) < 18) as e_menor_18,
               count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) between 18 and 39) as e_18_39,
               count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) between 40 and 59) as e_40_59,
               count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) >= 60) as e_60_mas,
               case when v_tasas then (select n from poblacion p where p.grupo is not distinct from a.grupo) end as poblacion,
               case when v_tasas then count(distinct a.trabajador_id) filter (
                 where not exists (select 1 from previos pr where pr.trabajador_id = a.trabajador_id and pr.motivo = lower(a.motivo))) end as nuevos
        from ate a
        group by a.grupo, lower(a.motivo)
      ) y
    ) x;

  when 'unida' then
    with casos as (
      select 'medico' as quien, c.trabajador_id, c.fecha, d.cie10 as clave, d.cie10, d.descripcion
      from public.diagnosticos d
      join public.consultas c on c.id = d.consulta_id
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta and (p_empresa is null or c.empresa_id = p_empresa)
      union all
      select 'enfermeria', a.trabajador_id, a.fecha, coalesce(a.cie10, 'motivo:' || lower(coalesce(a.motivo, 'sin motivo'))), a.cie10, coalesce(a.motivo, 'Sin motivo')
      from public.atenciones_enfermeria a
      where a.trabajador_id is not null and a.tipo not in ('inspeccion', 'evolucion')
        and a.fecha between p_desde and p_hasta and (p_empresa is null or a.empresa_id = p_empresa)
    ),
    atendidos as (select count(distinct trabajador_id) as n from casos)
    select coalesce(jsonb_agg(to_jsonb(x) order by x.casos desc, x.descripcion), '[]') into v from (
      select min(cie10) as cie10,
             coalesce(min(descripcion) filter (where quien = 'medico'), min(descripcion)) as descripcion,
             count(*) filter (where quien = 'medico') as casos_medico,
             count(*) filter (where quien = 'enfermeria') as casos_enfermeria,
             count(*) as casos, count(distinct trabajador_id) as pacientes, (select n from atendidos) as atendidos,
             count(distinct fecha) filter (where quien = 'medico') as dias_medico,
             count(distinct fecha) filter (where quien = 'enfermeria') as dias_enfermeria
      from casos group by clave
    ) x;

  when 'dias' then
    with dias as (
      select c.fecha, c.empresa_id, 'medico' as quien, c.trabajador_id
      from public.consultas c
      where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta and (p_empresa is null or c.empresa_id = p_empresa)
      union all
      select a.fecha, a.empresa_id, 'enfermeria', a.trabajador_id
      from public.atenciones_enfermeria a
      where a.fecha between p_desde and p_hasta and (p_empresa is null or a.empresa_id = p_empresa)
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fecha, x.empresa), '[]') into v from (
      select d.fecha, e.razon_social as empresa,
             count(*) filter (where quien = 'medico') as consultas_medico,
             count(*) filter (where quien = 'enfermeria') as atenciones_enfermeria,
             count(distinct trabajador_id) filter (where quien = 'medico') as pacientes_medico,
             count(distinct trabajador_id) filter (where quien = 'enfermeria') as pacientes_enfermeria,
             case when bool_or(quien = 'medico') and bool_or(quien = 'enfermeria') then 'Médico y enfermería'
                  when bool_or(quien = 'medico') then 'Médico' else 'Enfermería' end as atendio
      from dias d join public.empresas e on e.id = d.empresa_id
      group by d.fecha, e.razon_social
    ) x;

  when 'indicadores' then
    with ate as (
      select a.* from public.atenciones_enfermeria a
      where a.fecha between p_desde and p_hasta and (p_empresa is null or a.empresa_id = p_empresa)
    ),
    -- Nunca un motivo con menos de 3 casos ni uno sensible por su nombre (lo lee RR. HH.)
    mot as (
      select case when count(*) < 3 or bool_or(coalesce(cie10, '') ~ '^(F|O|B2[0-4]|Z21)') then 'Otros motivos' else min(motivo) end as nombre, count(*) as n
      from ate where trabajador_id is not null and tipo not in ('inspeccion', 'evolucion')
      group by lower(coalesce(motivo, 'Sin motivo'))
    )
    select jsonb_build_object(
      'atenciones', (select count(*) from ate),
      'pacientes', (select count(distinct trabajador_id) from ate),
      'dias_enfermeria', (select count(distinct fecha) from ate),
      'dias_medico', (select count(distinct c.fecha) from public.consultas c
                       where c.estado <> 'borrador' and c.fecha between p_desde and p_hasta and (p_empresa is null or c.empresa_id = p_empresa)),
      'referidos', (select count(*) from ate where referido_medico),
      'inspecciones', (select count(*) from ate where tipo = 'inspeccion'),
      'por_tipo', coalesce((select jsonb_agg(jsonb_build_object('nombre', tipo, 'n', n) order by n desc) from (select tipo, count(*) as n from ate group by tipo) t), '[]'),
      'causas', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'n', n) order by nombre = 'Otros motivos', n desc)
                          from (select nombre, sum(n)::int as n from mot group by nombre order by nombre = 'Otros motivos', sum(n) desc limit 10) m), '[]')
    ) into v;

  else
    raise exception 'Reporte de enfermería desconocido: %', p_tipo;
  end case;
  return v;
end $$;
revoke execute on function public.reporte_enfermeria(text, uuid, date, date, jsonb) from public, anon;
grant execute on function public.reporte_enfermeria(text, uuid, date, date, jsonb) to authenticated;

create or replace function public.guardar_decision_enfermeria(p_org uuid, p_clave text, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_clave not in ('enfermeria_unida', 'enfermeria_vigilancia', 'enfermeria_tasas') then
    raise exception 'Opción desconocida.' using errcode = '22023';
  end if;
  if p_org is null or not p_org = any (public.orgs_con('{administrador,gerente_medico}')) then
    raise exception 'Solo el administrador o el gerente médico cambian esta decisión.' using errcode = '42501';
  end if;
  update public.organizaciones
     set ajustes = coalesce(ajustes, '{}'::jsonb) || jsonb_build_object(p_clave, coalesce(p_valor, false))
   where id = p_org;
end $$;
revoke execute on function public.guardar_decision_enfermeria(uuid, text, boolean) from public, anon;
grant execute on function public.guardar_decision_enfermeria(uuid, text, boolean) to authenticated;
