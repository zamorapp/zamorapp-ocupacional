-- Puerta para agentes (Cesar, 13-nov-2026): «¿De qué manera puede operar Claude directamente… cuando yo decida o
-- cualquier agente?». Hoy un agente no pudo crear una empresa, su perfil, el presupuesto, el trabajador y la cita;
-- hubo que pegar un .sql a mano. Esta migración da una entrada ÚNICA y estrecha para agentes (Claude, ChatGPT,
-- Gemini u otros), apagada por defecto:
-- 1. agentes_llaves: llaves que crea y apaga el administrador. La base guarda solo la huella (SHA-256); la llave se
--    ve una vez. Vencen (30 días por defecto, 90 como máximo). Permiso «consultar» o «crear».
-- 2. agentes_registro: una línea por cada llamada (qué llave, qué acción, si fue ensayo, en qué empresa, resultado).
--    Sin datos de salud. Se autolimpia (limpieza «agentes_registro»).
-- 3. public.agente(llave, acción, datos, ensayo): lo único que ve un agente. Es una lista cerrada de acciones:
--    consultar (resumen, empresas, trabajadores, catálogo, citas, presupuestos, enlaces) y crear (empresa con sus
--    dependencias, servicio, perfil de exámenes, presupuesto en borrador, trabajador, cita).
-- Lo que NO hace, por construcción: no lee ni escribe el esquema clinico (historias, diagnósticos, aptitudes,
-- reposos), ni grupo sanguíneo ni discapacidad, ni firma ni sello; no borra ni modifica filas que ya existen; no
-- sale de la organización de la llave; no mueve una cédula que ya está en otra empresa (se detiene y avisa).
-- Permisos: la llave actúa como el administrador que la creó (auth.uid() = él durante la llamada, así la bitácora
-- y los disparadores lo registran igual que si lo hiciera a mano) y deja de servir si él deja de ser administrador.
-- La función es SECURITY DEFINER: por eso cada acción filtra por org_id a mano y solo toca las tablas listadas.
-- En la PC (base local) las tablas quedan vacías: la puerta vive en la nube y lo creado baja por la sincronía.

-- ===== 1. Llaves =====
create table if not exists public.agentes_llaves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 2 and 60),
  huella text not null unique check (huella ~ '^[0-9a-f]{64}$'),
  final text not null check (length(final) = 4),
  permiso text not null check (permiso in ('consultar', 'crear')),
  creada_por uuid not null,
  creada_en timestamptz not null default public.ahora(),
  vence_en timestamptz not null,
  revocada_en timestamptz,
  ultimo_uso_en timestamptz,
  usos integer not null default 0
);
comment on table public.agentes_llaves is
  'Llaves de la puerta para agentes. Solo la huella SHA-256; nadie las lee directo (RLS sin políticas): se entra por las funciones (20261030938000).';
create index if not exists agentes_llaves_org on public.agentes_llaves (org_id, creada_en desc);
alter table public.agentes_llaves enable row level security;
revoke all on public.agentes_llaves from anon, authenticated;

-- ===== 2. Registro =====
create table if not exists public.agentes_registro (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizaciones(id) on delete cascade,
  llave_id uuid references public.agentes_llaves(id) on delete set null,
  llave_nombre text not null,
  en timestamptz not null default public.ahora(),
  accion text not null,
  ensayo boolean not null default false,
  ok boolean not null,
  empresa_id uuid references public.empresas(id) on delete set null,
  resumen text,
  error text
);
comment on table public.agentes_registro is
  'Una línea por cada llamada de un agente. Sin datos de salud. Nadie la lee directo: se ve con agentes_estado (20261030938000).';
create index if not exists agentes_registro_org on public.agentes_registro (org_id, en desc);
create index if not exists agentes_registro_llave on public.agentes_registro (llave_id, en desc);
alter table public.agentes_registro enable row level security;
revoke all on public.agentes_registro from anon, authenticated;

-- ===== 3. Crear, apagar y ver (solo el administrador, desde Configuración > Puerta para agentes) =====
create or replace function public.agentes_soy_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros m
                  where m.org_id = p_org and m.usuario_id = auth.uid() and m.activo
                    and m.rol = 'administrador' and m.empresas_permitidas is null)
$$;
revoke execute on function public.agentes_soy_admin(uuid) from public, anon, authenticated;

create or replace function public.crear_llave_agente(p_org uuid, p_nombre text, p_permiso text, p_dias integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 60);
  v_llave text;
  v_id uuid;
  v_vence timestamptz;
begin
  if public.es_base_local() then
    raise exception 'La puerta para agentes se enciende con internet.' using errcode = 'P0001';
  end if;
  if not public.agentes_soy_admin(p_org) then
    raise exception 'Solo el administrador crea llaves para agentes.' using errcode = '42501';
  end if;
  if length(v_nombre) < 2 then raise exception 'Escribe un nombre para la llave (por ejemplo «Claude»).' using errcode = 'P0001'; end if;
  if p_permiso is null or p_permiso not in ('consultar', 'crear') then raise exception 'Permiso no válido.' using errcode = 'P0001'; end if;
  if p_dias is null or p_dias not between 1 and 90 then raise exception 'La llave dura entre 1 y 90 días.' using errcode = 'P0001'; end if;
  if (select count(*) from public.agentes_llaves l
       where l.org_id = p_org and l.revocada_en is null and l.vence_en > public.ahora()) >= 10 then
    raise exception 'Ya hay 10 llaves encendidas. Apaga una antes de crear otra.' using errcode = 'P0001';
  end if;
  -- 244 bits al azar (dos UUID v4), sin depender de pgcrypto
  v_llave := 'zk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_vence := public.ahora() + make_interval(days => p_dias);
  insert into public.agentes_llaves (org_id, nombre, huella, final, permiso, creada_por, vence_en)
  values (p_org, v_nombre, encode(sha256(convert_to(v_llave, 'UTF8')), 'hex'), right(v_llave, 4), p_permiso, auth.uid(), v_vence)
  returning id into v_id;
  insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ok, resumen)
  values (p_org, v_id, v_nombre, 'llave_creada', true,
          'Llave creada (' || case p_permiso when 'crear' then 'consulta y crea' else 'solo consulta' end || ', ' || p_dias || ' días)');
  return jsonb_build_object('id', v_id, 'llave', v_llave, 'vence_en', v_vence);
end $$;
revoke execute on function public.crear_llave_agente(uuid, text, text, integer) from public, anon;
grant execute on function public.crear_llave_agente(uuid, text, text, integer) to authenticated;

create or replace function public.revocar_llave_agente(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare k public.agentes_llaves;
begin
  select * into k from public.agentes_llaves where id = p_id;
  if not found or not public.agentes_soy_admin(k.org_id) then
    raise exception 'Solo el administrador apaga llaves.' using errcode = '42501';
  end if;
  if k.revocada_en is not null then return false; end if;
  update public.agentes_llaves set revocada_en = public.ahora() where id = p_id;
  insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ok, resumen)
  values (k.org_id, k.id, k.nombre, 'llave_apagada', true, 'Llave apagada');
  return true;
end $$;
revoke execute on function public.revocar_llave_agente(uuid) from public, anon;
grant execute on function public.revocar_llave_agente(uuid) to authenticated;

-- Lo que muestra la pantalla: llaves (sin huella) y el registro entre dos fechas (Caracas)
create or replace function public.agentes_estado(p_org uuid, p_desde date default null, p_hasta date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_hasta date := coalesce(p_hasta, public.hoy_caracas());
  v_desde date := coalesce(p_desde, coalesce(p_hasta, public.hoy_caracas()) - 30);
begin
  if not public.agentes_soy_admin(p_org) then
    raise exception 'Solo el administrador ve la puerta para agentes.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'local', public.es_base_local(),
    'desde', v_desde, 'hasta', v_hasta,
    'llaves', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', l.id, 'nombre', l.nombre, 'final', l.final, 'permiso', l.permiso, 'creada_en', l.creada_en,
                 'vence_en', l.vence_en, 'revocada_en', l.revocada_en, 'ultimo_uso_en', l.ultimo_uso_en, 'usos', l.usos,
                 'encendida', l.revocada_en is null and l.vence_en > public.ahora()) order by l.creada_en desc), '[]'::jsonb)
               from public.agentes_llaves l where l.org_id = p_org),
    'registro', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', r.id, 'en', r.en, 'llave', r.llave_nombre, 'accion', r.accion, 'ensayo', r.ensayo, 'ok', r.ok,
                   'empresa', e.razon_social, 'resumen', r.resumen, 'error', r.error) order by r.en desc, r.id desc), '[]'::jsonb)
                 from (select * from public.agentes_registro x
                        where x.org_id = p_org
                          and x.en >= (v_desde::timestamp at time zone 'America/Caracas')
                          and x.en < ((v_hasta + 1)::timestamp at time zone 'America/Caracas')
                        order by x.en desc, x.id desc limit 500) r
                 left join public.empresas e on e.id = r.empresa_id),
    'total', (select count(*) from public.agentes_registro x
               where x.org_id = p_org
                 and x.en >= (v_desde::timestamp at time zone 'America/Caracas')
                 and x.en < ((v_hasta + 1)::timestamp at time zone 'America/Caracas')));
end $$;
revoke execute on function public.agentes_estado(uuid, date, date) from public, anon;
grant execute on function public.agentes_estado(uuid, date, date) to authenticated;

-- ===== 4. Ayudas de las acciones (nadie las llama desde fuera) =====
-- Un rechazo explicable al agente: SQLSTATE ZA400. Cualquier otro error se le devuelve sin detalle.
create or replace function public.agente_no(p_mensaje text)
returns void language plpgsql immutable set search_path = public as $$
begin
  raise exception '%', p_mensaje using errcode = 'ZA400';
end $$;

create or replace function public.agente_txt(d jsonb, k text, p_max integer)
returns text language sql immutable set search_path = public as $$
  select case when jsonb_typeof(d -> k) in ('string', 'number') then nullif(left(btrim(d ->> k), p_max), '') end
$$;

create or replace function public.agente_uuid(d jsonb, k text)
returns uuid language plpgsql immutable set search_path = public as $$
begin
  if coalesce(d ->> k, '') = '' then return null; end if;
  return (d ->> k)::uuid;
exception when others then
  perform public.agente_no('«' || k || '» no es un identificador válido.');
  return null;
end $$;

create or replace function public.agente_fecha(d jsonb, k text)
returns date language plpgsql immutable set search_path = public as $$
begin
  if coalesce(d ->> k, '') = '' then return null; end if;
  if d ->> k !~ '^\d{4}-\d{2}-\d{2}$' then perform public.agente_no('«' || k || '» debe ser una fecha AAAA-MM-DD.'); end if;
  return (d ->> k)::date;
exception when sqlstate 'ZA400' then raise;
  when others then
    perform public.agente_no('«' || k || '» no es una fecha válida.');
    return null;
end $$;

create or replace function public.agente_num(d jsonb, k text, p_min numeric, p_max numeric)
returns numeric language plpgsql immutable set search_path = public as $$
declare v numeric;
begin
  if coalesce(d ->> k, '') = '' then return null; end if;
  begin v := (d ->> k)::numeric; exception when others then perform public.agente_no('«' || k || '» debe ser un número.'); end;
  if v < p_min or v > p_max then perform public.agente_no('«' || k || '» debe estar entre ' || p_min || ' y ' || p_max || '.'); end if;
  return v;
end $$;

-- Textos de un arreglo JSON: recortados, sin vacíos ni repetidos (sin distinguir mayúsculas), en su orden
create or replace function public.agente_textos(p jsonb, p_max_items integer, p_max_largo integer)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(t order by n), '{}')
    from (select distinct on (lower(left(btrim(x.v), p_max_largo))) left(btrim(x.v), p_max_largo) t, x.n
            from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality x(v, n)
           where btrim(x.v) <> '' and x.n <= p_max_items
           order by lower(left(btrim(x.v), p_max_largo)), x.n) s
$$;

create or replace function public.agente_rif(p text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- La empresa pedida, solo si es de la organización de la llave
create or replace function public.agente_empresa(o uuid, d jsonb, k text default 'empresa_id')
returns public.empresas language plpgsql stable set search_path = public as $$
declare e public.empresas; v_id uuid := public.agente_uuid(d, k);
begin
  if v_id is null then perform public.agente_no('Falta «' || k || '». Búscala con la acción buscar_empresas.'); end if;
  select * into e from public.empresas where id = v_id and org_id = o;
  if not found then perform public.agente_no('No encuentro esa empresa en esta organización.'); end if;
  return e;
end $$;

-- ===== 5. Consultas =====
create or replace function public.agente_resumen(o uuid)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'organizacion', (select nombre from public.organizaciones where id = o),
    'hoy', public.hoy_caracas(),
    'empresas_activas', (select count(*) from public.empresas where org_id = o and activa and not es_particular),
    'trabajadores_activos', (select count(*) from public.trabajadores where org_id = o and estado in ('activo', 'aspirante', 'reposo')),
    'citas_proximos_7_dias', (select count(*) from public.citas where org_id = o and estado <> 'cancelada'
                               and fecha between public.hoy_caracas() and public.hoy_caracas() + 7),
    'presupuestos_en_borrador', (select count(*) from public.cobros where org_id = o and tipo = 'presupuesto' and estado = 'borrador'))
$$;

create or replace function public.agente_buscar_empresas(o uuid, d jsonb)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('empresas', coalesce(jsonb_agg(jsonb_build_object(
           'empresa_id', e.id, 'razon_social', e.razon_social, 'nombre_comercial', e.nombre_comercial, 'rif', e.rif,
           'activa', e.activa, 'particulares', e.es_particular,
           'trabajadores', (select count(*) from public.trabajadores t where t.empresa_id = e.id and t.estado <> 'egresado'))
           order by e.razon_social), '[]'::jsonb))
    from (select * from public.empresas e
           where e.org_id = o
             and (public.agente_txt(d, 'texto', 80) is null
                  or e.razon_social ilike '%' || replace(replace(public.agente_txt(d, 'texto', 80), '%', '\%'), '_', '\_') || '%'
                  or coalesce(e.nombre_comercial, '') ilike '%' || replace(replace(public.agente_txt(d, 'texto', 80), '%', '\%'), '_', '\_') || '%'
                  or (public.agente_rif(public.agente_txt(d, 'texto', 80)) <> ''
                      and public.agente_rif(e.rif) like '%' || public.agente_rif(public.agente_txt(d, 'texto', 80)) || '%'))
           order by e.razon_social limit 50) e
$$;

create or replace function public.agente_ver_empresa(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare e public.empresas;
begin
  if public.agente_uuid(d, 'empresa_id') is not null then
    e := public.agente_empresa(o, d);
  elsif public.agente_rif(d ->> 'rif') <> '' then
    select * into e from public.empresas where org_id = o and public.agente_rif(rif) = public.agente_rif(d ->> 'rif') limit 1;
    if not found then perform public.agente_no('No hay una empresa con ese RIF.'); end if;
  else
    perform public.agente_no('Indica «empresa_id» o «rif».');
  end if;
  return jsonb_build_object(
    'empresa_id', e.id, 'razon_social', e.razon_social, 'nombre_comercial', e.nombre_comercial, 'rif', e.rif,
    'estado', e.estado, 'municipio', e.municipio, 'parroquia', e.parroquia, 'direccion', e.direccion,
    'telefono', e.telefono, 'correo', e.correo, 'actividad_economica', e.actividad_economica, 'activa', e.activa,
    'dependencias', (select coalesce(jsonb_agg(jsonb_build_object('dependencia_id', x.id, 'nombre', x.nombre) order by x.nombre), '[]'::jsonb)
                       from public.dependencias x where x.empresa_id = e.id and x.activa),
    'trabajadores', (select count(*) from public.trabajadores t where t.empresa_id = e.id and t.estado <> 'egresado'),
    '_empresa', e.id);
end $$;

-- Solo identificación y ubicación laboral: nunca grupo sanguíneo, discapacidad ni nada clínico
create or replace function public.agente_buscar_trabajadores(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_txt text := replace(replace(public.agente_txt(d, 'texto', 80), '%', '\%'), '_', '\_');
  v_ced text := regexp_replace(coalesce(d ->> 'cedula', ''), '\D', '', 'g');
  v_emp uuid := public.agente_uuid(d, 'empresa_id');
begin
  if v_txt is null and v_ced = '' and v_emp is null then
    perform public.agente_no('Indica «texto» (nombre o apellido), «cedula» o «empresa_id».');
  end if;
  return jsonb_build_object('trabajadores', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'trabajador_id', t.id, 'cedula', t.cedula, 'nombres', t.nombres, 'apellidos', t.apellidos,
             'numero_historia', t.numero_historia, 'estado', t.estado, 'empresa_id', t.empresa_id,
             'empresa', t.razon_social, 'dependencia', t.dependencia) order by t.apellidos, t.nombres), '[]'::jsonb)
      from (select t.*, e.razon_social, x.nombre as dependencia
              from public.trabajadores t
              join public.empresas e on e.id = t.empresa_id
              left join public.dependencias x on x.id = t.dependencia_id
             where t.org_id = o
               and (v_emp is null or t.empresa_id = v_emp)
               and (v_ced = '' or regexp_replace(t.cedula, '\D', '', 'g') = v_ced)
               and (v_txt is null or (t.nombres || ' ' || t.apellidos) ilike '%' || v_txt || '%'
                    or (t.apellidos || ' ' || t.nombres) ilike '%' || v_txt || '%')
             order by t.apellidos, t.nombres limit 50) t),
    '_empresa', v_emp);
end $$;

create or replace function public.agente_catalogo(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_tipo text := lower(coalesce(public.agente_txt(d, 'tipo', 20), ''));
  v_txt text := replace(replace(public.agente_txt(d, 'texto', 80), '%', '\%'), '_', '\_');
begin
  if v_tipo = 'servicios' then
    return jsonb_build_object('servicios', (
      select coalesce(jsonb_agg(jsonb_build_object('servicio_id', s.id, 'nombre', s.nombre, 'categoria', s.categoria,
               'unidad', s.unidad, 'precio_usd', s.precio_usd) order by s.orden, s.nombre), '[]'::jsonb)
        from public.servicios s where s.org_id = o and s.activo and (v_txt is null or s.nombre ilike '%' || v_txt || '%')));
  elsif v_tipo = 'perfiles' then
    return jsonb_build_object('perfiles', (
      select coalesce(jsonb_agg(jsonb_build_object('perfil_id', i.id, 'nombre', i.nombre, 'codigo', i.codigo,
               'examenes', to_jsonb(string_to_array(coalesce(i.texto, ''), E'\n')),
               'empresa_ids', coalesce(i.datos -> 'empresas', '[]'::jsonb),
               'motivo_ids', coalesce(i.datos -> 'motivos', '[]'::jsonb)) order by i.orden, i.nombre), '[]'::jsonb)
        from public.lista_items i
       where i.lista = 'grupo_paraclinicos' and i.activo and i.org_id = o and (v_txt is null or i.nombre ilike '%' || v_txt || '%')));
  elsif v_tipo = 'motivos' then
    return jsonb_build_object('motivos', (
      select coalesce(jsonb_agg(jsonb_build_object('motivo_id', i.id, 'nombre', i.nombre, 'codigo', i.codigo) order by i.orden, i.nombre), '[]'::jsonb)
        from public.lista_items i
       where i.lista = 'motivo_consulta' and i.activo and (i.org_id = o or i.org_id is null)
         and (v_txt is null or i.nombre ilike '%' || v_txt || '%')));
  elsif v_tipo = 'examenes' then
    return jsonb_build_object('examenes', (
      select coalesce(jsonb_agg(x.nombre order by x.nombre), '[]'::jsonb)
        from (select distinct i.nombre from public.lista_items i
               where i.lista = 'paraclinico' and i.activo and (i.org_id = o or i.org_id is null)
                 and (v_txt is null or i.nombre ilike '%' || v_txt || '%')
               order by i.nombre limit 300) x));
  end if;
  perform public.agente_no('«tipo» debe ser servicios, perfiles, motivos o examenes.');
  return null;
end $$;

create or replace function public.agente_listar_citas(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_desde date := coalesce(public.agente_fecha(d, 'desde'), public.hoy_caracas());
  v_hasta date := coalesce(public.agente_fecha(d, 'hasta'), coalesce(public.agente_fecha(d, 'desde'), public.hoy_caracas()) + 7);
  v_emp uuid := public.agente_uuid(d, 'empresa_id');
begin
  if v_hasta < v_desde or v_hasta - v_desde > 92 then perform public.agente_no('El rango de fechas va de 1 a 92 días.'); end if;
  return jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'citas', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'cita_id', c.id, 'fecha', c.fecha, 'hora', to_char(c.hora, 'HH24:MI'), 'estado', c.estado,
             'trabajador_id', c.trabajador_id, 'trabajador', c.trabajador, 'cedula', c.cedula,
             'empresa_id', c.empresa_id, 'empresa', c.razon_social, 'motivo', c.motivo) order by c.fecha, c.hora nulls last), '[]'::jsonb)
      from (select c.*, t.nombres || ' ' || t.apellidos as trabajador, t.cedula, e.razon_social, i.nombre as motivo
              from public.citas c
              join public.trabajadores t on t.id = c.trabajador_id
              join public.empresas e on e.id = c.empresa_id
              left join public.lista_items i on i.id = c.motivo_id
             where c.org_id = o and c.fecha between v_desde and v_hasta and (v_emp is null or c.empresa_id = v_emp)
             order by c.fecha, c.hora nulls last limit 300) c),
    '_empresa', v_emp);
end $$;

create or replace function public.agente_presupuesto_json(c public.cobros)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'presupuesto_id', c.id, 'numero', c.numero, 'fecha', c.fecha, 'vence', c.vence, 'estado', c.estado,
    'empresa_id', c.empresa_id, 'empresa', (select razon_social from public.empresas where id = c.empresa_id),
    'observacion', c.observacion,
    'total_usd', (select coalesce(sum(round(i.cantidad * i.precio_usd, 2)), 0) from public.cobro_items i where i.cobro_id = c.id),
    'renglones', (select coalesce(jsonb_agg(jsonb_build_object('descripcion', i.descripcion, 'detalle', i.detalle,
                    'cantidad', i.cantidad, 'precio_usd', i.precio_usd, 'servicio_id', i.servicio_id) order by i.orden), '[]'::jsonb)
                    from public.cobro_items i where i.cobro_id = c.id),
    'ruta', '/imprimir/cobro/' || c.id)
$$;

create or replace function public.agente_listar_presupuestos(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_emp uuid := public.agente_uuid(d, 'empresa_id');
  v_id uuid := public.agente_uuid(d, 'presupuesto_id');
  v_desde date := public.agente_fecha(d, 'desde');
  v_hasta date := public.agente_fecha(d, 'hasta');
begin
  return jsonb_build_object('presupuestos', (
    select coalesce(jsonb_agg(public.agente_presupuesto_json(c) order by c.fecha desc, c.numero desc), '[]'::jsonb)
      from (select * from public.cobros c
             where c.org_id = o and c.tipo = 'presupuesto'
               and (v_id is null or c.id = v_id) and (v_emp is null or c.empresa_id = v_emp)
               and (v_desde is null or c.fecha >= v_desde) and (v_hasta is null or c.fecha <= v_hasta)
             order by c.fecha desc, c.numero desc limit 50) c),
    '_empresa', v_emp);
end $$;

-- Enlaces para que Cesar abra (piden su sesión): el presupuesto y las órdenes de un perfil. La web arma la dirección.
create or replace function public.agente_enlaces(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_pre uuid := public.agente_uuid(d, 'presupuesto_id');
  v_perfil uuid := public.agente_uuid(d, 'perfil_id');
  v_trab uuid := public.agente_uuid(d, 'trabajador_id');
  v_emp uuid;
  v_nombre text;
  r jsonb := '{}'::jsonb;
begin
  if v_pre is null and v_perfil is null then perform public.agente_no('Indica «presupuesto_id», o «perfil_id» con «trabajador_id».'); end if;
  if v_pre is not null then
    select empresa_id into v_emp from public.cobros where id = v_pre and org_id = o;
    if not found then perform public.agente_no('No encuentro ese presupuesto.'); end if;
    r := r || jsonb_build_object('presupuesto', jsonb_build_object('ruta', '/imprimir/cobro/' || v_pre));
  end if;
  if v_perfil is not null then
    if not exists (select 1 from public.lista_items where id = v_perfil and org_id = o and lista = 'grupo_paraclinicos') then
      perform public.agente_no('No encuentro ese perfil de exámenes.');
    end if;
    if v_trab is null then perform public.agente_no('Para las órdenes indica también «trabajador_id».'); end if;
    select t.empresa_id, t.nombres || ' ' || t.apellidos into v_emp, v_nombre from public.trabajadores t where t.id = v_trab and t.org_id = o;
    if not found then perform public.agente_no('No encuentro ese trabajador.'); end if;
    r := r || jsonb_build_object('ordenes', jsonb_build_object('ruta', '/imprimir/registro-previa',
           'parametros', jsonb_strip_nulls(jsonb_build_object('nombre', v_nombre, 'empresa', v_emp, 'perfil', v_perfil,
                           'rec', public.agente_txt(d, 'recomendaciones', 2500)))));
  end if;
  return r || jsonb_build_object('nota', 'Estos enlaces los abre el doctor con su sesión iniciada; la firma y el sello los decide él al imprimir.',
                                 '_empresa', v_emp);
end $$;

-- ===== 6. Acciones que crean (nunca modifican ni borran lo que existe; repetir la misma orden no duplica) =====
create or replace function public.agente_crear_empresa(o uuid, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_rif text := public.agente_rif(d ->> 'rif');
  v_rif_bonito text;
  v_nombre text := public.agente_txt(d, 'razon_social', 200);
  v_deps text[] := public.agente_textos(d -> 'dependencias', 40, 120);
  v_nuevas text[];
  e public.empresas;
  v_existia boolean;
begin
  if v_rif !~ '^[JGVEPC][0-9]{7,9}$' then perform public.agente_no('RIF no válido. Ejemplo: J-12345678-9.'); end if;
  v_rif_bonito := left(v_rif, 1) || '-' || case when length(v_rif) = 10 then substr(v_rif, 2, 8) || '-' || right(v_rif, 1) else substr(v_rif, 2) end;
  select * into e from public.empresas where org_id = o and public.agente_rif(rif) = v_rif limit 1;
  v_existia := found;
  if not v_existia and v_nombre is null then perform public.agente_no('Falta «razon_social».'); end if;
  select coalesce(array_agg(x order by n), '{}') into v_nuevas from unnest(v_deps) with ordinality u(x, n)
   where not v_existia or not exists (select 1 from public.dependencias y where y.empresa_id = e.id and lower(btrim(y.nombre)) = lower(x));
  if p_ensayo then
    return jsonb_build_object('empresa', case when v_existia then 'Ya existe: ' || e.razon_social || ' (no se cambia)' else 'Se crearía: ' || v_nombre || ' · ' || v_rif_bonito end,
      'empresa_id', e.id, 'ya_existia', v_existia, 'dependencias_que_se_crearian', to_jsonb(v_nuevas), '_empresa', e.id,
      '_resumen', case when v_existia then 'Empresa ya existe' else 'Crearía la empresa ' || v_nombre end || ' · ' || cardinality(v_nuevas) || ' dependencias nuevas');
  end if;
  if not v_existia then
    insert into public.empresas (org_id, razon_social, nombre_comercial, rif, estado, municipio, parroquia, direccion, telefono, correo, actividad_economica)
    values (o, v_nombre, public.agente_txt(d, 'nombre_comercial', 200), v_rif_bonito, public.agente_txt(d, 'estado', 60),
            public.agente_txt(d, 'municipio', 80), public.agente_txt(d, 'parroquia', 80), public.agente_txt(d, 'direccion', 400),
            public.agente_txt(d, 'telefono', 60), public.agente_txt(d, 'correo', 120), public.agente_txt(d, 'actividad_economica', 200))
    returning * into e;
  end if;
  insert into public.dependencias (org_id, empresa_id, nombre) select o, e.id, x from unnest(v_nuevas) x;
  return jsonb_build_object('empresa_id', e.id, 'razon_social', e.razon_social, 'rif', e.rif, 'ya_existia', v_existia,
    'dependencias_creadas', to_jsonb(v_nuevas),
    'dependencias', (select coalesce(jsonb_agg(jsonb_build_object('dependencia_id', y.id, 'nombre', y.nombre) order by y.nombre), '[]'::jsonb)
                       from public.dependencias y where y.empresa_id = e.id and y.activa),
    '_empresa', e.id,
    '_resumen', case when v_existia then 'Empresa ya existía: ' else 'Empresa creada: ' end || e.razon_social
                || case when cardinality(v_nuevas) > 0 then ' · ' || cardinality(v_nuevas) || ' dependencias nuevas' else '' end);
end $$;

create or replace function public.agente_crear_servicio(o uuid, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_nombre text := public.agente_txt(d, 'nombre', 120);
  v_cat text := coalesce(public.agente_txt(d, 'categoria', 30), 'otro');
  v_uni text := coalesce(public.agente_txt(d, 'unidad', 30), 'servicio');
  v_precio numeric := public.agente_num(d, 'precio_usd', 0, 100000);
  s public.servicios;
begin
  if v_nombre is null then perform public.agente_no('Falta «nombre».'); end if;
  if v_cat not in ('consulta', 'evaluacion', 'paraclinico', 'informe', 'asesoria', 'evaluacion_puesto', 'formacion', 'otro') then
    perform public.agente_no('«categoria» debe ser consulta, evaluacion, paraclinico, informe, asesoria, evaluacion_puesto, formacion u otro.');
  end if;
  if v_uni not in ('servicio', 'hora', 'trabajador', 'mes') then perform public.agente_no('«unidad» debe ser servicio, hora, trabajador o mes.'); end if;
  select * into s from public.servicios where org_id = o and lower(btrim(nombre)) = lower(v_nombre) order by activo desc limit 1;
  if found then
    return jsonb_build_object('servicio_id', s.id, 'nombre', s.nombre, 'precio_usd', s.precio_usd, 'ya_existia', true,
      'nota', case when v_precio is not null and v_precio <> s.precio_usd then 'Ya existe con otro precio; no lo cambio. El precio se puede poner en cada presupuesto.' end,
      '_resumen', 'Servicio ya existía: ' || s.nombre);
  end if;
  if v_precio is null then perform public.agente_no('Falta «precio_usd».'); end if;
  if p_ensayo then
    return jsonb_build_object('servicio', 'Se crearía: ' || v_nombre || ' · ' || v_precio || ' USD por ' || v_uni, 'ya_existia', false,
      '_resumen', 'Crearía el servicio ' || v_nombre);
  end if;
  insert into public.servicios (org_id, nombre, categoria, unidad, precio_usd) values (o, v_nombre, v_cat, v_uni, v_precio) returning * into s;
  return jsonb_build_object('servicio_id', s.id, 'nombre', s.nombre, 'precio_usd', s.precio_usd, 'ya_existia', false,
    '_resumen', 'Servicio creado: ' || s.nombre || ' · ' || s.precio_usd || ' USD');
end $$;

create or replace function public.agente_crear_perfil(o uuid, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_nombre text := public.agente_txt(d, 'nombre', 120);
  v_ex text[] := public.agente_textos(d -> 'examenes', 80, 120);
  v_emps uuid[];
  v_mots uuid[];
  v_fuera text[];
  i public.lista_items;
begin
  if v_nombre is null then perform public.agente_no('Falta «nombre».'); end if;
  select * into i from public.lista_items where org_id = o and lista = 'grupo_paraclinicos' and lower(btrim(nombre)) = lower(v_nombre) order by activo desc limit 1;
  if found then
    return jsonb_build_object('perfil_id', i.id, 'nombre', i.nombre, 'ya_existia', true,
      'examenes', to_jsonb(string_to_array(coalesce(i.texto, ''), E'\n')), '_resumen', 'Perfil ya existía: ' || i.nombre);
  end if;
  if cardinality(v_ex) = 0 then perform public.agente_no('Falta «examenes» (lista de nombres).'); end if;
  begin
    select coalesce(array_agg(distinct x::uuid), '{}') into v_emps
      from jsonb_array_elements_text(case when jsonb_typeof(d -> 'empresa_ids') = 'array' then d -> 'empresa_ids' else '[]'::jsonb end) x;
    select coalesce(array_agg(distinct x::uuid), '{}') into v_mots
      from jsonb_array_elements_text(case when jsonb_typeof(d -> 'motivo_ids') = 'array' then d -> 'motivo_ids' else '[]'::jsonb end) x;
  exception when others then perform public.agente_no('«empresa_ids» y «motivo_ids» deben ser identificadores válidos.');
  end;
  if cardinality(v_emps) > 50 or cardinality(v_mots) > 50 then perform public.agente_no('Demasiadas empresas o motivos para un perfil.'); end if;
  if exists (select 1 from unnest(v_emps) x where not exists (select 1 from public.empresas e where e.id = x and e.org_id = o)) then
    perform public.agente_no('Una de las empresas del perfil no es de esta organización.');
  end if;
  if exists (select 1 from unnest(v_mots) x where not exists (
               select 1 from public.lista_items m where m.id = x and m.lista = 'motivo_consulta' and (m.org_id = o or m.org_id is null))) then
    perform public.agente_no('Uno de los motivos no existe. Búscalos con catalogo, tipo motivos.');
  end if;
  -- Aviso (no bloquea): exámenes que no están en el catálogo salen igual en la orden, sin rango de referencia
  select coalesce(array_agg(x order by n), '{}') into v_fuera from unnest(v_ex) with ordinality u(x, n)
   where not exists (select 1 from public.lista_items p
                      where p.lista = 'paraclinico' and p.activo and (p.org_id = o or p.org_id is null)
                        and (upper(p.nombre) = upper(x)
                             or exists (select 1 from jsonb_array_elements_text(
                                          case when jsonb_typeof(p.datos -> 'sinonimos') = 'array' then p.datos -> 'sinonimos' else '[]'::jsonb end) s
                                         where upper(s) = upper(x))));
  if p_ensayo then
    return jsonb_build_object('perfil', 'Se crearía: ' || v_nombre || ' con ' || cardinality(v_ex) || ' exámenes', 'ya_existia', false,
      'no_estan_en_el_catalogo', to_jsonb(v_fuera), '_empresa', v_emps[1], '_resumen', 'Crearía el perfil ' || v_nombre);
  end if;
  insert into public.lista_items (org_id, lista, codigo, nombre, texto, datos)
  values (o, 'grupo_paraclinicos', public.agente_txt(d, 'codigo', 10), v_nombre, array_to_string(v_ex, E'\n'),
          jsonb_build_object('empresas', to_jsonb(v_emps), 'motivos', to_jsonb(v_mots)))
  returning * into i;
  return jsonb_build_object('perfil_id', i.id, 'nombre', i.nombre, 'ya_existia', false, 'examenes', to_jsonb(v_ex),
    'no_estan_en_el_catalogo', to_jsonb(v_fuera), '_empresa', v_emps[1],
    '_resumen', 'Perfil creado: ' || i.nombre || ' · ' || cardinality(v_ex) || ' exámenes');
end $$;

create or replace function public.agente_crear_presupuesto(o uuid, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  e public.empresas := public.agente_empresa(o, d);
  v_dias integer := coalesce(public.agente_num(d, 'valido_dias', 1, 90), 15)::integer;
  v_obs text := public.agente_txt(d, 'observacion', 1000);
  v_n integer := 0;
  v_total numeric := 0;
  v_firma text := '';
  v_reng jsonb := '[]'::jsonb;
  r jsonb;
  s public.servicios;
  v_desc text; v_det text; v_cant numeric; v_precio numeric; v_serv uuid;
  c public.cobros;
begin
  if jsonb_typeof(d -> 'renglones') is distinct from 'array' or jsonb_array_length(d -> 'renglones') not between 1 and 30 then
    perform public.agente_no('«renglones» debe traer de 1 a 30 renglones.');
  end if;
  for r in select * from jsonb_array_elements(d -> 'renglones') loop
    if jsonb_typeof(r) <> 'object' then perform public.agente_no('Cada renglón es un objeto con servicio_id o descripcion, cantidad y precio_usd.'); end if;
    v_n := v_n + 1;
    v_serv := public.agente_uuid(r, 'servicio_id');
    v_desc := public.agente_txt(r, 'descripcion', 200);
    v_det := public.agente_txt(r, 'detalle', 500);
    v_cant := coalesce(public.agente_num(r, 'cantidad', 0.01, 10000), 1);
    v_precio := public.agente_num(r, 'precio_usd', 0, 100000);
    if v_serv is not null then
      select * into s from public.servicios where id = v_serv and org_id = o;
      if not found then perform public.agente_no('Renglón ' || v_n || ': no encuentro ese servicio.'); end if;
      v_desc := coalesce(v_desc, s.nombre);
      -- Precio: el del renglón; si no viene, el convenido con esa empresa; si no hay, el del servicio
      v_precio := coalesce(v_precio, (select p.precio_usd from public.precios_empresa p where p.empresa_id = e.id and p.servicio_id = s.id), s.precio_usd);
    end if;
    if v_desc is null then perform public.agente_no('Renglón ' || v_n || ': falta «descripcion» o «servicio_id».'); end if;
    if v_precio is null then perform public.agente_no('Renglón ' || v_n || ': falta «precio_usd».'); end if;
    v_total := v_total + round(v_cant * v_precio, 2);
    v_firma := v_firma || lower(v_desc) || '|' || v_cant::numeric(10,2) || '|' || v_precio::numeric(12,2) || E'\n';
    v_reng := v_reng || jsonb_build_object('servicio_id', v_serv, 'descripcion', v_desc, 'detalle', v_det, 'cantidad', v_cant, 'precio_usd', v_precio, 'orden', v_n);
  end loop;
  -- Misma orden repetida: un presupuesto en borrador de hoy, de esa empresa, con los mismos renglones
  select c0.* into c from public.cobros c0
   where c0.org_id = o and c0.empresa_id = e.id and c0.tipo = 'presupuesto' and c0.estado = 'borrador' and c0.fecha = public.hoy_caracas()
     and (select coalesce(string_agg(lower(i.descripcion) || '|' || i.cantidad::numeric(10,2) || '|' || i.precio_usd::numeric(12,2) || E'\n', '' order by i.orden), '')
            from public.cobro_items i where i.cobro_id = c0.id) = v_firma
   order by c0.creado_en desc limit 1;
  if found then
    return public.agente_presupuesto_json(c) || jsonb_build_object('ya_existia', true, '_empresa', e.id,
      '_resumen', 'Presupuesto Nº ' || c.numero || ' ya existía · ' || v_total || ' USD');
  end if;
  if p_ensayo then
    return jsonb_build_object('presupuesto', 'Se crearía en borrador para ' || e.razon_social || ' · ' || v_total || ' USD · válido ' || v_dias || ' días',
      'total_usd', v_total, 'renglones', v_reng, 'ya_existia', false, '_empresa', e.id,
      '_resumen', 'Crearía un presupuesto de ' || v_total || ' USD');
  end if;
  insert into public.cobros (org_id, empresa_id, tipo, vence, observacion)
  values (o, e.id, 'presupuesto', public.hoy_caracas() + v_dias, v_obs) returning * into c;
  insert into public.cobro_items (cobro_id, org_id, servicio_id, descripcion, detalle, cantidad, precio_usd, orden)
  select c.id, o, nullif(x ->> 'servicio_id', '')::uuid, x ->> 'descripcion', x ->> 'detalle', (x ->> 'cantidad')::numeric, (x ->> 'precio_usd')::numeric, (x ->> 'orden')::integer
    from jsonb_array_elements(v_reng) x;
  return public.agente_presupuesto_json(c) || jsonb_build_object('ya_existia', false, '_empresa', e.id,
    '_resumen', 'Presupuesto Nº ' || c.numero || ' creado en borrador · ' || v_total || ' USD');
end $$;

create or replace function public.agente_crear_trabajador(o uuid, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  e public.empresas := public.agente_empresa(o, d);
  v_cruda text := upper(regexp_replace(coalesce(d ->> 'cedula', ''), '[.\s]', '', 'g'));
  v_m text[] := regexp_match(v_cruda, '^([VEP])?-?(\d{5,9})$');
  v_ced text;
  v_nombres text := public.agente_txt(d, 'nombres', 80);
  v_apellidos text := public.agente_txt(d, 'apellidos', 80);
  v_sexo text := upper(public.agente_txt(d, 'sexo', 1));
  v_nac date := public.agente_fecha(d, 'fecha_nacimiento');
  v_ing date := public.agente_fecha(d, 'fecha_ingreso');
  v_dep uuid := public.agente_uuid(d, 'dependencia_id');
  t public.trabajadores;
  v_otra text;
begin
  if v_m is null then perform public.agente_no('Cédula no válida. Ejemplo: V-12345678.'); end if;
  v_ced := coalesce(v_m[1], 'V') || '-' || v_m[2];
  select * into t from public.trabajadores where org_id = o and regexp_replace(cedula, '\D', '', 'g') = v_m[2] limit 1;
  if found then
    if t.empresa_id <> e.id then
      select razon_social into v_otra from public.empresas where id = t.empresa_id;
      perform public.agente_no('La cédula ' || v_ced || ' ya está registrada en «' || coalesce(v_otra, 'otra empresa')
        || '». No la muevo: el doctor decide si le cambia la empresa en Pacientes.');
    end if;
    return jsonb_build_object('trabajador_id', t.id, 'cedula', t.cedula, 'nombres', t.nombres, 'apellidos', t.apellidos,
      'numero_historia', t.numero_historia, 'ya_existia', true, '_empresa', e.id,
      '_resumen', 'Trabajador ya existía: ' || t.nombres || ' ' || t.apellidos);
  end if;
  if v_nombres is null or v_apellidos is null then perform public.agente_no('Faltan «nombres» y «apellidos».'); end if;
  if v_sexo is not null and v_sexo not in ('F', 'M') then perform public.agente_no('«sexo» debe ser F o M.'); end if;
  if v_nac is not null and (v_nac > public.hoy_caracas() or v_nac < date '1900-01-01') then perform public.agente_no('«fecha_nacimiento» no es creíble.'); end if;
  if v_ing is not null and (v_ing > public.hoy_caracas() + 366 or v_ing < date '1940-01-01') then perform public.agente_no('«fecha_ingreso» no es creíble.'); end if;
  if v_dep is not null and not exists (select 1 from public.dependencias x where x.id = v_dep and x.empresa_id = e.id) then
    perform public.agente_no('Esa dependencia no es de la empresa indicada.');
  end if;
  if p_ensayo then
    return jsonb_build_object('trabajador', 'Se crearía: ' || v_nombres || ' ' || v_apellidos || ' · ' || v_ced || ' en ' || e.razon_social,
      'ya_existia', false, '_empresa', e.id, '_resumen', 'Crearía al trabajador ' || v_nombres || ' ' || v_apellidos);
  end if;
  insert into public.trabajadores (org_id, empresa_id, dependencia_id, cedula, nombres, apellidos, sexo, fecha_nacimiento, fecha_ingreso, telefono, correo)
  values (o, e.id, v_dep, v_ced, v_nombres, v_apellidos, v_sexo::public.sexo, v_nac, v_ing,
          public.agente_txt(d, 'telefono', 60), public.agente_txt(d, 'correo', 120))
  returning * into t;
  return jsonb_build_object('trabajador_id', t.id, 'cedula', t.cedula, 'nombres', t.nombres, 'apellidos', t.apellidos,
    'numero_historia', t.numero_historia, 'ya_existia', false, '_empresa', e.id,
    '_resumen', 'Trabajador creado: ' || t.nombres || ' ' || t.apellidos || ' · historia ' || t.numero_historia);
end $$;

create or replace function public.agente_crear_cita(o uuid, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_trab uuid := public.agente_uuid(d, 'trabajador_id');
  v_fecha date := public.agente_fecha(d, 'fecha');
  v_hora time;
  v_motivo uuid := public.agente_uuid(d, 'motivo_id');
  v_obs text := public.agente_txt(d, 'observacion', 500);
  t public.trabajadores;
  c public.citas;
  v_cuando text;
begin
  if v_trab is null then perform public.agente_no('Falta «trabajador_id». Búscalo con buscar_trabajadores.'); end if;
  select * into t from public.trabajadores where id = v_trab and org_id = o;
  if not found then perform public.agente_no('No encuentro ese trabajador en esta organización.'); end if;
  if t.estado = 'egresado' then perform public.agente_no('Ese trabajador está egresado: el doctor decide si lo reactiva.'); end if;
  if v_fecha is null then perform public.agente_no('Falta «fecha» (AAAA-MM-DD).'); end if;
  if v_fecha < public.hoy_caracas() or v_fecha > public.hoy_caracas() + 366 then perform public.agente_no('La fecha de la cita va de hoy a un año.'); end if;
  if coalesce(d ->> 'hora', '') <> '' then
    if d ->> 'hora' !~ '^([01]\d|2[0-3]):[0-5]\d$' then perform public.agente_no('«hora» va en 24 horas, HH:MM (por ejemplo 09:00).'); end if;
    v_hora := (d ->> 'hora')::time;
  end if;
  if v_motivo is not null and not exists (select 1 from public.lista_items m
       where m.id = v_motivo and m.lista = 'motivo_consulta' and (m.org_id = o or m.org_id is null)) then
    perform public.agente_no('Ese motivo no existe. Búscalo con catalogo, tipo motivos.');
  end if;
  v_cuando := to_char(v_fecha, 'DD/MM/YYYY') || coalesce(' ' || to_char(v_hora, 'HH24:MI'), '');
  select * into c from public.citas where trabajador_id = t.id and fecha = v_fecha and estado <> 'cancelada' order by creado_en limit 1;
  if found then
    return jsonb_build_object('cita_id', c.id, 'fecha', c.fecha, 'hora', to_char(c.hora, 'HH24:MI'), 'estado', c.estado, 'ya_existia', true,
      'nota', case when c.hora is distinct from v_hora then 'Ya tiene cita ese día a otra hora; no la cambio.' end,
      '_empresa', t.empresa_id, '_resumen', 'Cita ya existía: ' || t.nombres || ' ' || t.apellidos || ' · ' || to_char(c.fecha, 'DD/MM/YYYY'));
  end if;
  if p_ensayo then
    return jsonb_build_object('cita', 'Se crearía: ' || t.nombres || ' ' || t.apellidos || ' · ' || v_cuando, 'ya_existia', false,
      '_empresa', t.empresa_id, '_resumen', 'Crearía una cita para ' || t.nombres || ' ' || t.apellidos || ' · ' || v_cuando);
  end if;
  insert into public.citas (org_id, empresa_id, trabajador_id, fecha, hora, motivo_id, observacion)
  values (o, t.empresa_id, t.id, v_fecha, v_hora, v_motivo, v_obs) returning * into c;
  return jsonb_build_object('cita_id', c.id, 'fecha', c.fecha, 'hora', to_char(c.hora, 'HH24:MI'), 'estado', c.estado, 'ya_existia', false,
    'ruta', '/atencion?dia=' || c.fecha, '_empresa', t.empresa_id,
    '_resumen', 'Cita creada: ' || t.nombres || ' ' || t.apellidos || ' · ' || v_cuando);
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'agente\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- ===== 7. La puerta: lo único que llama un agente =====
create or replace function public.agente(p_llave text, p_accion text, p_datos jsonb default '{}'::jsonb, p_ensayo boolean default false)
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
  if length(d::text) > 60000 then
    return jsonb_build_object('ok', false, 'error', 'Los datos son demasiado grandes.');
  end if;
  -- Freno: 120 llamadas por minuto por llave (no se anota, para que un bucle no llene el registro)
  if (select count(*) from public.agentes_registro r where r.llave_id = k.id and r.en > public.ahora() - interval '1 minute') >= 120 then
    return jsonb_build_object('ok', false, 'error', 'Demasiadas llamadas seguidas. Espera un minuto.');
  end if;

  v_escribe := case
    when v_acc in ('resumen', 'buscar_empresas', 'ver_empresa', 'buscar_trabajadores', 'catalogo', 'listar_citas', 'listar_presupuestos', 'enlaces') then false
    when v_acc in ('crear_empresa', 'crear_servicio', 'crear_perfil', 'crear_presupuesto', 'crear_trabajador', 'crear_cita') then true
  end;
  if v_escribe is null then
    v_err := 'Acción desconocida. Las que hay: resumen, buscar_empresas, ver_empresa, buscar_trabajadores, catalogo, listar_citas, listar_presupuestos, enlaces, crear_empresa, crear_servicio, crear_perfil, crear_presupuesto, crear_trabajador, crear_cita.';
  elsif v_escribe and k.permiso <> 'crear' then
    v_err := 'Esta llave solo consulta. Para crear, el doctor genera una llave con permiso de crear.';
  else
    -- Durante la llamada, quien actúa es el administrador que creó la llave (bitácora, numeración y disparadores)
    perform set_config('request.jwt.claims', jsonb_build_object('sub', k.creada_por, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', k.creada_por::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      v_res := case v_acc
        when 'resumen' then public.agente_resumen(k.org_id)
        when 'buscar_empresas' then public.agente_buscar_empresas(k.org_id, d)
        when 'ver_empresa' then public.agente_ver_empresa(k.org_id, d)
        when 'buscar_trabajadores' then public.agente_buscar_trabajadores(k.org_id, d)
        when 'catalogo' then public.agente_catalogo(k.org_id, d)
        when 'listar_citas' then public.agente_listar_citas(k.org_id, d)
        when 'listar_presupuestos' then public.agente_listar_presupuestos(k.org_id, d)
        when 'enlaces' then public.agente_enlaces(k.org_id, d)
        when 'crear_empresa' then public.agente_crear_empresa(k.org_id, d, v_ensayo)
        when 'crear_servicio' then public.agente_crear_servicio(k.org_id, d, v_ensayo)
        when 'crear_perfil' then public.agente_crear_perfil(k.org_id, d, v_ensayo)
        when 'crear_presupuesto' then public.agente_crear_presupuesto(k.org_id, d, v_ensayo)
        when 'crear_trabajador' then public.agente_crear_trabajador(k.org_id, d, v_ensayo)
        when 'crear_cita' then public.agente_crear_cita(k.org_id, d, v_ensayo)
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
          left(coalesce(v_res ->> '_resumen', case when v_err is null then 'Consulta' end), 300),
          left(coalesce(v_det, v_err), 500));
  if v_err is not null then
    return jsonb_build_object('ok', false, 'accion', v_acc, 'error', v_err);
  end if;
  return jsonb_build_object('ok', true, 'accion', v_acc, 'ensayo', v_ensayo and v_escribe, 'resultado', v_res - '_empresa' - '_resumen');
end $$;
comment on function public.agente(text, text, jsonb, boolean) is
  'Puerta para agentes: lista cerrada de acciones con llave. La ejecuta un anónimo A PROPÓSITO (la llave es la credencial), como los enlaces públicos (20261030938000).';
revoke execute on function public.agente(text, text, jsonb, boolean) from public;
grant execute on function public.agente(text, text, jsonb, boolean) to anon, authenticated;

-- ===== 8. Autolimpieza: el registro se guarda un año; las llaves vencidas o apagadas se van con él =====
insert into public.limpieza_plazos (clave, dias, minimo, maximo) values ('agentes_registro', 365, 90, 1825)
on conflict (clave) do nothing;

do $$
declare
  v_def text := replace(pg_get_functiondef('public.limpieza_correr(boolean)'::regprocedure), chr(13), '');
  v_viejo text := 'clave := ''registros_respaldo''; cantidad := n; bytes := b; return next;';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'limpieza_correr cambió: revisar 20261030938000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_viejo || '

  -- Registro de la puerta para agentes y llaves que ya no sirven (20261030938000). Lo que el agente creó no se toca.
  select count(*), coalesce(sum(pg_column_size(r.*)), 0) into n, b from public.agentes_registro r
   where r.en < public.ahora() - public.limpieza_dias(''agentes_registro'');
  if p_borrar then
    delete from public.agentes_registro r where r.en < public.ahora() - public.limpieza_dias(''agentes_registro'');
    get diagnostics n = row_count;
    delete from public.agentes_llaves l
     where least(l.vence_en, coalesce(l.revocada_en, ''infinity'')) < public.ahora() - public.limpieza_dias(''agentes_registro'');
  end if;
  clave := ''agentes_registro''; cantidad := n; bytes := b; return next;');
end $$;
