-- zamorApp Ocupacional · Firma y sello del médico en la copia del escritorio, y titular en el membrete
-- Causa (04-nov-2026): «Firmar y cerrar» en el escritorio imprimía sin firma ni sello. La copia local de perfiles
-- se baja con instantanea(), que solo lleva las columnas que el rol puede leer, y firma_url/sello_url no se leen
-- directo desde 20261026007000 (firma privada). La PC quedaba con firma_url nula y su firma_sello() local no
-- devolvía nada, aunque en la nube estaban cargadas.
-- Arreglo: para perfiles, instantanea() agrega firma y sello pasando por firma_sello(), que aplica la misma regla de
-- la nube (el propio médico o personal clínico de su organización). A RR. HH. y a un rol no clínico no le llegan.
-- En la PC, firma_sello() local sigue filtrando con la misma regla.

create or replace function public.instantanea(p_equipo uuid, p_secreto text, p_tabla text,
                                              p_despues uuid default null, p_limite int default 1000)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid := sync.equipo_valido(p_equipo, p_secreto);
  v_seq bigint := (select coalesce(max(seq), 0) from sync.registro);
  v_cols text; v_tiene_id boolean; v_filas jsonb; v_extra text := '';
begin
  if p_tabla not in (select nombre from sync.tablas) and p_tabla not in
     ('public.organizaciones', 'public.perfiles', 'public.listas', 'public.cie10', 'public.precios_empresa', 'public.tasas_bcv') then
    raise exception 'Tabla no disponible para la copia: %', p_tabla;
  end if;
  select string_agg(format('t.%I', column_name), ', ' order by ordinal_position), bool_or(column_name = 'id')
    into v_cols, v_tiene_id
    from information_schema.columns where table_schema || '.' || table_name = p_tabla
     and has_column_privilege(p_tabla, column_name, 'SELECT');
  if p_tabla = 'public.trabajadores' then
    v_extra := ' || coalesce((select jsonb_build_object(''grupo_sanguineo'', s.grupo_sanguineo, ''discapacidad'', s.discapacidad)
                               from public.trabajadores_salud s where s.id = x.id), ''{}'')';
  elsif p_tabla = 'public.perfiles' then
    -- firma_sello() devuelve 0 filas si quien baja no puede verla: la fila llega sin esas dos claves
    v_extra := ' || coalesce((select jsonb_build_object(''firma_url'', f.firma_url, ''sello_url'', f.sello_url)
                               from public.firma_sello(x.id) f), ''{}'')';
  end if;
  if v_tiene_id then
    execute format('select coalesce(jsonb_agg(f order by f->>''id''), ''[]'') from (
                      select to_jsonb(x)%s f from (select %s from %s t where $1 is null or t.id > $1 order by t.id limit $2) x) y',
                   v_extra, v_cols, p_tabla)
      into v_filas using p_despues, least(greatest(p_limite, 1), 5000);
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from (select %s from %s t) x', v_cols, p_tabla) into v_filas;
  end if;
  return jsonb_build_object('seq', v_seq, 'filas', v_filas,
    'ultimo', case when v_tiene_id and jsonb_array_length(v_filas) > 0 then v_filas -> -1 ->> 'id' end);
end $$;

-- Huella de los catálogos que la PC copia (sin cie10, que no cambia): la PC la compara con la última que bajó y
-- vuelve a bajar solo el catálogo que cambió. Antes los catálogos (organización, perfiles, listas) bajaban solo en
-- la copia completa: un cambio hecho después (firma cargada, ajustes del membrete) no llegaba nunca a la PC.
-- Usa instantanea() por páginas: la misma regla de visibilidad, y la huella cambia si cambia algo que la PC recibiría.
create or replace function public.huella_catalogos(p_equipo uuid, p_secreto text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  t text; r jsonb; v_despues uuid; h text; salida jsonb := '{}';
begin
  perform sync.equipo_valido(p_equipo, p_secreto);
  foreach t in array array['public.organizaciones', 'public.perfiles', 'public.listas', 'public.precios_empresa', 'public.tasas_bcv'] loop
    h := ''; v_despues := null;
    loop
      r := public.instantanea(p_equipo, p_secreto, t, v_despues, 2000);
      h := md5(h || (r -> 'filas')::text);
      exit when r ->> 'ultimo' is null or jsonb_array_length(r -> 'filas') < 2000;
      v_despues := (r ->> 'ultimo')::uuid;
    end loop;
    salida := salida || jsonb_build_object(t, h);
  end loop;
  return salida;
end $$;
revoke execute on function public.huella_catalogos(uuid, text) from public, anon;
grant execute on function public.huella_catalogos(uuid, text) to authenticated;

-- Membrete (pedido de Cesar, 03-nov-2026): el titular va primero en todos los impresos. Es un dato de la organización
-- (Configuración › Organización › «Médico titular»): aquí solo se carga una vez para la organización de ese RIF si
-- todavía no lo tiene; después se edita desde la pantalla.
update public.organizaciones
   set ajustes = coalesce(ajustes, '{}') || jsonb_build_object(
         'membrete_titular', 'Dr. César Zamora',
         'membrete_credenciales', 'Especialista en Medicina del Trabajo, mención Salud Ocupacional (UDO – UNEG)')
 where rif = 'V-13475931-0' and not coalesce(ajustes, '{}') ? 'membrete_titular';
