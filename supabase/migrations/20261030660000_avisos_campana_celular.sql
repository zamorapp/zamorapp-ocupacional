-- zamorApp · Avisos de la campana al celular (Cesar, 30-oct: «sí lo quiero, todos»). Plazos legales de accidentes
-- (centinela), resultados por recibir, alerta para la próxima evaluación, post vacacional, estudios recibidos y exámenes por vencer
-- llegan como notificación push aunque nadie abra la app ni la laptop esté encendida.
-- Cada 15 minutos un latido (GitHub Actions, gratis en repo público) llama a /api/avisos/campana en Vercel, que pide
-- a avisos_campana_para_celular() con la clave del servidor (la misma de los avisos de RR. HH.) qué enviar:
--   1. Por cada usuario del servicio con avisos activos corre los mismos generadores de la campana que corren al abrir
--      el Inicio (centinela_legal, recordar_resultados, recordar_alertas), como si ese usuario hubiera entrado: así las
--      reglas (roles, empresas permitidas, avisos apagados por empresa) son exactamente las mismas.
--   2. Junta las notificaciones nuevas sin leer de la campana que aún no salieron al celular (avisos_push_enviadas,
--      por id: nunca casar filas por hora) y arma UN aviso por usuario.
--   3. Una vez al día, desde las 7:00 de Caracas, el resumen de exámenes vencidos y por vencer de sus empresas.
-- Respeta «Avisos de esta empresa» (610000): resultados, próxima evaluación y vencimientos apagados no suenan; los
-- plazos legales de accidentes no se apagan (igual que en la campana).
-- Lo que RR. HH. hace en el portal ya sale al instante (lib/aviso-servicio.ts): esos títulos no se repiten aquí.
-- Sin la clave correcta no hace nada. Llamarla de más no repite avisos.
-- Al instante (Cesar, 30-oct): cada notificación nueva de alguien con avisos activos llama la ruta en ese momento con
-- pg_net (incluido en el plan gratis de Supabase), después de guardarse. Esa llamada solo junta lo nuevo; los
-- generadores (plazos, resultados, alertas, post vacacional, vencimientos) corren como mucho cada 10 min. El latido de
-- 15 min queda de respaldo. Sin pg_net (base local de la PC, banco de pruebas) el trigger no hace nada.

create table if not exists public.avisos_push_enviadas (
  notificacion_id uuid primary key references public.notificaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  enviada_en timestamptz not null default public.ahora()
);
alter table public.avisos_push_enviadas enable row level security;
revoke all on public.avisos_push_enviadas from anon, authenticated;

create table if not exists public.avisos_push_resumen (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  dia date not null
);
alter table public.avisos_push_resumen enable row level security;
revoke all on public.avisos_push_resumen from anon, authenticated;

-- Freno: una corrida cada 2 s (aunque alguien llame la ruta en bucle) y los generadores cada 10 min. Una fila.
create table if not exists public.avisos_push_latido (
  unica boolean primary key default true check (unica),
  ultima timestamptz not null,
  generado timestamptz
);
alter table public.avisos_push_latido enable row level security;
revoke all on public.avisos_push_latido from anon, authenticated;

create or replace function public.avisos_campana_para_celular(p_clave text)
returns table (endpoint text, p256dh text, auth text, titulo text, cuerpo text, ruta text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_hoy date := public.hoy_caracas();
  v_hora int := extract(hour from public.ahora() at time zone 'America/Caracas')::int;
  u record;
  v_n int;
  v_titulo text;
  v_cuerpo text;
  v_ruta text;
  v_venc int;
  v_por_vencer int;
  v_generar boolean;
begin
  if length(coalesce(p_clave, '')) < 32 then return; end if;
  if not exists (select 1 from public.avisos_push_clave k where k.clave_hash = v_hash) then return; end if;
  -- Freno (solo con la clave correcta, para que una llamada ajena no pueda frenar los avisos)
  insert into public.avisos_push_latido as l (unica, ultima) values (true, public.ahora())
  on conflict (unica) do update set ultima = excluded.ultima where l.ultima <= public.ahora() - interval '2 seconds';
  get diagnostics v_n = row_count;
  if v_n = 0 then return; end if;
  -- Lo que creen los generadores aquí no vuelve a llamar la ruta (trigger avisar_al_celular_al_instante)
  perform set_config('zamorapp.latido_avisos', 'on', true);
  update public.avisos_push_latido set generado = public.ahora()
   where generado is null or generado <= public.ahora() - interval '10 minutes';
  v_generar := found;
  for u in
    select distinct s.usuario_id, s.org_id
      from public.suscripciones_push s
      join public.avisos_push_clave k on k.org_id = s.org_id and k.clave_hash = v_hash
      join public.miembros m on m.org_id = s.org_id and m.usuario_id = s.usuario_id and m.activo
       and m.rol in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion')
  loop
    -- Los generadores de la campana, como si este usuario hubiera abierto el Inicio (solo dentro de esta función)
    if v_generar then
    perform set_config('request.jwt.claim.sub', u.usuario_id::text, true);
    begin perform public.centinela_legal(); exception when others then raise warning 'avisos_campana_para_celular: centinela_legal falló: %', sqlerrm; end;
    begin perform public.recordar_resultados(); exception when others then raise warning 'avisos_campana_para_celular: recordar_resultados falló: %', sqlerrm; end;
    begin perform public.recordar_alertas(); exception when others then raise warning 'avisos_campana_para_celular: recordar_alertas falló: %', sqlerrm; end;
    -- Post vacacional (migración 20261030670000)
    begin perform public.recordar_post_vacacional(); exception when others then raise warning 'avisos_campana_para_celular: recordar_post_vacacional falló: %', sqlerrm; end;
    perform set_config('request.jwt.claim.sub', '', true);
    end if;

    -- Notificaciones nuevas de la campana que todavía no salieron al celular
    with nuevas as (
      select n.id, n.titulo, n.texto, n.enlace, n.creado_en
        from public.notificaciones n
       where n.usuario_id = u.usuario_id and n.org_id = u.org_id and not n.leida
         and n.creado_en >= public.ahora() - interval '2 days'
         and n.titulo not in ('Nueva solicitud de cita', 'RR. HH. aceptó la invitación', 'Nueva solicitud de la empresa')
         and not exists (select 1 from public.avisos_push_enviadas e where e.notificacion_id = n.id)
         -- «Avisos de esta empresa» (610000): un tipo apagado en la empresa no suena en el celular
         and not exists (select 1 from public.empresas x where x.id = n.empresa_id and (
               (n.titulo = 'Resultados por recibir' and 'resultados' = any (x.avisos_apagados))
            or (n.titulo = 'Alerta para la próxima evaluación' and 'proxima_evaluacion' = any (x.avisos_apagados))))
    ), marcadas as (
      insert into public.avisos_push_enviadas (notificacion_id, usuario_id)
      select id, u.usuario_id from nuevas on conflict do nothing
      returning notificacion_id
    )
    select count(*),
           (array_agg(n.titulo order by n.creado_en desc))[1],
           case when count(*) = 1 then max(n.texto)
                else string_agg(n.titulo || coalesce(': ' || n.texto, ''), ' · ' order by n.creado_en desc) end,
           (array_agg(n.enlace order by n.creado_en desc))[1]
      into v_n, v_titulo, v_cuerpo, v_ruta
      from nuevas n join marcadas m on m.notificacion_id = n.id;

    -- Resumen diario de exámenes vencidos y por vencer (desde las 7:00 de Caracas, una vez al día)
    v_venc := 0; v_por_vencer := 0;
    if v_hora >= 7 and not exists (select 1 from public.avisos_push_resumen r where r.usuario_id = u.usuario_id and r.dia >= v_hoy) then
      select count(*) filter (where a.proximo_examen < v_hoy),
             count(*) filter (where a.proximo_examen between v_hoy and v_hoy + e.dias_aviso_examen)
        into v_venc, v_por_vencer
        from public.miembros m
        join public.empresas e on e.org_id = m.org_id and e.activa
         and (m.empresas_permitidas is null or e.id = any (m.empresas_permitidas))
         and not ('vencimientos' = any (coalesce(e.avisos_apagados, '{}')))
        join public.trabajadores t on t.empresa_id = e.id and t.estado in ('activo', 'reposo')
        join public.ultima_aptitud a on a.trabajador_id = t.id
       where m.usuario_id = u.usuario_id and m.org_id = u.org_id and m.activo;
      insert into public.avisos_push_resumen (usuario_id, dia) values (u.usuario_id, v_hoy)
      on conflict (usuario_id) do update set dia = excluded.dia;
    end if;

    if v_n = 0 and v_venc + v_por_vencer = 0 then continue; end if;
    if v_n > 1 then
      v_titulo := v_n || ' avisos nuevos';
      v_ruta := '/panel';
    elsif v_n = 0 then
      v_titulo := 'Exámenes por vencer';
      v_cuerpo := null;
      v_ruta := '/reportes/vencimientos';
    end if;
    if v_venc + v_por_vencer > 0 then
      v_cuerpo := concat_ws(' · ', v_cuerpo,
        'Exámenes: ' || concat_ws(' y ', case when v_venc > 0 then v_venc || ' vencido' || case when v_venc > 1 then 's' else '' end end,
                                         case when v_por_vencer > 0 then v_por_vencer || ' por vencer' end));
    end if;

    return query
      select s.endpoint, s.p256dh, s.auth, v_titulo, left(v_cuerpo, 240), coalesce(v_ruta, '/panel')
        from public.suscripciones_push s where s.usuario_id = u.usuario_id and s.org_id = u.org_id;
    update public.suscripciones_push s set ultimo_aviso = public.ahora() where s.usuario_id = u.usuario_id and s.org_id = u.org_id;
  end loop;
end $$;

-- La llama el latido sin sesión (anon): todo depende de la clave del servidor, que solo vive en Vercel
revoke execute on function public.avisos_campana_para_celular(text) from public;
grant execute on function public.avisos_campana_para_celular(text) to anon, authenticated;

-- Suscripción vencida (410/404) vista por el latido: se borra con la clave, sin sesión
create or replace function public.quitar_suscripcion_vencida_clave(p_endpoint text, p_clave text)
returns void language sql security definer set search_path = public as $$
  delete from public.suscripciones_push s
   using public.avisos_push_clave k
   where s.endpoint = p_endpoint and k.org_id = s.org_id
     and length(coalesce(p_clave, '')) >= 32 and k.clave_hash = sha256(convert_to(p_clave, 'UTF8'))
$$;
revoke execute on function public.quitar_suscripcion_vencida_clave(text, text) from public;
grant execute on function public.quitar_suscripcion_vencida_clave(text, text) to anon, authenticated;

-- ─── Al instante: una notificación nueva llama la ruta de avisos con pg_net (después de guardarse) ───
do $$ begin
  create extension if not exists pg_net;
exception when others then raise notice 'pg_net no está disponible aquí: los avisos salen con el latido de 15 min';
end $$;

create or replace function public.avisar_al_celular_al_instante()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Una sola llamada por instrucción (el centinela avisa a varios miembros a la vez): la ruta junta todo lo nuevo
  if public.es_base_local() or to_regnamespace('net') is null
     or current_setting('zamorapp.latido_avisos', true) = 'on'
     or not exists (select 1 from nuevas n join public.suscripciones_push s on s.usuario_id = n.usuario_id and s.org_id = n.org_id
                     where n.titulo not in ('Nueva solicitud de cita', 'RR. HH. aceptó la invitación', 'Nueva solicitud de la empresa')) then
    return null;
  end if;
  begin
    execute 'select net.http_get($1)' using 'https://zamorapp-ocupacional.vercel.app/api/avisos/campana';
  exception when others then raise warning 'avisar_al_celular_al_instante: %', sqlerrm; -- nunca frena la notificación
  end;
  return null;
end $$;
revoke execute on function public.avisar_al_celular_al_instante() from public, anon, authenticated;
drop trigger if exists avisar_al_celular_al_instante on public.notificaciones;
create trigger avisar_al_celular_al_instante after insert on public.notificaciones
  referencing new table as nuevas for each statement execute function public.avisar_al_celular_al_instante();
