-- zamorApp Ocupacional · Mantenimiento automático (lo llama el respaldo diario de la PC con la clave de la base).
-- Solo purga copias temporales que ya no sirven; nunca toca datos clínicos, consultas, pacientes ni firmas.

-- PDF guardados para enlaces de WhatsApp vencidos o revocados (el enlace queda como constancia del envío).
create or replace function public.mantenimiento_purgar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pdf integer;
begin
  delete from public.envio_archivos a using public.envio_enlaces l
   where l.id = a.enlace_id and (l.vence < now() or l.revocado_en is not null);
  get diagnostics v_pdf = row_count;
  return jsonb_build_object('pdf_enlaces_vencidos', v_pdf);
end $$;

-- Resumen de espacio y archivos de Storage sin registro (huérfanos): solo informa, no borra.
-- El borrado de archivos va por la API de Storage, nunca con delete en storage.objects.
create or replace function public.mantenimiento_resumen()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'storage_mb', (select round(coalesce(sum((to_jsonb(o) -> 'metadata' ->> 'size')::bigint), 0) / 1048576.0, 1) from storage.objects o),
    'adjuntos_huerfanos', (select count(*) from storage.objects o where o.bucket_id = 'adjuntos'
                             and not exists (select 1 from clinico.adjuntos a where a.ruta = o.name)),
    'solicitudes_huerfanos', (select count(*) from storage.objects o where o.bucket_id = 'solicitudes'
                                and not exists (select 1 from public.solicitudes s where s.documento_ruta = o.name)),
    'pdf_enlaces_mb', (select round(coalesce(sum(length(contenido)), 0) / 1048576.0, 1) from public.envio_archivos))
$$;

revoke execute on function public.mantenimiento_purgar(), public.mantenimiento_resumen() from public, anon, authenticated;
