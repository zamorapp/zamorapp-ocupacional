-- zamorApp Ocupacional · El enlace de invitación lleva el rol (16-nov-2026)
-- Antes el único enlace era de RR. HH.: Cesar eligió «Enfermería» en «Agregar usuario» (que exige cuenta ya creada),
-- no pudo, y terminó mandando un enlace de RR. HH. a la enfermera. Ahora la invitación guarda el rol y la empresa,
-- y al aceptarla la persona queda con ESE rol.
-- Reglas:
--   · Nunca se invita como administrador ni como trabajador (el trabajador tiene su propio enlace de paciente).
--   · Roles de empresa y enfermería: siempre con su empresa (la enfermera de una empresa ve solo esa).
--   · Médico: empresa opcional (sin empresa ve todas). Gerente médico, recepción y coordinador SST: sin empresa.
--   · Los permisos del portal solo existen para RR. HH.
--   · Aceptar nunca cambia el rol de quien ya está en el servicio; si ya tiene ESE rol, solo suma la empresa
--     (y quien ya ve todas las empresas sigue viéndolas todas).
-- Las funciones se parchean por texto (sin chr(13)), con guarda si el ancla no aparece. ver_invitacion cambia lo que
-- devuelve (suma «rol»), y eso obliga a borrarla y crearla (como en 20261030750000).

-- Bloqueo al inicio, en el orden de la app (lección de 965: deadlock al pegar con usuarios conectados):
-- aceptar_invitacion toma primero la invitación (for update) y luego escribe en miembros
lock table public.invitaciones, public.miembros in share row exclusive mode;

alter table public.invitaciones add column if not exists rol public.rol_usuario not null default 'gerente_empresa';
alter table public.invitaciones alter column empresa_id drop not null;

alter table public.invitaciones drop constraint if exists invitaciones_rol_invitable;
alter table public.invitaciones add constraint invitaciones_rol_invitable
  check (rol not in ('administrador', 'trabajador'));
alter table public.invitaciones drop constraint if exists invitaciones_empresa_segun_rol;
alter table public.invitaciones add constraint invitaciones_empresa_segun_rol check (
  case
    when rol in ('gerente_empresa', 'supervisor', 'delegado_prevencion', 'auditor', 'enfermeria') then empresa_id is not null
    when rol in ('gerente_medico', 'recepcion', 'coordinador_sst') then empresa_id is null
    else true
  end);
alter table public.invitaciones drop constraint if exists invitaciones_permisos_solo_rrhh;
alter table public.invitaciones add constraint invitaciones_permisos_solo_rrhh
  check (permisos_portal is null or rol = 'gerente_empresa');

-- validar_invitacion: la empresa se revisa solo si la invitación la trae
do $$
declare d text; viejo text := 'if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then';
begin
  d := replace(pg_get_functiondef('public.validar_invitacion()'::regprocedure), chr(13), '');
  if position('new.empresa_id is not null and not exists' in d) > 0 then return; end if;
  if position(viejo in d) = 0 then raise exception '966: no encontré el ancla en validar_invitacion'; end if;
  d := replace(d, viejo, 'if new.empresa_id is not null and not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then');
  execute d;
end $$;

-- aceptar_invitacion: crea el miembro con el rol de la invitación
do $$
declare d text; ini int; fin int;
  ancla_ini text := '  select * into m from public.miembros where org_id = i.org_id and usuario_id = auth.uid();';
  ancla_fin text := 'Pide al administrador que te agregue la empresa.'';' || chr(10) || '  end if;';
  aviso_viejo text := '''RR. HH. aceptó la invitación'',' || chr(10) || '    coalesce(i.nombre, ''Una persona'') || '' ya entra al portal de la empresa.''';
  nuevo text := $n$  select * into m from public.miembros where org_id = i.org_id and usuario_id = auth.uid();
  if m.id is null then
    insert into public.miembros (org_id, usuario_id, rol, empresas_permitidas, permisos_portal)
    values (i.org_id, auth.uid(), i.rol,
            case when i.empresa_id is null then null else array[i.empresa_id] end,
            case when i.rol = 'gerente_empresa' then i.permisos_portal end);
  elsif m.rol = i.rol then
    -- Una cuenta desactivada por el administrador no se reactiva con un enlace
    if not m.activo then raise exception 'Tu cuenta está desactivada. Pide al administrador que la reactive.'; end if;
    -- Suma la empresa; quien ya ve todas las empresas (sin empresas marcadas) sigue viéndolas todas
    if i.empresa_id is not null and m.empresas_permitidas is not null then
      update public.miembros
      set empresas_permitidas = (select array_agg(distinct x) from unnest(m.empresas_permitidas || i.empresa_id) x)
      where id = m.id;
    end if;
  else
    -- Nunca cambia el rol de quien ya está en este servicio médico
    raise exception 'Tu cuenta ya tiene otro rol en este servicio médico. Pide al administrador que te agregue la empresa.';
  end if;$n$;
  aviso_nuevo text := $n$case i.rol when 'gerente_empresa' then 'RR. HH.' when 'enfermeria' then 'Enfermería'
      when 'medico' then 'Médico' when 'gerente_medico' then 'Gerente médico' when 'recepcion' then 'Recepción'
      when 'coordinador_sst' then 'Coordinador SST' when 'supervisor' then 'Supervisor' when 'delegado_prevencion' then 'Delegado de prevención'
      when 'auditor' then 'Auditor' else i.rol::text end || ' aceptó la invitación',
    coalesce(i.nombre, 'Una persona') || case when i.rol = 'gerente_empresa' then ' ya entra al portal de la empresa.' else ' ya entra a zamorApp.' end$n$;
begin
  d := replace(pg_get_functiondef('public.aceptar_invitacion(text)'::regprocedure), chr(13), '');
  if position('values (i.org_id, auth.uid(), i.rol,' in d) > 0 then return; end if;
  ini := position(ancla_ini in d);
  fin := position(ancla_fin in d);
  if ini = 0 or fin = 0 or fin < ini then raise exception '966: no encontré las anclas en aceptar_invitacion'; end if;
  d := left(d, ini - 1) || nuevo || substr(d, fin + length(ancla_fin));
  if position(aviso_viejo in d) = 0 then raise exception '966: no encontré el aviso en aceptar_invitacion'; end if;
  d := replace(d, aviso_viejo, aviso_nuevo);
  execute d;
end $$;

-- ver_invitacion: suma el rol; la empresa puede faltar (médico de todas, recepción…); otro_rol = ya tiene un rol distinto
drop function if exists public.ver_invitacion(text);
create function public.ver_invitacion(p_token text)
returns table (empresa text, organizacion text, nombre text, estado text, invita text, otro_rol boolean, rol text)
language sql stable security definer set search_path = public as $$
  select coalesce(e.nombre_comercial, e.razon_social), o.nombre, i.nombre,
         case when i.revocada_en is not null then 'anulada'
              when i.usada_en is not null then 'usada'
              when i.vence < now() then 'vencida'
              else 'vigente' end,
         nullif(btrim(left(o.ajustes ->> 'invita_como', 120)), ''),
         exists (select 1 from public.miembros m where m.org_id = i.org_id and m.usuario_id = auth.uid() and m.rol <> i.rol),
         i.rol::text
  from public.invitaciones i
  left join public.empresas e on e.id = i.empresa_id
  join public.organizaciones o on o.id = i.org_id
  where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
$$;
revoke execute on function public.ver_invitacion(text) from public;
grant execute on function public.ver_invitacion(text) to anon, authenticated;
