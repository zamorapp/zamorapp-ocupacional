-- zamorApp Ocupacional · Enlace de registro: la orden se separa por clase de estudio (pedido de Cesar, 06-nov-2026)
-- «Separar lo que es imágenes de los exámenes de sangre: Rx de tórax en otra orden, así mismo un eco o una TAC».
-- Cada examen elegido guarda su clase (laboratorio, rayos X, eco, tomografía, resonancia, otra imagen o estudio
-- funcional), calculada al crear el enlace con el catálogo de paraclínicos. Al descargar, sale una orden por clase.
-- Solo cambia la limpieza de lo elegido (20261030906000): ahora también acepta «clase» de una lista cerrada.

create or replace function public.limpiar_documentos_registro(p jsonb, p_org uuid)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  salida jsonb := '{}'::jsonb;
  o jsonb; ex jsonb := '[]'::jsonb; e jsonb; m uuid; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  o := p->'orden';
  if jsonb_typeof(o) = 'object' and jsonb_typeof(o->'examenes') = 'array' then
    for e in select * from jsonb_array_elements(o->'examenes') loop
      exit when n >= 60;
      if jsonb_typeof(e) = 'object' and length(btrim(coalesce(e->>'nombre', ''))) between 1 and 120 then
        ex := ex || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'nombre', btrim(e->>'nombre'), 'grupo', nullif(left(btrim(coalesce(e->>'grupo', '')), 80), ''),
          -- Clase del estudio (src/lib/estudios.ts): cada clase sale en su propia orden
          'clase', case when e->>'clase' in ('laboratorio','eco','rayos_x','tomografia','resonancia','imagen','espirometria','audiometria','electrocardiograma','funcional')
                        then e->>'clase' end)));
        n := n + 1;
      end if;
    end loop;
    begin m := (o->>'motivo_id')::uuid; exception when others then m := null; end;
    if m is not null and not exists (select 1 from public.lista_items i where i.id = m and i.org_id = p_org and i.lista = 'motivo_consulta') then m := null; end if;
    if jsonb_array_length(ex) > 0 then
      salida := salida || jsonb_build_object('orden', jsonb_strip_nulls(jsonb_build_object(
        'examenes', ex, 'motivo_id', m, 'perfil', nullif(left(btrim(coalesce(o->>'perfil', '')), 120), ''))));
    end if;
  end if;
  if jsonb_typeof(p->'control_ta') = 'object' then
    salida := salida || jsonb_build_object('control_ta', jsonb_build_object('dias', case when p->'control_ta'->>'dias' = '14' then 14 else 7 end));
  end if;
  if jsonb_typeof(p->'dieta') = 'object' then
    salida := salida || jsonb_build_object('dieta', jsonb_build_object(
      'dieta', case when coalesce(p->'dieta'->>'dieta', '') ~ '^[a-z_-]{1,30}$' then p->'dieta'->>'dieta' else 'general' end,
      'plan', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p->'dieta'->'plan') = 'array' then p->'dieta'->'plan' else '[]' end) x
                          where x ~ '^[a-z_-]{1,30}$' limit 10) t), '[]'::jsonb)));
  end if;
  if jsonb_typeof(p->'bienestar') = 'object' then
    salida := salida || jsonb_build_object('bienestar', jsonb_build_object(
      'tema', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p->'bienestar'->'tema') = 'array' then p->'bienestar'->'tema' else '[]' end) x
                          where x ~ '^[a-z_-]{1,30}$' limit 12) t), '[]'::jsonb)));
  end if;
  if salida <> '{}'::jsonb and p->>'firma' = 'true' then salida := salida || '{"firma": true}'::jsonb; end if;
  return salida;
end $$;
revoke execute on function public.limpiar_documentos_registro(jsonb, uuid) from public, anon;
grant execute on function public.limpiar_documentos_registro(jsonb, uuid) to authenticated;
