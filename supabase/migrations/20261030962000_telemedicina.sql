-- zamorApp · Consulta a distancia y sala de espera de seguimiento (pedido de Cesar, 14-nov-2026)
-- «Una paciente me consultó por teléfono y le indiqué paraclínicos. Si no la veo en cierto tiempo, que quede como
-- registro; si vuelve, que se genere una consulta nueva.»
-- · La consulta a distancia es una consulta normal (clinico.consultas: historia, diagnóstico, récipe, firma). Esta
--   tabla guarda lo propio de la telemedicina: medio, duración, dónde estaba el paciente, desde qué número, cómo se
--   comprobó su identidad, el consentimiento y las fallas técnicas (AMM, Declaración sobre Salud Digital, 2022).
-- · Ley de Telesalud (G.O. 6.207 Ext., 28-12-2015): consentimiento informado POR ESCRITO. El paciente lo da pulsando
--   «Acepto» en un enlace de 7 días (solo en la nube); si no puede, el médico marca «de palabra».
-- · La sala de espera NO es tabla nueva: es la «Alerta para la próxima evaluación» (clinico.alertas_clinicas) dejada en
--   una consulta a distancia. Al vencer su «revisar antes del» se archiva sola (descartada, automática) y queda en la
--   historia. Si el paciente vuelve, la consulta de control queda enlazada en control_id.
-- Reglas: solo personal clínico lee (RLS como alertas); escribe médico, gerente médico o administrador; sin borrar;
-- «escrito» solo lo pone el enlace; lo escrito no cambia después de firmar la consulta; RR. HH. nunca lo ve.

create table if not exists clinico.teleconsultas (
  id uuid primary key default gen_random_uuid(),
  -- Una por consulta (la sincronía del escritorio necesita «id»)
  consulta_id uuid not null unique references clinico.consultas (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete set null,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  medio text not null check (medio in ('llamada', 'videollamada', 'whatsapp', 'nota_voz')),
  duracion_min integer check (duracion_min between 0 and 600),
  ubicacion text not null default '' check (length(ubicacion) <= 200),
  telefono text not null default '' check (length(telefono) <= 40),
  identidad text not null default '' check (length(identidad) <= 200),
  consentimiento text not null default 'pendiente' check (consentimiento in ('pendiente', 'escrito', 'verbal')),
  consentimiento_en timestamptz,
  enlace_hash bytea,
  enlace_vence timestamptz,
  fallas text not null default '' check (length(fallas) <= 500),
  control_id uuid references clinico.consultas (id) on delete set null,
  creado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default public.ahora(),
  actualizado_en timestamptz not null default public.ahora(),
  hora_equipo jsonb,
  version bigint not null default 1
);
create index if not exists teleconsultas_trabajador on clinico.teleconsultas (trabajador_id);
create unique index if not exists teleconsultas_enlace on clinico.teleconsultas (enlace_hash) where enlace_hash is not null;

alter table clinico.teleconsultas enable row level security;
drop policy if exists teleconsultas_leer on clinico.teleconsultas;
create policy teleconsultas_leer on clinico.teleconsultas for select using (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
drop policy if exists teleconsultas_crear on clinico.teleconsultas;
create policy teleconsultas_crear on clinico.teleconsultas for insert with check (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
drop policy if exists teleconsultas_cambiar on clinico.teleconsultas;
create policy teleconsultas_cambiar on clinico.teleconsultas for update using (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
-- Sin delete: se borra solo con su consulta (papelera del administrador)
grant select, insert, update on clinico.teleconsultas to authenticated;
revoke delete on clinico.teleconsultas from authenticated, anon;

create or replace view public.teleconsultas with (security_invoker = true) as select * from clinico.teleconsultas;
grant select, insert, update on public.teleconsultas to authenticated;
revoke all on public.teleconsultas from anon;

-- ─── Reglas de la fila (corren en la nube y en la PC) ───
create or replace function public.proteger_teleconsulta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bandeja boolean := coalesce(current_setting('sync.cambio_id', true), '') <> '';
  v_enlace boolean := coalesce(current_setting('zamorapp.consentimiento_enlace', true), '') = 'on';
  v_firmada boolean;
begin
  -- Solo el enlace del paciente (aceptar_consentimiento_tele) escribe sin sesión
  if not v_enlace and (v_uid is null or not coalesce(new.org_id, old.org_id) = any (public.orgs_con('{administrador,gerente_medico,medico}'))) then
    raise exception 'La consulta a distancia la registra el médico.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select c.empresa_id, c.trabajador_id into new.empresa_id, new.trabajador_id
      from clinico.consultas c where c.id = new.consulta_id and c.org_id = new.org_id;
    if not found then raise exception 'La consulta no es de esta organización.'; end if;
    new.ubicacion := btrim(new.ubicacion); new.telefono := btrim(new.telefono);
    new.identidad := btrim(new.identidad); new.fallas := btrim(new.fallas);
    -- «Escrito» solo lo da el paciente en su enlace
    if new.consentimiento = 'escrito' then new.consentimiento := 'pendiente'; end if;
    if new.consentimiento = 'pendiente' then new.consentimiento_en := null;
    elsif not v_bandeja or new.consentimiento_en is null then new.consentimiento_en := public.ahora(); end if;
    new.control_id := null;
    -- El enlace dura 7 días desde que se crea (hora de la nube, nunca la del equipo)
    new.enlace_vence := case when new.enlace_hash is null then null else public.ahora() + interval '7 days' end;
    if not v_bandeja or new.creado_por is null then new.creado_por := v_uid; end if;
    if not v_bandeja then new.creado_en := public.ahora(); end if;
    return new;
  end if;

  -- Lo que ata la fila no cambia
  new.id := old.id; new.consulta_id := old.consulta_id; new.org_id := old.org_id; new.empresa_id := old.empresa_id; new.trabajador_id := old.trabajador_id;
  new.creado_por := old.creado_por; new.creado_en := old.creado_en;
  new.actualizado_en := public.ahora();

  -- Consentimiento: «escrito» no se pierde y solo lo pone el enlace; «de palabra» guarda su hora
  if old.consentimiento = 'escrito' then
    new.consentimiento := old.consentimiento; new.consentimiento_en := old.consentimiento_en;
  elsif new.consentimiento = 'escrito' and not v_enlace then
    new.consentimiento := old.consentimiento; new.consentimiento_en := old.consentimiento_en;
  elsif new.consentimiento is distinct from old.consentimiento then
    if new.consentimiento = 'pendiente' then new.consentimiento_en := null;
    elsif not v_bandeja or new.consentimiento_en is null then new.consentimiento_en := public.ahora(); end if;
  else
    new.consentimiento_en := old.consentimiento_en;
  end if;

  -- El enlace sin sesión solo toca el consentimiento
  if v_enlace then
    new.medio := old.medio; new.duracion_min := old.duracion_min; new.ubicacion := old.ubicacion; new.telefono := old.telefono;
    new.identidad := old.identidad; new.fallas := old.fallas; new.enlace_hash := old.enlace_hash; new.enlace_vence := old.enlace_vence;
    new.control_id := old.control_id;
    return new;
  end if;

  -- Enlace nuevo: 7 días desde ahora; sin enlace, sin vencimiento
  if new.enlace_hash is distinct from old.enlace_hash then
    new.enlace_vence := case when new.enlace_hash is null then null else public.ahora() + interval '7 days' end;
  else
    new.enlace_vence := old.enlace_vence;
  end if;

  -- La consulta de control se enlaza una sola vez y debe ser del mismo paciente
  if old.control_id is not null then
    new.control_id := old.control_id;
  elsif new.control_id is not null and not exists (
      select 1 from clinico.consultas c where c.id = new.control_id and c.trabajador_id = old.trabajador_id and c.id <> old.consulta_id) then
    new.control_id := null;
  end if;

  -- Firmada la consulta, lo registrado de la llamada queda como se firmó
  select c.estado = 'firmada' into v_firmada from clinico.consultas c where c.id = old.consulta_id;
  if coalesce(v_firmada, false) then
    new.medio := old.medio; new.duracion_min := old.duracion_min; new.ubicacion := old.ubicacion; new.telefono := old.telefono;
    new.identidad := old.identidad; new.fallas := old.fallas;
  else
    new.ubicacion := btrim(new.ubicacion); new.telefono := btrim(new.telefono);
    new.identidad := btrim(new.identidad); new.fallas := btrim(new.fallas);
  end if;
  return new;
end $$;
revoke execute on function public.proteger_teleconsulta() from public, anon, authenticated;

-- «proteger_…» corre después de «hora_oficial» (los before van en orden alfabético)
drop trigger if exists proteger_teleconsulta on clinico.teleconsultas;
create trigger proteger_teleconsulta before insert or update on clinico.teleconsultas
  for each row execute function public.proteger_teleconsulta();
drop trigger if exists hora_oficial on clinico.teleconsultas;
create trigger hora_oficial before insert or update on clinico.teleconsultas
  for each row execute function public.hora_oficial_de_la_bandeja('creado_en', 'consentimiento_en');
drop trigger if exists bit_teleconsultas on clinico.teleconsultas;
create trigger bit_teleconsultas after insert or update on clinico.teleconsultas
  for each row execute function public.registrar_bitacora();

-- ─── Enlace de consentimiento (sin cuenta). El enlace (≥240 bits) es la llave; solo se guarda su huella. ───
-- Lo que ve el paciente: quién lo atiende y cuándo; nunca datos clínicos. null = no existe.
create or replace function public.ver_consentimiento_tele(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  if public.es_base_local() or p_token is null or p_token !~ '^[A-Za-z0-9_-]{40,64}$' then return null; end if;
  select t.consentimiento, t.consentimiento_en, t.enlace_vence, t.medio, c.fecha, o.nombre as servicio, o.telefono as telefono_servicio,
         coalesce(nullif(btrim(p.nombre_completo), ''), 'su médico') as medico
    into r
    from clinico.teleconsultas t
    join clinico.consultas c on c.id = t.consulta_id
    join public.organizaciones o on o.id = t.org_id
    left join public.perfiles p on p.id = c.medico_id
   where t.enlace_hash = sha256(convert_to(p_token, 'UTF8'));
  if not found then return null; end if;
  return jsonb_build_object(
    'estado', case when r.consentimiento = 'escrito' then 'aceptado' when r.enlace_vence <= public.ahora() then 'vencido' else 'vigente' end,
    'aceptado_en', r.consentimiento_en, 'medio', r.medio, 'fecha', r.fecha,
    'servicio', r.servicio, 'telefono_servicio', r.telefono_servicio, 'medico', r.medico);
end $$;
revoke execute on function public.ver_consentimiento_tele(text) from public;
grant execute on function public.ver_consentimiento_tele(text) to anon, authenticated;

-- «Acepto»: ok | ya (ya estaba aceptado) | cerrado (no existe o venció)
create or replace function public.aceptar_consentimiento_tele(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_estado text; v_vence timestamptz;
begin
  if public.es_base_local() or p_token is null or p_token !~ '^[A-Za-z0-9_-]{40,64}$' then return 'cerrado'; end if;
  select id, consentimiento, enlace_vence into v_id, v_estado, v_vence
    from clinico.teleconsultas where enlace_hash = sha256(convert_to(p_token, 'UTF8')) for update;
  if v_id is null then return 'cerrado'; end if;
  if v_estado = 'escrito' then return 'ya'; end if;
  if v_vence is null or v_vence <= public.ahora() then return 'cerrado'; end if;
  perform set_config('zamorapp.consentimiento_enlace', 'on', true);
  update clinico.teleconsultas set consentimiento = 'escrito', consentimiento_en = public.ahora() where id = v_id;
  perform set_config('zamorapp.consentimiento_enlace', '', true);
  return 'ok';
end $$;
revoke execute on function public.aceptar_consentimiento_tele(text) from public;
grant execute on function public.aceptar_consentimiento_tele(text) to anon, authenticated;

-- ─── Sala de espera: alertas pendientes dejadas en una consulta a distancia (y las archivadas de 90 días) ───
-- Invoker: cada quien ve solo lo que su RLS le deja ver (RR. HH. no ve nada).
create or replace function public.seguimientos_distancia(p_archivados boolean default false)
returns table (alerta_id uuid, consulta_id uuid, trabajador_id uuid, paciente text, empresa text, medio text, fecha date,
               revisar_antes date, estado text, respuesta text, paraclinicos jsonb, texto text, telefono text, control_id uuid)
language sql stable security invoker set search_path = public as $$
  select a.id, a.consulta_id, a.trabajador_id, w.nombres || ' ' || w.apellidos, e.razon_social, t.medio, c.fecha,
         a.revisar_antes, a.estado, a.respuesta, a.paraclinicos, a.texto,
         coalesce(nullif(t.telefono, ''), w.telefono), t.control_id
    from clinico.alertas_clinicas a
    join clinico.teleconsultas t on t.consulta_id = a.consulta_id
    join clinico.consultas c on c.id = a.consulta_id
    join public.trabajadores w on w.id = a.trabajador_id
    left join public.empresas e on e.id = a.empresa_id
   where case when p_archivados
              then a.estado = 'descartada' and a.automatica and a.revisada_en >= public.ahora() - interval '90 days'
              else a.estado = 'pendiente' end
   order by a.revisar_antes nulls last, c.fecha
   limit 200
$$;
revoke execute on function public.seguimientos_distancia(boolean) from public, anon;
grant execute on function public.seguimientos_distancia(boolean) to authenticated;

-- Archiva lo vencido (al abrir el Inicio). Solo en la nube: la PC recibe el cambio al bajar la copia.
create or replace function public.archivar_seguimientos_distancia()
returns integer language plpgsql security definer set search_path = public as $$
declare v_total integer := 0; r record;
begin
  if public.es_base_local() or auth.uid() is null then return 0; end if;
  for r in
    select a.id from clinico.alertas_clinicas a
      join clinico.teleconsultas t on t.consulta_id = a.consulta_id
     where a.estado = 'pendiente' and a.revisar_antes is not null and a.revisar_antes < public.hoy_caracas()
       -- Solo médico, gerente médico o administrador (enfermería no actúa sobre lo que no es suyo)
       and (a.org_id = any (public.orgs_con('{administrador,gerente_medico,medico}', p_sin_limite => true))
            or (a.org_id::text || a.empresa_id::text) = any (public.pares_limitados('{administrador,gerente_medico,medico}')))
     limit 100
  loop
    perform set_config('zamorapp.cierre_automatico', 'on', true);
    update clinico.alertas_clinicas set estado = 'descartada',
      respuesta = 'Archivada: no volvió antes del ' || to_char(revisar_antes, 'DD/MM/YYYY') || ' (seguimiento a distancia)'
     where id = r.id and estado = 'pendiente';
    perform set_config('zamorapp.cierre_automatico', '', true);
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
revoke execute on function public.archivar_seguimientos_distancia() from public, anon;
grant execute on function public.archivar_seguimientos_distancia() to authenticated;

-- ─── Escritorio: baja con la copia y se registra sin internet (sube por la bandeja) ───
insert into sync.tablas (nombre, clinica, subible) values ('clinico.teleconsultas', true, true)
  on conflict (nombre) do nothing;
alter table clinico.teleconsultas add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on clinico.teleconsultas;
create trigger sync_version before insert or update on clinico.teleconsultas for each row execute function sync.versionar();
drop trigger if exists sync_anotar on clinico.teleconsultas;
create trigger sync_anotar after insert or update or delete on clinico.teleconsultas for each row execute function sync.anotar();
