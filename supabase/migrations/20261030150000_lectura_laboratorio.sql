-- zamorApp Ocupacional · Lectura de resultados de laboratorio (foto o PDF) y «Consulta médica general»
-- La lectura corre en el navegador (pdfjs / Tesseract.js servidos por la app): nada clínico sale del equipo.
-- Los resultados se guardan por el camino de siempre (guardar_consulta / guardar_resultados, con su RLS);
-- aquí solo queda la constancia en la bitácora de cada lectura registrada y de la cédula ignorada.

-- ─── 1. Bitácora de la lectura ───────────────────────────────
create or replace function public.registrar_lectura_laboratorio(
  p_consulta uuid, p_adjunto uuid, p_cedula_leida text, p_cedula_coincide boolean, p_cedula_ignorada boolean, p_examenes integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_cedula text := nullif(btrim(coalesce(p_cedula_leida, '')), '');
begin
  select c.org_id into v_org from clinico.consultas c where c.id = p_consulta;
  if v_org is null or not public.es_clinico(v_org) or not public.ve_consulta(v_org, p_consulta) then
    raise exception 'No tienes acceso a esta consulta.' using errcode = '42501';
  end if;
  if v_cedula is not null and (length(v_cedula) > 20 or v_cedula !~ '^[0-9VEJPGvejpg .-]+$') then
    raise exception 'Cédula leída no válida.';
  end if;
  if p_adjunto is not null and not exists (select 1 from clinico.adjuntos a where a.id = p_adjunto and a.consulta_id = p_consulta) then
    raise exception 'El archivo no es de esta consulta.';
  end if;
  insert into public.bitacora (org_id, tabla, registro_id, accion, despues)
  values (v_org, 'clinico.lectura_laboratorio', p_consulta, 'LECTURA', jsonb_build_object(
    'adjunto', p_adjunto, 'cedula_leida', v_cedula, 'cedula_coincide', coalesce(p_cedula_coincide, false),
    'cedula_ignorada', coalesce(p_cedula_ignorada, false), 'examenes', greatest(coalesce(p_examenes, 0), 0)));
end $$;
revoke execute on function public.registrar_lectura_laboratorio(uuid, uuid, text, boolean, boolean, integer) from public, anon;
grant execute on function public.registrar_lectura_laboratorio(uuid, uuid, text, boolean, boolean, integer) to authenticated;

-- ─── 2. Motivo «Consulta médica general» (CMG) ───────────────
-- En la base del sistema (la reciben las organizaciones nuevas al crearse) y en cada organización que no lo tenga.
-- No pisa nada: si la organización ya tiene el código CMG o un motivo con ese nombre, solo se enlaza a la base.
insert into public.lista_items (lista, codigo, nombre, grupo, orden)
select 'motivo_consulta', 'CMG', 'Consulta médica general', 'no_preventivo', 19
where not exists (select 1 from public.lista_items where org_id is null and lista = 'motivo_consulta' and codigo = 'CMG');

with base as (select id from public.lista_items where org_id is null and lista = 'motivo_consulta' and codigo = 'CMG')
update public.lista_items o set base_id = base.id
from base
where o.org_id is not null and o.lista = 'motivo_consulta' and o.base_id is null
  and (o.codigo = 'CMG' or lower(btrim(o.nombre)) = 'consulta médica general')
  and not exists (select 1 from public.lista_items y where y.org_id = o.org_id and y.base_id = base.id);

insert into public.lista_items (lista, org_id, codigo, nombre, grupo, texto, orden, activo, datos, base_id)
select b.lista, g.id, b.codigo, b.nombre, b.grupo, b.texto, b.orden, b.activo, b.datos, b.id
from public.organizaciones g
cross join public.lista_items b
where b.org_id is null and b.lista = 'motivo_consulta' and b.codigo = 'CMG'
  and not exists (
    select 1 from public.lista_items o
    where o.org_id = g.id and o.lista = 'motivo_consulta'
      and (o.codigo = 'CMG' or o.base_id = b.id or lower(btrim(o.nombre)) = 'consulta médica general'));
