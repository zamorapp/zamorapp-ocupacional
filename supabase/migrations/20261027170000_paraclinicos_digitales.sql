-- zamorApp Ocupacional · Paraclínicos digitales
-- 1. Cada archivo (PDF o foto) se puede ligar a uno o varios exámenes de su consulta (adjuntos.examenes).
-- 2. Reglas del archivo en la base: solo PDF, JPG y PNG de hasta 10 MB; consulta y trabajador coherentes;
--    la ruta está en la carpeta del trabajador; los exámenes ligados existen en esa consulta; ruta, trabajador y
--    organización no cambian después de subir. Los archivos de una consulta firmada no se agregan, religan ni borran
--    (igual que sus resultados: hay que «Corregir»).
-- 3. Los adjuntos respetan las empresas asignadas al usuario (igual que diagnósticos y aptitudes).
-- 4. guardar_resultados: escribe solo resultado, estado y marca manual de los exámenes ya solicitados,
--    también con la consulta cerrada (los resultados llegan días después). Firmada: hay que corregirla.

alter table clinico.adjuntos add column if not exists examenes text[] not null default '{}';

-- La vista se crea con select *: hay que recrearla para que muestre la columna nueva
create or replace view public.adjuntos with (security_invoker = true) as select * from clinico.adjuntos;
grant select, insert, update, delete on public.adjuntos to authenticated;
revoke all on public.adjuntos from anon;

create or replace function public.validar_adjunto()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record; v_ids text[]; v_falta text;
begin
  -- Lo que ya está en una consulta firmada no se toca. Sin sesión (importación del SAME con la clave de servicio)
  -- sí se cargan los escaneados de consultas que ya vienen firmadas.
  if tg_op in ('UPDATE', 'DELETE') and auth.uid() is not null and old.consulta_id is not null
     and exists (select 1 from clinico.consultas where id = old.consulta_id and estado = 'firmada') then
    raise exception 'La consulta está firmada: sus archivos no se cambian. Usa «Corregir».';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'INSERT' then
    if new.tipo_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
      raise exception 'Solo se aceptan PDF, JPG o PNG.';
    end if;
    if new.tamano > 10485760 then raise exception 'El archivo pesa más de 10 MB.'; end if;
    if new.ruta not like new.org_id::text || '/' || new.trabajador_id::text || '/%' then
      raise exception 'La ruta del archivo no corresponde al trabajador.';
    end if;
  else
    if new.org_id <> old.org_id or new.trabajador_id <> old.trabajador_id or new.ruta <> old.ruta
       or new.tipo_mime <> old.tipo_mime or new.tamano <> old.tamano then
      raise exception 'El archivo ya subido no cambia de trabajador ni de ruta.';
    end if;
  end if;

  if new.consulta_id is not null then
    select org_id, trabajador_id, estado, paraclinicos into c from clinico.consultas where id = new.consulta_id;
    if not found or c.org_id <> new.org_id or c.trabajador_id <> new.trabajador_id then
      raise exception 'El archivo y la consulta deben ser del mismo trabajador.';
    end if;
    if c.estado = 'firmada' and auth.uid() is not null then
      raise exception 'La consulta está firmada: sus archivos no se cambian. Usa «Corregir» o súbelo a la ficha del paciente.';
    end if;
  end if;

  new.examenes := coalesce((select array_agg(distinct x order by x) from unnest(new.examenes) x where x <> ''), '{}');
  if cardinality(new.examenes) > 0 then
    if new.consulta_id is null then raise exception 'Para ligarlo a un examen, el archivo debe estar en la consulta.'; end if;
    select coalesce(array_agg(p ->> 'id'), '{}') into v_ids from jsonb_array_elements(coalesce(c.paraclinicos, '[]')) p;
    select x into v_falta from unnest(new.examenes) x where not (x = any (v_ids)) limit 1;
    if v_falta is not null then raise exception 'Ese examen no está solicitado en la consulta. Guarda la consulta y vuelve a intentarlo.'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.validar_adjunto() from public, authenticated;

drop trigger if exists validar_adjunto on clinico.adjuntos;
create trigger validar_adjunto before insert or update or delete on clinico.adjuntos
  for each row execute function public.validar_adjunto();

drop policy if exists adjuntos_empresa on clinico.adjuntos;
create policy adjuntos_empresa on clinico.adjuntos as restrictive for all
  using (public.ve_trabajador(org_id, trabajador_id)) with check (public.ve_trabajador(org_id, trabajador_id));

-- Bucket: solo PDF, JPG y PNG (las fotos se convierten a JPG en el navegador, sin EXIF)
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'], file_size_limit = 10485760
where id = 'adjuntos';

-- Resultados de los exámenes ya solicitados. p_resultados: [{id, resultado, estado, manual, unidad, referencia}]
create or replace function public.guardar_resultados(p_id uuid, p_resultados jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare c record; v jsonb;
begin
  select id, estado, paraclinicos into c from clinico.consultas where id = p_id;
  if not found then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  if c.estado = 'firmada' then raise exception 'La consulta está firmada: usa «Corregir» para cambiar resultados.'; end if;
  if jsonb_typeof(p_resultados) <> 'array' then raise exception 'Resultados inválidos.'; end if;
  if exists (select 1 from jsonb_array_elements(p_resultados) r
             where coalesce(r ->> 'estado', '') not in ('', 'normal', 'fuera', 'alterado')) then
    raise exception 'Estado de resultado inválido.';
  end if;
  perform 1 from clinico.consultas where id = p_id for update;

  select coalesce(jsonb_agg(
    case when r is null then p
         else p || jsonb_build_object(
           'resultado', left(coalesce(r ->> 'resultado', ''), 500),
           'estado', coalesce(r ->> 'estado', ''),
           'manual', coalesce((r ->> 'manual')::boolean, false),
           'unidad', left(coalesce(r ->> 'unidad', p ->> 'unidad', ''), 40),
           'referencia', left(coalesce(r ->> 'referencia', p ->> 'referencia', ''), 80))
    end order by o), '[]') into v
  from jsonb_array_elements(coalesce(c.paraclinicos, '[]')) with ordinality as e(p, o)
  left join lateral (select x as r from jsonb_array_elements(p_resultados) x where x ->> 'id' = p ->> 'id' limit 1) m on true;

  update clinico.consultas set paraclinicos = v where id = p_id;
end $$;
revoke execute on function public.guardar_resultados(uuid, jsonb) from public, anon;
grant execute on function public.guardar_resultados(uuid, jsonb) to authenticated;
