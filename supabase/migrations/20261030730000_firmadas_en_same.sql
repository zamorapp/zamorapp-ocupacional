-- zamorApp Ocupacional · Consultas del SAME ya firmadas allá (pedido de Cesar, 31-oct-2026)
-- «Casi todas las evaluaciones que vinieron del SAME ya se encuentran firmadas y emitidas sus constancias.»
-- El cargador las dejaba «cerrada», así que aparecían «Sin firmar» en Aptitud emitida, en Envíos y en «Por firmar».
-- Aquí pasan a «firmada» con su origen a la vista, SIN firma de zamorApp:
--   · firma_origen = 'same' dice que la firma y la emisión ocurrieron en el SAME (null = firmada en zamorApp);
--   · firmada_en = la hora de cierre que traía el SAME (o la de inicio, o el mediodía de su fecha);
--   · el impreso lo dice con una leyenda junto a la firma; «Corregir» la reabre y, al volver a firmar, la firma
--     pasa a ser de zamorApp (firma_origen vuelve a null).
-- Solo la importación (sin sesión) o esta migración ponen firma_origen; con sesión nadie lo fabrica.
-- Acción masiva (regla del 30-oct): solo consultas con origen 'integral', del lote de importación y en «cerrada»
-- (exacto, nada por contenido); cuenta cuántas toca; deja en la bitácora un renglón por organización con la lista
-- de ids; y public.revertir_firmadas_same() las devuelve a «cerrada» si hiciera falta (solo desde la PC/servicio).
-- Sin la bitácora fila por fila (antes y después de 4.000+ consultas llenaría la base gratuita) y sin avisos: el paso
-- de «cerrada» a «firmada» no avisa aptitud ni revoca enlaces.

alter table clinico.consultas add column if not exists firma_origen text;
alter table clinico.consultas drop constraint if exists consultas_firma_origen_check;
alter table clinico.consultas add constraint consultas_firma_origen_check
  check (firma_origen is null or (firma_origen = 'same' and estado = 'firmada'));

-- origen, codigo_origen, lote_importacion y ahora firma_origen solo los pone la importación (clave de servicio).
-- Al volver a borrador (Corregir), firma_origen se borra siempre, también en la base local de la PC.
create or replace function public.proteger_origen_importacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado <> 'firmada' then new.firma_origen := null; end if;
  if auth.uid() is null then return new; end if; -- importación con la clave de servicio
  if tg_op = 'INSERT' then
    new.origen := null; new.codigo_origen := null; new.lote_importacion := null; new.firma_origen := null;
  else
    new.origen := old.origen; new.codigo_origen := old.codigo_origen; new.lote_importacion := old.lote_importacion;
    new.firma_origen := case when new.estado = 'firmada' then old.firma_origen end;
  end if;
  return new;
end $$;
revoke execute on function public.proteger_origen_importacion() from public, authenticated;

select public.vistas_al_dia();

-- Deshacer (solo servicio): solo las que marcó marcar_firmadas_same (ids de sus renglones FIRMADAS_EN_SAME, no las
-- que el cargador importe después) y que siguen firmadas en el SAME vuelven a «cerrada», sin hora de firma.
-- Ojo: salir de «firmada» dispara revocar_enlaces_consulta, así que los enlaces ya enviados de esas consultas se revocan.
create or replace function public.revertir_firmadas_same(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  alter table clinico.consultas disable trigger bit_consultas;
  update clinico.consultas set estado = 'cerrada', firma_origen = null, firmada_en = null
   where org_id = p_org and firma_origen = 'same' and estado = 'firmada'
     and id in (select (x #>> '{}')::uuid from public.bitacora bt, jsonb_array_elements(bt.despues -> 'ids') x
                 where bt.org_id = p_org and bt.accion = 'FIRMADAS_EN_SAME');
  get diagnostics v_n = row_count;
  alter table clinico.consultas enable trigger bit_consultas;
  insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
  values (p_org, 'clinico.consultas', null, 'REVERTIR_FIRMADAS_SAME', null, jsonb_build_object('consultas', v_n));
  return v_n;
end $$;
revoke execute on function public.revertir_firmadas_same(uuid) from public, anon, authenticated;

-- Marca (solo servicio; la importación nueva ya llega así). Devuelve cuántas marcó.
create or replace function public.marcar_firmadas_same()
returns int language plpgsql security definer set search_path = public as $$
declare o record; v_ids uuid[]; v_total int := 0;
begin
  alter table clinico.consultas disable trigger bit_consultas;
  for o in select distinct org_id from clinico.consultas where origen = 'integral' and estado = 'cerrada' and lote_importacion is not null loop
    with marcadas as (
      update clinico.consultas
         set estado = 'firmada', firma_origen = 'same',
             firmada_en = coalesce(hora_cierre, hora_inicio, (fecha + time '12:00') at time zone 'America/Caracas')
       where org_id = o.org_id and origen = 'integral' and estado = 'cerrada' and lote_importacion is not null
       returning id)
    select coalesce(array_agg(id), '{}') into v_ids from marcadas;
    insert into public.bitacora (org_id, tabla, registro_id, accion, antes, despues)
    values (o.org_id, 'clinico.consultas', null, 'FIRMADAS_EN_SAME',
            jsonb_build_object('estado', 'cerrada'),
            jsonb_build_object('estado', 'firmada', 'firma_origen', 'same', 'consultas', cardinality(v_ids), 'ids', to_jsonb(v_ids)));
    raise notice 'Organización %: % consultas del SAME marcadas «Firmada en el SAME».', o.org_id, cardinality(v_ids);
    v_total := v_total + cardinality(v_ids);
  end loop;
  alter table clinico.consultas enable trigger bit_consultas;
  return v_total;
end $$;
revoke execute on function public.marcar_firmadas_same() from public, anon, authenticated;

-- Solo en la nube: a la PC le llegan por la réplica (marcarlas allá también las subiría por la bandeja).
do $$ begin
  if not public.es_base_local() then perform public.marcar_firmadas_same(); end if;
end $$;
