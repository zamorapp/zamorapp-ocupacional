-- zamorApp Ocupacional · Atenciones de enfermería (Cesar, 10-nov)
-- La enfermera de una empresa registra lo que hace cada día que va: toma de tensión, tratamientos, curas,
-- procedimientos (vendaje, nebulización, inyección…), primeros auxilios, orientación e inspecciones del lugar. Eso arma una morbilidad de enfermería APARTE de la del
-- médico. El médico decide en Reportes si además la ve unida a la suya (con los días de cada uno) y si sus
-- indicadores entran en el informe de vigilancia (organizaciones.ajustes: enfermeria_unida, enfermeria_vigilancia).
-- Es dato clínico: vive en el esquema clínico y solo lo ve el personal de salud de esa empresa.

-- ─── 1) Registro ───
create table if not exists clinico.atenciones_enfermeria (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete restrict,
  -- Sin trabajador solo la inspección, la orientación grupal u «otro» (charla, revisión del botiquín…)
  -- cascade: si se elimina un trabajador repetido (Papelera), sus atenciones se van con él y vuelven al restaurarlo
  trabajador_id uuid references public.trabajadores (id) on delete cascade,
  fecha date not null default public.hoy_caracas(),
  tipo text not null check (tipo in ('signos', 'tratamiento', 'procedimiento', 'cura', 'primeros_auxilios', 'orientacion', 'inspeccion', 'evolucion', 'otro')),
  -- Evolución de enfermería anotada en una consulta del médico (la enfermera la lee, no la cambia)
  consulta_id uuid references clinico.consultas (id) on delete set null,
  motivo text check (char_length(motivo) <= 200),
  cie10 text check (cie10 ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$'),
  -- {ta: "120/80", fc, fr, temp, glicemia, spo2, peso}
  signos jsonb not null default '{}'::jsonb check (jsonb_typeof(signos) = 'object' and pg_column_size(signos) <= 2048),
  tratamiento text check (char_length(tratamiento) <= 1000),
  nota text check (char_length(nota) <= 2000),
  referido_medico boolean not null default false,
  registrado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  actualizado_en timestamptz not null default public.ahora(),
  -- La escribe solo «hora_oficial» (hora que traía la PC y si venía verificada)
  hora_equipo jsonb
);
create index if not exists atenciones_enfermeria_empresa_fecha on clinico.atenciones_enfermeria (org_id, empresa_id, fecha);
create index if not exists atenciones_enfermeria_trabajador on clinico.atenciones_enfermeria (trabajador_id, fecha desc);
create index if not exists atenciones_enfermeria_consulta on clinico.atenciones_enfermeria (consulta_id) where consulta_id is not null;

alter table clinico.atenciones_enfermeria enable row level security;
-- Mismo alcance que la consulta: personal de salud de la organización, y si está limitado, solo su empresa
drop policy if exists atenciones_enfermeria_clinico on clinico.atenciones_enfermeria;
create policy atenciones_enfermeria_clinico on clinico.atenciones_enfermeria for all
  using (org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]))
  with check (public.es_clinico(org_id) and public.puede_ver_empresa(org_id, empresa_id));
-- Corregir: quien la registró, el gerente médico o el administrador. Borrar: la autora solo en las primeras 24 horas
-- (un error de tecleo); después, solo el gerente médico o el administrador (es dato clínico).
drop policy if exists atenciones_enfermeria_autor_editar on clinico.atenciones_enfermeria;
create policy atenciones_enfermeria_autor_editar on clinico.atenciones_enfermeria as restrictive for update
  using (registrado_por = auth.uid() or org_id = any ((select public.orgs_con('{gerente_medico,administrador}'))::uuid[]))
  with check (true);
drop policy if exists atenciones_enfermeria_autor_borrar on clinico.atenciones_enfermeria;
create policy atenciones_enfermeria_autor_borrar on clinico.atenciones_enfermeria as restrictive for delete
  using ((registrado_por = auth.uid() and creado_en > public.ahora() - interval '24 hours')
         or org_id = any ((select public.orgs_con('{gerente_medico,administrador}'))::uuid[]));
grant select, insert, update, delete on clinico.atenciones_enfermeria to authenticated;
revoke all on clinico.atenciones_enfermeria from anon;

-- Empresa = la del trabajador; autor fijo; sin fechas futuras; tipos que piden trabajador; signos conocidos
create or replace function public.validar_atencion_enfermeria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_org uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.registrado_por := auth.uid(); end if;
    -- La hora de registro no la elige quien escribe: en la nube, la del servidor; desde la PC, la marca «hora_oficial»
    -- (si no venía verificada). Así nadie corre el plazo de 24 h para borrar.
    if coalesce(current_setting('sync.cambio_id', true), '') = '' then new.creado_en := public.ahora(); end if;
  else
    new.registrado_por := old.registrado_por;
    new.creado_en := old.creado_en;
  end if;
  if new.trabajador_id is not null then
    select empresa_id, org_id into v_emp, v_org from public.trabajadores where id = new.trabajador_id;
    if v_org is distinct from new.org_id then
      raise exception 'El trabajador no es de esta organización.' using errcode = '23514';
    end if;
    new.empresa_id := coalesce(v_emp, new.empresa_id);
  elsif new.tipo not in ('inspeccion', 'orientacion', 'otro') then
    raise exception 'Elige el trabajador atendido.' using errcode = '23514';
  end if;
  -- La evolución se anota en una consulta de ESE trabajador (la que la enfermera leyó), o en su historia sin consulta
  if new.consulta_id is not null and not exists (
      select 1 from clinico.consultas c where c.id = new.consulta_id and c.trabajador_id = new.trabajador_id and c.org_id = new.org_id) then
    raise exception 'La consulta no es de este trabajador.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
    raise exception 'La empresa no es de esta organización.' using errcode = '23514';
  end if;
  if new.fecha > public.hoy_caracas() then
    raise exception 'La fecha de la atención no puede ser futura.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_object_keys(new.signos) k where k not in ('ta', 'fc', 'fr', 'temp', 'glicemia', 'spo2', 'peso')) then
    raise exception 'Signos vitales con datos desconocidos.' using errcode = '23514';
  end if;
  new.motivo := nullif(btrim(new.motivo), '');
  new.cie10 := nullif(upper(btrim(new.cie10)), '');
  new.tratamiento := nullif(btrim(new.tratamiento), '');
  new.nota := nullif(btrim(new.nota), '');
  return new;
end $$;
revoke execute on function public.validar_atencion_enfermeria() from public, authenticated, anon;
drop trigger if exists validar_atencion_enfermeria on clinico.atenciones_enfermeria;
create trigger validar_atencion_enfermeria before insert or update on clinico.atenciones_enfermeria
  for each row execute function public.validar_atencion_enfermeria();
-- «hora_oficial» corre antes que «validar_…» (los before van en orden alfabético)
drop trigger if exists hora_oficial on clinico.atenciones_enfermeria;
create trigger hora_oficial before insert or update on clinico.atenciones_enfermeria
  for each row execute function public.hora_oficial_de_la_bandeja('creado_en');
drop trigger if exists upd_atenciones_enfermeria on clinico.atenciones_enfermeria;
create trigger upd_atenciones_enfermeria before update on clinico.atenciones_enfermeria
  for each row execute function public.tocar_actualizado();

-- ─── 2) Réplica en el programa de escritorio (la enfermera puede registrar sin internet) ───
insert into sync.tablas (nombre, clinica, subible) values ('clinico.atenciones_enfermeria', true, true)
  on conflict (nombre) do nothing;
alter table clinico.atenciones_enfermeria add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on clinico.atenciones_enfermeria;
create trigger sync_version before insert or update on clinico.atenciones_enfermeria for each row execute function sync.versionar();
drop trigger if exists sync_anotar on clinico.atenciones_enfermeria;
create trigger sync_anotar after insert or update or delete on clinico.atenciones_enfermeria for each row execute function sync.anotar();

-- La vista va después de «version» para que la incluya (la usa la app y la réplica)
create or replace view public.atenciones_enfermeria with (security_invoker = true) as select * from clinico.atenciones_enfermeria;
grant select, insert, update, delete on public.atenciones_enfermeria to authenticated;
revoke all on public.atenciones_enfermeria from anon;

-- ─── 3) Motivos frecuentes de enfermería (Configuración › Listas; el código es el CIE-10 que une con la del médico) ───
create or replace function public.sembrar_motivos_enfermeria_2026()
returns void language plpgsql set search_path = public as $$
begin
  -- En la PC la lista y sus motivos llegan por la réplica con sus ids
  if public.es_base_local() then return; end if;
  insert into public.listas (codigo, nombre, descripcion) values
    ('motivo_enfermeria', 'Motivos de atención de enfermería', 'Lo que se elige con un clic en la atención de enfermería; el código CIE-10 une su morbilidad con la del médico')
  on conflict (codigo) do nothing;
  with nuevos as (
    insert into public.lista_items (lista, codigo, nombre, orden)
    select 'motivo_enfermeria', x.codigo, x.nombre, x.orden
    from (values
      ('I10', 'Control de tensión arterial', 1),
      ('R51', 'Cefalea', 2),
      ('M54.5', 'Lumbalgia', 3),
      ('J06.9', 'Infección respiratoria alta (gripe)', 4),
      ('R50.9', 'Fiebre', 5),
      ('A09', 'Diarrea / gastroenteritis', 6),
      ('R10.4', 'Dolor abdominal', 7),
      ('N94.6', 'Dismenorrea', 8),
      ('R42', 'Mareo', 9),
      ('T14.1', 'Herida (cura)', 10),
      ('T14.0', 'Golpe o contusión', 11),
      ('L50.9', 'Alergia / urticaria', 12),
      ('H10.9', 'Conjuntivitis / ojo rojo', 13),
      ('K30', 'Dispepsia / acidez', 14),
      ('R73.9', 'Control de glicemia', 15),
      ('Z51.8', 'Tratamiento indicado (ampolla, nebulización)', 16)
    ) as x(codigo, nombre, orden)
    where not exists (select 1 from public.lista_items i
                       where i.lista = 'motivo_enfermeria' and i.org_id is null and lower(i.nombre) = lower(x.nombre))
    returning id, lista, codigo, nombre, grupo, texto, orden, activo, datos)
  insert into public.lista_items (lista, org_id, codigo, nombre, grupo, texto, orden, activo, datos, base_id)
  select n.lista, o.id, n.codigo, n.nombre, n.grupo, n.texto, n.orden, n.activo, n.datos, n.id
    from nuevos n cross join public.organizaciones o
   where not exists (select 1 from public.lista_items x where x.org_id = o.id and x.base_id = n.id)
     and not exists (select 1 from public.lista_items x where x.org_id = o.id and x.lista = n.lista and lower(x.nombre) = lower(n.nombre));
end $$;
revoke execute on function public.sembrar_motivos_enfermeria_2026() from public, anon, authenticated;
select public.sembrar_motivos_enfermeria_2026();

-- ─── 4) Reportes de enfermería (función aparte: nunca recrear reporte_listado) ───
-- Con los permisos de quien consulta (security invoker): la RLS decide qué empresas y si ve lo clínico.
--   atenciones  · cada atención del período (registro imprimible: tratamientos, procedimientos, curas…)
--   tension     · control de tensión arterial: cada toma con su clasificación
--   morbilidad  · motivos de enfermería ordenados por casos (columnas compatibles con la morbilidad del médico)
--   unida       · médico + enfermería por CIE-10 (o motivo), con casos y días de cada uno
--   dias        · por día y empresa: consultas del médico y atenciones de enfermería, y quién atendió
--   indicadores · resumen para el informe de vigilancia (solo totales; grupos de menos de 3 van a «Otros motivos»)
create or replace function public.reporte_enfermeria(p_tipo text, p_empresa uuid, p_desde date, p_hasta date, p_opciones jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v jsonb;
  v_agrupar text := nullif(p_opciones ->> 'agrupar', '');
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
    atendidos as (select grupo, count(distinct trabajador_id) as n from ate group by grupo)
    select coalesce(jsonb_agg(to_jsonb(x) order by x.grupo nulls first, x.casos desc, x.descripcion), '[]') into v from (
      select a.grupo, min(a.cie10) as cie10, min(a.motivo) as descripcion,
             count(*) as casos, count(distinct a.trabajador_id) as pacientes,
             (select n from atendidos s where s.grupo is not distinct from a.grupo) as atendidos,
             count(distinct a.fecha) as dias,
             count(*) filter (where a.sexo = 'F') as femenino, count(*) filter (where a.sexo = 'M') as masculino,
             count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) < 18) as e_menor_18,
             count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) between 18 and 39) as e_18_39,
             count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) between 40 and 59) as e_40_59,
             count(*) filter (where extract(year from age(a.fecha, a.fecha_nacimiento)) >= 60) as e_60_mas
      from ate a
      group by a.grupo, lower(a.motivo)
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

-- ─── 5) Decisiones del médico sobre enfermería: cambia SOLO su clave en ajustes (no pisa lo que otro guardó a la vez) ───
-- Las cambian el administrador y el gerente médico (Cesar: enfermería la administra el gerente médico).
create or replace function public.guardar_decision_enfermeria(p_org uuid, p_clave text, p_valor boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_clave not in ('enfermeria_unida', 'enfermeria_vigilancia') then
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

-- ─── 6) Enfermería lee las consultas del médico pero no las abre, cambia ni borra (pedido de Cesar, 10-nov) ───
-- Restrictivas: se suman a las demás reglas; solo afectan a quien tiene el rol «enfermeria» en esa organización.
drop policy if exists consultas_enfermeria_no_crea on clinico.consultas;
create policy consultas_enfermeria_no_crea on clinico.consultas as restrictive for insert
  with check (not org_id = any ((select public.orgs_con('{enfermeria}'))::uuid[]));
drop policy if exists consultas_enfermeria_no_edita on clinico.consultas;
create policy consultas_enfermeria_no_edita on clinico.consultas as restrictive for update
  using (not org_id = any ((select public.orgs_con('{enfermeria}'))::uuid[]));
drop policy if exists consultas_enfermeria_no_borra on clinico.consultas;
create policy consultas_enfermeria_no_borra on clinico.consultas as restrictive for delete
  using (not org_id = any ((select public.orgs_con('{enfermeria}'))::uuid[]));
