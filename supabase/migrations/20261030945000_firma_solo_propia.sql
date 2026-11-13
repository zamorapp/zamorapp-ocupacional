-- zamorApp Ocupacional · La firma y el sello de cada médico son solo suyos (decisión de Cesar, 13-nov-2026)
-- Antes (20261026007000) firma_sello(p_usuario) entregaba la firma de CUALQUIER médico a todo el personal clínico de
-- su organización (enfermería incluida), para cualquier uso. Ahora:
-- 1) firma_sello(p_usuario) solo devuelve la firma de quien la pide (Mi perfil, «Firmar y sellar PDF», sus documentos).
--    instantanea() de perfiles pasa por aquí: la copia del escritorio solo baja la firma del dueño de la sesión.
-- 2) firma_de_documento(tipo, id): para imprimir un documento, la firma de quien lo firmó, tomada del propio documento
--    (nadie elige de quién). Al firmante se la da siempre; al resto del personal clínico de la organización solo si el
--    documento ya está cerrado (Cesar: «Sí, solo lo que usted ya cerró»). RR. HH. y roles no clínicos: nunca.
create or replace function public.firma_sello(p_usuario uuid)
returns table (firma_url text, sello_url text)
language sql stable security definer set search_path = public as $$
  select p.firma_url, p.sello_url
  from public.perfiles p
  where p.id = p_usuario and p_usuario = auth.uid()
$$;
revoke execute on function public.firma_sello(uuid) from anon, public;
grant execute on function public.firma_sello(uuid) to authenticated;

create or replace function public.firma_de_documento(p_tipo text, p_id uuid)
returns table (firma_url text, sello_url text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
  v_firmante uuid;
  v_cerrado boolean;
begin
  if auth.uid() is null then return; end if;
  case p_tipo
    when 'consulta' then
      select c.org_id, c.medico_id, c.estado in ('cerrada', 'firmada') into v_org, v_firmante, v_cerrado
      from clinico.consultas c where c.id = p_id;
    when 'indicacion' then
      select i.org_id, i.medico_id, i.estado in ('emitida', 'cumplida') into v_org, v_firmante, v_cerrado
      from clinico.indicaciones i where i.id = p_id;
    when 'ergonomia' then
      select e.org_id, e.evaluado_por, e.estado = 'cerrada' into v_org, v_firmante, v_cerrado
      from public.evaluaciones_ergonomicas e where e.id = p_id;
    when 'riesgos' then
      select e.org_id, e.evaluado_por, e.estado = 'cerrada' into v_org, v_firmante, v_cerrado
      from public.evaluaciones_riesgos e where e.id = p_id;
    when 'psicosocial' then
      select e.org_id, e.creado_por, e.estado = 'cerrada' into v_org, v_firmante, v_cerrado
      from public.evaluaciones_psicosociales e where e.id = p_id;
    when 'puesto' then
      select p.org_id, p.evaluado_por, p.evaluado_en is not null into v_org, v_firmante, v_cerrado
      from public.puestos p where p.id = p_id;
    else return;
  end case;
  if v_firmante is null then return; end if;
  if v_firmante <> auth.uid() then
    if not coalesce(v_cerrado, false) or not public.es_clinico(v_org) then return; end if;
    -- El firmante debe seguir activo en esa organización
    if not exists (select 1 from public.miembros m where m.org_id = v_org and m.usuario_id = v_firmante and m.activo) then return; end if;
  end if;
  return query select p.firma_url, p.sello_url from public.perfiles p where p.id = v_firmante;
end $$;
revoke execute on function public.firma_de_documento(text, uuid) from anon, public;
grant execute on function public.firma_de_documento(text, uuid) to authenticated;
