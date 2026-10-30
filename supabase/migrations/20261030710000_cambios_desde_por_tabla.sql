-- La bajada del escritorio se trancaba (30-oct-2026): con la PC apagada unas horas, la nube acumuló miles de cambios
-- (cargos restaurados, clases de estudios) y cambios_desde armaba cada fila con sync.fila_visible, una consulta dinámica
-- por fila (en trabajadores además una lectura de information_schema y de la vista de salud). Un lote de 1.000 pasaba
-- los 8 s del rol authenticated, la nube lo cortaba («canceling statement due to statement timeout») y la PC repetía el
-- mismo pedido cada 30 s sin avanzar nunca.
-- Ahora se arma por tabla: una consulta por cada tabla del lote (id = any(...)), con las mismas reglas que fila_visible
-- (tabla entera legible, o solo las columnas permitidas, y salud de trabajadores solo desde la vista). Mismo resultado.

-- Filas visibles de una tabla, como objeto { id: fila }. Lo que el usuario no puede ver no aparece.
create or replace function sync.filas_visibles(p_tabla text, p_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_cols text; v jsonb;
begin
  perform p_tabla::regclass; -- solo una tabla que existe, nunca texto libre en el format de abajo (Analizar)
  if has_table_privilege(p_tabla, 'SELECT') then -- lo común: la tabla entera es legible
    execute format('select jsonb_object_agg(t.id, to_jsonb(t)) from %s t where t.id = any($1)', p_tabla) into v using p_ids;
    return coalesce(v, '{}');
  end if;
  select string_agg(format('t.%I', column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns where table_schema || '.' || table_name = p_tabla
     and has_column_privilege(p_tabla, column_name, 'SELECT');
  if v_cols is null then return '{}'; end if;
  execute format('select jsonb_object_agg(x.id, to_jsonb(x)) from (select %s from %s t where t.id = any($1)) x', v_cols, p_tabla)
    into v using p_ids;
  v := coalesce(v, '{}');
  if p_tabla = 'public.trabajadores' and v <> '{}' then
    select v || coalesce(jsonb_object_agg(s.id, (v -> s.id::text)
                 || jsonb_build_object('grupo_sanguineo', s.grupo_sanguineo, 'discapacidad', s.discapacidad)), '{}')
      into v
      from public.trabajadores_salud s where s.id = any(p_ids) and v ? s.id::text;
  end if;
  return v;
end $$;
revoke execute on function sync.filas_visibles(text, uuid[]) from public, anon;
grant execute on function sync.filas_visibles(text, uuid[]) to authenticated;

create or replace function public.cambios_desde(p_equipo uuid, p_secreto text, p_desde bigint, p_limite int default 500)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := sync.equipo_valido(p_equipo, p_secreto);
  v_lote sync.registro[];
  v_hasta bigint;
  v_filas jsonb := '{}'; -- { tabla: { id: fila } }
  t text;
  cambios jsonb;
begin
  select array_agg(g order by g.seq) into v_lote
    from (select * from sync.registro
           where (org_id = v_org or org_id is null) and seq > p_desde order by seq limit least(greatest(p_limite, 1), 2000)) g;
  if v_lote is null then return jsonb_build_object('hasta', p_desde, 'cambios', '[]'::jsonb); end if;
  v_hasta := v_lote[array_upper(v_lote, 1)].seq;

  for t in select distinct l.tabla from unnest(v_lote) l where l.op <> 'D' loop
    v_filas := v_filas || jsonb_build_object(t, sync.filas_visibles(t,
      array(select distinct l.fila_id from unnest(v_lote) l where l.tabla = t and l.op <> 'D')));
  end loop;

  -- Una fila no visible para este usuario (o borrada después: llega su D) no se manda
  select coalesce(jsonb_agg(jsonb_build_object('seq', l.seq, 'tabla', l.tabla, 'fila_id', l.fila_id, 'op', l.op,
           'version', coalesce((f.fila ->> 'version')::bigint, l.version), 'cambio_id', l.cambio_id, 'fila', f.fila) order by l.seq), '[]')
    into cambios
    from unnest(v_lote) l
    cross join lateral (select case when l.op = 'D' then null else v_filas -> l.tabla -> l.fila_id::text end as fila) f
   where l.op = 'D' or f.fila is not null;
  return jsonb_build_object('hasta', v_hasta, 'cambios', cambios);
end $$;
