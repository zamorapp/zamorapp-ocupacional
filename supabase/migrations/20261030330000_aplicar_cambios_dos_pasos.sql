-- zamorApp · Fase A (local primero): aplicar_cambios() exige la verificación en dos pasos cumplida
-- (dos_pasos_cumplido(): aal2, equipo de confianza o rol sin dos pasos). Mismo cuerpo que 20261026100000 más esa comprobación.

-- p_lote: [{id, tabla, fila_id, op: I|U|D, version_base, datos}] (en I, datos es la fila completa; en U, solo lo que cambió).
-- Devuelve por cambio: {id, estado: aplicado|duplicado|conflicto|rechazado, version, motivo}.
create or replace function public.aplicar_cambios(p_equipo uuid, p_secreto text, p_lote jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid;
  c jsonb; t sync.tablas; r jsonb; salida jsonb := '[]';
  v_id uuid; v_fila uuid; v_base bigint; v_actual bigint; v_nueva bigint; v_cols text[]; v_lista text;
  v_tocados text[]; v_n int; v_tipo text; v_motivo text; v_existente jsonb;
begin
  -- Fase A (local primero): subir cambios desde una PC exige el segundo paso (código) o un equipo de confianza,
  -- igual que guardar en la web. Una sesión aal1 de administrador o gerente médico no sube nada.
  if not public.dos_pasos_cumplido() then
    raise exception 'Falta la verificación en dos pasos para subir cambios desde este equipo' using errcode = '42501';
  end if;
  v_org := sync.equipo_valido(p_equipo, p_secreto);
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
        perform set_config('sync.cambio_id', v_id::text, true), set_config('sync.equipo_id', p_equipo::text, true),
                set_config('sync.hora_anclada', case when coalesce((c ->> 'hora_verificada')::boolean, false) then 'on' else 'off' end, true);
        execute format('select version from %s where id = $1', t.nombre) into v_actual using v_fila;

        if c ->> 'op' = 'I' then
          if v_actual is not null then
            -- Ya hay una fila con ese id: solo es «duplicado» (se descarta sin más) si trae el mismo contenido;
            -- con contenido distinto es un conflicto que alguien revisa (Analizar, 29-oct-2026).
            v_cols := sync.columnas(t.nombre, c -> 'datos', 'SELECT');
            select string_agg(quote_ident(x), ', ') into v_lista from unnest(v_cols) x;
            execute format('select to_jsonb(x) from (select %s from %s where id = $1) x', coalesce(v_lista, 'id'), t.nombre) into v_existente using v_fila;
            if v_existente @> ((c -> 'datos') - array['id', 'org_id', 'version', 'creado_en', 'actualizado_en']) then
              v_tipo := 'duplicado'; v_motivo := 'Ya existe una fila igual con ese id';
            else
              v_tipo := 'version'; v_motivo := 'Ya existe una fila con ese id y contenido distinto';
            end if;
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
            if v_actual is distinct from v_base then
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
          elsif v_actual is distinct from v_base then
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
        when unique_violation then v_tipo := 'version'; v_motivo := 'Choca con otra fila: ' || sqlerrm; -- conflicto, nunca «duplicado»
        when others then v_tipo := 'rechazado'; v_motivo := sqlerrm;
      end;
    end if;

    if v_tipo is null then
      r := jsonb_build_object('id', v_id, 'estado', 'aplicado', 'version', v_nueva);
    elsif v_tipo = 'duplicado' then -- la misma fila ya está igual: no hay nada que revisar ni conservar
      r := jsonb_build_object('id', v_id, 'estado', 'duplicado', 'version', v_actual, 'motivo', v_motivo);
    else
      insert into sync.conflictos (org_id, tabla, fila_id, tipo, motivo, cambio, equipo_id)
      values (v_org, coalesce(c ->> 'tabla', '?'), v_fila, v_tipo, v_motivo, c, p_equipo);
      r := jsonb_build_object('id', v_id, 'estado', case when v_tipo = 'rechazado' then 'rechazado' else 'conflicto' end,
                              'version', v_actual, 'motivo', v_motivo);
    end if;
    update sync.aplicados set resultado = r where cambio_id = v_id;
    salida := salida || jsonb_build_array(r);
  end loop;
  perform set_config('sync.cambio_id', '', true), set_config('sync.equipo_id', '', true), set_config('sync.hora_anclada', '', true);
  return salida;
end $$;

revoke execute on function public.aplicar_cambios(uuid, text, jsonb) from public, anon;
grant execute on function public.aplicar_cambios(uuid, text, jsonb) to authenticated;
