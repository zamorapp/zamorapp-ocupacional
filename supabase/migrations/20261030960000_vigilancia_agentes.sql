-- Vigilancia epidemiológica con agentes (Cesar, 14-nov-2026): «créame la vigilancia de este trimestre de tal empresa
-- con el proyecto tal, las condiciones para esta vigilancia son tales. Si no las tiene registradas la empresa,
-- créala y configúrala… yo audito y apruebo». Aprobado con la vista previa («Sí, constrúyela así», 14-nov).
-- 1. Casilla nueva en la llave, APAGADA por defecto: «Vigilancia y reportes» (agentes_llaves.vigilancia).
-- 2. public.vigilancia_programas: programas de vigilancia por empresa (riesgo, condiciones, dependencias y cargos que
--    cubre, exámenes con su frecuencia y metas). Son configuración, no código: el médico los crea y edita a mano en
--    la ficha de la empresa; el agente solo los PROPONE. vigilancia_programa_cumplimiento() da la cobertura.
-- 3. public.agentes_propuestas: bandeja común de lo que un agente propone (la usa también Facturación, 954). Nada se
--    aplica sin «Aprobar»: aplicar_propuesta() hace el cambio CON LA SESIÓN de quien aprueba (security invoker: las
--    reglas RLS de siempre deciden). descartar_propuesta() la cierra. Se borra sola (limpieza «agentes_propuestas»).
-- 4. public.puerta_vigilancia(llave, acción, datos, ensayo): entrada de agentes APARTE de public.agente (otros hilos
--    la parchean; así no chocamos). Misma llave, mismo freno y mismo registro. Acciones:
--    leer: vigilancia_cifras (solo totales: grupos de menos de 3 y diagnósticos confidenciales van a «Otros»; nada
--    de nombres, cédulas ni casos), ver_programas, ver_informe, ver_propuestas;
--    proponer: proponer_programa, proponer_ajuste_empresa, redactar_informe.
-- Lo que NO hace: no escribe en informes_vigilancia, vigilancia_programas ni empresas (solo propone), no ve precios,
-- no imprime, no firma, no sella, no envía. En la PC (base local) la puerta no corre: las propuestas bajan por la
-- sincronía y se aprueban allí también.

-- ===== 1. Casilla de la llave =====
alter table public.agentes_llaves add column if not exists vigilancia boolean not null default false;

create or replace function public.agentes_llave_vigilancia(p_org uuid, p_llave uuid, p_si boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k public.agentes_llaves;
begin
  if public.es_base_local() then
    raise exception 'La puerta para agentes se cambia con internet.' using errcode = 'P0001';
  end if;
  if not public.agentes_soy_admin(p_org) then
    raise exception 'Solo el administrador cambia las llaves para agentes.' using errcode = '42501';
  end if;
  update public.agentes_llaves set vigilancia = coalesce(p_si, false)
   where id = p_llave and org_id = p_org and revocada_en is null and vence_en > public.ahora()
  returning * into k;
  if not found then raise exception 'Esa llave ya no sirve (apagada o vencida).' using errcode = 'P0001'; end if;
  insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ensayo, ok, resumen)
  values (p_org, k.id, k.nombre, 'casilla_vigilancia', false, true,
          case when k.vigilancia then 'Casilla «Vigilancia y reportes» encendida' else 'Casilla «Vigilancia y reportes» apagada' end);
  return jsonb_build_object('id', k.id, 'vigilancia', k.vigilancia);
end $$;
revoke execute on function public.agentes_llave_vigilancia(uuid, uuid, boolean) from public, anon;
grant execute on function public.agentes_llave_vigilancia(uuid, uuid, boolean) to authenticated;

-- agentes_estado devuelve la casilla de cada llave (mismo ancla que 959: cada parche suma su clave detrás)
do $$
declare
  v_def text := replace(pg_get_functiondef('public.agentes_estado(uuid, date, date)'::regprocedure), chr(13), '');
  v_viejo text := '''permiso'', l.permiso,';
begin
  if position('''vigilancia'', l.vigilancia' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'agentes_estado cambió: revisar 20261030960000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_viejo || ' ''vigilancia'', l.vigilancia,');
end $$;

-- ===== 2. Programas de vigilancia por empresa =====
create table if not exists public.vigilancia_programas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 3 and 120),
  proyecto text check (proyecto is null or char_length(proyecto) <= 300),
  riesgo text check (riesgo is null or char_length(riesgo) <= 300),
  condiciones text check (condiciones is null or char_length(condiciones) <= 4000),
  -- A quién cubre: dependencias y cargos de la empresa (vacíos = toda la empresa)
  dependencia_ids uuid[] not null default '{}' check (cardinality(dependencia_ids) <= 60),
  puesto_ids uuid[] not null default '{}' check (cardinality(puesto_ids) <= 120),
  -- [{"nombre": "Audiometría", "cada_meses": 6}]
  examenes jsonb not null default '[]' check (jsonb_typeof(examenes) = 'array' and jsonb_array_length(examenes) <= 30),
  -- [{"indicador": "Trabajadores evaluados", "meta": "100 %"}]
  metas jsonb not null default '[]' check (jsonb_typeof(metas) = 'array' and jsonb_array_length(metas) <= 20),
  activo boolean not null default true,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  actualizado_en timestamptz not null default public.ahora()
);
comment on table public.vigilancia_programas is
  'Programas de vigilancia epidemiológica por empresa (riesgo, población, exámenes, metas). Configuración editable; el agente solo los propone (20261030960000).';
create index if not exists vigilancia_programas_empresa on public.vigilancia_programas (empresa_id, activo);
create index if not exists vigilancia_programas_org on public.vigilancia_programas (org_id);

-- La empresa y las dependencias/cargos tienen que ser de la misma organización y empresa
create or replace function public.vigilancia_programas_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.org_id = new.org_id) then
    raise exception 'La empresa no es de esta organización.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.dependencia_ids) d(id)
              where not exists (select 1 from public.dependencias x where x.id = d.id and x.empresa_id = new.empresa_id)) then
    raise exception 'Una de las dependencias no es de esta empresa.' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(new.puesto_ids) p(id)
              where not exists (select 1 from public.puestos x where x.id = p.id and x.empresa_id = new.empresa_id)) then
    raise exception 'Uno de los cargos no es de esta empresa.' using errcode = '23514';
  end if;
  new.nombre := btrim(new.nombre);
  new.proyecto := nullif(btrim(coalesce(new.proyecto, '')), '');
  new.riesgo := nullif(btrim(coalesce(new.riesgo, '')), '');
  new.condiciones := nullif(btrim(coalesce(new.condiciones, '')), '');
  return new;
end $$;
drop trigger if exists vigilancia_programas_validar on public.vigilancia_programas;
create trigger vigilancia_programas_validar before insert or update on public.vigilancia_programas
  for each row execute function public.vigilancia_programas_validar();

alter table public.vigilancia_programas enable row level security;
drop policy if exists vigilancia_programas_leer on public.vigilancia_programas;
create policy vigilancia_programas_leer on public.vigilancia_programas for select
  using (org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]));
-- Los configura el servicio médico (y el administrador o el coordinador de SST), como el informe de vigilancia
drop policy if exists vigilancia_programas_editar on public.vigilancia_programas;
create policy vigilancia_programas_editar on public.vigilancia_programas for all
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]))
  with check (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]));
grant select, insert, update, delete on public.vigilancia_programas to authenticated;
revoke all on public.vigilancia_programas from anon;

drop trigger if exists bit_vigilancia_programas on public.vigilancia_programas;
create trigger bit_vigilancia_programas after insert or update or delete on public.vigilancia_programas
  for each row execute function public.registrar_bitacora();
drop trigger if exists upd_vigilancia_programas on public.vigilancia_programas;
create trigger upd_vigilancia_programas before update on public.vigilancia_programas
  for each row execute function public.tocar_actualizado();

-- Cobertura del programa en un período: población (activos o en reposo de sus dependencias/cargos, o de toda la
-- empresa), evaluados (con consulta no borrador en el período) y, por examen, cuántos lo tienen hecho. Solo
-- cifras. Security invoker: quien no ve consultas (RR. HH.) recibe evaluados en cero.
create or replace function public.vigilancia_programa_cumplimiento(p_programa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
  with pr as (select * from public.vigilancia_programas where id = p_programa),
  pob as (
    select t.id from public.trabajadores t, pr
    where t.empresa_id = pr.empresa_id and t.estado in ('activo', 'reposo')
      and (cardinality(pr.dependencia_ids) = 0 and cardinality(pr.puesto_ids) = 0
           or t.dependencia_id = any (pr.dependencia_ids) or t.puesto_id = any (pr.puesto_ids))
  ),
  con as (
    select c.trabajador_id, c.paraclinicos from public.consultas c join pob on pob.id = c.trabajador_id
    where c.fecha between p_desde and p_hasta and c.estado <> 'borrador'
  )
  select case when not exists (select 1 from pr) then null else jsonb_build_object(
    'poblacion', (select count(*) from pob),
    'evaluados', (select count(distinct trabajador_id) from con),
    'examenes', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', ex ->> 'nombre', 'cada_meses', ex -> 'cada_meses',
               'hechos', (select count(distinct con.trabajador_id) from con
                           cross join lateral jsonb_array_elements(case when jsonb_typeof(con.paraclinicos) = 'array' then con.paraclinicos else '[]'::jsonb end) pc
                           where length(btrim(ex ->> 'nombre')) >= 3 and pc ->> 'nombre' ilike '%' || btrim(ex ->> 'nombre') || '%'))
             order by o)
      from pr, jsonb_array_elements(pr.examenes) with ordinality as e(ex, o)), '[]'::jsonb)) end
$$;
revoke execute on function public.vigilancia_programa_cumplimiento(uuid, date, date) from public, anon;
grant execute on function public.vigilancia_programa_cumplimiento(uuid, date, date) to authenticated;

-- ===== 3. Bandeja de propuestas de agentes =====
create table if not exists public.agentes_propuestas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete cascade,
  llave_id uuid references public.agentes_llaves (id) on delete set null,
  llave_nombre text not null,
  tipo text not null check (tipo ~ '^[a-z_]{3,40}$'),   -- cada entrada de agente valida sus tipos
  objeto_id uuid,                                        -- lo que se cambiaría (programa, servicio…), si ya existe
  titulo text not null check (char_length(titulo) between 3 and 200),
  antes jsonb,
  propuesto jsonb not null,
  motivo text check (motivo is null or char_length(motivo) <= 2000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'descartada')),
  creado_en timestamptz not null default public.ahora(),
  resuelto_por uuid,
  resuelto_en timestamptz
);
comment on table public.agentes_propuestas is
  'Lo que un agente PROPONE (programa, ajuste, borrador de informe, precio…). Solo lo insertan las entradas de agentes; se aplica con aplicar_propuesta (20261030960000).';
create index if not exists agentes_propuestas_org on public.agentes_propuestas (org_id, estado, creado_en desc);
create index if not exists agentes_propuestas_empresa on public.agentes_propuestas (empresa_id) where empresa_id is not null;

alter table public.agentes_propuestas enable row level security;
-- La ven y la resuelven el administrador, el gerente médico y el médico (con la empresa a su alcance).
-- Enfermería y RR. HH. no (Cesar: enfermería solo edita lo suyo).
drop policy if exists agentes_propuestas_leer on public.agentes_propuestas;
create policy agentes_propuestas_leer on public.agentes_propuestas for select
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_sin_limite => true))::uuid[])
         or (empresa_id is null and org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}'))::uuid[]))
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}'))::text[]));
drop policy if exists agentes_propuestas_resolver on public.agentes_propuestas;
create policy agentes_propuestas_resolver on public.agentes_propuestas for update
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_sin_limite => true))::uuid[])
         or (empresa_id is null and org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}'))::uuid[]))
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}'))::text[]))
  with check (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_sin_limite => true))::uuid[])
         or (empresa_id is null and org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}'))::uuid[]))
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}'))::text[]));
revoke all on public.agentes_propuestas from anon, authenticated;
grant select on public.agentes_propuestas to authenticated;
-- Lo escrito por el agente no se cambia: solo se resuelve
grant update (estado, resuelto_por, resuelto_en) on public.agentes_propuestas to authenticated;

create or replace function public.agentes_propuestas_resolver()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.estado <> 'pendiente' and coalesce(current_setting('sync.cambio_id', true), '') = '' then
    raise exception 'Esta propuesta ya se resolvió.' using errcode = 'P0001';
  end if;
  -- «aprobada» solo la pone aplicar_propuesta (que hace el cambio); un update directo solo puede descartar
  if new.estado = 'aprobada' and old.estado <> 'aprobada' and coalesce(current_setting('sync.cambio_id', true), '') = ''
     and coalesce(current_setting('zamorapp.aplicando_propuesta', true), '') <> new.id::text then
    raise exception 'Una propuesta se aprueba con «Aprobar» (aplicar_propuesta).' using errcode = '42501';
  end if;
  if new.estado <> old.estado and coalesce(current_setting('sync.cambio_id', true), '') = '' then
    new.resuelto_por := auth.uid();
    new.resuelto_en := public.ahora();
  end if;
  return new;
end $$;
drop trigger if exists agentes_propuestas_resolver on public.agentes_propuestas;
create trigger agentes_propuestas_resolver before update of estado, resuelto_por, resuelto_en on public.agentes_propuestas
  for each row execute function public.agentes_propuestas_resolver();
-- Una propuesta nueva reemplaza a la pendiente igual de la misma llave (no se acumulan copias). Va en la tabla y
-- no en las acciones del agente: así ninguna acción de la puerta escribe un «update» (prueba 237).
-- Igual = mismo tipo, empresa y objeto; en el programa, mismo nombre; en el informe, mismo período.
create or replace function public.agentes_propuestas_reemplazar()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('sync.cambio_id', true), '') <> '' or new.estado <> 'pendiente' then return new; end if;
  update public.agentes_propuestas x set estado = 'descartada'
   where x.org_id = new.org_id and x.llave_id is not distinct from new.llave_id and x.estado = 'pendiente'
     and x.tipo = new.tipo and x.empresa_id is not distinct from new.empresa_id and x.objeto_id is not distinct from new.objeto_id
     and case new.tipo
           when 'programa_vigilancia' then lower(x.propuesto ->> 'nombre') = lower(new.propuesto ->> 'nombre')
           when 'informe_vigilancia' then x.propuesto ->> 'desde' = new.propuesto ->> 'desde' and x.propuesto ->> 'hasta' = new.propuesto ->> 'hasta'
           when 'ajuste_empresa' then true
           else false  -- los demás tipos (p. ej. facturación) deciden en su propia migración
         end;
  return new;
end $$;
revoke all on function public.agentes_propuestas_reemplazar() from public, anon, authenticated;
drop trigger if exists agentes_propuestas_reemplazar on public.agentes_propuestas;
create trigger agentes_propuestas_reemplazar before insert on public.agentes_propuestas
  for each row execute function public.agentes_propuestas_reemplazar();
drop trigger if exists bit_agentes_propuestas on public.agentes_propuestas;
create trigger bit_agentes_propuestas after update on public.agentes_propuestas
  for each row execute function public.registrar_bitacora();

-- Bajan a la PC con la sincronía (se aprueban también sin internet; el cambio sube con lo demás)
insert into sync.tablas (nombre, clinica, subible) values
  ('public.vigilancia_programas', false, true),
  ('public.agentes_propuestas', false, true)
on conflict (nombre) do nothing;
do $$
declare t text;
begin
  foreach t in array array['public.vigilancia_programas', 'public.agentes_propuestas'] loop
    execute format('alter table %s add column if not exists version bigint not null default 1', t);
    execute format('drop trigger if exists sync_version on %s', t);
    execute format('create trigger sync_version before insert or update on %s for each row execute function sync.versionar()', t);
    execute format('drop trigger if exists sync_anotar on %s', t);
    execute format('create trigger sync_anotar after insert or update or delete on %s for each row execute function sync.anotar()', t);
  end loop;
end $$;

-- Columnas del informe que un agente puede proponer (la «Visión del médico» es solo de Cesar)
create or replace function public.propuesta_seccion_valida(p text)
returns boolean language sql immutable set search_path = public as $$
  select p in ('resumen', 'conclusiones', 'recomendaciones_medicas', 'recomendaciones', 'factores_riesgo', 'medidas_control')
$$;
revoke execute on function public.propuesta_seccion_valida(text) from public, anon;
grant execute on function public.propuesta_seccion_valida(text) to authenticated;

-- Aprobar: hace el cambio con la sesión de quien aprueba. p_datos (opcional) trae lo editado o elegido:
--   programa_vigilancia: el programa corregido; ajuste_empresa: los campos que se aceptan;
--   informe_vigilancia: {"secciones": {...}, "analisis": {...}} solo con lo que se usa.
create or replace function public.aplicar_propuesta(p_id uuid, p_datos jsonb default null)
returns jsonb language plpgsql set search_path = public as $$
declare
  pr public.agentes_propuestas;
  d jsonb;
  v_id uuid;
  v_inf public.informes_vigilancia;
  v_sec jsonb;
  k text;
begin
  select * into pr from public.agentes_propuestas where id = p_id for update;
  if not found then raise exception 'Propuesta no encontrada.' using errcode = 'P0001'; end if;
  if pr.estado <> 'pendiente' then raise exception 'Esta propuesta ya se resolvió.' using errcode = 'P0001'; end if;
  d := coalesce(p_datos, pr.propuesto);

  if pr.tipo = 'programa_vigilancia' then
    if pr.objeto_id is null then
      insert into public.vigilancia_programas (org_id, empresa_id, nombre, proyecto, riesgo, condiciones, dependencia_ids, puesto_ids, examenes, metas)
      values (pr.org_id, pr.empresa_id, d ->> 'nombre', d ->> 'proyecto', d ->> 'riesgo', d ->> 'condiciones',
              coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(d -> 'dependencia_ids', '[]')) x), '{}'),
              coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(d -> 'puesto_ids', '[]')) x), '{}'),
              coalesce(d -> 'examenes', '[]'), coalesce(d -> 'metas', '[]'))
      returning id into v_id;
    else
      update public.vigilancia_programas set
        nombre = d ->> 'nombre', proyecto = d ->> 'proyecto', riesgo = d ->> 'riesgo', condiciones = d ->> 'condiciones',
        dependencia_ids = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(d -> 'dependencia_ids', '[]')) x), '{}'),
        puesto_ids = coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(d -> 'puesto_ids', '[]')) x), '{}'),
        examenes = coalesce(d -> 'examenes', '[]'), metas = coalesce(d -> 'metas', '[]')
      where id = pr.objeto_id and empresa_id = pr.empresa_id
      returning id into v_id;
    end if;
    if v_id is null then raise exception 'No tienes permiso para configurar programas de esta empresa.' using errcode = '42501'; end if;

  elsif pr.tipo = 'ajuste_empresa' then
    update public.empresas e set
      proyecto = case when d ? 'proyecto' then nullif(btrim(d ->> 'proyecto'), '') else e.proyecto end,
      mes_inicio_gestion = case when d ? 'mes_inicio_gestion' then (d ->> 'mes_inicio_gestion')::smallint else e.mes_inicio_gestion end
    where e.id = pr.empresa_id and e.org_id = pr.org_id
    returning e.id into v_id;
    if v_id is null then raise exception 'No tienes permiso para cambiar los datos de esta empresa.' using errcode = '42501'; end if;

  elsif pr.tipo = 'informe_vigilancia' then
    v_sec := coalesce(d -> 'secciones', '{}');
    select * into v_inf from public.informes_vigilancia
     where org_id = pr.org_id and empresa_id = pr.empresa_id
       and desde = (pr.propuesto ->> 'desde')::date and hasta = (pr.propuesto ->> 'hasta')::date;
    if v_inf.id is null then
      insert into public.informes_vigilancia (org_id, empresa_id, desde, hasta)
      values (pr.org_id, pr.empresa_id, (pr.propuesto ->> 'desde')::date, (pr.propuesto ->> 'hasta')::date)
      returning * into v_inf;
    end if;
    for k in select jsonb_object_keys(v_sec) loop
      if not public.propuesta_seccion_valida(k) then
        raise exception 'Sección no válida: %', k using errcode = 'P0001';
      end if;
    end loop;
    update public.informes_vigilancia i set
      resumen = case when v_sec ? 'resumen' then v_sec ->> 'resumen' else i.resumen end,
      conclusiones = case when v_sec ? 'conclusiones' then v_sec ->> 'conclusiones' else i.conclusiones end,
      recomendaciones_medicas = case when v_sec ? 'recomendaciones_medicas' then v_sec ->> 'recomendaciones_medicas' else i.recomendaciones_medicas end,
      recomendaciones = case when v_sec ? 'recomendaciones' then v_sec ->> 'recomendaciones' else i.recomendaciones end,
      factores_riesgo = case when v_sec ? 'factores_riesgo' then v_sec ->> 'factores_riesgo' else i.factores_riesgo end,
      medidas_control = case when v_sec ? 'medidas_control' then v_sec ->> 'medidas_control' else i.medidas_control end,
      analisis = coalesce(i.analisis, '{}'::jsonb) || coalesce(d -> 'analisis', '{}'::jsonb)
    where i.id = v_inf.id
    returning i.id into v_id;
    if v_id is null then raise exception 'No tienes permiso para redactar el informe de esta empresa.' using errcode = '42501'; end if;

  else
    raise exception 'Este tipo de propuesta todavía no se aplica aquí (%).', pr.tipo using errcode = 'P0001';
  end if;

  perform set_config('zamorapp.aplicando_propuesta', p_id::text, true);
  update public.agentes_propuestas set estado = 'aprobada' where id = p_id;
  perform set_config('zamorapp.aplicando_propuesta', '', true);
  if not found then raise exception 'No tienes permiso para aprobar esta propuesta.' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'tipo', pr.tipo, 'id', v_id);
end $$;
revoke execute on function public.aplicar_propuesta(uuid, jsonb) from public, anon;
grant execute on function public.aplicar_propuesta(uuid, jsonb) to authenticated;

create or replace function public.descartar_propuesta(p_id uuid)
returns boolean language plpgsql set search_path = public as $$
begin
  update public.agentes_propuestas set estado = 'descartada' where id = p_id and estado = 'pendiente';
  return found;
end $$;
revoke execute on function public.descartar_propuesta(uuid) from public, anon;
grant execute on function public.descartar_propuesta(uuid) to authenticated;

-- ===== 4. Ayudas de la puerta de vigilancia (nadie las llama desde fuera) =====
-- Lista de {nombre, n, …}: solo con 3 o más llevan nombre; el resto (y lo sensible) va junto en «Otros».
-- Un «Otros» de 1 o 2 sale como "<3". Suma también «dias» y «personal» si los hay.
create or replace function public.agente_vig_lista(p_lista jsonb, p_clave text default 'nombre', p_sensible boolean default false)
returns jsonb language sql immutable set search_path = public as $$
  with x as (
    select e, o, e ->> p_clave as nom, coalesce((e ->> 'n')::numeric, 0) as n,
           (e ->> 'dias')::numeric as dias, (e ->> 'personal')::numeric as personal
    from jsonb_array_elements(case when jsonb_typeof(p_lista) = 'array' then p_lista else '[]'::jsonb end) with ordinality as a(e, o)
  ),
  marcado as (
    select *, n >= 3 and coalesce(nom, '') <> ''
              and not (p_sensible and nom ~* 'mental|comportamiento|embarazo|parto|puerperio|vih|inmunodeficiencia') as visible
    from x
  ),
  otros as (select sum(n) as n, sum(dias) as dias from marcado where not visible)
  select coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('nombre', nom, 'n', n, 'dias', dias, 'personal', personal)) order by n desc, o)
                   from marcado where visible), '[]'::jsonb)
         || case when (select n from otros) >= 3
                 then jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('nombre', 'Otros (grupos de menos de 3 o confidenciales)', 'n', (select n from otros), 'dias', (select dias from otros))))
                 when (select n from otros) > 0 then jsonb_build_array(jsonb_build_object('nombre', 'Otros', 'n', '<3'))
                 else '[]'::jsonb end
$$;

-- {"clave": n} → lista {nombre, n}
create or replace function public.agente_vig_objeto(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('nombre', replace(k, '_', ' '), 'n', v)), '[]'::jsonb)
  from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end) as e(k, v)
  where jsonb_typeof(v) = 'number'
$$;

-- Un número suelto de 1 o 2 personas sale como "<3"
create or replace function public.agente_vig_n(p numeric)
returns jsonb language sql immutable set search_path = public as $$
  select case when p is null then 'null'::jsonb when p > 0 and p < 3 then to_jsonb('<3'::text) else to_jsonb(p) end
$$;

-- Primeras causas: solo con 3 casos y 3 personas o más, y nunca VIH, salud mental, embarazo ni parto
create or replace function public.agente_vig_causas(p jsonb)
returns jsonb language sql immutable set search_path = public as $$
  with x as (
    select e ->> 'cie10' as cie, e ->> 'descripcion' as des, coalesce((e ->> 'n')::numeric, 0) as n,
           coalesce((e ->> 'pacientes')::numeric, (e ->> 'n')::numeric, 0) as pac, (e ->> 'dias')::numeric as dias, o
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality as a(e, o)
  ),
  m as (select *, least(n, pac) >= 3 and coalesce(cie, '') !~* '^\s*(B2[0-4]|Z21|F\d|O\d|Z3[2-6])' as visible from x)
  select coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('diagnostico', coalesce(nullif(des, ''), cie) || ' (' || cie || ')', 'n', n, 'dias', dias)) order by o)
                   from m where visible), '[]'::jsonb)
         || case when (select sum(n) from m where not visible) >= 3
                 then jsonb_build_array(jsonb_build_object('diagnostico', 'Otros diagnósticos (menos de 3 casos o confidenciales)', 'n', (select sum(n) from m where not visible)))
                 when (select sum(n) from m where not visible) > 0 then jsonb_build_array(jsonb_build_object('diagnostico', 'Otros diagnósticos', 'n', '<3'))
                 else '[]'::jsonb end
$$;

-- Periodo pedido por el agente: desde/hasta, o anio + trimestre (contado desde el mes de inicio de la gestión)
create or replace function public.agente_vig_periodo(p_org uuid, d jsonb, out empresa_id uuid, out desde date, out hasta date)
language plpgsql stable set search_path = public as $$
declare
  v_ini smallint;
  v_anio integer;
  v_t integer;
begin
  empresa_id := public.agente_uuid(d, 'empresa_id');
  if empresa_id is null then perform public.agente_no('Falta «empresa_id» (búscala con buscar_empresas).'); end if;
  select e.mes_inicio_gestion into v_ini from public.empresas e where e.id = empresa_id and e.org_id = p_org;
  if not found then perform public.agente_no('Esa empresa no existe en esta organización.'); end if;
  desde := public.agente_fecha(d, 'desde');
  hasta := public.agente_fecha(d, 'hasta');
  if desde is null and hasta is null and d ? 'trimestre' then
    v_anio := public.agente_num(d, 'anio', 2000, 2100);
    v_t := public.agente_num(d, 'trimestre', 1, 4);
    if v_anio is null then perform public.agente_no('Con «trimestre» indica también «anio».'); end if;
    desde := make_date(v_anio, 1, 1) + make_interval(months => v_ini - 1 + 3 * (v_t - 1));
    hasta := (desde + interval '3 months')::date - 1;
  end if;
  if desde is null or hasta is null then perform public.agente_no('Indica «desde» y «hasta» (AAAA-MM-DD), o «anio» y «trimestre» (1 a 4).'); end if;
  if hasta < desde or hasta - desde > 400 then perform public.agente_no('El período va de «desde» a «hasta» y dura un año como máximo.'); end if;
end $$;

-- Cifras de la vigilancia de UNA empresa: solo totales, con las mismas reglas que «Mejorar con IA» y la copia de la
-- empresa. Las funciones del informe corren con la identidad del administrador de la llave (la fija puerta_vigilancia).
create or replace function public.agente_vig_cifras(p_org uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  per record;
  r jsonb;
  l jsonb;
  ac jsonb;
  v_f numeric; v_m numeric; v_tot numeric; v_dias numeric; v_comp numeric;
  v_prog jsonb;
begin
  select * into per from public.agente_vig_periodo(p_org, d);
  r := public.reporte_vigilancia(per.empresa_id, per.desde, per.hasta);
  begin l := public.vigilancia_legal(per.empresa_id, per.desde, per.hasta); exception when others then l := null; end;
  begin ac := to_jsonb(public.indices_accidentalidad(per.empresa_id, per.desde, per.hasta)); exception when others then ac := null; end;
  v_f := coalesce((r #>> '{poblacion,femenino}')::numeric, 0);
  v_m := coalesce((r #>> '{poblacion,masculino}')::numeric, 0);
  v_tot := coalesce((r #>> '{poblacion,total}')::numeric, 0);
  v_dias := nullif((r #>> '{ausentismo,dias_periodo}')::numeric, 0);
  v_comp := coalesce((r #>> '{ausentismo,dias_computables}')::numeric, 0);
  select coalesce(jsonb_agg(jsonb_build_object('programa', p.nombre, 'riesgo', p.riesgo,
           'cumplimiento', public.vigilancia_programa_cumplimiento(p.id, per.desde, per.hasta)) order by p.nombre), '[]'::jsonb)
    into v_prog from public.vigilancia_programas p where p.empresa_id = per.empresa_id and p.activo;
  return jsonb_build_object(
    'empresa', (select coalesce(e.nombre_comercial, e.razon_social) from public.empresas e where e.id = per.empresa_id),
    'desde', per.desde, 'hasta', per.hasta,
    'reglas', 'Solo totales. Los grupos de menos de 3 personas y los diagnósticos confidenciales van juntos en «Otros»; "<3" = 1 o 2. No nombres casos ni personas en el texto.',
    'poblacion', jsonb_strip_nulls(jsonb_build_object('total', v_tot,
       'mujeres', case when v_f >= 3 and v_m >= 3 then v_f end, 'hombres', case when v_f >= 3 and v_m >= 3 then v_m end,
       'por_tipo', public.agente_vig_lista(r #> '{poblacion,por_tipo}'))),
    'consultas', jsonb_build_object(
       'total', r #> '{consultas,total}', 'trabajadores', public.agente_vig_n((r #>> '{consultas,pacientes}')::numeric),
       'preventivas', r #> '{consultas,preventivas}', 'asistenciales', r #> '{consultas,no_preventivas}',
       'por_motivo', public.agente_vig_lista(r #> '{consultas,por_motivo}'),
       'por_edad', public.agente_vig_lista(r #> '{consultas,por_edad}', 'grupo'),
       'por_dependencia', public.agente_vig_lista(r #> '{consultas,por_dependencia}')),
    'morbilidad', jsonb_build_object(
       'diagnosticos', r #> '{morbilidad,total}',
       'por_sistema', public.agente_vig_lista(r #> '{morbilidad,por_sistema}', 'nombre', true),
       'por_origen', public.agente_vig_lista(public.agente_vig_objeto(r #> '{morbilidad,por_origen}')),
       'primeras_causas', public.agente_vig_causas(r #> '{morbilidad,primeras_causas}')),
    'ausentismo', jsonb_build_object(
       'reposos', r #> '{ausentismo,reposos}', 'dias_perdidos', v_comp,
       'trabajadores_ausentes', public.agente_vig_n((r #>> '{ausentismo,trabajadores_ausentes}')::numeric),
       'porcentaje', case when v_dias is not null and v_tot > 0 then round(v_comp / v_dias * 100 / v_tot, 2) end,
       'meta_porcentaje', 2.5,
       'por_causa', public.agente_vig_lista(r #> '{ausentismo,por_causa}'),
       'por_ente', public.agente_vig_lista(r #> '{ausentismo,por_ente}'),
       'por_dependencia', public.agente_vig_lista(r #> '{ausentismo,por_dependencia}'),
       'primeras_causas', public.agente_vig_causas(r #> '{ausentismo,primeras_causas}')),
    'aptitud', public.agente_vig_lista(public.agente_vig_objeto(r -> 'aptitud')),
    'referencias', jsonb_build_object('total', public.agente_vig_n((r #>> '{referencias,total}')::numeric),
       'por_especialidad', public.agente_vig_lista(r #> '{referencias,por_especialidad}')),
    'enfermedad_ocupacional', jsonb_build_object('casos', public.agente_vig_n((r #>> '{enfermedad_ocupacional,casos}')::numeric),
       'dias', r #> '{enfermedad_ocupacional,dias}'),
    'accidentes', case when ac is null then null else jsonb_build_object(
       'accidentes', ac -> 'accidentes', 'con_tiempo_perdido', ac -> 'con_tiempo_perdido', 'incidentes', ac -> 'incidentes',
       'dias_perdidos', ac -> 'dias_perdidos', 'horas_hombre', ac -> 'hht', 'declarados_a_tiempo', ac -> 'declarados_a_tiempo',
       'por_declarar', ac -> 'por_declarar') end,
    'examenes_periodicos', case when l is null then null else jsonb_build_object(
       'programados', l #> '{examenes,programados}', 'realizados', l #> '{examenes,realizados}', 'vencidos', l #> '{examenes,vencidos}',
       'por_vencer_3_meses', l #> '{examenes,por_vencer}', 'sin_evaluacion', l #> '{examenes,sin_evaluacion}') end,
    'riesgos_de_los_cargos', (select coalesce(jsonb_agg(distinct x.v), '[]'::jsonb) from public.puestos pu
        cross join lateral jsonb_each(case when jsonb_typeof(pu.riesgos) = 'object' then pu.riesgos else '{}'::jsonb end) g(k, a)
        cross join lateral jsonb_array_elements_text(case when jsonb_typeof(g.a) = 'array' then g.a else '[]'::jsonb end) x(v)
        where pu.empresa_id = per.empresa_id),
    'programas', v_prog);
end $$;

create or replace function public.agente_vig_ver_programas(p_org uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare v_emp uuid := public.agente_uuid(d, 'empresa_id');
begin
  if v_emp is null or not exists (select 1 from public.empresas e where e.id = v_emp and e.org_id = p_org) then
    perform public.agente_no('Falta «empresa_id» de una empresa de esta organización.');
  end if;
  return (select jsonb_build_object(
    '_empresa', e.id,
    'empresa', coalesce(e.nombre_comercial, e.razon_social), 'proyecto', e.proyecto, 'mes_inicio_gestion', e.mes_inicio_gestion,
    'dependencias', (select coalesce(jsonb_agg(x.nombre order by x.nombre), '[]') from public.dependencias x where x.empresa_id = e.id and x.activa),
    'cargos', (select coalesce(jsonb_agg(distinct x.nombre), '[]') from public.puestos x where x.empresa_id = e.id),
    'programas', (select coalesce(jsonb_agg(jsonb_build_object('programa_id', p.id, 'nombre', p.nombre, 'proyecto', p.proyecto,
                    'riesgo', p.riesgo, 'condiciones', p.condiciones, 'activo', p.activo,
                    'dependencias', (select coalesce(jsonb_agg(x.nombre), '[]') from public.dependencias x where x.id = any (p.dependencia_ids)),
                    'cargos', (select coalesce(jsonb_agg(x.nombre), '[]') from public.puestos x where x.id = any (p.puesto_ids)),
                    'examenes', p.examenes, 'metas', p.metas) order by p.activo desc, p.nombre), '[]')
                  from public.vigilancia_programas p where p.empresa_id = e.id),
    'propuestas_pendientes', (select count(*) from public.agentes_propuestas a where a.empresa_id = e.id and a.estado = 'pendiente'))
    from public.empresas e where e.id = v_emp);
end $$;

create or replace function public.agente_vig_ver_informe(p_org uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  per record;
  i public.informes_vigilancia;
begin
  select * into per from public.agente_vig_periodo(p_org, d);
  select * into i from public.informes_vigilancia x
   where x.org_id = p_org and x.empresa_id = per.empresa_id and x.desde = per.desde and x.hasta = per.hasta;
  return jsonb_build_object('_empresa', per.empresa_id, 'desde', per.desde, 'hasta', per.hasta, 'guardado', i.id is not null,
    'secciones', jsonb_build_object('resumen', i.resumen, 'conclusiones', i.conclusiones, 'recomendaciones_medicas', i.recomendaciones_medicas,
       'recomendaciones', i.recomendaciones, 'factores_riesgo', i.factores_riesgo, 'medidas_control', i.medidas_control),
    'analisis', coalesce(i.analisis, '{}'::jsonb),
    'ruta', '/reportes/propuestas');
end $$;

create or replace function public.agente_vig_ver_propuestas(p_org uuid, p_llave uuid, d jsonb)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('propuestas', coalesce(jsonb_agg(jsonb_build_object('propuesta_id', a.id, 'tipo', a.tipo, 'titulo', a.titulo,
           'estado', a.estado, 'creada', a.creado_en, 'resuelta', a.resuelto_en) order by a.creado_en desc), '[]'),
         'ruta', '/reportes/propuestas')
  from (select * from public.agentes_propuestas x
         where x.org_id = p_org and x.llave_id = p_llave
           and x.tipo in ('programa_vigilancia', 'ajuste_empresa', 'informe_vigilancia')
         order by x.creado_en desc limit 50) a
$$;

-- Lista de nombres (dependencias o cargos) → ids de esa empresa; un nombre que no existe detiene la acción
create or replace function public.agente_vig_ids(p_empresa uuid, d jsonb, k text, p_tabla text)
returns uuid[] language plpgsql stable set search_path = public as $$
declare
  v_nombre text;
  v_id uuid;
  v_ids uuid[] := '{}';
begin
  if d -> k is null or jsonb_typeof(d -> k) = 'null' then return '{}'; end if;
  if jsonb_typeof(d -> k) <> 'array' or jsonb_array_length(d -> k) > 60 then
    perform public.agente_no('«' || k || '» es una lista de nombres (hasta 60).');
  end if;
  for v_nombre in select btrim(x) from jsonb_array_elements_text(d -> k) x loop
    if p_tabla = 'dependencias' then
      select x.id into v_id from public.dependencias x where x.empresa_id = p_empresa and lower(btrim(x.nombre)) = lower(v_nombre) limit 1;
    else
      select x.id into v_id from public.puestos x where x.empresa_id = p_empresa and lower(btrim(x.nombre)) = lower(v_nombre) limit 1;
    end if;
    if v_id is null then
      perform public.agente_no('«' || v_nombre || '» no está en ' || case when p_tabla = 'dependencias' then 'las dependencias' else 'los cargos' end
        || ' de la empresa (ver_programas las lista). Pídele al doctor que la cree o usa un nombre de la lista.');
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return (select coalesce(array_agg(distinct x), '{}') from unnest(v_ids) x);
end $$;

create or replace function public.agente_vig_lista_json(d jsonb, k text, p_max integer, p_campos text[])
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  e jsonb;
  sal jsonb := '[]';
begin
  if d -> k is null or jsonb_typeof(d -> k) = 'null' then return '[]'; end if;
  if jsonb_typeof(d -> k) <> 'array' or jsonb_array_length(d -> k) > p_max then
    perform public.agente_no('«' || k || '» es una lista (hasta ' || p_max || ').');
  end if;
  for e in select * from jsonb_array_elements(d -> k) loop
    if jsonb_typeof(e) <> 'object' or coalesce(btrim(e ->> p_campos[1]), '') = '' then
      perform public.agente_no('Cada elemento de «' || k || '» lleva «' || p_campos[1] || '».');
    end if;
    sal := sal || jsonb_build_array((select jsonb_object_agg(c, case when c = 'cada_meses' then to_jsonb(public.agente_num(e, c, 1, 60)) else to_jsonb(public.agente_txt(e, c, 300)) end)
                                     from unnest(p_campos) c where e ? c));
  end loop;
  return sal;
end $$;

create or replace function public.agente_vig_proponer_programa(p_org uuid, p_llave public.agentes_llaves, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_emp uuid := public.agente_uuid(d, 'empresa_id');
  v_prog uuid := public.agente_uuid(d, 'programa_id');
  v_nombre text := public.agente_txt(d, 'nombre', 120);
  v_antes jsonb;
  v_prop jsonb;
  v_id uuid;
begin
  if v_emp is null or not exists (select 1 from public.empresas e where e.id = v_emp and e.org_id = p_org) then
    perform public.agente_no('Falta «empresa_id» de una empresa de esta organización.');
  end if;
  if v_nombre is null or length(v_nombre) < 3 then perform public.agente_no('Falta «nombre» del programa (por ejemplo «Conservación auditiva»).'); end if;
  if v_prog is not null then
    select to_jsonb(p) - 'org_id' - 'creado_por' - 'creado_en' - 'actualizado_en' - 'version' into v_antes
      from public.vigilancia_programas p where p.id = v_prog and p.empresa_id = v_emp;
    if v_antes is null then perform public.agente_no('Ese programa no es de esta empresa.'); end if;
  elsif exists (select 1 from public.vigilancia_programas p where p.empresa_id = v_emp and lower(p.nombre) = lower(v_nombre)) then
    perform public.agente_no('La empresa ya tiene un programa con ese nombre: para cambiarlo, manda su «programa_id» (ver_programas).');
  end if;
  v_prop := jsonb_build_object(
    'nombre', v_nombre, 'proyecto', public.agente_txt(d, 'proyecto', 300), 'riesgo', public.agente_txt(d, 'riesgo', 300),
    'condiciones', public.agente_txt(d, 'condiciones', 4000),
    'dependencia_ids', to_jsonb(public.agente_vig_ids(v_emp, d, 'dependencias', 'dependencias')),
    'puesto_ids', to_jsonb(public.agente_vig_ids(v_emp, d, 'cargos', 'puestos')),
    'dependencias', coalesce(d -> 'dependencias', '[]'), 'cargos', coalesce(d -> 'cargos', '[]'),
    'examenes', public.agente_vig_lista_json(d, 'examenes', 30, array['nombre', 'cada_meses']),
    'metas', public.agente_vig_lista_json(d, 'metas', 20, array['indicador', 'meta']));
  if p_ensayo then
    return jsonb_build_object('_empresa', v_emp, '_resumen', 'Ensayo: programa «' || v_nombre || '»', 'se_propondria', v_prop, 'antes', v_antes);
  end if;
  insert into public.agentes_propuestas (org_id, empresa_id, llave_id, llave_nombre, tipo, objeto_id, titulo, antes, propuesto, motivo)
  values (p_org, v_emp, p_llave.id, p_llave.nombre, 'programa_vigilancia', v_prog,
          case when v_prog is null then 'Programa nuevo: ' else 'Cambiar programa: ' end || v_nombre,
          v_antes, v_prop, public.agente_txt(d, 'motivo', 2000))
  returning id into v_id;
  return jsonb_build_object('_empresa', v_emp, '_resumen', 'Propuso el programa «' || v_nombre || '»',
    'propuesta_id', v_id, 'estado', 'pendiente: el doctor la aprueba en zamorApp', 'ruta', '/reportes/propuestas', 'parametros', jsonb_build_object('id', v_id));
end $$;

create or replace function public.agente_vig_proponer_ajuste(p_org uuid, p_llave public.agentes_llaves, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_emp uuid := public.agente_uuid(d, 'empresa_id');
  e public.empresas;
  v_prop jsonb := '{}';
  v_antes jsonb := '{}';
  v_id uuid;
begin
  select * into e from public.empresas x where x.id = v_emp and x.org_id = p_org;
  if e.id is null then perform public.agente_no('Falta «empresa_id» de una empresa de esta organización.'); end if;
  if d ? 'proyecto' then
    v_prop := v_prop || jsonb_build_object('proyecto', public.agente_txt(d, 'proyecto', 300));
    v_antes := v_antes || jsonb_build_object('proyecto', e.proyecto);
  end if;
  if d ? 'mes_inicio_gestion' then
    v_prop := v_prop || jsonb_build_object('mes_inicio_gestion', public.agente_num(d, 'mes_inicio_gestion', 1, 12)::int);
    v_antes := v_antes || jsonb_build_object('mes_inicio_gestion', e.mes_inicio_gestion);
  end if;
  if v_prop = '{}' then perform public.agente_no('Indica «proyecto» o «mes_inicio_gestion» (1 a 12).'); end if;
  if v_prop = v_antes then perform public.agente_no('La empresa ya tiene esos datos: no hace falta proponer nada.'); end if;
  if p_ensayo then
    return jsonb_build_object('_empresa', v_emp, '_resumen', 'Ensayo: ajuste de empresa', 'antes', v_antes, 'se_propondria', v_prop);
  end if;
  insert into public.agentes_propuestas (org_id, empresa_id, llave_id, llave_nombre, tipo, titulo, antes, propuesto, motivo)
  values (p_org, v_emp, p_llave.id, p_llave.nombre, 'ajuste_empresa', 'Ajuste de ' || coalesce(e.nombre_comercial, e.razon_social),
          v_antes, v_prop, public.agente_txt(d, 'motivo', 2000))
  returning id into v_id;
  return jsonb_build_object('_empresa', v_emp, '_resumen', 'Propuso un ajuste de la empresa', 'propuesta_id', v_id,
    'estado', 'pendiente: el doctor la aprueba en zamorApp', 'ruta', '/reportes/propuestas', 'parametros', jsonb_build_object('id', v_id));
end $$;

create or replace function public.agente_vig_redactar(p_org uuid, p_llave public.agentes_llaves, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  per record;
  v_sec jsonb := '{}';
  v_an jsonb := '{}';
  k text;
  v jsonb;
  v_id uuid;
begin
  select * into per from public.agente_vig_periodo(p_org, d);
  if jsonb_typeof(d -> 'secciones') = 'object' then
    for k, v in select * from jsonb_each(d -> 'secciones') loop
      if not public.propuesta_seccion_valida(k) then
        perform public.agente_no('Sección desconocida «' || k || '». Las que hay: resumen, conclusiones, recomendaciones_medicas, recomendaciones, factores_riesgo, medidas_control.');
      end if;
      if jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) = 0 then continue; end if;
      if length(v #>> '{}') > 8000 then perform public.agente_no('La sección «' || k || '» pasa de 8000 letras.'); end if;
      v_sec := v_sec || jsonb_build_object(k, btrim(v #>> '{}'));
    end loop;
  end if;
  if jsonb_typeof(d -> 'analisis') = 'object' then
    for k, v in select * from jsonb_each(d -> 'analisis') loop
      if k !~ '^[a-z][a-z0-9_]{1,40}$' then perform public.agente_no('Clave de análisis no válida «' || k || '».'); end if;
      if jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) = 0 then continue; end if;
      if length(v #>> '{}') > 4000 then perform public.agente_no('El análisis «' || k || '» pasa de 4000 letras.'); end if;
      v_an := v_an || jsonb_build_object(k, btrim(v #>> '{}'));
    end loop;
    if (select count(*) from jsonb_object_keys(v_an)) > 80 then perform public.agente_no('Demasiados análisis (máximo 80).'); end if;
  end if;
  if v_sec = '{}' and v_an = '{}' then
    perform public.agente_no('Manda al menos una sección en «secciones» o un análisis en «analisis».');
  end if;
  if p_ensayo then
    return jsonb_build_object('_empresa', per.empresa_id, '_resumen', 'Ensayo: borrador de informe',
      'secciones', (select coalesce(jsonb_agg(x), '[]') from jsonb_object_keys(v_sec) x),
      'analisis', (select coalesce(jsonb_agg(x), '[]') from jsonb_object_keys(v_an) x));
  end if;
  insert into public.agentes_propuestas (org_id, empresa_id, llave_id, llave_nombre, tipo, titulo, propuesto, motivo)
  values (p_org, per.empresa_id, p_llave.id, p_llave.nombre, 'informe_vigilancia',
          'Borrador del informe de vigilancia del ' || to_char(per.desde, 'DD/MM/YYYY') || ' al ' || to_char(per.hasta, 'DD/MM/YYYY'),
          jsonb_build_object('desde', per.desde, 'hasta', per.hasta, 'secciones', v_sec, 'analisis', v_an),
          public.agente_txt(d, 'motivo', 2000))
  returning id into v_id;
  return jsonb_build_object('_empresa', per.empresa_id, '_resumen', 'Dejó un borrador del informe de vigilancia', 'propuesta_id', v_id,
    'estado', 'pendiente: el doctor lo revisa sección por sección en zamorApp', 'ruta', '/reportes/propuestas', 'parametros', jsonb_build_object('id', v_id));
end $$;

-- Nadie las llama desde fuera
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'agente\_vig\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ===== 5. La entrada de vigilancia para agentes =====
create or replace function public.puerta_vigilancia(p_llave text, p_accion text, p_datos jsonb default '{}'::jsonb, p_ensayo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k public.agentes_llaves;
  d jsonb := case when jsonb_typeof(p_datos) = 'object' then p_datos else '{}'::jsonb end;
  v_acc text := lower(btrim(coalesce(p_accion, '')));
  v_ensayo boolean := coalesce(p_ensayo, false);
  v_escribe boolean;
  v_res jsonb;
  v_err text;
  v_det text;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_rol text := current_setting('request.jwt.claim.role', true);
begin
  if public.es_base_local() then
    return jsonb_build_object('ok', false, 'error', 'La puerta para agentes vive en la nube (necesita internet).');
  end if;
  if p_llave is null or length(p_llave) not between 20 and 200 then
    return jsonb_build_object('ok', false, 'error', 'Falta la llave.');
  end if;
  select * into k from public.agentes_llaves where huella = encode(sha256(convert_to(p_llave, 'UTF8')), 'hex');
  if not found or k.revocada_en is not null or k.vence_en <= public.ahora() then
    return jsonb_build_object('ok', false, 'error', 'Llave no válida, vencida o apagada. El doctor crea otra en Configuración > Puerta para agentes.');
  end if;
  if not exists (select 1 from public.miembros m
                  where m.org_id = k.org_id and m.usuario_id = k.creada_por and m.activo
                    and m.rol = 'administrador' and m.empresas_permitidas is null) then
    return jsonb_build_object('ok', false, 'error', 'Quien creó esta llave ya no administra la organización.');
  end if;
  if length(d::text) > 100000 then
    return jsonb_build_object('ok', false, 'error', 'Los datos son demasiado grandes.');
  end if;
  if (select count(*) from public.agentes_registro r where r.llave_id = k.id and r.en > public.ahora() - interval '1 minute') >= 120 then
    return jsonb_build_object('ok', false, 'error', 'Demasiadas llamadas seguidas. Espera un minuto.');
  end if;

  v_escribe := case
    when v_acc in ('vigilancia_cifras', 'ver_programas', 'ver_informe', 'ver_propuestas') then false
    when v_acc in ('proponer_programa', 'proponer_ajuste_empresa', 'redactar_informe') then true
  end;
  if v_escribe is null then
    v_err := 'Acción desconocida. Las de vigilancia: vigilancia_cifras, ver_programas, ver_informe, ver_propuestas, proponer_programa, proponer_ajuste_empresa, redactar_informe.';
  elsif not k.vigilancia then
    v_err := 'Esta llave no tiene la casilla «Vigilancia y reportes». El doctor la enciende en Configuración > Puerta para agentes.';
  else
    perform set_config('request.jwt.claims', jsonb_build_object('sub', k.creada_por, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', k.creada_por::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      v_res := case v_acc
        when 'vigilancia_cifras' then public.agente_vig_cifras(k.org_id, d)
        when 'ver_programas' then public.agente_vig_ver_programas(k.org_id, d)
        when 'ver_informe' then public.agente_vig_ver_informe(k.org_id, d)
        when 'ver_propuestas' then public.agente_vig_ver_propuestas(k.org_id, k.id, d)
        when 'proponer_programa' then public.agente_vig_proponer_programa(k.org_id, k, d, v_ensayo)
        when 'proponer_ajuste_empresa' then public.agente_vig_proponer_ajuste(k.org_id, k, d, v_ensayo)
        when 'redactar_informe' then public.agente_vig_redactar(k.org_id, k, d, v_ensayo)
      end;
    exception
      when sqlstate 'ZA400' then v_err := sqlerrm;
      when others then
        get stacked diagnostics v_det = message_text;
        v_err := 'No se pudo completar (' || sqlstate || '). No se guardó nada de esta acción.';
    end;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(v_rol, ''), true);
  end if;

  update public.agentes_llaves set ultimo_uso_en = public.ahora(), usos = usos + 1 where id = k.id;
  insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ensayo, ok, empresa_id, resumen, error)
  values (k.org_id, k.id, k.nombre, left(v_acc, 40), v_ensayo and coalesce(v_escribe, false), v_err is null,
          case when v_res ->> '_empresa' is not null
                and exists (select 1 from public.empresas e where e.id = (v_res ->> '_empresa')::uuid and e.org_id = k.org_id)
               then (v_res ->> '_empresa')::uuid end,
          left(coalesce(v_res ->> '_resumen', case when v_err is null then 'Consulta de vigilancia' end), 300),
          left(coalesce(v_det, v_err), 500));
  if v_err is not null then
    return jsonb_build_object('ok', false, 'accion', v_acc, 'error', v_err);
  end if;
  return jsonb_build_object('ok', true, 'accion', v_acc, 'ensayo', v_ensayo and v_escribe, 'resultado', v_res - '_empresa' - '_resumen');
end $$;
comment on function public.puerta_vigilancia(text, text, jsonb, boolean) is
  'Puerta para agentes, vigilancia: lee totales y PROPONE (programa, ajuste, borrador de informe). La ejecuta un anónimo A PROPÓSITO (la llave es la credencial), como public.agente (20261030960000).';
revoke execute on function public.puerta_vigilancia(text, text, jsonb, boolean) from public;
grant execute on function public.puerta_vigilancia(text, text, jsonb, boolean) to anon, authenticated;

-- ===== 6. Autolimpieza: las propuestas se van a los 30 días (lo aprobado ya quedó en su tabla y en la bitácora) =====
insert into public.limpieza_plazos (clave, dias, minimo, maximo) values ('agentes_propuestas', 30, 7, 365)
on conflict (clave) do nothing;

do $$
declare
  v_def text := replace(pg_get_functiondef('public.limpieza_correr(boolean)'::regprocedure), chr(13), '');
  v_viejo text := 'clave := ''registros_respaldo''; cantidad := n; bytes := b; return next;';
begin
  -- Repetir la migración no la suma dos veces
  if position('clave := ''agentes_propuestas''' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'limpieza_correr cambió: revisar 20261030960000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_viejo || '

  -- Propuestas de agentes (20261030960000): pendientes sin revisar, descartadas y aprobadas, a los 30 días
  select count(*), coalesce(sum(pg_column_size(x.*)), 0) into n, b from public.agentes_propuestas x
   where x.creado_en < public.ahora() - public.limpieza_dias(''agentes_propuestas'');
  if p_borrar then
    delete from public.agentes_propuestas x where x.creado_en < public.ahora() - public.limpieza_dias(''agentes_propuestas'');
    get diagnostics n = row_count;
  end if;
  clave := ''agentes_propuestas''; cantidad := n; bytes := b; return next;');
end $$;
