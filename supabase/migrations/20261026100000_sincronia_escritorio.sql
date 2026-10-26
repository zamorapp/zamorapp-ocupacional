-- zamorApp Ocupacional · Fase F0 del programa de escritorio: base de la sincronía PC ⇄ nube.
-- Todo es aditivo: la app web sigue igual. Arquitectura: https://claude.ai/artifact/9DgoHNbvVG11Ff7qJAyqvS
-- 1) Equipos (PC) registrados y revocables, con su serie de numeración y un secreto propio (solo su hash queda aquí).
-- 2) Cada fila sincronizable lleva "version"; cada cambio queda en sync.registro con los campos tocados.
-- 3) aplicar_cambios(): la PC sube su cola con la sesión del usuario (security invoker, RLS igual que en la web).
--    Idempotente por id de cambio; aplica solo si la versión base coincide. En datos clínicos nunca gana
--    «el último»: cualquier diferencia queda en sync.conflictos sin pisar nada.
-- 4) cambios_desde(): la PC baja solo lo que ese usuario puede ver.
-- 5) Registro de accesos a la historia clínica (solo se agrega) y equipo en la bitácora.

create schema if not exists sync;
grant usage on schema sync to authenticated;

-- ─── 1) Equipos ───
create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  nombre text not null,
  serie text not null check (serie ~ '^[A-VX-Z][A-Z]?$'), -- «W» queda para la web
  activo boolean not null default true,
  registrado_por uuid default auth.uid() references auth.users (id) on delete set null,
  registrado_en timestamptz not null default now(),
  ultimo_contacto timestamptz,
  secreto_hash text not null,  -- sha256 del secreto que guarda la PC; el secreto no se guarda en la nube
  unique (org_id, serie)
);
alter table public.equipos enable row level security;
-- Solo el administrador ve y gestiona equipos (los ids no circulan entre usuarios).
create policy equipos_admin on public.equipos for all using (public.es_admin(org_id)) with check (public.es_admin(org_id));
grant select, delete on public.equipos to authenticated;
grant update (nombre, activo) on public.equipos to authenticated;

-- Alta de una PC: solo el administrador. Devuelve el secreto una única vez; la PC lo guarda cifrado en Windows.
create or replace function public.registrar_equipo(p_org uuid, p_nombre text, p_serie text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_secreto text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); v_id uuid;
begin
  if not public.es_admin(p_org) then raise exception 'Solo el administrador registra equipos' using errcode = '42501'; end if;
  insert into public.equipos (org_id, nombre, serie, secreto_hash)
  values (p_org, p_nombre, upper(p_serie), encode(sha256(convert_to(v_secreto, 'UTF8')), 'hex'))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'secreto', v_secreto);
end $$;

-- El equipo debe estar activo, presentar su secreto y ser de la organización de un usuario interno
-- (las empresas cliente usan solo el portal web). Marca el último contacto.
create or replace function sync.equipo_valido(p_equipo uuid, p_secreto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.equipos
   where id = p_equipo and activo and org_id in (select public.mis_orgs())
     and secreto_hash = encode(sha256(convert_to(coalesce(p_secreto, ''), 'UTF8')), 'hex');
  if v_org is null or public.mi_rol(v_org) in ('gerente_empresa', 'supervisor', 'delegado_prevencion', 'trabajador') then
    raise exception 'Equipo no autorizado o desactivado' using errcode = '42501';
  end if;
  update public.equipos set ultimo_contacto = now() where id = p_equipo;
  return v_org;
end $$;

-- ─── 2) Tablas que se sincronizan ───
create table sync.tablas (
  nombre text primary key,
  clinica boolean not null,          -- conflicto ante cualquier diferencia de versión
  subible boolean not null default true -- false: solo baja (se cambia en línea)
);
insert into sync.tablas (nombre, clinica, subible) values
  ('clinico.consultas', true, true), ('clinico.diagnosticos', true, true), ('clinico.aptitudes', true, true),
  ('clinico.reposos', true, true), ('clinico.historia_laboral', true, true), ('clinico.adjuntos', true, true),
  ('public.trabajadores', false, true), ('public.empresas', false, true), ('public.sedes', false, true),
  ('public.dependencias', false, true), ('public.puestos', false, true), ('public.horas_trabajadas', false, true),
  ('public.citas', false, true), ('public.eventos', false, true), ('public.cobros', false, true),
  ('public.cobro_items', false, true), ('public.servicios', false, true), ('public.lista_items', false, true),
  ('public.miembros', false, false);
grant select on sync.tablas to authenticated;

create table sync.registro (
  seq bigserial primary key,
  org_id uuid,            -- null: ítems de lista globales
  tabla text not null,
  fila_id uuid not null,
  op char(1) not null check (op in ('I', 'U', 'D')),
  version bigint,
  campos text[],          -- columnas que cambiaron (solo en U)
  cambio_id uuid,         -- cambio de la cola de una PC que lo originó (null si vino de la web)
  equipo_id uuid,
  autor uuid default auth.uid(),
  en timestamptz not null default now()
);
create index registro_org_seq on sync.registro (org_id, seq);
create index registro_fila on sync.registro (tabla, fila_id, version);
alter table sync.registro enable row level security;
-- Lo clínico solo lo ve el personal de salud; las empresas cliente no sincronizan (portal solo web).
create policy registro_leer on sync.registro for select using (
  org_id is null or (public.mi_rol(org_id) not in ('gerente_empresa', 'supervisor', 'delegado_prevencion', 'trabajador')
  and (tabla not like 'clinico.%' or public.es_clinico(org_id))));
grant select on sync.registro to authenticated;

create or replace function sync.versionar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.version := 1; else new.version := old.version + 1; end if;
  return new;
end $$;

create or replace function sync.anotar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nuevo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  viejo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  fila jsonb := coalesce(nuevo, viejo);
  v_campos text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_campos from jsonb_object_keys(nuevo) k
     where k not in ('version', 'actualizado_en') and nuevo -> k is distinct from viejo -> k;
  end if;
  insert into sync.registro (org_id, tabla, fila_id, op, version, campos, cambio_id, equipo_id)
  values ((fila ->> 'org_id')::uuid, tg_table_schema || '.' || tg_table_name, (fila ->> 'id')::uuid,
          left(tg_op, 1), (nuevo ->> 'version')::bigint, v_campos,
          nullif(current_setting('sync.cambio_id', true), '')::uuid,
          nullif(current_setting('sync.equipo_id', true), '')::uuid);
  return null;
end $$;
revoke execute on function sync.versionar(), sync.anotar() from public, authenticated;

do $$
declare t record;
begin
  for t in select nombre from sync.tablas loop
    execute format('alter table %s add column if not exists version bigint not null default 1', t.nombre);
    execute format('create trigger sync_version before insert or update on %s for each row execute function sync.versionar()', t.nombre);
    execute format('create trigger sync_anotar after insert or update or delete on %s for each row execute function sync.anotar()', t.nombre);
  end loop;
end $$;

-- ─── 3) Subida: cola de cambios de la PC ───
create table sync.aplicados (
  cambio_id uuid primary key,
  org_id uuid not null,
  autor uuid not null default auth.uid(),
  equipo_id uuid not null,
  resultado jsonb not null,
  en timestamptz not null default now()
);
alter table sync.aplicados enable row level security;
create policy aplicados_propios on sync.aplicados for all
  using (autor = auth.uid()) with check (autor = auth.uid() and org_id in (select public.mis_orgs()));
grant select on sync.aplicados to authenticated;
grant insert (cambio_id, org_id, equipo_id, resultado), update (resultado) on sync.aplicados to authenticated;

create table sync.conflictos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  tabla text not null,
  fila_id uuid,
  tipo text not null check (tipo in ('version', 'duplicado', 'rechazado')),
  motivo text,
  cambio jsonb not null,           -- lo que la PC quiso guardar; no se pierde
  autor uuid not null default auth.uid(),
  equipo_id uuid,
  creado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  resuelto_por uuid,
  resolucion text check (resolucion in ('aplicado', 'descartado', 'ignorado'))
);
create index conflictos_pendientes on sync.conflictos (org_id) where resuelto_en is null;
alter table sync.conflictos enable row level security;
create policy conflictos_ver on sync.conflictos for select using (
  autor = auth.uid() or (org_id in (select public.mis_orgs()) and public.es_admin(org_id)
    and (tabla not like 'clinico.%' or public.es_clinico(org_id))));
-- Lo crea aplicar_cambios con la sesión del usuario: queda a su nombre y no puede nacer resuelto.
-- (Enviar un cambio inválido por aplicar_cambios produce lo mismo, así que no hay conflicto «falso» posible
-- que no quede atribuido a su autor.)
create policy conflictos_crear on sync.conflictos for insert
  with check (autor = auth.uid() and org_id in (select public.mis_orgs()));
grant select on sync.conflictos to authenticated;
grant insert (org_id, tabla, fila_id, tipo, motivo, cambio, equipo_id) on sync.conflictos to authenticated;

-- Resolver: solo por esta función, que firma con quien resuelve.
create or replace function public.resolver_conflicto(p_id uuid, p_resolucion text)
returns void language plpgsql security definer set search_path = public as $$
declare k sync.conflictos;
begin
  select * into k from sync.conflictos where id = p_id and resuelto_en is null;
  if not found or not (k.autor = auth.uid() or (public.es_admin(k.org_id)
      and (k.tabla not like 'clinico.%' or public.es_clinico(k.org_id)))) then
    raise exception 'Conflicto inexistente, ya resuelto o sin permiso' using errcode = '42501';
  end if;
  update sync.conflictos set resuelto_en = now(), resuelto_por = auth.uid(), resolucion = p_resolucion where id = p_id;
end $$;

-- Columnas que una PC puede escribir: las reales de la tabla, menos las que controla el servidor.
-- Un campo desconocido (versiones distintas de la app) rechaza el cambio entero: así nada se pierde en silencio.
create or replace function sync.columnas(p_tabla text, p_datos jsonb, p_privilegio text)
returns text[] language plpgsql stable set search_path = public as $$
declare v_cols text[]; v_desconocidos text[]; v_prohibidos text[];
begin
  select coalesce(array_agg(k order by k) filter (where c.column_name is not null), '{}'),
         array_agg(k order by k) filter (where c.column_name is null)
    into v_cols, v_desconocidos
    from jsonb_object_keys(p_datos) k
    left join information_schema.columns c on c.table_schema || '.' || c.table_name = p_tabla and c.column_name = k
   where k not in ('id', 'org_id', 'version', 'creado_en', 'actualizado_en');
  if v_desconocidos is not null then
    raise exception 'Campos desconocidos en %: %', p_tabla, array_to_string(v_desconocidos, ', ');
  end if;
  select array_agg(k) into v_prohibidos from unnest(v_cols) k where not has_column_privilege(p_tabla, k, p_privilegio);
  if v_prohibidos is not null then
    raise exception 'Sin permiso para escribir en %: %', p_tabla, array_to_string(v_prohibidos, ', ') using errcode = '42501';
  end if;
  return v_cols;
end $$;

-- p_lote: [{id, tabla, fila_id, op: I|U|D, version_base, datos}] (en I, datos es la fila completa; en U, solo lo que cambió).
-- Devuelve por cambio: {id, estado: aplicado|duplicado|conflicto|rechazado, version, motivo}.
create or replace function public.aplicar_cambios(p_equipo uuid, p_secreto text, p_lote jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := sync.equipo_valido(p_equipo, p_secreto);
  c jsonb; t sync.tablas; r jsonb; salida jsonb := '[]';
  v_id uuid; v_fila uuid; v_base bigint; v_actual bigint; v_nueva bigint; v_cols text[]; v_lista text;
  v_tocados text[]; v_n int; v_tipo text; v_motivo text;
begin
  if jsonb_typeof(p_lote) <> 'array' or jsonb_array_length(p_lote) > 500 then
    raise exception 'El lote debe ser una lista de hasta 500 cambios';
  end if;
  for c in select * from jsonb_array_elements(p_lote) loop
    v_id := (c ->> 'id')::uuid; v_fila := (c ->> 'fila_id')::uuid; v_base := (c ->> 'version_base')::bigint;
    r := null; v_tipo := null; v_motivo := null;

    -- Reservar el id del cambio antes de aplicarlo: un reenvío simultáneo espera y lo ve como duplicado.
    insert into sync.aplicados (cambio_id, org_id, equipo_id, resultado) values (v_id, v_org, p_equipo, '{}')
      on conflict (cambio_id) do nothing;
    if not found then
      select resultado into r from sync.aplicados where cambio_id = v_id;
      salida := salida || jsonb_build_array(coalesce(r, jsonb_build_object('id', v_id)) || '{"estado":"duplicado"}');
      continue;
    end if;

    select * into t from sync.tablas where nombre = c ->> 'tabla';
    if not found or not t.subible then
      v_tipo := 'rechazado'; v_motivo := 'Esta tabla no se modifica desde un equipo';
    else
      begin
        perform set_config('sync.cambio_id', v_id::text, true), set_config('sync.equipo_id', p_equipo::text, true);
        execute format('select version from %s where id = $1', t.nombre) into v_actual using v_fila;

        if c ->> 'op' = 'I' then
          if v_actual is not null then
            v_tipo := 'duplicado'; v_motivo := 'Ya existe una fila con ese id';
          elsif (c -> 'datos' ->> 'org_id')::uuid is distinct from v_org then
            v_tipo := 'rechazado'; v_motivo := 'La fila no es de la organización del equipo';
          else
            v_cols := sync.columnas(t.nombre, c -> 'datos', 'INSERT') || array['id', 'org_id'];
            select string_agg(quote_ident(x), ', ') into v_lista from unnest(v_cols) x;
            execute format('insert into %1$s (%2$s) select %2$s from jsonb_populate_record(null::%1$s, $1) returning version',
                           t.nombre, v_lista) into v_nueva using (c -> 'datos') || jsonb_build_object('id', v_fila);
          end if;

        elsif c ->> 'op' = 'U' then
          v_cols := sync.columnas(t.nombre, c -> 'datos', 'UPDATE');
          if v_actual is null then
            v_tipo := 'rechazado'; v_motivo := 'La fila no existe o no tienes acceso';
          elsif cardinality(v_cols) = 0 then
            v_nueva := v_actual;
          else
            if v_actual <> v_base then
              select coalesce(array_agg(distinct x), '{}') into v_tocados
                from sync.registro g, unnest(g.campos) x
               where g.tabla = t.nombre and g.fila_id = v_fila and g.version > v_base;
              if t.clinica then
                v_tipo := 'version'; v_motivo := 'La ficha clínica cambió en otro lugar; la revisa el médico';
              elsif v_tocados && v_cols then
                v_tipo := 'version'; v_motivo := 'Otro usuario cambió los mismos campos';
              end if;
            end if;
            if v_tipo is null then -- versión igual, o campos distintos en datos administrativos: se combinan
              select string_agg(format('%1$I = r.%1$I', x), ', ') into v_lista from unnest(v_cols) x;
              execute format('update %1$s t set %2$s from jsonb_populate_record(null::%1$s, $1) r
                               where t.id = $2 and t.version = $3 returning t.version', t.nombre, v_lista)
                 into v_nueva using c -> 'datos', v_fila, v_actual;
              if v_nueva is null then
                v_tipo := 'rechazado'; v_motivo := 'Sin permiso para modificarla (por ejemplo, consulta firmada) o cambió en este instante';
              end if;
            end if;
          end if;

        elsif c ->> 'op' = 'D' then
          if v_actual is null then
            v_nueva := null; -- ya no existe: nada que hacer
          elsif v_actual <> v_base then
            v_tipo := 'version'; v_motivo := 'Se editó en otro lugar; la edición gana y no se borra';
          else
            execute format('delete from %s where id = $1 and version = $2', t.nombre) using v_fila, v_actual;
            get diagnostics v_n = row_count;
            if v_n = 0 then v_tipo := 'rechazado'; v_motivo := 'Sin permiso para borrarla'; end if;
          end if;
        else
          v_tipo := 'rechazado'; v_motivo := 'Operación desconocida';
        end if;
      exception
        when unique_violation then v_tipo := 'duplicado'; v_motivo := sqlerrm;
        when others then v_tipo := 'rechazado'; v_motivo := sqlerrm;
      end;
    end if;

    if v_tipo is null then
      r := jsonb_build_object('id', v_id, 'estado', 'aplicado', 'version', v_nueva);
    else
      insert into sync.conflictos (org_id, tabla, fila_id, tipo, motivo, cambio, equipo_id)
      values (v_org, coalesce(c ->> 'tabla', '?'), v_fila, v_tipo, v_motivo, c, p_equipo);
      r := jsonb_build_object('id', v_id, 'estado', case when v_tipo = 'rechazado' then 'rechazado' else 'conflicto' end,
                              'version', v_actual, 'motivo', v_motivo);
    end if;
    update sync.aplicados set resultado = r where cambio_id = v_id;
    salida := salida || jsonb_build_array(r);
  end loop;
  perform set_config('sync.cambio_id', '', true), set_config('sync.equipo_id', '', true);
  return salida;
end $$;

-- ─── 4) Bajada: lo que cambió desde el último punto, solo lo visible para el usuario ───
-- Devuelve {hasta, cambios: [{seq, tabla, fila_id, op, version, cambio_id, fila}]}. La PC guarda «hasta» como cursor.
create or replace function public.cambios_desde(p_equipo uuid, p_secreto text, p_desde bigint, p_limite int default 500)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := sync.equipo_valido(p_equipo, p_secreto);
  g record; v_fila jsonb; v_hasta bigint := p_desde; cambios jsonb := '[]';
begin
  for g in select * from sync.registro
            where (org_id = v_org or org_id is null) and seq > p_desde order by seq limit least(greatest(p_limite, 1), 2000) loop
    v_hasta := g.seq;
    v_fila := null;
    if g.op <> 'D' then
      execute format('select to_jsonb(t) from %s t where id = $1', g.tabla) into v_fila using g.fila_id;
      continue when v_fila is null; -- no visible para este usuario, o borrada después (llega su D)
    end if;
    cambios := cambios || jsonb_build_array(jsonb_build_object('seq', g.seq, 'tabla', g.tabla, 'fila_id', g.fila_id,
      'op', g.op, 'version', coalesce((v_fila ->> 'version')::bigint, g.version), 'cambio_id', g.cambio_id, 'fila', v_fila));
  end loop;
  return jsonb_build_object('hasta', v_hasta, 'cambios', cambios);
end $$;

-- Primera descarga de una PC nueva (o reinstalada): copia de cada tabla, por páginas, solo lo visible
-- para el usuario y solo las columnas que puede leer. «seq» es el punto desde el que seguir con cambios_desde.
create or replace function public.instantanea(p_equipo uuid, p_secreto text, p_tabla text,
                                              p_despues uuid default null, p_limite int default 1000)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := sync.equipo_valido(p_equipo, p_secreto);
  v_seq bigint := (select coalesce(max(seq), 0) from sync.registro);
  v_cols text; v_tiene_id boolean; v_filas jsonb;
begin
  if p_tabla not in (select nombre from sync.tablas) and p_tabla not in
     ('public.organizaciones', 'public.perfiles', 'public.listas', 'public.cie10', 'public.precios_empresa', 'public.tasas_bcv') then
    raise exception 'Tabla no disponible para la copia: %', p_tabla;
  end if;
  select string_agg(format('t.%I', column_name), ', ' order by ordinal_position), bool_or(column_name = 'id')
    into v_cols, v_tiene_id
    from information_schema.columns where table_schema || '.' || table_name = p_tabla
     and has_column_privilege(p_tabla, column_name, 'SELECT');
  if v_tiene_id then
    execute format('select coalesce(jsonb_agg(f order by f->>''id''), ''[]'') from (
                      select to_jsonb(x) f from (select %s from %s t where $1 is null or t.id > $1 order by t.id limit $2) x) y',
                   v_cols, p_tabla)
      into v_filas using p_despues, least(greatest(p_limite, 1), 5000);
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (select %s from %s t) x', v_cols, p_tabla) into v_filas;
  end if;
  return jsonb_build_object('seq', v_seq, 'filas', v_filas,
    'ultimo', case when v_tiene_id and jsonb_array_length(v_filas) > 0 then v_filas -> -1 ->> 'id' end);
end $$;
revoke execute on function public.instantanea(uuid, text, text, uuid, int) from public, anon;
grant execute on function public.instantanea(uuid, text, text, uuid, int) to authenticated;

revoke execute on function public.aplicar_cambios(uuid, text, jsonb), public.cambios_desde(uuid, text, bigint, int),
  public.registrar_equipo(uuid, text, text), public.resolver_conflicto(uuid, text) from public, anon;
revoke execute on function sync.equipo_valido(uuid, text), sync.columnas(text, jsonb, text) from public, anon;
grant execute on function public.aplicar_cambios(uuid, text, jsonb), public.cambios_desde(uuid, text, bigint, int),
  public.registrar_equipo(uuid, text, text), public.resolver_conflicto(uuid, text),
  sync.equipo_valido(uuid, text), sync.columnas(text, jsonb, text) to authenticated;

-- ─── 5) Auditoría ───
-- Accesos a la historia clínica: quién la abrió, cuándo y desde qué equipo. Solo se agrega.
create table public.accesos (
  id bigserial primary key,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  consulta_id uuid,
  usuario_id uuid not null default auth.uid(),
  equipo_id uuid references public.equipos (id) on delete set null,
  en timestamptz not null default now()
);
create index accesos_trabajador on public.accesos (trabajador_id, en desc);
alter table public.accesos enable row level security;
create policy accesos_ver on public.accesos for select
  using (public.es_admin(org_id) or public.mi_rol(org_id) = 'auditor' or usuario_id = auth.uid());
grant select on public.accesos to authenticated;

create or replace function public.registrar_acceso(p_trabajador uuid, p_consulta uuid default null, p_equipo uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.trabajadores where id = p_trabajador;
  -- solo se audita a quien puede abrir esa historia
  if v_org is null or not public.es_clinico(v_org) or not public.ve_trabajador(v_org, p_trabajador) then return; end if;
  insert into public.accesos (org_id, trabajador_id, consulta_id, equipo_id)
  values (v_org, p_trabajador, p_consulta,
          (select id from public.equipos where id = p_equipo and org_id = v_org));
end $$;
revoke execute on function public.registrar_acceso(uuid, uuid, uuid) from public, anon;
grant execute on function public.registrar_acceso(uuid, uuid, uuid) to authenticated;

-- La bitácora anota el equipo cuando el cambio llegó desde una PC.
alter table public.bitacora add column if not exists equipo_id uuid;
create or replace function public.registrar_bitacora()
returns trigger language plpgsql security definer set search_path = public as $$
declare fila jsonb;
begin
  fila := to_jsonb(coalesce(new, old));
  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues, equipo_id)
  values ((fila ->> 'org_id')::uuid, tg_table_schema || '.' || tg_table_name, (fila ->> 'id')::uuid, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
          nullif(current_setting('sync.equipo_id', true), '')::uuid);
  return coalesce(new, old);
end $$;
