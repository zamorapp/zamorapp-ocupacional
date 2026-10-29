-- zamorApp Ocupacional · Escaneados del SAME en su consulta (29-oct-2026, hilo Paraclínicos, pedido del Arquitecto)
-- Las consultas importadas del SAME llegan firmadas, y validar_adjunto no deja agregar archivos a una consulta
-- firmada con sesión. La PC no tiene la clave de servicio, así que la página Configuración › Escaneados del SAME
-- dejaba cada escaneado en la ficha del paciente y perdía la consulta (para imprimirla con sus anexos y para el
-- paquete). Excepción acotada, solo para dar de alta:
--   · la consulta viene del SAME (origen = 'integral'),
--   · la descripción trae la marca «[SAME …]» que pone el cargador,
--   · lo sube el administrador o el gerente médico de la organización,
--   · no se liga a exámenes.
-- Nada más cambia: después de subido no se religa ni se borra (sigue la regla de la consulta firmada).
-- Para que la excepción no se pueda fabricar, origen, codigo_origen y lote_importacion de una consulta solo los
-- pone la importación (clave de servicio, sin sesión): con sesión, al crear quedan vacíos y al editar no cambian
-- (revisión de Analizar, 29-oct-2026).

create or replace function public.proteger_origen_importacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- importación con la clave de servicio
  if tg_op = 'INSERT' then
    new.origen := null; new.codigo_origen := null; new.lote_importacion := null;
  else
    new.origen := old.origen; new.codigo_origen := old.codigo_origen; new.lote_importacion := old.lote_importacion;
  end if;
  return new;
end $$;
revoke execute on function public.proteger_origen_importacion() from public, authenticated;

drop trigger if exists proteger_origen_importacion on clinico.consultas;
create trigger proteger_origen_importacion before insert or update on clinico.consultas
  for each row execute function public.proteger_origen_importacion();

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
    select org_id, trabajador_id, estado, paraclinicos, origen, codigo_origen, lote_importacion into c from clinico.consultas where id = new.consulta_id;
    if not found or c.org_id <> new.org_id or c.trabajador_id <> new.trabajador_id then
      raise exception 'El archivo y la consulta deben ser del mismo trabajador.';
    end if;
    -- Excepción única: el escaneado del SAME de una consulta importada del SAME (ya firmada allá) entra a esa
    -- consulta, solo como alta, solo por el administrador o el gerente médico y sin ligarlo a exámenes.
    if c.estado = 'firmada' and auth.uid() is not null
       and not (tg_op = 'INSERT' and coalesce(c.origen, '') = 'integral' and c.codigo_origen is not null
                and c.lote_importacion is not null and coalesce(new.descripcion, '') like '[SAME %'
                and cardinality(coalesce(new.examenes, '{}')) = 0
                and coalesce(public.mi_rol(new.org_id)::text in ('administrador', 'gerente_medico'), false)) then
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
