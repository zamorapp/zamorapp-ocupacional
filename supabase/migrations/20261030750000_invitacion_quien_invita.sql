-- Invitación de RR. HH. (Cesar, 31-oct): la página del enlace dice «Le invita el Dr. César Zamora». El texto vive en
-- Configuración › Organización (ajustes.invita_como), nunca en el código; vacío = como antes («<organización> te invita»).
-- Y si quien abre el enlace ya tiene sesión con una cuenta del servicio (Cesar lo probó en su celular con su sesión de
-- médico abierta): otro_rol avisa para ofrecer «Salir y crear la cuenta de RR. HH.» en vez de un error sin salida.
-- Cambia el tipo que devuelve: hay que borrarla y crearla de nuevo (misma firma para el guardián).
drop function if exists public.ver_invitacion(text);
create function public.ver_invitacion(p_token text)
returns table (empresa text, organizacion text, nombre text, estado text, invita text, otro_rol boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(e.nombre_comercial, e.razon_social), o.nombre, i.nombre,
         case when i.revocada_en is not null then 'anulada'
              when i.usada_en is not null then 'usada'
              when i.vence < now() then 'vencida'
              else 'vigente' end,
         nullif(btrim(left(o.ajustes ->> 'invita_como', 120)), ''),
         exists (select 1 from public.miembros m where m.org_id = i.org_id and m.usuario_id = auth.uid() and m.rol <> 'gerente_empresa')
  from public.invitaciones i
  join public.empresas e on e.id = i.empresa_id
  join public.organizaciones o on o.id = i.org_id
  where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
$$;
revoke execute on function public.ver_invitacion(text) from public;
grant execute on function public.ver_invitacion(text) to anon, authenticated;
