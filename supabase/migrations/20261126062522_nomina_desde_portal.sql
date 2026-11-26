-- Los enlaces del portal exigen sesión y permiso de nómina en cada llamada.
alter table public.depuraciones_nomina add column desde_portal boolean not null default false;

alter table public.miembros drop constraint miembros_permisos_portal_validos;
alter table public.miembros add constraint miembros_permisos_portal_validos
  check (permisos_portal is null or permisos_portal <@ array['citas', 'relacion', 'descargas', 'nomina']::text[]);
alter table public.invitaciones drop constraint invitaciones_permisos_portal_validos;
alter table public.invitaciones add constraint invitaciones_permisos_portal_validos
  check (permisos_portal is null or permisos_portal <@ array['citas', 'relacion', 'descargas', 'nomina']::text[]);

create function actividad_privada.puede_nomina_portal(p_org uuid, p_empresa uuid)
returns boolean language sql stable set search_path = '' as $$
  select auth.uid() is not null and not public.es_base_local() and not public.falta_segundo_paso()
    and actividad_privada.rrhh_empresa(p_org, p_empresa) and public.permiso_portal(p_org, 'nomina')
    and exists (select from public.empresas e where e.id = p_empresa and e.org_id = p_org and e.activa and not e.es_particular)
$$;
revoke all on function actividad_privada.puede_nomina_portal(uuid, uuid) from public, anon, authenticated;

create function actividad_privada.nomina_portal(p_org uuid, p_empresa uuid, p_crear boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.depuraciones_nomina;
  v_token text;
  v_ahora timestamptz := public.ahora();
begin
  if not actividad_privada.puede_nomina_portal(p_org, p_empresa) then
    raise exception 'No tienes permiso para actualizar la nómina de esta empresa.' using errcode = '42501';
  end if;
  if p_crear then
    -- Tanto el portal como el servicio médico toman la misma llave antes de buscar el último enlace.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nomina:' || p_empresa::text, 0));
    select * into d from public.depuraciones_nomina where org_id = p_org and empresa_id = p_empresa
      order by creado_en desc limit 1 for update;
  else
    select * into d from public.depuraciones_nomina where org_id = p_org and empresa_id = p_empresa
      order by creado_en desc limit 1;
  end if;

  if d.id is not null and d.aplicado_en is null and d.anulado_en is null then
    if d.enviado_en is not null then
      return jsonb_build_object('estado', 'enviada');
    end if;
    if d.vence > v_ahora then
      return case when d.desde_portal then jsonb_build_object('estado', 'borrador', 'token', d.token, 'vence', d.vence)
               else jsonb_build_object('estado', 'enlace_servicio') end;
    end if;
  end if;
  if not coalesce(p_crear, false) then return jsonb_build_object('estado', 'disponible'); end if;

  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.depuraciones_nomina
    (org_id, empresa_id, token, vence, creado_en, desde_portal, rrhh_nombre, telefono_hash, telefono_fin, respuestas, agregados)
  values (p_org, p_empresa, v_token, v_ahora + interval '7 days',
    greatest(v_ahora, d.creado_en + interval '1 microsecond'), true,
    (select left(p.nombre_completo, 120) from public.perfiles p where p.id = auth.uid()),
    -- La columna heredada es obligatoria. El enlace de sesión nunca usa esta huella para abrirse.
    public.depuracion_huella(gen_random_uuid()::text), '0000',
    case when d.desde_portal and d.vence <= v_ahora and d.anulado_en is null and d.aplicado_en is null then d.respuestas else '{}'::jsonb end,
    case when d.desde_portal and d.vence <= v_ahora and d.anulado_en is null and d.aplicado_en is null then d.agregados else '[]'::jsonb end)
  returning * into d;
  return jsonb_build_object('estado', 'borrador', 'token', d.token, 'vence', d.vence);
end $$;
revoke all on function actividad_privada.nomina_portal(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function actividad_privada.nomina_portal(uuid, uuid, boolean) to authenticated;

create function public.nomina_portal(p_org uuid, p_empresa uuid, p_crear boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select actividad_privada.nomina_portal(p_org, p_empresa, p_crear)
$$;
revoke all on function public.nomina_portal(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.nomina_portal(uuid, uuid, boolean) to authenticated;

-- Las operaciones del editor comparten la misma validación y el mismo bloqueo de fila.
create or replace function public.depuracion_abierta(p_token text, p_dispositivo text)
returns public.depuraciones_nomina language plpgsql security definer set search_path = '' as $$
declare d public.depuraciones_nomina;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into d from public.depuraciones_nomina where token = p_token for update;
  if d.id is null or d.anulado_en is not null or d.aplicado_en is not null or d.vence <= public.ahora() then
    return null;
  end if;
  if d.desde_portal then
    if p_dispositivo is not null or d.enviado_en is not null
       or not actividad_privada.puede_nomina_portal(d.org_id, d.empresa_id) then return null; end if;
  elsif p_dispositivo is null or p_dispositivo !~ '^[0-9a-f]{64}$' or d.bloqueado_en is not null
        or d.dispositivo_hash is distinct from public.depuracion_huella(p_dispositivo) then
    return null;
  end if;
  return d;
end $$;
revoke all on function public.depuracion_abierta(text, text) from public, anon, authenticated;

-- Extiende las funciones vigentes sin sustituir su lógica de nómina ni la llave de los enlaces antiguos.
do $migracion$
declare
  par text[];
  definicion text;
begin
  foreach par slice 1 in array array[
    array['public.abrir_depuracion_nomina(text,text,text)',
      'if d.id is null or d.anulado_en', 'if d.id is null or d.desde_portal or d.anulado_en'],
    array['public.ver_depuracion_nomina(text,text)',
      'if d.id is null then return null; end if;',
      'if d.id is null or (d.desde_portal and (p_dispositivo is not null or not actividad_privada.puede_nomina_portal(d.org_id, d.empresa_id))) then return null; end if;'],
    array['public.ver_depuracion_nomina(text,text)',
      'v_acceso := case when d.bloqueado_en', 'v_acceso := case when d.desde_portal then ''ok'' when d.bloqueado_en'],
    array['public.crear_depuracion_nomina(uuid,text,text,integer,boolean)',
      '  select * into d from public.depuraciones_nomina',
      $nuevo$  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nomina:' || p_empresa::text, 0));
  if exists (select from public.depuraciones_nomina
    where org_id = v_org and empresa_id = p_empresa and desde_portal
      and anulado_en is null and aplicado_en is null and (vence > public.ahora() or enviado_en is not null)) then
    raise exception 'Esta empresa ya tiene una actualización en el portal de RR. HH.' using errcode = '23514';
  end if;
  select * into d from public.depuraciones_nomina$nuevo$],
    array['public.revision_depuracion_nomina(uuid)',
      '''token'', case when d.anulado_en', '''desde_portal'', d.desde_portal, ''token'', case when not d.desde_portal and d.anulado_en'],
    array['public.aplicar_depuracion_nomina(uuid,uuid[])',
      '  if d.aplicado_en is not null or d.anulado_en is not null then',
      $nuevo$  if d.desde_portal and d.enviado_en is null then
    raise exception 'RR. HH. todavía no ha enviado esta revisión.' using errcode = '22023';
  end if;
  if d.aplicado_en is not null or d.anulado_en is not null then$nuevo$],
    array['public.cerrar_depuracion_nomina(uuid,uuid)',
      '  if p_lote is not null',
      $nuevo$  if d.desde_portal and (d.enviado_en is null or d.anulado_en is not null) then
    raise exception 'La revisión del portal no está pendiente de confirmación.' using errcode = '22023';
  end if;
  if p_lote is not null$nuevo$]
  ] loop
    definicion := replace(pg_get_functiondef(par[1]::regprocedure), chr(13), '');
    if length(definicion) - length(replace(definicion, par[2], '')) <> length(par[2]) then
      raise exception 'Cambió la definición de %; revisar la migración de nómina', par[1];
    end if;
    execute replace(definicion, par[2], par[3]);
  end loop;
end $migracion$;

create or replace function actividad_privada.anotar_nomina()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.dispositivo_en is null and new.dispositivo_en is not null then
    perform actividad_privada.anotar(new.org_id, new.empresa_id, null, 'nomina_abierta', new.id::text);
  end if;
  if new.enviado_en is not null and (old.enviado_en is null or old.enviado_en <= new.enviado_en - interval '30 minutes') then
    perform actividad_privada.anotar(new.org_id, new.empresa_id, case when new.desde_portal then auth.uid() end, 'nomina_enviada',
      new.id::text || '/' || extract(epoch from new.enviado_en)::text);
  end if;
  return null;
end $$;
revoke all on function actividad_privada.anotar_nomina() from public, anon, authenticated;
