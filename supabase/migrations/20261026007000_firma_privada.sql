-- zamorApp Ocupacional · Imágenes de firma y sello privadas
-- Cualquier miembro de la organización (incluido RR. HH. de una empresa cliente) podía leer la firma y el
-- sello escaneados de los médicos desde la tabla perfiles y falsificar constancias o reposos.
-- Ahora esas dos columnas no se leen directamente: las ve el propio médico y el personal clínico de su
-- organización (para imprimir documentos), mediante firma_sello().
revoke select on public.perfiles from anon, authenticated;
grant select (id, nombre_completo, cedula, telefono, mpps, colegio_medicos, registro_inpsasel, creado_en,
              mostrar_firma, mostrar_sello) on public.perfiles to authenticated;

create or replace function public.firma_sello(p_usuario uuid)
returns table (firma_url text, sello_url text)
language sql stable security definer set search_path = public as $$
  select p.firma_url, p.sello_url
  from public.perfiles p
  where p.id = p_usuario
    and (p_usuario = auth.uid()
         or exists (select 1 from public.miembros yo
                    join public.miembros el on el.org_id = yo.org_id and el.usuario_id = p_usuario and el.activo
                    where yo.usuario_id = auth.uid() and yo.activo and public.es_clinico(yo.org_id)))
$$;
revoke execute on function public.firma_sello(uuid) from anon, public;
grant execute on function public.firma_sello(uuid) to authenticated;
