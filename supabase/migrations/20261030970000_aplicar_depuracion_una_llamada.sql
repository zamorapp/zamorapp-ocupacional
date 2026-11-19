-- Confirmar la depuración de nómina en UNA llamada (Cesar 18-nov-2026: 76 personas, el botón giró y no aplicó nada;
-- «arreglar los dos problemas de raíz de una vez»).
--
-- Causa: confirmarDepuracion llamaba aplicarParteNomina (una RPC por motivo) en serie dentro de la acción; en el celular
-- la acción moría antes de terminar y el botón quedaba girando para siempre. Nada se guardaba.
--
-- Solución: public.aplicar_depuracion_nomina(p_id, p_excluir) hace TODO dentro de la base en una sola ida y vuelta:
-- lee la depuración con llave, agrupa los «ya no está» por su motivo (igual que la pantalla), llama aplicar_nomina por
-- grupo encadenando el mismo lote y cierra la depuración. Los agregados con cédula (pocos) los sigue haciendo la
-- acción por el camino de siempre, sobre el lote que esta función devuelve.
-- p_excluir: los «ya no está» que Cesar DESMARCÓ en la pantalla (la base solo quita de su propia lista; el navegador
-- nunca puede agregar a nadie que RR. HH. no haya marcado).
create or replace function public.aplicar_depuracion_nomina(p_id uuid, p_excluir uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.depuraciones_nomina;
  v_hoy date := public.hoy_caracas();
  v_dma text;
  v_lote uuid;
  v_motivo text;
  v_ids uuid[];
  v_parte jsonb;
  v_inactivados int := 0;
begin
  select * into d from public.depuraciones_nomina where id = p_id for update;
  if d.id is null or not public.maneja_depuracion(d.org_id, d.empresa_id) then
    raise exception 'Solo el administrador o el personal de salud confirman la depuración' using errcode = '42501';
  end if;
  if d.aplicado_en is not null or d.anulado_en is not null then
    raise exception 'Esta revisión ya se cerró' using errcode = '22023';
  end if;
  v_dma := to_char(v_hoy, 'DD/MM/YYYY');
  -- Un grupo por motivo (el texto queda en la ficha de cada uno), todos en el mismo lote (un solo «Deshacer»)
  for v_motivo, v_ids in
    select 'Ya no está según RR. HH. (' || v_dma || ')' || case when nullif(btrim(r.value ->> 'm'), '') is not null
             then ': ' || btrim(r.value ->> 'm') else '' end,
           array_agg((r.key)::uuid order by t.apellidos, t.nombres)
      from jsonb_each(d.respuestas) r
      join public.trabajadores t on t.id = (r.key)::uuid and t.org_id = d.org_id
     where r.value ->> 'e' = 'no' and t.empresa_id = d.empresa_id and t.estado in ('activo', 'reposo', 'aspirante')
       and not ((r.key)::uuid = any (coalesce(p_excluir, '{}')))
     group by 1
  loop
    v_parte := public.aplicar_nomina(v_lote, d.empresa_id, 'Enlace RR. HH. ' || v_dma, '[]'::jsonb, '[]'::jsonb, v_ids, v_motivo);
    v_lote := (v_parte ->> 'lote')::uuid;
    v_inactivados := v_inactivados + (v_parte ->> 'inactivados')::int;
  end loop;
  -- Solo se cierra si se aplicó algo; sin «ya no está» la acción decide según los agregados
  if v_lote is not null then
    update public.depuraciones_nomina set aplicado_en = coalesce(aplicado_en, public.ahora()), lote_id = v_lote where id = p_id;
  end if;
  return jsonb_build_object('lote', v_lote, 'inactivados', v_inactivados, 'cerrada', v_lote is not null);
end $$;
revoke execute on function public.aplicar_depuracion_nomina(uuid, uuid[]) from public, anon;
grant execute on function public.aplicar_depuracion_nomina(uuid, uuid[]) to authenticated;
