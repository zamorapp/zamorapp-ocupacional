-- Depurar la nómina con RR. HH. por un enlace, sin cuenta (Cesar, 12-nov-2026).
-- Cesar tenía 176 trabajadores de una empresa y RR. HH. dice que la nómina real es de 96. Le manda a RR. HH. un enlace
-- con la lista: RR. HH. toca «Sigue» o «Ya no está» (con motivo) y agrega a quien falta (nombre y apellido; cédula y
-- cargo si los tiene). RR. HH. solo PROPONE: Cesar revisa en la ficha de la empresa, ve si cada uno tiene hecha la
-- evaluación de egreso y confirma con un clic (inactivar y agregar pasan por aplicar_nomina: queda «Deshacer» ese día).
--   · Enlace de 128 bits al azar; vence (7 días por defecto, máximo 30); Cesar lo anula; uno vigente por empresa.
--   · RR. HH. ve SOLO nombre, cargo, departamento y los últimos 4 números de la cédula de los que están en la nómina
--     (activo, reposo o aspirante, sin decir cuál). Nada clínico, nada de contacto.
--   · La tabla no la lee nadie directo: todo pasa por funciones (las públicas validan el enlace en cada llamada).
--   · Doble llave (Cesar, 12-nov): el enlace pide el teléfono de la persona de RR. HH. que Cesar anotó al crearlo
--     (5 intentos y se bloquea) y queda amarrado al PRIMER teléfono que lo abre (secreto en una galleta; la base guarda
--     solo su sha256). Reenviado a otro, no abre; Cesar lo libera con «Permitir otro teléfono».
--   · Lo que escribe RR. HH. tiene topes (motivos de una lista fija, textos cortos, 300 agregados) para que un enlace
--     filtrado no sirva para llenar la base.

create table if not exists public.depuraciones_nomina (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  vence timestamptz not null,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  anulado_en timestamptz,
  enviado_en timestamptz,                 -- RR. HH. pulsó «Enviar»
  actualizado_en timestamptz,             -- último toque de RR. HH.
  aplicado_en timestamptz,                -- Cesar confirmó
  lote_id uuid references public.nomina_actualizaciones (id) on delete set null,
  -- Doble llave: a quién se le mandó (nombre y teléfono, este solo como sha256 de sus últimos 10 números) y el teléfono
  -- (aparato) que lo abrió primero
  rrhh_nombre text check (length(rrhh_nombre) <= 120),
  telefono_hash bytea not null check (length(telefono_hash) = 32),
  telefono_fin text not null check (telefono_fin ~ '^[0-9]{4}$'),
  intentos int not null default 0,
  bloqueado_en timestamptz,
  dispositivo_hash bytea check (length(dispositivo_hash) = 32),
  dispositivo_en timestamptz,
  -- { "<trabajador_id>": { "e": "si" | "no", "m": motivo } }
  respuestas jsonb not null default '{}'::jsonb check (jsonb_typeof(respuestas) = 'object'),
  -- [ { "id", "nombres", "apellidos", "cedula", "cargo" } ]
  agregados jsonb not null default '[]'::jsonb check (jsonb_typeof(agregados) = 'array' and jsonb_array_length(agregados) <= 300)
);
create index if not exists depuraciones_nomina_empresa on public.depuraciones_nomina (empresa_id, creado_en desc);
alter table public.depuraciones_nomina enable row level security;
-- Sin políticas ni permisos: solo las funciones de abajo
revoke all on public.depuraciones_nomina from public, anon, authenticated;

create or replace function public.depuracion_motivos()
returns text[] language sql immutable as $$ select array['Renunció', 'Despido', 'Fin de contrato', 'Otro'] $$;
revoke execute on function public.depuracion_motivos() from public, anon, authenticated;

-- Teléfono venezolano en cualquier forma (0414-1234567, +58 414 123 4567) → sus últimos 10 números
create or replace function public.depuracion_telefono(p text)
returns text language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) $$;
revoke execute on function public.depuracion_telefono(text) from public, anon, authenticated;

create or replace function public.depuracion_huella(p text)
returns bytea language sql immutable as $$ select sha256(convert_to(coalesce(p, ''), 'UTF8')) $$;
revoke execute on function public.depuracion_huella(text) from public, anon, authenticated;

-- ¿El enlace sirve para que RR. HH. escriba desde ESTE teléfono? Bloquea la fila para que dos toques a la vez no se pisen.
create or replace function public.depuracion_abierta(p_token text, p_dispositivo text)
returns public.depuraciones_nomina language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' or p_dispositivo is null or p_dispositivo !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into d from public.depuraciones_nomina where token = p_token for update;
  if d.id is null or d.anulado_en is not null or d.aplicado_en is not null or d.vence <= public.ahora() or d.bloqueado_en is not null
     or d.dispositivo_hash is distinct from public.depuracion_huella(p_dispositivo) then
    return null;
  end if;
  return d;
end $$;
revoke execute on function public.depuracion_abierta(text, text) from public, anon, authenticated;

-- RR. HH. abre el enlace escribiendo su teléfono. 'ok' | 'mal:<intentos que quedan>' | 'bloqueado' | 'otro_telefono' | 'cerrado'.
-- El primer aparato que acierta queda amarrado; en otro aparato el teléfono correcto ya no basta.
create or replace function public.abrir_depuracion_nomina(p_token text, p_telefono text, p_dispositivo text)
returns text language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' or p_dispositivo is null or p_dispositivo !~ '^[0-9a-f]{64}$' then return 'cerrado'; end if;
  select * into d from public.depuraciones_nomina where token = p_token for update;
  if d.id is null or d.anulado_en is not null or d.aplicado_en is not null or d.vence <= public.ahora() then return 'cerrado'; end if;
  if d.bloqueado_en is not null then return 'bloqueado'; end if;
  if length(public.depuracion_telefono(p_telefono)) < 10 or public.depuracion_huella(d.token || public.depuracion_telefono(p_telefono)) <> d.telefono_hash then
    update public.depuraciones_nomina set intentos = intentos + 1,
           bloqueado_en = case when intentos + 1 >= 5 then public.ahora() end
     where id = d.id;
    return case when d.intentos + 1 >= 5 then 'bloqueado' else 'mal:' || (5 - d.intentos - 1) end;
  end if;
  if d.dispositivo_hash is null then
    update public.depuraciones_nomina set dispositivo_hash = public.depuracion_huella(p_dispositivo), dispositivo_en = public.ahora(), intentos = 0
     where id = d.id;
    return 'ok';
  end if;
  return case when d.dispositivo_hash = public.depuracion_huella(p_dispositivo) then 'ok' else 'otro_telefono' end;
end $$;
revoke execute on function public.abrir_depuracion_nomina(text, text, text) from public;
-- Pública a propósito: el enlace (128 bits) + el teléfono + el aparato son la llave; en la línea base del guardián
grant execute on function public.abrir_depuracion_nomina(text, text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Lo que ve RR. HH. (sin sesión). estado: vigente | vencido | anulado | aplicado; null = no existe.
-- acceso: ok (este aparato ya entró) | telefono (falta escribir el teléfono) | otro_telefono | bloqueado.
-- La lista, lo marcado y lo agregado salen SOLO con acceso ok y el enlace vigente.
create or replace function public.ver_depuracion_nomina(p_token text, p_dispositivo text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.depuraciones_nomina; v_ok boolean; v_acceso text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into d from public.depuraciones_nomina where token = p_token;
  if d.id is null then return null; end if;
  v_acceso := case when d.bloqueado_en is not null then 'bloqueado'
                   when d.dispositivo_hash is not null and p_dispositivo ~ '^[0-9a-f]{64}$' and d.dispositivo_hash = public.depuracion_huella(p_dispositivo) then 'ok'
                   when d.dispositivo_hash is not null and p_dispositivo ~ '^[0-9a-f]{64}$' then 'telefono_otro'
                   else 'telefono' end;
  v_ok := v_acceso = 'ok' and d.anulado_en is null and d.aplicado_en is null and d.vence > public.ahora();
  return jsonb_build_object(
    'acceso', v_acceso,
    'rrhh', split_part(coalesce(d.rrhh_nombre, ''), ' ', 1),
    'estado', case when d.anulado_en is not null then 'anulado' when d.aplicado_en is not null then 'aplicado'
                   when d.vence <= public.ahora() then 'vencido' else 'vigente' end,
    'servicio', (select o.nombre from public.organizaciones o where o.id = d.org_id),
    'empresa', (select coalesce(m.nombre_comercial, m.razon_social) from public.empresas m where m.id = d.empresa_id),
    'vence', d.vence,
    'enviado_en', d.enviado_en,
    'respuestas', case when v_ok then d.respuestas else '{}'::jsonb end,
    'agregados', case when v_ok then d.agregados else '[]'::jsonb end,
    -- La lista solo con la llave y mientras el enlace sirve: vencido, anulado o sin teléfono no muestra nombres
    'trabajadores', case when v_ok then coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nombre', btrim(t.nombres || ' ' || t.apellidos),
               'cargo', p.nombre,
               'departamento', dp.nombre,
               'ci', right(regexp_replace(t.cedula, '\D', '', 'g'), 4))
             order by t.apellidos, t.nombres)
        from public.trabajadores t
        left join public.puestos p on p.id = t.puesto_id
        left join public.dependencias dp on dp.id = t.dependencia_id
       where t.empresa_id = d.empresa_id and t.org_id = d.org_id and t.estado in ('activo', 'reposo', 'aspirante')), '[]'::jsonb)
      else '[]'::jsonb end);
end $$;
revoke execute on function public.ver_depuracion_nomina(text, text) from public;
-- Pública a propósito: sin el aparato amarrado solo dice el estado y la empresa; en la línea base del guardián
grant execute on function public.ver_depuracion_nomina(text, text) to anon, authenticated;

-- RR. HH. marca a una persona: 'si' (sigue), 'no' (ya no está, con motivo) o null (quitar la marca). Devuelve 'ok' o el error.
create or replace function public.marcar_depuracion_nomina(p_token text, p_dispositivo text, p_trabajador uuid, p_estado text, p_motivo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  d := public.depuracion_abierta(p_token, p_dispositivo);
  if d.id is null then return 'El enlace venció, ya no está activo o este teléfono no tiene permiso.'; end if;
  if p_estado is not null and p_estado not in ('si', 'no') then return 'Marca no válida.'; end if;
  if p_motivo is not null and not p_motivo = any (public.depuracion_motivos()) then return 'Motivo no válido.'; end if;
  if not exists (select 1 from public.trabajadores t where t.id = p_trabajador and t.empresa_id = d.empresa_id and t.org_id = d.org_id
                   and t.estado in ('activo', 'reposo', 'aspirante')) then
    return 'Esa persona no está en la lista.';
  end if;
  update public.depuraciones_nomina set
    respuestas = case when p_estado is null then respuestas - p_trabajador::text
                      else respuestas || jsonb_build_object(p_trabajador::text,
                             jsonb_strip_nulls(jsonb_build_object('e', p_estado, 'm', case when p_estado = 'no' then p_motivo end))) end,
    actualizado_en = public.ahora()
  where id = d.id;
  return 'ok';
end $$;
revoke execute on function public.marcar_depuracion_nomina(text, text, uuid, text, text) from public;
grant execute on function public.marcar_depuracion_nomina(text, text, uuid, text, text) to anon, authenticated;

-- «Marcar los que quedan sin revisar como Sigue»
create or replace function public.marcar_resto_depuracion_nomina(p_token text, p_dispositivo text)
returns text language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  d := public.depuracion_abierta(p_token, p_dispositivo);
  if d.id is null then return 'El enlace venció, ya no está activo o este teléfono no tiene permiso.'; end if;
  update public.depuraciones_nomina set
    respuestas = coalesce((select jsonb_object_agg(t.id::text, '{"e":"si"}'::jsonb) from public.trabajadores t
                            where t.empresa_id = d.empresa_id and t.org_id = d.org_id and t.estado in ('activo', 'reposo', 'aspirante')
                              and not d.respuestas ? t.id::text), '{}'::jsonb) || respuestas,
    actualizado_en = public.ahora()
  where id = d.id;
  return 'ok';
end $$;
revoke execute on function public.marcar_resto_depuracion_nomina(text, text) from public;
grant execute on function public.marcar_resto_depuracion_nomina(text, text) to anon, authenticated;

-- RR. HH. agrega a alguien que falta. Nombres y apellidos obligatorios; cédula (solo números, 5 a 9) y cargo opcionales.
create or replace function public.agregar_depuracion_nomina(p_token text, p_dispositivo text, p_nombres text, p_apellidos text, p_cedula text default null, p_cargo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina; v_ci text; v_n text; v_a text; v_c text;
begin
  d := public.depuracion_abierta(p_token, p_dispositivo);
  if d.id is null then return 'El enlace venció, ya no está activo o este teléfono no tiene permiso.'; end if;
  v_n := left(btrim(regexp_replace(coalesce(p_nombres, ''), '\s+', ' ', 'g')), 80);
  v_a := left(btrim(regexp_replace(coalesce(p_apellidos, ''), '\s+', ' ', 'g')), 80);
  v_c := nullif(left(btrim(regexp_replace(coalesce(p_cargo, ''), '\s+', ' ', 'g')), 80), '');
  v_ci := nullif(regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g'), '');
  if length(v_n) < 2 or length(v_a) < 2 then return 'Escriba nombres y apellidos.'; end if;
  if v_ci is not null and (length(v_ci) < 5 or length(v_ci) > 9) then return 'La cédula debe tener entre 5 y 9 números.'; end if;
  if jsonb_array_length(d.agregados) >= 300 then return 'Llegó al tope de 300 personas agregadas.'; end if;
  if v_ci is not null and exists (select 1 from jsonb_array_elements(d.agregados) x where x ->> 'cedula' = v_ci) then
    return 'Esa cédula ya está agregada.';
  end if;
  update public.depuraciones_nomina set
    agregados = agregados || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', gen_random_uuid(), 'nombres', v_n, 'apellidos', v_a, 'cedula', v_ci, 'cargo', v_c))),
    actualizado_en = public.ahora()
  where id = d.id;
  return 'ok';
end $$;
revoke execute on function public.agregar_depuracion_nomina(text, text, text, text, text, text) from public;
grant execute on function public.agregar_depuracion_nomina(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.quitar_agregado_depuracion_nomina(p_token text, p_dispositivo text, p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  d := public.depuracion_abierta(p_token, p_dispositivo);
  if d.id is null then return 'El enlace venció, ya no está activo o este teléfono no tiene permiso.'; end if;
  update public.depuraciones_nomina set
    agregados = coalesce((select jsonb_agg(x order by i) from jsonb_array_elements(agregados) with ordinality a(x, i)
                           where x ->> 'id' is distinct from p_id::text), '[]'::jsonb),
    actualizado_en = public.ahora()
  where id = d.id;
  return 'ok';
end $$;
revoke execute on function public.quitar_agregado_depuracion_nomina(text, text, uuid) from public;
grant execute on function public.quitar_agregado_depuracion_nomina(text, text, uuid) to anon, authenticated;

-- «Enviar a OcupaVida»: avisa a Cesar. Puede seguir corrigiendo hasta que venza (o hasta que Cesar confirme).
create or replace function public.enviar_depuracion_nomina(p_token text, p_dispositivo text)
returns text language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  d := public.depuracion_abierta(p_token, p_dispositivo);
  if d.id is null then return 'El enlace venció, ya no está activo o este teléfono no tiene permiso.'; end if;
  update public.depuraciones_nomina set enviado_en = public.ahora(), actualizado_en = public.ahora() where id = d.id;
  return 'ok';
end $$;
revoke execute on function public.enviar_depuracion_nomina(text, text) from public;
grant execute on function public.enviar_depuracion_nomina(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Lado de Cesar: administrador o personal de salud que ve esa empresa (como aplicar_nomina)
create or replace function public.maneja_depuracion(p_org uuid, p_empresa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.es_admin(p_org) or public.es_clinico(p_org)) and public.puede_ver_empresa(p_org, p_empresa)
$$;
revoke execute on function public.maneja_depuracion(uuid, uuid) from public, anon, authenticated;

-- Crea el enlace de la empresa para la persona de RR. HH. (nombre y teléfono, obligatorio). Si ya hay uno que sirve y no
-- se pide nuevo, lo devuelve tal cual. p_nuevo: cambia el enlace (el anterior deja de servir), con el teléfono que se
-- indique, y conserva lo que RR. HH. ya marcó. Devuelve el token.
create or replace function public.crear_depuracion_nomina(p_empresa uuid, p_nombre text, p_telefono text, p_dias int default 7, p_nuevo boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_org uuid; d public.depuraciones_nomina; t text; v_tel text := public.depuracion_telefono(p_telefono);
begin
  select e.org_id into v_org from public.empresas e where e.id = p_empresa;
  if v_org is null or not public.maneja_depuracion(v_org, p_empresa) then
    raise exception 'Solo el administrador o el personal de salud depuran la nómina' using errcode = '42501';
  end if;
  select * into d from public.depuraciones_nomina
   where empresa_id = p_empresa and anulado_en is null and aplicado_en is null and vence > public.ahora()
   order by creado_en desc limit 1 for update;
  if d.id is not null and not coalesce(p_nuevo, false) then return d.token; end if;
  if length(v_tel) < 10 then
    raise exception 'Escribe el teléfono de la persona de RR. HH.: es la llave del enlace.' using errcode = '23514';
  end if;
  t := encode(uuid_send(gen_random_uuid()), 'hex');  -- 128 bits al azar (sin pgcrypto)
  if d.id is not null then update public.depuraciones_nomina set anulado_en = public.ahora() where id = d.id; end if;
  insert into public.depuraciones_nomina (org_id, empresa_id, token, vence, respuestas, agregados, enviado_en, rrhh_nombre, telefono_hash, telefono_fin)
  values (v_org, p_empresa, t, public.ahora() + make_interval(days => least(greatest(coalesce(p_dias, 7), 1), 30)),
          coalesce(d.respuestas, '{}'::jsonb), coalesce(d.agregados, '[]'::jsonb), d.enviado_en,
          nullif(left(btrim(coalesce(p_nombre, '')), 120), ''), public.depuracion_huella(t || v_tel), right(v_tel, 4));  -- con el token como sal (Analizar)
  return t;
end $$;
revoke execute on function public.crear_depuracion_nomina(uuid, text, text, int, boolean) from public, anon;
grant execute on function public.crear_depuracion_nomina(uuid, text, text, int, boolean) to authenticated;

-- «Permitir otro teléfono»: borra el aparato amarrado y los intentos fallidos (también desbloquea)
create or replace function public.liberar_depuracion_nomina(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  select * into d from public.depuraciones_nomina where id = p_id for update;
  if d.id is null or not public.maneja_depuracion(d.org_id, d.empresa_id) then
    raise exception 'Sin permiso sobre este enlace' using errcode = '42501';
  end if;
  update public.depuraciones_nomina set dispositivo_hash = null, dispositivo_en = null, intentos = 0, bloqueado_en = null where id = p_id;
end $$;
revoke execute on function public.liberar_depuracion_nomina(uuid) from public, anon;
grant execute on function public.liberar_depuracion_nomina(uuid) to authenticated;

create or replace function public.anular_depuracion_nomina(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  select * into d from public.depuraciones_nomina where id = p_id for update;
  if d.id is null or not public.maneja_depuracion(d.org_id, d.empresa_id) then
    raise exception 'Sin permiso sobre este enlace' using errcode = '42501';
  end if;
  update public.depuraciones_nomina set anulado_en = coalesce(anulado_en, public.ahora()) where id = p_id;
end $$;
revoke execute on function public.anular_depuracion_nomina(uuid) from public, anon;
grant execute on function public.anular_depuracion_nomina(uuid) to authenticated;

-- La revisión de Cesar: el último enlace de la empresa con lo que dijo RR. HH. Por cada «ya no está»: cédula completa,
-- si sigue en la nómina y si tiene la evaluación de egreso (consulta con motivo Egreso en su período vigente) o una
-- cita de egreso pendiente. Por cada agregado: si su cédula ya está registrada en la organización.
create or replace function public.revision_depuracion_nomina(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; d public.depuraciones_nomina; v_total int;
begin
  select e.org_id into v_org from public.empresas e where e.id = p_empresa;
  if v_org is null or not public.maneja_depuracion(v_org, p_empresa) then
    raise exception 'Solo el administrador o el personal de salud depuran la nómina' using errcode = '42501';
  end if;
  select * into d from public.depuraciones_nomina where empresa_id = p_empresa order by creado_en desc limit 1;
  if d.id is null then return null; end if;
  select count(*) into v_total from public.trabajadores t
   where t.empresa_id = p_empresa and t.org_id = v_org and t.estado in ('activo', 'reposo', 'aspirante');
  return jsonb_build_object(
    'id', d.id,
    'token', case when d.anulado_en is null and d.aplicado_en is null and d.vence > public.ahora() then d.token end,
    'estado', case when d.anulado_en is not null then 'anulado' when d.aplicado_en is not null then 'aplicado'
                   when d.vence <= public.ahora() then 'vencido' else 'vigente' end,
    'creado_en', d.creado_en, 'vence', d.vence, 'enviado_en', d.enviado_en, 'actualizado_en', d.actualizado_en,
    'aplicado_en', d.aplicado_en, 'lote_id', d.lote_id,
    'rrhh_nombre', d.rrhh_nombre, 'telefono_fin', d.telefono_fin, 'abierto_en', d.dispositivo_en,
    'bloqueado', d.bloqueado_en is not null, 'intentos', d.intentos,
    'en_nomina', v_total,
    'siguen', (select count(*) from jsonb_each(d.respuestas) r join public.trabajadores t on t.id = r.key::uuid
                where r.value ->> 'e' = 'si' and t.empresa_id = p_empresa and t.estado in ('activo', 'reposo', 'aspirante')),
    'no_estan', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'nombre', btrim(t.nombres || ' ' || t.apellidos), 'cedula', t.cedula, 'cargo', p.nombre,
               'motivo', r.value ->> 'm',
               'en_nomina', t.empresa_id = p_empresa and t.estado in ('activo', 'reposo', 'aspirante'),
               'estado', t.estado,
               'egreso', (select jsonb_build_object('fecha', c.fecha, 'hecha', c.estado <> 'borrador')
                            from clinico.consultas c join public.lista_items li on li.id = c.motivo_id
                           where c.trabajador_id = t.id and li.lista = 'motivo_consulta' and li.codigo = 'EGR'
                             and c.fecha >= coalesce(t.periodo_desde, '-infinity'::date)
                           order by (c.estado <> 'borrador') desc, c.fecha desc limit 1),
               'cita_egreso', (select min(ci.fecha) from public.citas ci join public.lista_items li on li.id = ci.motivo_id
                                where ci.trabajador_id = t.id and li.lista = 'motivo_consulta' and li.codigo = 'EGR'
                                  and ci.estado in ('citado', 'en_espera') and ci.fecha >= public.hoy_caracas()))
             order by t.apellidos, t.nombres)
        from jsonb_each(d.respuestas) r
        join public.trabajadores t on t.id = r.key::uuid and t.org_id = v_org
        left join public.puestos p on p.id = t.puesto_id
       where r.value ->> 'e' = 'no'), '[]'::jsonb),
    'agregados', coalesce((
      select jsonb_agg(x || jsonb_build_object('registrado', (
               select jsonb_build_object('id', t.id, 'nombre', btrim(t.nombres || ' ' || t.apellidos), 'estado', t.estado,
                                         'misma_empresa', t.empresa_id = p_empresa)
                 from public.trabajadores t
                where t.org_id = v_org
                  and (regexp_replace(t.cedula, '\D', '', 'g') = x ->> 'cedula'
                       -- Sin cédula: Cesar lo registra a mano («Registrar»); se reconoce por el nombre en esta empresa
                       or (x ->> 'cedula' is null and t.empresa_id = p_empresa
                           and lower(regexp_replace(btrim(t.nombres || ' ' || t.apellidos), '\s+', ' ', 'g'))
                             = lower(regexp_replace(btrim((x ->> 'nombres') || ' ' || (x ->> 'apellidos')), '\s+', ' ', 'g'))))
                order by (regexp_replace(t.cedula, '\D', '', 'g') = x ->> 'cedula') desc nulls last
                limit 1))
             order by i)
        from jsonb_array_elements(d.agregados) with ordinality a(x, i)), '[]'::jsonb));
end $$;
revoke execute on function public.revision_depuracion_nomina(uuid) from public, anon;
grant execute on function public.revision_depuracion_nomina(uuid) to authenticated;

-- Cesar confirmó (ya aplicó con aplicar_nomina en el lote p_lote): el enlace deja de servir.
create or replace function public.cerrar_depuracion_nomina(p_id uuid, p_lote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.depuraciones_nomina;
begin
  select * into d from public.depuraciones_nomina where id = p_id for update;
  if d.id is null or not public.maneja_depuracion(d.org_id, d.empresa_id) then
    raise exception 'Sin permiso sobre este enlace' using errcode = '42501';
  end if;
  if p_lote is not null and not exists (select 1 from public.nomina_actualizaciones n where n.id = p_lote and n.empresa_id = d.empresa_id) then
    raise exception 'Actualización de otra empresa' using errcode = '22023';
  end if;
  update public.depuraciones_nomina set aplicado_en = coalesce(aplicado_en, public.ahora()), lote_id = coalesce(p_lote, lote_id) where id = p_id;
end $$;
revoke execute on function public.cerrar_depuracion_nomina(uuid, uuid) from public, anon;
grant execute on function public.cerrar_depuracion_nomina(uuid, uuid) to authenticated;

-- Limpieza: los enlaces cerrados (anulados, aplicados o vencidos) guardan nombres que RR. HH. escribió; a los 90 días
-- se vacían (queda la fila, sin respuestas ni agregados).
create or replace function public.purgar_depuraciones_nomina()
returns void language sql security definer set search_path = public as $$
  update public.depuraciones_nomina set respuestas = '{}'::jsonb, agregados = '[]'::jsonb
   where (respuestas <> '{}'::jsonb or agregados <> '[]'::jsonb)
     and coalesce(aplicado_en, anulado_en, vence) < public.ahora() - interval '90 days'
$$;
revoke execute on function public.purgar_depuraciones_nomina() from public, anon, authenticated;
-- Cada día a las 5:37 a. m. de Caracas, en la nube y solo donde exista pg_cron
do $migracion$
begin
  if public.es_base_local() then return; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('zamorapp-purgar-depuraciones', '37 9 * * *', $$select public.purgar_depuraciones_nomina()$$);
  end if;
end $migracion$;
