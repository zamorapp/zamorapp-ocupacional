-- Enlace del paciente: descarga una sola vez (pedido de Cesar, 06-nov-2026). «Después que los descargue, que el enlace
-- quede solo para subir resultados; para volver a descargar le mando un enlace nuevo».
-- Las hojas no se guardan como PDF: se arman al abrirlas con lo que el servicio eligió (solicitudes_paciente.documentos)
-- y los datos del paciente. Al tocar «Descargar PDF» por primera vez se abre una ventana de 30 minutos para bajar todas
-- (si el teléfono falla, puede reintentar); al cerrarse, documentos_registro_paciente ya no las entrega y la limpieza de
-- la bandeja del servicio vacía lo elegido. La subida de resultados (20261030912000) no cambia: sigue 30 días.

alter table public.solicitudes_paciente add column if not exists descarga_hasta timestamptz;
comment on column public.solicitudes_paciente.descarga_hasta is
  'Fin de la ventana de descarga: se fija al primer «Descargar PDF» (30 minutos). Después solo queda subir resultados.';

-- ===== 1. Las hojas no se entregan pasada la ventana =====
-- Solo se agregan la condición y el dato «descarga_hasta» (texto exacto, una vez, como 20261030912000) para no pisar el resto.
do $$
declare
  v_def text := pg_get_functiondef('public.documentos_registro_paciente(text)'::regprocedure);
  v_cond text := 'or v.documentos = ''{}''::jsonb or v.recibido_en < now() - interval ''7 days'' then';
  v_dato text := '''recibido'', v.recibido_en,';
begin
  if (length(v_def) - length(replace(v_def, v_cond, ''))) / length(v_cond) <> 1
     or (length(v_def) - length(replace(v_def, v_dato, ''))) / length(v_dato) <> 1 then
    raise exception 'documentos_registro_paciente cambió: revisar 20261030915000 antes de aplicarla';
  end if;
  v_def := replace(v_def, v_cond, 'or v.documentos = ''{}''::jsonb or v.recibido_en < now() - interval ''7 days''
     or v.descarga_hasta < public.ahora() then');
  execute replace(v_def, v_dato, v_dato || ' ''descarga_hasta'', v.descarga_hasta,');
end $$;

-- ===== 2. Primer «Descargar PDF»: abre la ventana de 30 minutos (no la alarga) =====
create or replace function public.marcar_descarga_registro(p_token text)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare v_hasta timestamptz;
begin
  if public.documentos_registro_paciente(p_token) is null then return null; end if;
  update public.solicitudes_paciente set descarga_hasta = coalesce(descarga_hasta, public.ahora() + interval '30 minutes')
   where token_hash = sha256(convert_to(p_token, 'UTF8'))
  returning descarga_hasta into v_hasta;
  return v_hasta;
end $$;
revoke execute on function public.marcar_descarga_registro(text) from public;
-- Pública a propósito: el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.marcar_descarga_registro(text) to anon, authenticated;

-- ===== 3. ¿Ya los descargó? Para el aviso «Tus documentos ya fueron descargados» =====
create or replace function public.descarga_cerrada_registro(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select s.descarga_hasta < public.ahora() and s.anulado_en is null
                     from public.solicitudes_paciente s
                    where p_token is not null and length(p_token) between 40 and 60
                      and s.token_hash = sha256(convert_to(p_token, 'UTF8'))), false)
$$;
revoke execute on function public.descarga_cerrada_registro(text) from public;
grant execute on function public.descarga_cerrada_registro(text) to anon, authenticated;

-- ===== 4. Limpieza: lo elegido se borra al cerrarse la descarga o a los 7 días =====
-- La sigue llamando la bandeja del servicio (paciente-enlace-acciones.ts), solo para sus organizaciones.
create or replace function public.purgar_solicitudes_paciente()
returns void language plpgsql security definer set search_path = public as $$
declare v_orgs uuid[] := public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true);
begin
  update public.solicitudes_paciente set datos = '{}'::jsonb
   where org_id = any (v_orgs) and resultado = 'descartada' and revisado_en < now() - interval '30 days' and datos <> '{}'::jsonb;
  update public.solicitudes_paciente set documentos = '{}'::jsonb
   where org_id = any (v_orgs) and documentos <> '{}'::jsonb
     and (descarga_hasta < public.ahora() or recibido_en < public.ahora() - interval '7 days');
end $$;
revoke execute on function public.purgar_solicitudes_paciente() from public, anon;
grant execute on function public.purgar_solicitudes_paciente() to authenticated;
