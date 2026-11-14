-- Recordatorios de citas (Cesar, 14-nov-2026): «tienes una consulta el día tal… mañana… en una hora».
-- Tres avisos por omisión: 3 días antes, 1 día antes y 1 hora antes. Se cambian en Configuración › Organización ›
-- Plazos y avisos (organizaciones.ajustes -> 'recordatorio_citas'). Le llegan al administrador, gerente médico y
-- médicos (solo las citas de las empresas que cada uno ve), por:
--   · la campana (y el aviso de Windows en el escritorio, también SIN internet: la copia local corre esta misma función
--     como constancia y, al volver internet, la nube hace los suyos y la PC borra los que creó; escritorio/puerta);
--   · el celular: el latido de pg_cron (avisos_campana_para_celular) la corre cada 10 min por cada suscrito;
--   · el correo (opcional): un resumen con la lista del día, solo con el aviso de días más cercano (por omisión
--     «mañana»), con reintento (correos_recordatorio_citas / resultado_correo_recordatorio, desde /api/avisos/campana).
-- Los avisos de días agrupan todas las citas de ese día en uno; el de horas va por hora de cita. Nunca se repite: la
-- llave del aviso va en el enlace (…&rc=d3 / …&rc=h60-0900), así la copia de la PC tampoco repite lo que ya bajó.
-- Fechas y horas siempre en America/Caracas con public.ahora() (en la PC, la hora anclada de la puerta; también la
-- hora del aviso: el aviso de Windows solo suena si es reciente, y la fecha de Windows puede estar cambiada por el SAME).

-- ─── Ajustes: lo guardado o, si falta, 3 días / 1 día / 1 hora, celular y correo activos, avisos de días a las 7 ───
create or replace function public.ajustes_recordatorio_citas(p_ajustes jsonb)
returns table (orden int, valor int, unidad text, minutos int, activo boolean, celular boolean, correo boolean, hora_dias int)
language sql immutable set search_path = '' as $$
  with a as (select coalesce(p_ajustes -> 'recordatorio_citas', '{}'::jsonb) as rc),
  pasos as (
    select x.orden::int as orden, x.paso
      from a, jsonb_array_elements(case when jsonb_typeof(a.rc -> 'avisos') = 'array' then a.rc -> 'avisos'
        else '[{"valor":3,"unidad":"dias","activo":true},{"valor":1,"unidad":"dias","activo":true},{"valor":1,"unidad":"horas","activo":true}]'::jsonb end)
        with ordinality as x(paso, orden)
     where x.orden <= 3)
  select p.orden,
         v.valor,
         v.unidad,
         case v.unidad when 'dias' then v.valor * 1440 when 'horas' then v.valor * 60 else v.valor end,
         coalesce((p.paso ->> 'activo')::boolean, true),
         coalesce((a.rc ->> 'celular')::boolean, true),
         coalesce((a.rc ->> 'correo')::boolean, true),
         case when (a.rc ->> 'hora_dias') ~ '^[0-9]{1,2}$' then least((a.rc ->> 'hora_dias')::int, 23) else 7 end
    from pasos p cross join a
    cross join lateral (select case when p.paso ->> 'unidad' in ('dias', 'horas', 'minutos') then p.paso ->> 'unidad' else 'dias' end as unidad) u
    cross join lateral (select case
        when (p.paso ->> 'valor') !~ '^[0-9]{1,3}$' then null
        when u.unidad = 'dias' then least((p.paso ->> 'valor')::int, 30)
        when u.unidad = 'horas' then least(greatest((p.paso ->> 'valor')::int, 1), 23)
        else least(greatest((p.paso ->> 'valor')::int, 5), 180) end as valor, u.unidad) v
   where v.valor is not null
$$;
revoke execute on function public.ajustes_recordatorio_citas(jsonb) from public, anon;
grant execute on function public.ajustes_recordatorio_citas(jsonb) to authenticated;

-- «9:00 a. m.»
create or replace function public.hora_corta(p_hora time)
returns text language sql immutable set search_path = '' as $$
  select case when p_hora is null then 'sin hora'
    else ltrim(to_char(p_hora, 'HH12:MI'), '0') || case when p_hora < '12:00' then ' a. m.' else ' p. m.' end end
$$;
revoke execute on function public.hora_corta(time) from public, anon;
grant execute on function public.hora_corta(time) to authenticated;

-- ─── Cola del correo (solo en la nube; nadie la lee directo: solo las funciones de abajo) ───
create table if not exists public.recordatorios_citas_correos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  para text not null,
  asunto text not null check (length(asunto) <= 200),
  texto text not null check (length(texto) <= 8000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'fallido')),
  intentos smallint not null default 0,
  error text check (length(error) <= 300),
  tomado_en timestamptz,
  creado_en timestamptz not null default public.ahora()
);
create index if not exists recordatorios_citas_correos_estado on public.recordatorios_citas_correos (estado, creado_en);
alter table public.recordatorios_citas_correos enable row level security;
revoke all on public.recordatorios_citas_correos from anon, authenticated;

-- ─── El generador: como el resto de la campana, avisa a quien lo llama (auth.uid()) ───
create or replace function public.recordar_citas()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ahora timestamp := public.ahora() at time zone 'America/Caracas';
  v_hoy date := (public.ahora() at time zone 'America/Caracas')::date;
  v_total integer := 0;
  v_dias constant text[] := array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  o record;
  p record;
  r record;
  v_fecha date;
  v_enlace text;
  v_titulo text;
  v_texto text;
  v_id uuid;
  v_correo_dias int;
  v_para text;
begin
  if v_uid is null then return 0; end if;
  for o in
    select m.org_id, m.empresas_permitidas, org.ajustes
      from public.miembros m join public.organizaciones org on org.id = m.org_id
     where m.usuario_id = v_uid and m.activo and m.rol in ('administrador', 'gerente_medico', 'medico')
  loop
    -- El correo va solo con el aviso de días más cercano (por omisión, «mañana»)
    select min(a.valor) into v_correo_dias from public.ajustes_recordatorio_citas(o.ajustes) a
     where a.activo and a.unidad = 'dias' and a.correo;

    for p in select * from public.ajustes_recordatorio_citas(o.ajustes) a where a.activo order by a.minutos desc loop
      if p.unidad = 'dias' then
        -- Un aviso por día de citas, desde la hora elegida (7 a. m.) del día que toca
        continue when extract(hour from v_ahora) < p.hora_dias;
        v_fecha := v_hoy + p.valor;
        v_enlace := '/atencion?dia=' || v_fecha || '&rc=d' || p.valor;
        continue when exists (select 1 from public.notificaciones n where n.usuario_id = v_uid and n.org_id = o.org_id and n.enlace = v_enlace);
        select count(*) as n, count(distinct c.empresa_id) as empresas, min(c.hora) as primera, max(c.hora) as ultima,
               string_agg(public.hora_corta(c.hora) || ' ' || t.nombres || ' ' || t.apellidos
                          || coalesce(' (' || li.nombre || ')', ''), ' · ' order by c.hora nulls last, t.apellidos) as lista,
               string_agg(public.hora_corta(c.hora) || ' · ' || t.nombres || ' ' || t.apellidos
                          || coalesce(' · ' || li.nombre, '') || coalesce(' · ' || e.razon_social, ''), E'\n' order by c.hora nulls last, t.apellidos) as lineas,
               min(e.razon_social) as empresa
          into r
          from public.citas c
          join public.trabajadores t on t.id = c.trabajador_id
          left join public.empresas e on e.id = c.empresa_id
          left join public.lista_items li on li.id = c.motivo_id
         where c.org_id = o.org_id and c.fecha = v_fecha and c.estado = 'citado'
           and coalesce(e.activa, true)
           and (o.empresas_permitidas is null or c.empresa_id = any (o.empresas_permitidas));
        continue when r.n = 0;
        v_titulo := case p.valor when 0 then 'Hoy tienes ' when 1 then 'Mañana tienes '
                      else 'En ' || p.valor || ' días (' || v_dias[extract(dow from v_fecha)::int + 1] || ' ' || extract(day from v_fecha) || ') tienes ' end
                    || r.n || case when r.n = 1 then ' cita' else ' citas' end;
        v_texto := case when r.n <= 3 then r.lista
                   else concat_ws(' · ', case when r.primera is not null then 'Primera a las ' || public.hora_corta(r.primera) end,
                                         case when r.ultima is not null and r.ultima <> r.primera then 'última a las ' || public.hora_corta(r.ultima) end,
                                         case when r.empresas = 1 then r.empresa else r.empresas || ' empresas' end) end;
        insert into public.notificaciones (org_id, usuario_id, titulo, texto, enlace, nivel, creado_en)
        values (o.org_id, v_uid, v_titulo, left(v_texto, 500), v_enlace, 'info', public.ahora()) returning id into v_id;
        if not p.celular then
          insert into public.avisos_push_enviadas (notificacion_id, usuario_id) values (v_id, v_uid) on conflict do nothing;
        end if;
        -- Correo con la lista del día (solo en la nube: la PC no manda correos)
        if p.valor = v_correo_dias and not public.es_base_local() then
          select u.email into v_para from auth.users u where u.id = v_uid;
          if coalesce(v_para, '') like '%@%' then
            insert into public.recordatorios_citas_correos (org_id, usuario_id, para, asunto, texto)
            values (o.org_id, v_uid, v_para,
              left(case p.valor when 0 then 'Tu agenda de hoy' when 1 then 'Tu agenda de mañana' else 'Tu agenda del ' || v_dias[extract(dow from v_fecha)::int + 1] end
                   || ' (' || to_char(v_fecha, 'DD/MM/YYYY') || '): ' || r.n || case when r.n = 1 then ' cita' else ' citas' end, 200),
              left(r.lineas, 7000));
          end if;
        end if;
        v_total := v_total + 1;
      else
        -- Un aviso por hora de cita (varias a la misma hora van juntas), desde X horas/minutos antes hasta la hora
        for r in
          select c.fecha, c.hora, count(*) as n,
                 string_agg(t.nombres || ' ' || t.apellidos || coalesce(' · ' || li.nombre, ''), ' · ' order by t.apellidos)
                   || case when count(*) = 1 then coalesce(' · ' || min(e.razon_social), '') else '' end as lista
            from public.citas c
            join public.trabajadores t on t.id = c.trabajador_id
            left join public.empresas e on e.id = c.empresa_id
            left join public.lista_items li on li.id = c.motivo_id
           where c.org_id = o.org_id and c.fecha between v_hoy and v_hoy + 1 and c.hora is not null and c.estado = 'citado'
             and (c.fecha + c.hora) > v_ahora and (c.fecha + c.hora) - make_interval(mins => p.minutos) <= v_ahora
             and coalesce(e.activa, true)
             and (o.empresas_permitidas is null or c.empresa_id = any (o.empresas_permitidas))
           group by c.fecha, c.hora
           order by c.fecha, c.hora
        loop
          v_enlace := '/atencion?dia=' || r.fecha || '&rc=h' || p.minutos || '-' || to_char(r.hora, 'HH24MI');
          continue when exists (select 1 from public.notificaciones n where n.usuario_id = v_uid and n.org_id = o.org_id and n.enlace = v_enlace);
          v_titulo := case when r.n = 1 then 'Cita a las ' else r.n || ' citas a las ' end || public.hora_corta(r.hora)
                      || case when r.fecha > v_hoy then ' (mañana)' else '' end;
          v_texto := 'Dentro de ' || case when p.unidad = 'horas' then p.valor || case when p.valor = 1 then ' hora' else ' horas' end
                                         else p.valor || ' minutos' end || ' · ' || r.lista;
          insert into public.notificaciones (org_id, usuario_id, titulo, texto, enlace, nivel, creado_en)
          values (o.org_id, v_uid, v_titulo, left(v_texto, 500), v_enlace, 'aviso', public.ahora()) returning id into v_id;
          if not p.celular then
            insert into public.avisos_push_enviadas (notificacion_id, usuario_id) values (v_id, v_uid) on conflict do nothing;
          end if;
          v_total := v_total + 1;
        end loop;
      end if;
    end loop;
  end loop;
  return v_total;
end $$;
revoke execute on function public.recordar_citas() from public, anon;
grant execute on function public.recordar_citas() to authenticated;

-- ─── Correo: la ruta toma los pendientes (o caídos a mitad hace 10 min) y avisa el resultado ───
create or replace function public.correos_recordatorio_citas(p_clave text)
returns table (id uuid, para text, asunto text, texto text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_org uuid;
begin
  if length(coalesce(p_clave, '')) < 32 then return; end if;
  select org_id into v_org from public.avisos_push_clave where clave_hash = v_hash;
  if v_org is null then return; end if;
  -- Se limpia sola: lo de más de 30 días ya no sirve
  delete from public.recordatorios_citas_correos x where x.org_id = v_org and x.creado_en < public.ahora() - interval '30 days';
  -- Caídos a mitad sin intentos: fallidos, con aviso en la campana
  with caidos as (
    update public.recordatorios_citas_correos x set estado = 'fallido', error = coalesce(x.error, 'El envío no terminó')
     where x.org_id = v_org and x.estado = 'enviando' and x.intentos >= 3 and x.tomado_en <= public.ahora() - interval '10 minutes'
    returning x.org_id, x.usuario_id, x.asunto, x.error)
  insert into public.notificaciones (org_id, usuario_id, titulo, texto, enlace, nivel, creado_en)
  select c.org_id, c.usuario_id, 'No salió el correo de tus citas', c.asunto || ' · ' || c.error || ' · Las ves en la agenda y en la campana', '/atencion', 'aviso', public.ahora()
    from caidos c;
  return query
    with marcados as (
      update public.recordatorios_citas_correos x set estado = 'enviando', intentos = x.intentos + 1, tomado_en = public.ahora()
       where x.id in (select y.id from public.recordatorios_citas_correos y
                       where y.org_id = v_org and y.creado_en >= public.ahora() - interval '2 days'
                         and (y.estado = 'pendiente' or (y.estado = 'enviando' and y.intentos < 3 and y.tomado_en <= public.ahora() - interval '10 minutes'))
                       order by y.creado_en limit 20 for update skip locked)
      returning x.id, x.para, x.asunto, x.texto)
    select m.id, m.para, m.asunto, m.texto from marcados m;
end $$;
revoke execute on function public.correos_recordatorio_citas(text) from public;
grant execute on function public.correos_recordatorio_citas(text) to anon, authenticated;

create or replace function public.resultado_correo_recordatorio(p_clave text, p_id uuid, p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_org uuid;
  r record;
begin
  if length(coalesce(p_clave, '')) < 32 then return; end if;
  select org_id into v_org from public.avisos_push_clave where clave_hash = v_hash;
  if v_org is null then return; end if;
  update public.recordatorios_citas_correos x
     set estado = case when p_error is null then 'enviado' when x.intentos >= 3 then 'fallido' else 'pendiente' end,
         error = left(p_error, 300)
   where x.id = p_id and x.org_id = v_org and x.estado = 'enviando'
  returning x.org_id, x.usuario_id, x.asunto, x.estado, x.error into r;
  if r.estado = 'fallido' then
    insert into public.notificaciones (org_id, usuario_id, titulo, texto, enlace, nivel, creado_en)
    values (r.org_id, r.usuario_id, 'No salió el correo de tus citas', r.asunto || ' · ' || r.error || ' · Las ves en la agenda y en la campana', '/atencion', 'aviso', public.ahora());
  end if;
end $$;
revoke execute on function public.resultado_correo_recordatorio(text, uuid, text) from public;
grant execute on function public.resultado_correo_recordatorio(text, uuid, text) to anon, authenticated;

-- ─── Parches por texto a la versión vigente (nunca se recrea entera una función de otra migración) ───
do $$
declare
  d text;
  v_ancla text;
begin
  -- 1. El latido del celular corre también los recordatorios de citas de cada suscrito
  d := replace(pg_get_functiondef('public.avisos_campana_para_celular(text)'::regprocedure), chr(13), '');
  if position('recordar_citas' in d) = 0 then
    v_ancla := 'begin perform public.recordar_post_vacacional(); exception when others then raise warning ''avisos_campana_para_celular: recordar_post_vacacional falló: %'', sqlerrm; end;';
    if (length(d) - length(replace(d, v_ancla, ''))) / length(v_ancla) <> 1 then
      raise exception 'recordatorios_citas: no se encontró una sola vez el punto de avisos_campana_para_celular';
    end if;
    execute replace(d, v_ancla, v_ancla || E'\n    -- Recordatorios de citas (20261030955000)\n'
      || '    begin perform public.recordar_citas(); exception when others then raise warning ''avisos_campana_para_celular: recordar_citas falló: %'', sqlerrm; end;');
  end if;

  -- 2. Sin internet en la PC: la constancia de la campana de citas sube y la nube la recalcula
  d := replace(pg_get_functiondef('public.constancia_diferida(uuid, text, uuid, text, jsonb, timestamptz, boolean)'::regprocedure), chr(13), '');
  if position('recordar_citas' in d) = 0 then
    v_ancla := 'perform public.recordar_post_vacacional();';
    if (length(d) - length(replace(d, v_ancla, ''))) / length(v_ancla) <> 1 then
      raise exception 'recordatorios_citas: no se encontró una sola vez el punto de constancia_diferida';
    end if;
    execute replace(d, v_ancla, v_ancla || E'\n  elsif p_rpc = ''recordar_citas'' then\n    perform public.recordar_citas();');
  end if;
end $$;
