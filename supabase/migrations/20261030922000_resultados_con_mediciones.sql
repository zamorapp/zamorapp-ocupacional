-- zamorApp Ocupacional · Goniometría y espirometría con valores (pedido de Cesar, 06-nov-2026)
-- «La goniometría en las evaluaciones, pero opcional: se puede hacer como no. Igualmente la espirometría.»
-- Se piden como un paraclínico más y sus valores viajan dentro del mismo examen: consultas.paraclinicos[].medicion
-- (sin columna nueva; la réplica del escritorio ya copia la consulta entera). guardar_consulta guarda la lista tal cual;
-- lo único que cambia es guardar_resultados (consulta cerrada, «Guardar resultados»), que antes descartaba todo lo
-- que no fuera resultado/estado/unidad/referencia: ahora también acepta «medicion», limitada a un objeto de 16 KB
-- con tipo goniometria o espirometria. Lo demás queda idéntico a 20261027170000_paraclinicos_digitales.sql.

create or replace function public.guardar_resultados(p_id uuid, p_resultados jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare c record; v jsonb;
begin
  select id, estado, paraclinicos into c from clinico.consultas where id = p_id;
  if not found then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  if c.estado = 'firmada' then raise exception 'La consulta está firmada: usa «Corregir» para cambiar resultados.'; end if;
  if jsonb_typeof(p_resultados) <> 'array' then raise exception 'Resultados inválidos.'; end if;
  if exists (select 1 from jsonb_array_elements(p_resultados) r
             where coalesce(r ->> 'estado', '') not in ('', 'normal', 'fuera', 'alterado')) then
    raise exception 'Estado de resultado inválido.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_resultados) r
             where r ? 'medicion' and jsonb_typeof(r -> 'medicion') <> 'null'
               and (jsonb_typeof(r -> 'medicion') <> 'object'
                    or coalesce(r -> 'medicion' ->> 'tipo', '') not in ('goniometria', 'espirometria')
                    or length((r -> 'medicion')::text) > 16384)) then
    raise exception 'Valores de goniometría o espirometría inválidos.';
  end if;
  perform 1 from clinico.consultas where id = p_id for update;

  select coalesce(jsonb_agg(
    case when r is null then p
         else (p - 'medicion') || jsonb_build_object(
           'resultado', left(coalesce(r ->> 'resultado', ''), 500),
           'estado', coalesce(r ->> 'estado', ''),
           'manual', coalesce((r ->> 'manual')::boolean, false),
           'unidad', left(coalesce(r ->> 'unidad', p ->> 'unidad', ''), 40),
           'referencia', left(coalesce(r ->> 'referencia', p ->> 'referencia', ''), 80))
           -- Sin «medicion» en lo enviado se conserva la que había; con null se borra
           || case when not (r ? 'medicion') then case when jsonb_typeof(p -> 'medicion') = 'object' then jsonb_build_object('medicion', p -> 'medicion') else '{}'::jsonb end
                   when jsonb_typeof(r -> 'medicion') = 'object' then jsonb_build_object('medicion', r -> 'medicion')
                   else '{}'::jsonb end
    end order by o), '[]') into v
  from jsonb_array_elements(coalesce(c.paraclinicos, '[]')) with ordinality as e(p, o)
  left join lateral (select x as r from jsonb_array_elements(p_resultados) x where x ->> 'id' = p ->> 'id' limit 1) m on true;

  update clinico.consultas set paraclinicos = v where id = p_id;
end $$;
revoke execute on function public.guardar_resultados(uuid, jsonb) from public, anon;
grant execute on function public.guardar_resultados(uuid, jsonb) to authenticated;
