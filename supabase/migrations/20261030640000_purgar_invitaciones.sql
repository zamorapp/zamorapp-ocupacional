-- La rutina de mantenimiento también limpia las invitaciones de RR. HH. que ya no sirven: vencidas o anuladas,
-- sin usar y con más de 30 días. Las usadas se conservan siempre (registro de quién entró, con qué enlace y cuándo).
-- Cada invitación pesa menos de 1 KB; la limpieza es por orden, no por espacio.
create or replace function public.mantenimiento_purgar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pdf integer; v_registros integer; v_invitaciones integer;
begin
  delete from public.envio_archivos a using public.envio_enlaces l
   where l.id = a.enlace_id and (l.vence < now() or l.revocado_en is not null);
  get diagnostics v_pdf = row_count;
  delete from public.respaldos where fecha < now() - interval '1 year';
  get diagnostics v_registros = row_count;
  delete from public.invitaciones
   where usada_en is null
     and coalesce(revocada_en, vence) < now() - interval '30 days';
  get diagnostics v_invitaciones = row_count;
  return jsonb_build_object('pdf_enlaces_vencidos', v_pdf, 'registros_respaldo_viejos', v_registros, 'invitaciones_viejas', v_invitaciones);
end $$;
revoke execute on function public.mantenimiento_purgar() from public, anon, authenticated;
