-- zamorApp Ocupacional · Citas por confirmar (Cesar, 13-nov)
-- Una cita provisional (p. ej. espera que la empresa apruebe el presupuesto) se agenda con «Por confirmar».
-- El Inicio muestra «Citas por confirmar»: estas más las solicitadas por las empresas desde el portal.
-- Confirmar la pasa a la agenda normal (por_confirmar = false); Eliminar la cancela (con Deshacer en la app).
-- No es dato clínico: RR. HH. sigue viendo las citas de su empresa como antes.

alter table public.citas add column if not exists por_confirmar boolean not null default false;
create index if not exists citas_por_confirmar on public.citas (org_id, fecha) where por_confirmar;

-- Columna nueva de citas: vistas al día
select public.vistas_al_dia();

-- Conteo del Inicio: parche EN VIVO sobre inicio_conteos (nunca copiarla: la 937 y la 939 también la parchean).
-- Se puede repetir: si ya cuenta las por confirmar, no hace nada.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.inicio_conteos(uuid, boolean, boolean)'::regprocedure), chr(13), '');
  v_cuenta_viejo constant text := '''solicitadas'', count(*) filter (where c.estado = ''solicitada'' and c.fecha >= v_hoy)';
  v_cuenta_nuevo constant text := '''solicitadas'', count(*) filter (where c.estado = ''solicitada'' and c.fecha >= v_hoy), ''por_confirmar'', count(*) filter (where c.por_confirmar and c.estado = ''citado'')';
  v_filtro_viejo constant text := 'where c.fecha = v_hoy or c.estado = ''solicitada'';';
  v_filtro_nuevo constant text := 'where c.fecha = v_hoy or c.estado = ''solicitada'' or (c.por_confirmar and c.estado = ''citado'');';
  v_viejo text;
begin
  if position('''por_confirmar''' in v_def) > 0 then return; end if;
  foreach v_viejo in array array[v_cuenta_viejo, v_filtro_viejo] loop
    if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
      raise exception 'inicio_conteos: se esperaba 1 vez «%»', v_viejo;
    end if;
  end loop;
  execute replace(replace(v_def, v_cuenta_viejo, v_cuenta_nuevo), v_filtro_viejo, v_filtro_nuevo);
end $$;
