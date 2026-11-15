-- Eliminar desde la Papelera fallaba en la nube con «DELETE requires a WHERE clause».
-- Causa: Supabase carga pg_safeupdate en las sesiones de la API, que rechaza todo DELETE/UPDATE sin WHERE,
-- también dentro de funciones. papelera_disparadores vaciaba su tabla temporal con «delete from papelera_apagados;».
-- La base local de pruebas no carga pg_safeupdate, por eso no se vio. La prueba 198 barre todas las funciones.
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
    delete from papelera_apagados where true;
  end if;
end $$;

-- ─── Papelera para todos los documentos (Cesar, 05-nov-2026: «como administrador puedo borrar cualquier elemento
-- y cualquier informe») ─────────────────────────────────────────────────────────────────────────────────────────
-- Además de consulta y trabajador: accidente/enfermedad (evento), investigación, evaluación ergonómica,
-- informe de vigilancia y notificación de riesgos. Mismo motor (papelera_juntar/eliminar/restaurar): idéntico al
-- restaurar, motivo obligatorio y bitácora. Las fotos de ergonomía se quedan en su carpeta para poder restaurarla.

alter table public.papelera drop constraint if exists papelera_tipo_check;
alter table public.papelera add constraint papelera_tipo_check check (tipo in
  ('consulta', 'trabajador', 'evento', 'investigacion', 'ergonomia', 'informe_vigilancia', 'notificacion_riesgo'));

create or replace function public.papelera_tabla(p_tipo text)
returns regclass language sql immutable set search_path = '' as $$
  select case p_tipo
    when 'consulta' then 'clinico.consultas'::regclass
    when 'trabajador' then 'public.trabajadores'::regclass
    when 'evento' then 'public.eventos'::regclass
    when 'investigacion' then 'clinico.investigaciones'::regclass
    when 'ergonomia' then 'public.evaluaciones_ergonomicas'::regclass
    when 'informe_vigilancia' then 'public.informes_vigilancia'::regclass
    when 'notificacion_riesgo' then 'public.notificaciones_riesgo'::regclass
  end
$$;

-- Cuántas filas juntadas están firmadas o cerradas (la pantalla pide escribir ELIMINAR si hay alguna)
create or replace function public.papelera_cerradas(p_filas jsonb)
returns int language sql immutable set search_path = '' as $$
  select count(*)::int from jsonb_array_elements(p_filas) e
   where (e ->> 't' = 'clinico.consultas' and e -> 'f' ->> 'estado' = 'firmada')
      or (e ->> 't' = 'public.eventos' and e -> 'f' ->> 'estado' = 'cerrado')
      or (e ->> 't' = 'clinico.investigaciones' and e -> 'f' ->> 'terminado_en' is not null)
      or (e ->> 't' = 'public.evaluaciones_ergonomicas' and e -> 'f' ->> 'cerrada_en' is not null)
      or (e ->> 't' = 'public.notificaciones_riesgo' and e -> 'f' ->> 'firmada_en' is not null)
$$;

create or replace function public.papelera_vista_previa(p_tipo text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_filas jsonb;
  v_enlaces jsonb;
  v_tabla regclass := public.papelera_tabla(p_tipo);
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
    'firmadas', public.papelera_cerradas(v_filas),
    'sueltas', (select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
                  from (select e ->> 't' as t, count(*) as n from jsonb_array_elements(v_enlaces) e
                         where not exists (select 1 from jsonb_array_elements(v_filas) f where f ->> 't' = e ->> 't'
                                             and (select bool_and(f -> 'f' -> k = e -> 'k' -> k) from jsonb_object_keys(e -> 'k') k))
                         group by 1) x));
end $$;

-- Eliminar cualquier documento que no sea consulta ni trabajador (esos siguen con su propia función)
create or replace function public.eliminar_documento(p_tipo text, p_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tabla regclass := public.papelera_tabla(p_tipo);
  v_org uuid;
  v_titulo text;
begin
  if v_tabla is null or p_tipo in ('consulta', 'trabajador') then raise exception 'Tipo desconocido'; end if;
  execute format('select org_id from %s where id = $1', v_tabla) into v_org using p_id;
  if v_org is null then raise exception 'Ya no existe (puede que ya se haya eliminado).'; end if;
  if not (public.es_admin(v_org) and public.es_clinico(v_org)) then
    raise exception 'Solo el administrador con acceso clínico puede eliminar.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe el motivo (al menos 5 letras).'; end if;

  if p_tipo = 'evento' then
    select format('%s del %s%s', initcap(replace(e.tipo::text, '_', ' ')), to_char(e.fecha_hora at time zone 'America/Caracas', 'DD/MM/YYYY'),
                  coalesce(' · ' || t.nombres || ' ' || t.apellidos, ''))
      into v_titulo from public.eventos e left join public.trabajadores t on t.id = e.trabajador_id where e.id = p_id;
  elsif p_tipo = 'investigacion' then
    select format('Investigación%s%s', coalesce(' del evento ' || e.numero::text, ''), coalesce(' · ' || t.nombres || ' ' || t.apellidos, ''))
      into v_titulo from clinico.investigaciones i left join public.eventos e on e.id = i.evento_id
      left join public.trabajadores t on t.id = coalesce(i.trabajador_id, e.trabajador_id) where i.id = p_id;
  elsif p_tipo = 'ergonomia' then
    select format('Ergonomía %s · %s%s', upper(x.metodo::text), coalesce(x.puesto, 'sin puesto'), coalesce(' · ' || to_char(x.fecha, 'DD/MM/YYYY'), ''))
      into v_titulo from public.evaluaciones_ergonomicas x where x.id = p_id;
  elsif p_tipo = 'informe_vigilancia' then
    select format('Informe de vigilancia %s al %s%s', to_char(i.desde, 'DD/MM/YYYY'), to_char(i.hasta, 'DD/MM/YYYY'), coalesce(' · ' || em.razon_social, ' · todas las empresas'))
      into v_titulo from public.informes_vigilancia i left join public.empresas em on em.id = i.empresa_id where i.id = p_id;
  elsif p_tipo = 'notificacion_riesgo' then
    select format('Notificación de riesgos · %s %s%s', t.nombres, t.apellidos, coalesce(' · ' || n.puesto, ''))
      into v_titulo from public.notificaciones_riesgo n left join public.trabajadores t on t.id = n.trabajador_id where n.id = p_id;
  end if;

  return public.papelera_eliminar(v_org, p_tipo, v_tabla, p_id, coalesce(v_titulo, 'Documento'), p_motivo);
end $$;

-- Restaurar: igual que antes; solo la bitácora anota la tabla correcta de cada tipo
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
          raise exception 'No se puede restaurar: ya existe otro registro igual (%). Si registraste de nuevo lo mismo, elimina o corrige ese registro primero.', e ->> 't';
      end;
    end loop;
    if jsonb_array_length(v_resto) = jsonb_array_length(v_pend) then
      raise exception 'No se puede restaurar: falta un dato del que depende (%). Si pertenece a un trabajador o un accidente eliminado, restaura ese primero.', v_falla;
    end if;
    v_pend := v_resto;
  end loop;

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
  values (p.org_id, auth.uid(), public.papelera_tabla(p.tipo)::text, p.objeto_id,
          'RESTAURAR_DE_PAPELERA', null, jsonb_build_object('papelera_id', p.id, 'titulo', p.titulo));
  return p.titulo;
end $$;

revoke execute on function public.papelera_tabla(text), public.papelera_cerradas(jsonb) from public, anon, authenticated;
revoke execute on function public.eliminar_documento(text, uuid, text) from public, anon;
grant execute on function public.eliminar_documento(text, uuid, text) to authenticated;
