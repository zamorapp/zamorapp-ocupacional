-- Papelera del administrador: eliminar una consulta o un trabajador (duplicado o registrado por error) SIN perderlo.
-- Pedido de Cesar (03-nov-2026): consultas duplicadas al probar la firma que no se podían borrar, y trabajadores
-- repetidos. Regla del proyecto: nunca borrar datos clínicos sin el sí de Cesar y todo borrado tiene «Deshacer».
--
-- Cómo funciona:
-- 1. Se juntan la fila y TODO lo que cuelga de ella siguiendo las claves foráneas reales de la base (diagnósticos,
--    aptitud, versiones firmadas, alertas, citas, reposos…), sin lista fija: una tabla nueva entra sola.
--    · Hijas «en cascada» o que no pueden quedar sin padre (columna NOT NULL) → se guardan y se eliminan con ella.
--    · Hijas que pueden quedar sueltas (columna que admite vacío: reposo, cita, cobro, adjunto, solicitud…) → no se
--      borran; solo se anota a qué apuntaban («enlaces») para volver a unirlas al restaurar.
-- 2. Todo queda en public.papelera (filas completas en JSON) con motivo, autor y hora; luego se elimina.
-- 3. «Restaurar» vuelve a insertar las filas tal cual (mismos id, fechas, firma, número de historia) y rehace los enlaces.
--
-- Mientras se elimina o restaura, los disparadores propios de esas tablas se apagan DENTRO de la transacción
-- (ALTER TABLE … DISABLE TRIGGER, que bloquea la tabla hasta el commit: ninguna otra sesión ve las tablas sin
-- disparadores). Así nada se recalcula al restaurar (hora de firma, número de historia, avisos a RR. HH., horario de
-- citas) y la consulta vuelve idéntica. Solo quedan encendidos sync_version y sync_anotar, para que el programa de
-- escritorio reciba el borrado y la restauración. La bitácora lleva una entrada propia con el motivo.
--
-- Solo el administrador con acceso clínico. Requiere internet en el escritorio (va a la nube, no a la copia local).

create table if not exists public.papelera (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  tipo text not null check (tipo in ('consulta', 'trabajador')),
  objeto_id uuid not null,
  titulo text not null,
  resumen jsonb not null default '{}'::jsonb,   -- {"clinico.consultas": 2, "clinico.diagnosticos": 3, …}
  motivo text not null check (length(btrim(motivo)) >= 5),
  filas jsonb not null,                          -- [{"t": "clinico.consultas", "f": {…fila…}}] en orden de juntado
  enlaces jsonb not null default '[]'::jsonb,    -- [{"t": tabla, "c": columna, "v": valor, "k": {clave}}]
  eliminado_por uuid references auth.users (id) on delete set null default auth.uid(),
  eliminado_en timestamptz not null default public.ahora(),
  restaurado_por uuid references auth.users (id) on delete set null,
  restaurado_en timestamptz
);
create index if not exists papelera_org_en on public.papelera (org_id, eliminado_en desc);
create index if not exists papelera_objeto on public.papelera (objeto_id);
alter table public.papelera enable row level security;
drop policy if exists papelera_admin on public.papelera;
create policy papelera_admin on public.papelera for select
  using (org_id = any ((select public.orgs_con('{administrador}', p_clinico => true))::uuid[]));
revoke all on public.papelera from anon, authenticated;
-- Las filas guardadas (datos clínicos completos) no se leen directo: solo el listado
grant select (id, org_id, tipo, objeto_id, titulo, resumen, motivo, eliminado_por, eliminado_en, restaurado_por, restaurado_en)
  on public.papelera to authenticated;

-- Clave primaria de una tabla (lista de columnas)
create or replace function public.papelera_pk(p_tabla regclass)
returns text[] language sql stable set search_path = '' as $$
  select array_agg(a.attname::text order by k.ord)
    from pg_catalog.pg_index i
    cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = p_tabla and i.indisprimary
$$;

-- Junta las filas de p_tabla cuya p_col está en p_valores y, recursivamente, todo lo que cuelga de ellas
create or replace function public.papelera_juntar(p_tabla regclass, p_col text, p_valores text[],
  inout p_filas jsonb, inout p_enlaces jsonb, p_nivel int default 0)
language plpgsql set search_path = '' as $$
declare
  v_pk text[] := public.papelera_pk(p_tabla);
  v_tipo text;
  v_nuevas jsonb;
  v_vals text[];
  v_tipo_hija text;
  v_pk_hija text[];
  v_enl jsonb;
  f record;
begin
  if coalesce(cardinality(p_valores), 0) = 0 then return; end if;
  if p_nivel > 8 then raise exception 'Papelera: demasiados niveles de datos relacionados en %', p_tabla; end if;
  if v_pk is null then raise exception 'Papelera: la tabla % no tiene clave primaria; no se puede guardar para restaurar', p_tabla; end if;
  select pg_catalog.format_type(atttypid, atttypmod) into v_tipo
    from pg_catalog.pg_attribute where attrelid = p_tabla and attname = p_col;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s x where x.%I = any ($1::%s[])', p_tabla, p_col, v_tipo)
    into v_nuevas using p_valores;
  -- Sin repetir lo ya juntado por otro camino (p. ej. la aptitud llega por el trabajador y por su consulta)
  select coalesce(jsonb_agg(n), '[]'::jsonb) into v_nuevas
    from jsonb_array_elements(v_nuevas) n
   where not exists (select 1 from jsonb_array_elements(p_filas) e
                      where e ->> 't' = p_tabla::text
                        and (select bool_and(e -> 'f' -> k = n -> k) from unnest(v_pk) k));
  if jsonb_array_length(v_nuevas) = 0 then return; end if;
  p_filas := p_filas || (select jsonb_agg(jsonb_build_object('t', p_tabla::text, 'f', n)) from jsonb_array_elements(v_nuevas) n);
  if jsonb_array_length(p_filas) > 20000 then raise exception 'Papelera: son demasiados datos para eliminar de una vez.'; end if;

  for f in
    select c.conrelid::regclass as hija, ah.attname::text as col_hija, ap.attname::text as col_padre,
           c.confdeltype as accion, not ah.attnotnull as admite_vacio
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute ah on ah.attrelid = c.conrelid and ah.attnum = c.conkey[1]
      join pg_catalog.pg_attribute ap on ap.attrelid = c.confrelid and ap.attnum = c.confkey[1]
     where c.contype = 'f' and c.confrelid = p_tabla and cardinality(c.conkey) = 1
       and c.conrelid::regclass::text not in ('public.papelera', 'public.bitacora')
     order by c.conrelid::regclass::text, ah.attname
  loop
    select array_agg(distinct n ->> f.col_padre) into v_vals from jsonb_array_elements(v_nuevas) n where n ->> f.col_padre is not null;
    if v_vals is null then continue; end if;
    if f.accion in ('n', 'd') or (f.accion in ('a', 'r') and f.admite_vacio) then
      -- La hija se queda (sin el enlace); se anota para volver a unirla al restaurar
      v_pk_hija := public.papelera_pk(f.hija);
      if v_pk_hija is null then raise exception 'Papelera: la tabla % no tiene clave primaria', f.hija; end if;
      select pg_catalog.format_type(atttypid, atttypmod) into v_tipo_hija
        from pg_catalog.pg_attribute where attrelid = f.hija and attname = f.col_hija;
      execute format('select coalesce(jsonb_agg(jsonb_build_object(''t'', %L, ''c'', %L, ''a'', %L, ''v'', x.%I::text, ''k'', jsonb_build_object(%s))), ''[]''::jsonb)
                        from %s x where x.%I = any ($1::%s[])',
                     f.hija::text, f.col_hija, f.accion, f.col_hija,
                     (select string_agg(format('%L, x.%I', k, k), ', ') from unnest(v_pk_hija) k),
                     f.hija, f.col_hija, v_tipo_hija)
        into v_enl using v_vals;
      p_enlaces := p_enlaces || v_enl;
    else
      select x.p_filas, x.p_enlaces into p_filas, p_enlaces
        from public.papelera_juntar(f.hija, f.col_hija, v_vals, p_filas, p_enlaces, p_nivel + 1) x;
    end if;
  end loop;
end $$;

-- Apaga (o vuelve a encender) los disparadores propios de las tablas tocadas, salvo los de la sincronía.
-- Solo dentro de la transacción de eliminar/restaurar: el ALTER TABLE bloquea la tabla hasta el commit.
create or replace function public.papelera_disparadores(p_tablas text[], p_encender boolean)
returns void language plpgsql set search_path = '' as $$
declare r record;
begin
  if not p_encender then
    create temp table if not exists papelera_apagados (tabla text, nombre text) on commit drop;
    insert into papelera_apagados
      select t.tgrelid::regclass::text, t.tgname
        from pg_catalog.pg_trigger t
       where t.tgrelid in (select x::regclass from unnest(p_tablas) x)
         and not t.tgisinternal and t.tgname not in ('sync_anotar', 'sync_version') and t.tgenabled <> 'D'
         and not exists (select 1 from papelera_apagados a where a.tabla = t.tgrelid::regclass::text and a.nombre = t.tgname);
    for r in select tabla, nombre from papelera_apagados loop
      execute format('alter table %s disable trigger %I', r.tabla, r.nombre);
    end loop;
  else
    for r in select tabla, nombre from papelera_apagados loop
      execute format('alter table %s enable trigger %I', r.tabla, r.nombre);
    end loop;
    delete from papelera_apagados;
  end if;
end $$;

-- Tablas que toca una entrada de la papelera (filas guardadas + hijas sueltas)
create or replace function public.papelera_tablas(p_filas jsonb, p_enlaces jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct t), '{}')
    from (select e ->> 't' as t from jsonb_array_elements(p_filas) e
          union select e ->> 't' from jsonb_array_elements(p_enlaces) e) x
$$;

create or replace function public.papelera_resumen(p_filas jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
    from (select e ->> 't' as t, count(*) as n from jsonb_array_elements(p_filas) e group by 1) x
$$;

-- Elimina lo juntado: primero suelta las hijas que no se borran solas (columna con vacío y sin «on delete set null»),
-- luego borra de las hojas hacia la raíz. Devuelve el id de la entrada de la papelera.
create or replace function public.papelera_eliminar(p_org uuid, p_tipo text, p_tabla regclass, p_id uuid, p_titulo text, p_motivo text)
returns uuid language plpgsql set search_path = '' as $$
declare
  v_filas jsonb;
  v_enlaces jsonb;
  v_tablas text[];
  v_id uuid;
  v_pend jsonb;
  v_resto jsonb;
  v_pk text[];
  e jsonb;
  v_vuelta int := 0;
begin
  select x.p_filas, x.p_enlaces into v_filas, v_enlaces
    from public.papelera_juntar(p_tabla, 'id', array[p_id::text], '[]'::jsonb, '[]'::jsonb) x;
  if jsonb_array_length(v_filas) = 0 then raise exception 'No se encontró lo que se quiere eliminar (puede que ya se haya eliminado).'; end if;

  insert into public.papelera (org_id, tipo, objeto_id, titulo, resumen, motivo, filas, enlaces, eliminado_por)
  values (p_org, p_tipo, p_id, p_titulo, public.papelera_resumen(v_filas), btrim(p_motivo), v_filas, v_enlaces, auth.uid())
  returning id into v_id;

  v_tablas := public.papelera_tablas(v_filas, v_enlaces);
  perform public.papelera_disparadores(v_tablas, false);

  -- Hijas sueltas sin acción automática: se dejan sin el enlace a mano (las «set null» las suelta la base)
  for e in select x from jsonb_array_elements(v_enlaces) x where x ->> 'a' in ('a', 'r') loop
    execute format('update %s x set %I = null where (%s) = (select %s from jsonb_populate_record(null::%s, $1) r)',
                   e ->> 't', e ->> 'c',
                   (select string_agg(format('x.%I', k), ', ') from jsonb_object_keys(e -> 'k') k),
                   (select string_agg(format('r.%I', k), ', ') from jsonb_object_keys(e -> 'k') k),
                   e ->> 't')
      using e -> 'k';
  end loop;

  -- De las hojas a la raíz; si una fila aún tiene hijas (orden cruzado), se reintenta en la vuelta siguiente
  select coalesce(jsonb_agg(x order by o desc), '[]'::jsonb) into v_pend from jsonb_array_elements(v_filas) with ordinality t(x, o);
  while jsonb_array_length(v_pend) > 0 loop
    v_vuelta := v_vuelta + 1;
    if v_vuelta > 10 then raise exception 'Papelera: no se pudo eliminar todo (quedan datos que dependen entre sí).'; end if;
    v_resto := '[]'::jsonb;
    for e in select x from jsonb_array_elements(v_pend) x loop
      v_pk := public.papelera_pk((e ->> 't')::regclass);
      begin
        execute format('delete from %s x where (%s) = (select %s from jsonb_populate_record(null::%s, $1) r)',
                       e ->> 't',
                       (select string_agg(format('x.%I', k), ', ') from unnest(v_pk) k),
                       (select string_agg(format('r.%I', k), ', ') from unnest(v_pk) k),
                       e ->> 't')
          using e -> 'f';
      exception when foreign_key_violation then
        v_resto := v_resto || jsonb_build_array(e);
      end;
    end loop;
    if jsonb_array_length(v_resto) = jsonb_array_length(v_pend) and v_vuelta > 1 then
      raise exception 'Papelera: hay datos de otra parte que dependen de esto y no se pueden soltar.';
    end if;
    v_pend := v_resto;
  end loop;

  perform public.papelera_disparadores(v_tablas, true);
  insert into public.bitacora (org_id, usuario_id, tabla, registro_id, accion, antes, despues)
  values (p_org, auth.uid(), p_tabla::text, p_id, 'ELIMINAR_A_PAPELERA', null,
          jsonb_build_object('papelera_id', v_id, 'motivo', btrim(p_motivo), 'titulo', p_titulo, 'resumen', public.papelera_resumen(v_filas)));
  return v_id;
end $$;

-- ─── Lo que llama la app ─────────────────────────────────────────

-- Vista previa: qué se iría a la papelera (para que el administrador lo vea antes de confirmar)
create or replace function public.papelera_vista_previa(p_tipo text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_filas jsonb;
  v_enlaces jsonb;
  v_tabla regclass := case p_tipo when 'consulta' then 'clinico.consultas'::regclass when 'trabajador' then 'public.trabajadores'::regclass end;
begin
  if v_tabla is null then raise exception 'Tipo desconocido'; end if;
  execute format('select org_id from %s where id = $1', v_tabla) into v_org using p_id;
  if v_org is null or not (public.es_admin(v_org) and public.es_clinico(v_org)) then
    raise exception 'Solo el administrador con acceso clínico puede eliminar.' using errcode = '42501';
  end if;
  select x.p_filas, x.p_enlaces into v_filas, v_enlaces
    from public.papelera_juntar(v_tabla, 'id', array[p_id::text], '[]'::jsonb, '[]'::jsonb) x;
  return jsonb_build_object(
    'resumen', public.papelera_resumen(v_filas),
    'firmadas', (select count(*) from jsonb_array_elements(v_filas) e where e ->> 't' = 'clinico.consultas' and e -> 'f' ->> 'estado' = 'firmada'),
    'sueltas', (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
                  from (select e ->> 't' as t, count(*) as n from jsonb_array_elements(v_enlaces) e
                         where not exists (select 1 from jsonb_array_elements(v_filas) f where f ->> 't' = e ->> 't'
                                             and (select bool_and(f -> 'f' -> k = e -> 'k' -> k) from jsonb_object_keys(e -> 'k') k))
                         group by 1) x));
end $$;

create or replace function public.eliminar_consulta(p_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  select co.org_id, co.fecha, co.estado, t.nombres, t.apellidos into c
    from clinico.consultas co join public.trabajadores t on t.id = co.trabajador_id where co.id = p_id;
  if c.org_id is null then raise exception 'La consulta ya no existe (puede que ya se haya eliminado).'; end if;
  if not (public.es_admin(c.org_id) and public.es_clinico(c.org_id)) then
    raise exception 'Solo el administrador con acceso clínico puede eliminar consultas.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo (al menos 5 letras).'; end if;
  return public.papelera_eliminar(c.org_id, 'consulta', 'clinico.consultas', p_id,
    format('Consulta del %s · %s %s%s', to_char(c.fecha, 'DD/MM/YYYY'), c.nombres, c.apellidos, case when c.estado = 'firmada' then ' (firmada)' else '' end),
    p_motivo);
end $$;

create or replace function public.eliminar_trabajador(p_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select org_id, cedula, nombres, apellidos into t from public.trabajadores where id = p_id;
  if t.org_id is null then raise exception 'El trabajador ya no existe (puede que ya se haya eliminado).'; end if;
  if not (public.es_admin(t.org_id) and public.es_clinico(t.org_id)) then
    raise exception 'Solo el administrador con acceso clínico puede eliminar trabajadores.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo (al menos 5 letras).'; end if;
  return public.papelera_eliminar(t.org_id, 'trabajador', 'public.trabajadores', p_id,
    format('%s %s · C.I. %s', t.nombres, t.apellidos, t.cedula), p_motivo);
end $$;

-- Restaurar: vuelve a insertar todo tal cual y rehace los enlaces de las hijas sueltas
create or replace function public.restaurar_papelera(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_tablas text[];
  v_pend jsonb;
  v_resto jsonb;
  v_cols text;
  e jsonb;
  v_vuelta int := 0;
  v_falla text;
begin
  select * into p from public.papelera where id = p_id for update;
  if p.id is null then raise exception 'Esa entrada de la papelera no existe.'; end if;
  if not (public.es_admin(p.org_id) and public.es_clinico(p.org_id)) then
    raise exception 'Solo el administrador con acceso clínico puede restaurar.' using errcode = '42501';
  end if;
  if p.restaurado_en is not null then raise exception 'Ya se restauró el %.', to_char(p.restaurado_en at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'); end if;

  v_tablas := public.papelera_tablas(p.filas, p.enlaces);
  perform public.papelera_disparadores(v_tablas, false);

  -- Padres antes que hijas; si una fila espera a otra (orden cruzado), se reintenta en la vuelta siguiente
  v_pend := p.filas;
  while jsonb_array_length(v_pend) > 0 loop
    v_vuelta := v_vuelta + 1;
    v_resto := '[]'::jsonb;
    for e in select x from jsonb_array_elements(v_pend) x loop
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
        from pg_catalog.pg_attribute a
       where a.attrelid = (e ->> 't')::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      begin
        execute format('insert into %s (%s) overriding system value select %s from jsonb_populate_record(null::%s, $1)',
                       e ->> 't', v_cols, v_cols, e ->> 't')
          using e -> 'f';
      exception
        when foreign_key_violation then
          v_resto := v_resto || jsonb_build_array(e);
          get stacked diagnostics v_falla = message_text;
        when unique_violation then
          raise exception 'No se puede restaurar: ya existe otro registro igual (%). Si registraste de nuevo a este trabajador con la misma cédula, elimina o corrige ese registro primero.', e ->> 't';
      end;
    end loop;
    if jsonb_array_length(v_resto) = jsonb_array_length(v_pend) then
      raise exception 'No se puede restaurar: falta un dato del que depende (%). Si es una consulta de un trabajador eliminado, restaura primero al trabajador.', v_falla;
    end if;
    v_pend := v_resto;
  end loop;

  -- Vuelve a unir las hijas sueltas que siguen sin enlace (si alguien ya las cambió, se respeta lo nuevo)
  for e in select x from jsonb_array_elements(p.enlaces) x loop
    execute format('update %s x set %I = $2::%s where x.%I is null and (%s) = (select %s from jsonb_populate_record(null::%s, $1) r)',
                   e ->> 't', e ->> 'c',
                   (select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute where attrelid = (e ->> 't')::regclass and attname = e ->> 'c'),
                   e ->> 'c',
                   (select string_agg(format('x.%I', k), ', ') from jsonb_object_keys(e -> 'k') k),
                   (select string_agg(format('r.%I', k), ', ') from jsonb_object_keys(e -> 'k') k),
                   e ->> 't')
      using e -> 'k', e ->> 'v';
  end loop;

  perform public.papelera_disparadores(v_tablas, true);
  update public.papelera set restaurado_en = public.ahora(), restaurado_por = auth.uid() where id = p_id;
  insert into public.bitacora (org_id, usuario_id, tabla, registro_id, accion, antes, despues)
  values (p.org_id, auth.uid(), case p.tipo when 'consulta' then 'clinico.consultas' else 'public.trabajadores' end, p.objeto_id,
          'RESTAURAR_DE_PAPELERA', null, jsonb_build_object('papelera_id', p.id, 'titulo', p.titulo));
  return p.titulo;
end $$;

revoke execute on function public.papelera_pk(regclass), public.papelera_juntar(regclass, text, text[], jsonb, jsonb, int),
  public.papelera_disparadores(text[], boolean), public.papelera_tablas(jsonb, jsonb), public.papelera_resumen(jsonb),
  public.papelera_eliminar(uuid, text, regclass, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.papelera_vista_previa(text, uuid), public.eliminar_consulta(uuid, text),
  public.eliminar_trabajador(uuid, text), public.restaurar_papelera(uuid) from public, anon;
grant execute on function public.papelera_vista_previa(text, uuid), public.eliminar_consulta(uuid, text),
  public.eliminar_trabajador(uuid, text), public.restaurar_papelera(uuid) to authenticated;
