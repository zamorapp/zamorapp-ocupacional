-- zamorApp Ocupacional · «Firmar y sellar PDF» deja rastro (Documentos › Firmar y sellar PDF, PR #368)
-- El PDF nunca se sube: solo se anota en la bitácora quién estampó su firma y sello, en qué archivo (nombre),
-- en qué páginas y cuándo (hora del servidor). Sirve para responder después «¿yo firmé esto?».
-- Solo los roles firmantes con acceso clínico (administrador, gerente médico, médico), igual que la pantalla.
create or replace function public.registrar_firma_pdf(p_org uuid, p_archivo text, p_paginas int[], p_total int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.miembros m
    where m.org_id = p_org and m.usuario_id = auth.uid() and m.activo
      and m.rol in ('administrador', 'gerente_medico', 'medico') and public.es_clinico(p_org)
  ) then
    raise exception 'Solo el médico firmante puede estampar su firma y sello' using errcode = '42501';
  end if;
  insert into public.bitacora (org_id, usuario_id, tabla, accion, despues)
  values (p_org, auth.uid(), 'documento.pdf', 'FIRMA_PDF',
          jsonb_build_object('archivo', left(coalesce(nullif(btrim(p_archivo), ''), 'sin nombre'), 200),
                             'paginas', (select coalesce(array_agg(x), '{}') from unnest(p_paginas[1:500]) x where x between 1 and 100000),
                             'total', greatest(coalesce(p_total, 0), 0)));
end $$;
revoke execute on function public.registrar_firma_pdf(uuid, text, int[], int) from anon, public;
grant execute on function public.registrar_firma_pdf(uuid, text, int[], int) to authenticated;
