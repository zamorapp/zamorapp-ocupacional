-- Limpieza automática con plazos editables y botón «Limpieza» en Configuración (Cesar, 06-nov: «que se autoeliminen
-- con el tiempo o que yo pueda gestionar la eliminación... para que no se acumulen»).
-- Amplía public.mantenimiento_purgar() (no la duplica): mismas claves de antes + reglas nuevas, cada una con su plazo.
-- NUNCA borra: historias, consultas, trabajadores, diagnósticos, firmas, auditoría (bitacora), papelera, sincronía de
-- las PC (sync.*), envíos (constancia de qué se mandó a quién) ni respaldos. Solo copias temporales y registros técnicos.
-- Corre sola cada día en la nube (pg_cron) y además desde el respaldo de la PC; en la base local de la PC no borra nada.

create table if not exists public.limpieza_plazos (
  clave text primary key,
  dias integer not null,
  minimo integer not null,
  maximo integer not null,
  cambiado_por uuid references auth.users (id) on delete set null,
  cambiado_en timestamptz,
  check (dias between minimo and maximo)
);
alter table public.limpieza_plazos enable row level security;
revoke all on public.limpieza_plazos from anon, authenticated;

-- Plazos por defecto (días). «pdf_enlaces» cuenta desde que el enlace venció o se revocó.
insert into public.limpieza_plazos (clave, dias, minimo, maximo) values
  ('pdf_enlaces', 0, 0, 30),
  ('enlaces_paciente', 30, 7, 365),
  ('constancias_enviadas', 30, 7, 365),
  ('notificaciones_leidas', 90, 30, 730),
  ('aperturas_enlaces', 180, 30, 730),
  ('invitaciones', 30, 7, 365),
  ('pases_respaldo', 1, 1, 30),
  ('registros_respaldo', 365, 90, 1825)
on conflict (clave) do nothing;

-- «Quitar de la lista» en los enlaces de registro enviados (anulados, vencidos, descartados o ya agendados), con
-- Deshacer: solo los esconde. Cesar 06-nov: «los enlaces los puedo anular, pero igual me quedan allí».
alter table public.solicitudes_paciente add column if not exists oculto_en timestamptz;
grant update (oculto_en) on public.solicitudes_paciente to authenticated;
-- Solo se quita lo que ya terminó: un enlace que el paciente todavía puede llenar o uno por revisar se queda a la vista
create or replace function public.quitar_solicitud_paciente()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.oculto_en is not distinct from old.oculto_en then return new; end if;
  if new.oculto_en is not null then
    if old.recibido_en is null and old.anulado_en is null and old.vence >= now() then
      raise exception 'Ese enlace todavía se puede llenar: anúlalo primero';
    end if;
    if old.recibido_en is not null and old.resultado is null then
      raise exception 'Ese paciente está por revisar: acéptalo o descártalo primero';
    end if;
    new.oculto_en := now();
  end if;
  return new;
end $$;
drop trigger if exists quitar_solicitud_paciente on public.solicitudes_paciente;
create trigger quitar_solicitud_paciente before update of oculto_en on public.solicitudes_paciente
  for each row execute function public.quitar_solicitud_paciente();
revoke execute on function public.quitar_solicitud_paciente() from public, anon, authenticated;

create table if not exists public.limpieza_historial (
  id bigint generated always as identity primary key,
  en timestamptz not null default public.ahora(),
  automatica boolean not null,
  por uuid references auth.users (id) on delete set null,
  resultado jsonb not null
);
alter table public.limpieza_historial enable row level security;
revoke all on public.limpieza_historial from anon, authenticated;

create or replace function public.limpieza_dias(p_clave text)
returns interval language sql stable security definer set search_path = public as $$
  select make_interval(days => coalesce((select dias from public.limpieza_plazos where clave = p_clave), 36500))
$$;

-- Calcula (p_borrar = false) o borra (true) cada regla. Devuelve cuántas filas y cuántos bytes ocupan.
create or replace function public.limpieza_correr(p_borrar boolean)
returns table (clave text, cantidad bigint, bytes bigint)
language plpgsql security definer set search_path = public as $$
declare n bigint; b bigint;
begin
  -- PDF guardados para enlaces de envío ya vencidos o revocados (el enlace queda como constancia del envío)
  select count(*), coalesce(sum(pg_column_size(a.*)), 0) into n, b from public.envio_archivos a join public.envio_enlaces l on l.id = a.enlace_id
   where least(l.vence, coalesce(l.revocado_en, 'infinity')) < public.ahora() - public.limpieza_dias('pdf_enlaces');
  if p_borrar then
    delete from public.envio_archivos a using public.envio_enlaces l
     where l.id = a.enlace_id and least(l.vence, coalesce(l.revocado_en, 'infinity')) < public.ahora() - public.limpieza_dias('pdf_enlaces');
    get diagnostics n = row_count;
  end if;
  clave := 'pdf_enlaces'; cantidad := n; bytes := b; return next;

  -- Lo mismo para los enlaces del trabajador (mismo plazo)
  select count(*), coalesce(sum(pg_column_size(a.*)), 0) into n, b from public.enlaces_trabajador_archivos a join public.enlaces_trabajador l on l.id = a.enlace_id
   where least(l.vence, coalesce(l.revocado_en, 'infinity')) < public.ahora() - public.limpieza_dias('pdf_enlaces');
  if p_borrar then
    delete from public.enlaces_trabajador_archivos a using public.enlaces_trabajador l
     where l.id = a.enlace_id and least(l.vence, coalesce(l.revocado_en, 'infinity')) < public.ahora() - public.limpieza_dias('pdf_enlaces');
    get diagnostics n = row_count;
  end if;
  clave := 'pdf_trabajador'; cantidad := n; bytes := b; return next;

  -- Enlaces de registro que el paciente NUNCA llenó (sin datos de nadie) y ya vencieron o se anularon. Los que sí
  -- llenó no se borran aquí: los descartados ya se vacían solos a los 30 días y los aceptados viven en su ficha.
  select count(*), coalesce(sum(pg_column_size(s.*)), 0) into n, b from public.solicitudes_paciente s
   where s.recibido_en is null and least(s.vence, coalesce(s.anulado_en, 'infinity')) < public.ahora() - public.limpieza_dias('enlaces_paciente');
  if p_borrar then
    delete from public.solicitudes_paciente s
     where s.recibido_en is null and least(s.vence, coalesce(s.anulado_en, 'infinity')) < public.ahora() - public.limpieza_dias('enlaces_paciente');
    get diagnostics n = row_count;
  end if;
  clave := 'enlaces_paciente'; cantidad := n; bytes := b; return next;

  -- PDF de constancias que ya salieron en el correo diario de la empresa (la constancia se puede volver a imprimir)
  select count(*), coalesce(sum(pg_column_size(c.*)), 0) into n, b from public.constancias_listas c
   where c.enviada_en < public.ahora() - public.limpieza_dias('constancias_enviadas');
  if p_borrar then
    delete from public.constancias_listas c where c.enviada_en < public.ahora() - public.limpieza_dias('constancias_enviadas');
    get diagnostics n = row_count;
  end if;
  clave := 'constancias_enviadas'; cantidad := n; bytes := b; return next;

  -- Avisos de la campana ya leídos (con ellos se va su marca de «enviado al celular»)
  select count(*), coalesce(sum(pg_column_size(x.*)), 0) into n, b from public.notificaciones x
   where x.leida and x.creado_en < public.ahora() - public.limpieza_dias('notificaciones_leidas');
  if p_borrar then
    delete from public.notificaciones x where x.leida and x.creado_en < public.ahora() - public.limpieza_dias('notificaciones_leidas');
    get diagnostics n = row_count;
  end if;
  clave := 'notificaciones_leidas'; cantidad := n; bytes := b; return next;

  -- Registro técnico de cada vez que alguien abrió un enlace (navegador y hora)
  select (select count(*) from public.envio_aperturas where en < public.ahora() - public.limpieza_dias('aperturas_enlaces'))
       + (select count(*) from public.enlaces_trabajador_aperturas where en < public.ahora() - public.limpieza_dias('aperturas_enlaces')),
         (select coalesce(sum(pg_column_size(x.*)), 0) from public.envio_aperturas x where en < public.ahora() - public.limpieza_dias('aperturas_enlaces'))
       + (select coalesce(sum(pg_column_size(x.*)), 0) from public.enlaces_trabajador_aperturas x where en < public.ahora() - public.limpieza_dias('aperturas_enlaces'))
    into n, b;
  if p_borrar then
    delete from public.envio_aperturas where en < public.ahora() - public.limpieza_dias('aperturas_enlaces');
    get diagnostics n = row_count;
    delete from public.enlaces_trabajador_aperturas where en < public.ahora() - public.limpieza_dias('aperturas_enlaces');
    get diagnostics b = row_count;
    n := n + b; b := null;
  end if;
  clave := 'aperturas_enlaces'; cantidad := n; bytes := b; return next;

  -- Invitaciones de RR. HH. que nunca se usaron y ya vencieron o se revocaron
  select count(*), coalesce(sum(pg_column_size(i.*)), 0) into n, b from public.invitaciones i
   where i.usada_en is null and coalesce(i.revocada_en, i.vence) < public.ahora() - public.limpieza_dias('invitaciones');
  if p_borrar then
    delete from public.invitaciones i
     where i.usada_en is null and coalesce(i.revocada_en, i.vence) < public.ahora() - public.limpieza_dias('invitaciones');
    get diagnostics n = row_count;
  end if;
  clave := 'invitaciones'; cantidad := n; bytes := b; return next;

  -- Pases de un solo uso del respaldo de archivos (valen 10 minutos)
  select count(*), coalesce(sum(pg_column_size(p.*)), 0) into n, b from public.pases_respaldo p
   where p.creado < public.ahora() - public.limpieza_dias('pases_respaldo');
  if p_borrar then
    delete from public.pases_respaldo p where p.creado < public.ahora() - public.limpieza_dias('pases_respaldo');
    get diagnostics n = row_count;
  end if;
  clave := 'pases_respaldo'; cantidad := n; bytes := b; return next;

  -- Renglones del historial de respaldos (los archivos de respaldo NO se tocan: viven en la PC y en Drive)
  select count(*), coalesce(sum(pg_column_size(r.*)), 0) into n, b from public.respaldos r
   where r.fecha < public.ahora() - public.limpieza_dias('registros_respaldo');
  if p_borrar then
    delete from public.respaldos r where r.fecha < public.ahora() - public.limpieza_dias('registros_respaldo');
    get diagnostics n = row_count;
  end if;
  clave := 'registros_respaldo'; cantidad := n; bytes := b; return next;

  -- El propio historial de limpiezas se guarda un año
  if p_borrar then delete from public.limpieza_historial h where h.en < public.ahora() - interval '1 year'; end if;
end $$;

-- Misma firma y claves de antes (la usa scripts/respaldo.mjs y la prueba 99), ahora con todas las reglas
create or replace function public.mantenimiento_purgar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if public.es_base_local() then return '{}'::jsonb; end if;
  select jsonb_object_agg(x.clave, x.cantidad) into r from public.limpieza_correr(true) x;
  r := r || jsonb_build_object('pdf_enlaces_vencidos', r -> 'pdf_enlaces', 'pdf_trabajador_vencidos', r -> 'pdf_trabajador',
                               'registros_respaldo_viejos', r -> 'registros_respaldo', 'invitaciones_viejas', r -> 'invitaciones');
  return r;
end $$;
revoke execute on function public.mantenimiento_purgar() from public, anon, authenticated;
revoke execute on function public.limpieza_correr(boolean), public.limpieza_dias(text) from public, anon, authenticated;

-- La que corre cada día en la nube: borra y deja la constancia en el historial
create or replace function public.limpieza_automatica()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  r := public.mantenimiento_purgar();
  insert into public.limpieza_historial (automatica, resultado) values (true, r);
  return r;
end $$;
revoke execute on function public.limpieza_automatica() from public, anon, authenticated;

create or replace function public.limpieza_soy_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mis_orgs() o where public.es_admin(o))
$$;
-- Solo la usan las funciones de abajo (corren como dueño): nadie de la app la llama directo
revoke execute on function public.limpieza_soy_admin() from public, anon, authenticated;

-- Para la pantalla: reglas con su plazo y cuánto hay ahora para limpiar, espacio de la base y la última limpieza
create or replace function public.limpieza_estado()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.limpieza_soy_admin() then raise exception 'Solo el administrador ve la limpieza' using errcode = '42501'; end if;
  return jsonb_build_object(
    'reglas', (select jsonb_agg(jsonb_build_object('clave', p.clave, 'dias', p.dias, 'minimo', p.minimo, 'maximo', p.maximo,
                 'cantidad', x.cantidad, 'bytes', x.bytes) order by p.clave)
               from public.limpieza_correr(false) x
               join public.limpieza_plazos p on p.clave = case x.clave when 'pdf_trabajador' then 'pdf_enlaces' else x.clave end
               where x.clave <> 'pdf_trabajador'),
    'pdf_trabajador', (select jsonb_build_object('cantidad', x.cantidad, 'bytes', x.bytes) from public.limpieza_correr(false) x where x.clave = 'pdf_trabajador'),
    'base_mb', round(pg_database_size(current_database()) / 1048576.0, 1),
    'local', public.es_base_local(),
    'ultima', (select jsonb_build_object('en', h.en, 'automatica', h.automatica, 'resultado', h.resultado)
               from public.limpieza_historial h order by h.en desc limit 1),
    'historial', (select coalesce(jsonb_agg(jsonb_build_object('en', h.en, 'automatica', h.automatica, 'resultado', h.resultado) order by h.en desc), '[]'::jsonb)
                  from (select * from public.limpieza_historial order by en desc limit 5) h));
end $$;
revoke execute on function public.limpieza_estado() from public, anon;
grant execute on function public.limpieza_estado() to authenticated;

-- «Limpiar ahora» desde la pantalla
create or replace function public.limpieza_ejecutar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.limpieza_soy_admin() then raise exception 'Solo el administrador limpia' using errcode = '42501'; end if;
  if public.es_base_local() then raise exception 'La limpieza se hace en la nube: abre zamorApp con internet' using errcode = 'P0001'; end if;
  r := public.mantenimiento_purgar();
  insert into public.limpieza_historial (automatica, por, resultado) values (false, auth.uid(), r);
  return r;
end $$;
revoke execute on function public.limpieza_ejecutar() from public, anon;
grant execute on function public.limpieza_ejecutar() to authenticated;

create or replace function public.limpieza_cambiar_plazo(p_clave text, p_dias integer)
returns void language plpgsql security definer set search_path = public as $$
declare p public.limpieza_plazos;
begin
  if not public.limpieza_soy_admin() then raise exception 'Solo el administrador cambia los plazos' using errcode = '42501'; end if;
  select * into p from public.limpieza_plazos where clave = p_clave;
  if not found then raise exception 'Plazo desconocido: %', p_clave using errcode = 'P0001'; end if;
  if p_dias is null or p_dias < p.minimo or p_dias > p.maximo then
    raise exception 'Ese plazo va de % a % días', p.minimo, p.maximo using errcode = 'P0001';
  end if;
  update public.limpieza_plazos set dias = p_dias, cambiado_por = auth.uid(), cambiado_en = public.ahora() where clave = p_clave;
end $$;
revoke execute on function public.limpieza_cambiar_plazo(text, integer) from public, anon;
grant execute on function public.limpieza_cambiar_plazo(text, integer) to authenticated;

-- Cada día a las 5:27 a. m. de Caracas (9:27 UTC), en la nube y solo donde exista pg_cron
do $migracion$
begin
  if public.es_base_local() then return; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('zamorapp-limpieza', '27 9 * * *', $$select public.limpieza_automatica()$$);
  end if;
end $migracion$;
