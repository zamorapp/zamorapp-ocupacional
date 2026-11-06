-- Enlace del paciente: las hojas firmadas salen con la imagen de la firma y el sello del médico (Cesar, 06-nov-2026,
-- «sí firma en enlace»). Las imágenes NUNCA llegan al navegador del paciente: el servidor de zamorApp arma el PDF
-- (Chromium) y las incrusta; el paciente recibe un PDF aplanado. Para pedirlas, el servidor presenta su clave
-- (la misma de los avisos y la tasa BCV, solo en Vercel; la base guarda su sha256 en avisos_push_clave) y el token.
--   · Solo si el enlace sigue entregando hojas (documentos_registro_paciente: llenado, vigente, ventana de descarga)
--   · Solo si se creó «Firmados a mi nombre» y solo las imágenes de quien lo creó, con sus casillas «mostrar».
--   · Sin la clave del servidor de ESA organización no devuelve nada: un anónimo con el token no ve las imágenes.

create or replace function public.firma_registro_pdf(p_clave text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.solicitudes_paciente;
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
begin
  if length(coalesce(p_clave, '')) < 32 or public.documentos_registro_paciente(p_token) is null then return null; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v.id is null or coalesce((v.documentos->>'firma')::boolean, false) is not true
     or not exists (select 1 from public.avisos_push_clave k where k.org_id = v.org_id and k.clave_hash = v_hash) then
    return null;
  end if;
  return (select jsonb_build_object(
            'firma', case when p.mostrar_firma is not false then p.firma_url end,
            'sello', case when p.mostrar_sello is not false then p.sello_url end)
            from public.perfiles p where p.id = v.creado_por);
end $$;
revoke execute on function public.firma_registro_pdf(text, text) from public;
-- anon a propósito: el servidor llama sin sesión; la llave es la clave del servidor (como tasa_bcv_ultima_fecha)
grant execute on function public.firma_registro_pdf(text, text) to anon, authenticated;
comment on function public.firma_registro_pdf(text, text) is
  'Firma y sello del médico para el PDF aplanado del enlace del paciente. Exige la clave del servidor de la organización.';
