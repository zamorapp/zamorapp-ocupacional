-- zamorApp Ocupacional · Tasa BCV automática (Cesar, 05-nov-2026)
-- El BCV publica a las 4–5 p. m. la tasa del día hábil siguiente («Fecha Valor»). Un latido sin sesión (el workflow
-- «Avisos al celular») la lee del BCV y la guarda por la fecha en que rige, para cada organización que tenga la clave
-- del servidor (la misma de los avisos al celular). Se conserva el historial: una fila por fecha.
-- Lo escrito a mano manda: el latido nunca pisa una tasa con fuente «manual».

alter table public.tasas_bcv
  add column if not exists fuente text not null default 'manual' check (fuente in ('manual', 'bcv', 'respaldo')),
  add column if not exists registrada_en timestamptz not null default public.ahora();

-- ¿Hace falta buscar? Devuelve la última fecha guardada por el latido o a mano (null si no hay ninguna) de las
-- organizaciones con esa clave. No expone montos.
create or replace function public.tasa_bcv_ultima_fecha(p_clave text)
returns date language plpgsql stable security definer set search_path = public as $$
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
begin
  if length(coalesce(p_clave, '')) < 32 then return null; end if;
  return (select min(u.ultima) from (
            select k.org_id, max(t.fecha) as ultima
              from public.avisos_push_clave k left join public.tasas_bcv t on t.org_id = k.org_id
             where k.clave_hash = v_hash
             group by k.org_id) u);
end $$;
revoke execute on function public.tasa_bcv_ultima_fecha(text) from public;
grant execute on function public.tasa_bcv_ultima_fecha(text) to anon, authenticated;

-- Guarda la tasa leída del BCV para su fecha valor. Límites de cordura: fecha entre 10 días atrás y 7 adelante, tasa
-- positiva y a no más de ±30 % de la última conocida (si el BCV cambia de formato y se lee otro número, no se guarda).
-- Devuelve cuántas organizaciones quedaron con esa tasa.
create or replace function public.guardar_tasa_bcv_auto(p_clave text, p_fecha date, p_tasa numeric, p_fuente text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_hoy date := public.hoy_caracas();
  v_n int := 0;
  v_org uuid;
  v_previa numeric;
begin
  if length(coalesce(p_clave, '')) < 32 then return 0; end if;
  if p_fuente not in ('bcv', 'respaldo') then raise exception 'Fuente no válida'; end if;
  if p_fecha is null or p_fecha < v_hoy - 10 or p_fecha > v_hoy + 7 then raise exception 'Fecha valor fuera de rango: %', p_fecha; end if;
  if p_tasa is null or p_tasa <= 0 or p_tasa > 10000000 then raise exception 'Tasa no válida: %', p_tasa; end if;
  for v_org in select org_id from public.avisos_push_clave where clave_hash = v_hash loop
    select tasa into v_previa from public.tasas_bcv where org_id = v_org and fecha < p_fecha order by fecha desc limit 1;
    if v_previa is not null and (p_tasa > v_previa * 1.3 or p_tasa < v_previa * 0.7) then
      raise exception 'La tasa leída (%) se aleja más de 30 %% de la anterior (%): no se guarda', p_tasa, v_previa;
    end if;
    insert into public.tasas_bcv (org_id, fecha, tasa, fuente, registrada_en)
    values (v_org, p_fecha, round(p_tasa, 4), p_fuente, public.ahora())
    on conflict (org_id, fecha) do update
      set tasa = excluded.tasa, fuente = excluded.fuente, registrada_en = excluded.registrada_en
      where public.tasas_bcv.fuente <> 'manual';
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.guardar_tasa_bcv_auto(text, date, numeric, text) from public;
grant execute on function public.guardar_tasa_bcv_auto(text, date, numeric, text) to anon, authenticated;

select public.vistas_al_dia();
