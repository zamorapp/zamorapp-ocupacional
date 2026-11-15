-- zamorApp · Vacaciones y alerta de post vacacional (Cesar, 30-oct): «tener en cuenta cuando se van de vacaciones,
-- cuánto tiempo les corresponde la revaloración para el post vacacional». Y avisos configurables por empresa.
-- 1. public.vacaciones: desde y regreso de cada trabajador. Las anota el servicio o RR. HH. de esa empresa.
-- 2. empresas.dias_post_vacacional: días que tiene el servicio, desde el regreso, para la evaluación post vacacional.
-- 3. Nuevo tipo de aviso por empresa «post_vacacional» (se apaga en «Avisos de esta empresa», como los otros).
-- 4. recordar_post_vacacional(): campana del personal clínico 2 días antes del regreso y otra vez si se vence el plazo.
--    Se apaga sola al registrar una consulta con motivo «Post vacacional» (POSV) desde el regreso.
-- Local primero (Analizar, 30-oct): la tabla es «subible». En el escritorio se anota sin internet en la base local y
-- sube por la bandeja (aplicar_cambios) con las mismas reglas que en la web: políticas por rol y empresa, y la empresa
-- se toma siempre del trabajador (trigger), nunca de lo que mande la pantalla.

create table if not exists public.vacaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  desde date not null,
  regreso date not null,
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  check (regreso > desde and regreso <= desde + 120)
);
create index if not exists vacaciones_trabajador on public.vacaciones (trabajador_id, regreso desc);
create index if not exists vacaciones_regreso on public.vacaciones (org_id, regreso);

alter table public.vacaciones enable row level security;
revoke all on public.vacaciones from anon;
grant select, insert, update, delete on public.vacaciones to authenticated;
-- Quien ve la empresa (servicio sin límite, o con esa empresa entre las permitidas, como RR. HH.); forma rápida (C14)
drop policy if exists vacaciones_leer on public.vacaciones;
create policy vacaciones_leer on public.vacaciones for select to authenticated using (
  org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]));
-- Anotan, corrigen y quitan: servicio (administrador, gerente médico, médico, enfermería, recepción) y RR. HH., en su empresa
drop policy if exists vacaciones_anotar on public.vacaciones;
create policy vacaciones_anotar on public.vacaciones for insert to authenticated with check (
  org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}'))::text[]));
drop policy if exists vacaciones_corregir on public.vacaciones;
create policy vacaciones_corregir on public.vacaciones for update to authenticated using (
  org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}'))::text[]))
  with check (
  org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}'))::text[]));
drop policy if exists vacaciones_quitar on public.vacaciones;
create policy vacaciones_quitar on public.vacaciones for delete to authenticated using (
  org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}'))::text[]));

-- La organización y la empresa salen del trabajador (no se puede anotar en una empresa ajena ni mover la fila a otra)
create or replace function public.vacaciones_de_su_empresa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select t.org_id, t.empresa_id into new.org_id, new.empresa_id from public.trabajadores t where t.id = new.trabajador_id;
  if new.org_id is null then raise exception 'Trabajador no encontrado' using errcode = '23503'; end if;
  -- Autor: quien sube el cambio (en la PC sin sesión en la nube queda el que traía la fila)
  if tg_op = 'INSERT' then new.creado_por := coalesce(auth.uid(), new.creado_por); end if;
  return new;
end $$;
revoke execute on function public.vacaciones_de_su_empresa() from public, anon, authenticated;
drop trigger if exists vacaciones_de_su_empresa on public.vacaciones;
create trigger vacaciones_de_su_empresa before insert or update of trabajador_id, org_id, empresa_id on public.vacaciones
  for each row execute function public.vacaciones_de_su_empresa();

insert into sync.tablas (nombre, clinica, subible) values ('public.vacaciones', false, true)
  on conflict (nombre) do update set subible = true;
alter table public.vacaciones add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.vacaciones;
create trigger sync_version before insert or update on public.vacaciones for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.vacaciones;
create trigger sync_anotar after insert or update or delete on public.vacaciones for each row execute function sync.anotar();

alter table public.empresas add column if not exists dias_post_vacacional integer not null default 5;
alter table public.empresas drop constraint if exists empresas_dias_post_vacacional;
alter table public.empresas add constraint empresas_dias_post_vacacional check (dias_post_vacacional between 0 and 60);
alter table public.empresas drop constraint if exists empresas_avisos_apagados_validos;
alter table public.empresas add constraint empresas_avisos_apagados_validos
  check (avisos_apagados <@ array['vencimientos', 'proxima_evaluacion', 'resultados', 'post_vacacional']::text[]);

-- Avisos ya dados por cada vacación y usuario (etapa: 'aviso' al acercarse el regreso, 'vencido' si pasa el plazo)
create table if not exists public.recordatorios_vacaciones (
  vacacion_id uuid not null references public.vacaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  etapa text not null check (etapa in ('aviso', 'vencido')),
  primary key (vacacion_id, usuario_id, etapa)
);
alter table public.recordatorios_vacaciones enable row level security;
revoke all on public.recordatorios_vacaciones from anon, authenticated;

-- Si se corrige la fecha de regreso, el aviso vuelve a sonar con la fecha nueva
create or replace function public.vacaciones_regreso_corregido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.recordatorios_vacaciones where vacacion_id = new.id;
  return null;
end $$;
revoke execute on function public.vacaciones_regreso_corregido() from public, anon, authenticated;
drop trigger if exists vacaciones_regreso_corregido on public.vacaciones;
create trigger vacaciones_regreso_corregido after update of regreso on public.vacaciones
  for each row when (old.regreso is distinct from new.regreso) execute function public.vacaciones_regreso_corregido();

create or replace function public.recordar_post_vacacional()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select v.id, v.org_id, v.empresa_id, v.trabajador_id, v.regreso, v.regreso + e.dias_post_vacacional as limite,
           t.nombres || ' ' || t.apellidos as nombre,
           case when v.regreso + e.dias_post_vacacional < v_hoy then 'vencido' else 'aviso' end as etapa
      from public.vacaciones v
      join public.empresas e on e.id = v.empresa_id and e.activa
      join public.trabajadores t on t.id = v.trabajador_id and t.estado in ('activo', 'reposo')
     where v.regreso <= v_hoy + 2 and v.regreso >= v_hoy - 60
       and not ('post_vacacional' = any (coalesce(e.avisos_apagados, '{}')))
       and (v.org_id = any (public.orgs_con(p_clinico => true, p_sin_limite => true))
            or (v.org_id::text || v.empresa_id::text) = any (public.pares_limitados(p_clinico => true)))
       and not exists (select 1 from clinico.consultas c join public.lista_items li on li.id = c.motivo_id and li.codigo = 'POSV'
                        where c.trabajador_id = v.trabajador_id and c.fecha >= v.regreso)
     order by v.regreso
     limit 30
  loop
    insert into public.recordatorios_vacaciones (vacacion_id, usuario_id, etapa) values (r.id, v_uid, r.etapa)
    on conflict do nothing;
    continue when not found;
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace, nivel)
    values (r.org_id, v_uid, r.empresa_id,
      case r.etapa when 'vencido' then 'Post vacacional vencido' else 'Post vacacional pendiente' end,
      r.nombre || case when r.regreso > v_hoy then ' · regresa el ' else ' · regresó el ' end || to_char(r.regreso, 'DD/MM/YYYY')
        || ' · evaluar antes del ' || to_char(r.limite, 'DD/MM/YYYY'),
      '/pacientes/' || r.trabajador_id,
      case r.etapa when 'vencido' then 'aviso' else 'info' end);
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

revoke execute on function public.recordar_post_vacacional() from public, anon;
grant execute on function public.recordar_post_vacacional() to authenticated;

-- Pausar o reactivar todos los avisos de una empresa de un toque (empresas con las que no se trabaja por un tiempo)
create or replace function public.pausar_avisos_empresa(p_empresa uuid, p_pausar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.empresas where id = p_empresa;
  if v_org is null or coalesce(public.mi_rol(v_org)::text, '') not in ('administrador', 'gerente_medico')
     or not public.puede_ver_empresa(v_org, p_empresa) then
    raise exception 'Solo el administrador o el gerente médico pausan avisos' using errcode = '42501';
  end if;
  update public.empresas
     set avisos_apagados = case when p_pausar then array['vencimientos', 'proxima_evaluacion', 'resultados', 'post_vacacional']::text[] else '{}' end
   where id = p_empresa;
end $$;
revoke execute on function public.pausar_avisos_empresa(uuid, boolean) from public, anon;
grant execute on function public.pausar_avisos_empresa(uuid, boolean) to authenticated;

-- ─── Sin internet en la PC: el aviso de post vacacional también lo calcula la base local ───
-- La puerta del escritorio la trata como la campana de resultados (constancia): la copia crea los avisos al momento y,
-- al volver internet, la nube la recalcula con sus datos y la PC borra los suyos (bandeja.mjs).
create or replace function public.constancia_diferida(p_equipo uuid, p_secreto text, p_id uuid, p_rpc text, p_args jsonb,
                                                       p_hora timestamptz, p_hora_verificada boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_hora timestamptz := case when coalesce(p_hora_verificada, false) and p_hora <= now() + interval '5 minutes'
                                  and p_hora >= now() - interval '30 days' then least(p_hora, now()) end;
begin
  if auth.uid() is null then raise exception 'Inicia sesión' using errcode = '42501'; end if;
  -- Como todo lo que sube desde una PC (aplicar_cambios): con el segundo paso cumplido
  if not public.dos_pasos_cumplido() then
    raise exception 'Falta la verificación en dos pasos para subir cambios desde este equipo' using errcode = '42501';
  end if;
  v_org := sync.equipo_valido(p_equipo, p_secreto);
  perform set_config('sync.equipo_id', p_equipo::text, true);
  insert into sync.constancias_aplicadas (id, equipo_id) values (p_id, p_equipo) on conflict (id) do nothing;
  if not found then return 'duplicado'; end if;

  if p_rpc = 'registrar_lectura_laboratorio' then
    perform public.registrar_lectura_laboratorio((p_args ->> 'p_consulta')::uuid, (p_args ->> 'p_adjunto')::uuid,
      p_args ->> 'p_cedula_leida', (p_args ->> 'p_cedula_coincide')::boolean, (p_args ->> 'p_cedula_ignorada')::boolean,
      (p_args ->> 'p_examenes')::integer);
    -- La fila que acaba de dejar (misma transacción: en = now()): lleva la hora de la PC y de qué equipo vino
    update public.bitacora set en = coalesce(v_hora, en), equipo_id = p_equipo,
           despues = despues || jsonb_build_object('registrada_sin_internet', true, 'hora_verificada', v_hora is not null)
     where usuario_id = auth.uid() and tabla = 'clinico.lectura_laboratorio' and en = now()
       and registro_id = (p_args ->> 'p_consulta')::uuid;
  elsif p_rpc = 'registrar_acceso' then
    perform public.registrar_acceso((p_args ->> 'p_trabajador')::uuid, (p_args ->> 'p_consulta')::uuid, p_equipo);
    update public.accesos set en = coalesce(v_hora, en), llego_en = now()
     where usuario_id = auth.uid() and en = now() and llego_en is null and trabajador_id = (p_args ->> 'p_trabajador')::uuid;
  elsif p_rpc = 'recordar_resultados' then
    -- La campana de resultados pendientes: la nube la vuelve a calcular con sus datos y su fecha (las consultas de la
    -- PC ya subieron); los avisos que la PC creó sin internet los borra la puerta al recibir «aplicado»
    perform public.recordar_resultados();
  elsif p_rpc = 'recordar_post_vacacional' then
    perform public.recordar_post_vacacional();
  else
    raise exception 'Constancia desconocida: %', p_rpc using errcode = '22023';
  end if;
  return 'aplicado';
end $$;
revoke execute on function public.constancia_diferida(uuid, text, uuid, text, jsonb, timestamptz, boolean) from public, anon;
grant execute on function public.constancia_diferida(uuid, text, uuid, text, jsonb, timestamptz, boolean) to authenticated;
