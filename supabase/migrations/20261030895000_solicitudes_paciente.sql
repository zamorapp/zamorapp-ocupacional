-- zamorApp Ocupacional · Enlace para que el paciente llene sus datos (pedido de Cesar, 05-nov-2026)
-- Cesar le manda por WhatsApp (desde la PC o el celular) un enlace /registro/<token> a un paciente. El paciente escribe
-- sus datos y lo que necesita; queda «por revisar» en Atención médica. Nada entra a la ficha ni a la agenda hasta que el
-- servicio lo revisa, elige la empresa (o «Particular») y lo acepta.
--   · token aleatorio de 32 bytes guardado como sha256; vence a los 7 días; sirve UNA sola vez; se puede anular;
--   · el formulario público solo puede llenar los datos (lista cerrada de campos, cada uno con su límite) de un enlace
--     vigente; no ve nada del servicio salvo su nombre, la empresa sugerida y la lista de motivos;
--   · solo el personal del servicio sin límite de empresas (administrador, gerencia médica, médicos, enfermería y
--     recepción) crea, lee, anula y revisa. RR. HH. y la empresa nunca lo ven;
--   · los datos de un enlace descartado se borran a los 30 días; el aceptado guarda a quién se registró y qué cita se dio.
-- Tabla solo de la nube (no entra en sync.tablas): el escritorio la lee y escribe en la nube; sin internet no se envía
-- el enlace ni se ven las respuestas (aceptar sí crea la ficha y la cita en la PC, que suben con la sincronía).

create table if not exists public.solicitudes_paciente (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  token_hash bytea not null unique check (length(token_hash) = 32),
  nombre text check (length(nombre) <= 120),            -- a quién se le mandó (para el saludo y la lista)
  telefono text check (telefono ~ '^[0-9]{10,15}$'),     -- a qué número; vacío = se eligió el contacto en WhatsApp
  empresa_id uuid references public.empresas (id) on delete set null, -- empresa sugerida por el servicio (opcional)
  vence timestamptz not null default public.ahora() + interval '7 days',
  anulado_en timestamptz,
  recibido_en timestamptz,
  datos jsonb not null default '{}'::jsonb check (pg_column_size(datos) <= 8192),
  resultado text check (resultado in ('aceptada', 'descartada')),
  revisado_en timestamptz,
  revisado_por uuid references auth.users (id),
  -- Sin llave foránea a propósito: en el escritorio la ficha y la cita nacen en la PC y suben después
  trabajador_id uuid,
  cita_id uuid,
  creado_por uuid not null references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default public.ahora()
);
create index if not exists solicitudes_paciente_org on public.solicitudes_paciente (org_id, creado_en desc);
create index if not exists solicitudes_paciente_por_revisar on public.solicitudes_paciente (org_id, recibido_en)
  where recibido_en is not null and resultado is null;

alter table public.solicitudes_paciente enable row level security;
drop policy if exists sp_leer on public.solicitudes_paciente;
drop policy if exists sp_crear on public.solicitudes_paciente;
drop policy if exists sp_cambiar on public.solicitudes_paciente;
create policy sp_leer on public.solicitudes_paciente for select
  using (org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))::uuid[]));
create policy sp_crear on public.solicitudes_paciente for insert
  with check (org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))::uuid[])
              and creado_por = auth.uid());
create policy sp_cambiar on public.solicitudes_paciente for update
  using (org_id = any ((select public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))::uuid[]))
  with check (true);

revoke all on public.solicitudes_paciente from anon;
revoke delete, truncate, update on public.solicitudes_paciente from authenticated;
grant select, insert on public.solicitudes_paciente to authenticated;
grant update (anulado_en, resultado, trabajador_id, cita_id) on public.solicitudes_paciente to authenticated;

-- Reglas que la RLS sola no cubre. Al crear: limpio (sin datos ni revisión), 7 días como máximo, la empresa sugerida
-- de la misma organización. Después el servicio solo puede: anular un enlace que aún no se llenó; aceptar o descartar
-- uno llenado (una vez); o deshacer un descarte. Los datos que escribió el paciente nunca los cambia el servicio.
-- Sin SECURITY DEFINER a propósito: así current_user dice quién escribe (las funciones públicas de abajo corren como
-- dueño y pasan; una sesión de la app es 'authenticated' y queda sujeta a estas reglas).
create or replace function public.validar_solicitud_paciente()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.creado_por := auth.uid(); end if;
    new.creado_en := now();
    new.anulado_en := null; new.recibido_en := null; new.datos := '{}'::jsonb;
    new.resultado := null; new.revisado_en := null; new.revisado_por := null; new.trabajador_id := null; new.cita_id := null;
    if new.vence > now() + interval '7 days' or new.vence < now() then new.vence := now() + interval '7 days'; end if;
    if new.empresa_id is not null and not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.org_id = new.org_id) then
      raise exception 'La empresa no es de esta organización';
    end if;
    return new;
  end if;
  -- El formulario público (enviar_solicitud_paciente) y la limpieza corren como dueño
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (new.id, new.org_id, new.token_hash, new.nombre, new.telefono, new.empresa_id, new.vence, new.recibido_en, new.datos, new.creado_por, new.creado_en)
     is distinct from (old.id, old.org_id, old.token_hash, old.nombre, old.telefono, old.empresa_id, old.vence, old.recibido_en, old.datos, old.creado_por, old.creado_en) then
    raise exception 'Los datos que envió el paciente no se cambian';
  end if;
  if new.anulado_en is distinct from old.anulado_en then
    if old.anulado_en is not null or old.recibido_en is not null or new.resultado is distinct from old.resultado then
      raise exception 'Solo se anula un enlace que el paciente todavía no llenó';
    end if;
    new.anulado_en := now();
    return new;
  end if;
  if new.resultado is not distinct from old.resultado then
    if (new.trabajador_id, new.cita_id) is distinct from (old.trabajador_id, old.cita_id) then raise exception 'Nada que cambiar'; end if;
    return new;
  end if;
  if old.recibido_en is null then raise exception 'El paciente todavía no llenó sus datos'; end if;
  if old.resultado = 'aceptada' then raise exception 'Esta solicitud ya se aceptó'; end if;
  if new.resultado is null then
    -- Deshacer un descarte: vuelve a «por revisar»
    if old.resultado <> 'descartada' then raise exception 'Nada que deshacer'; end if;
    new.revisado_en := null; new.revisado_por := null; new.trabajador_id := null; new.cita_id := null;
    return new;
  end if;
  if new.resultado = 'aceptada' and (new.trabajador_id is null or new.cita_id is null) then
    raise exception 'Al aceptar se indica la ficha y la cita';
  end if;
  if new.resultado = 'descartada' then new.trabajador_id := null; new.cita_id := null; end if;
  new.revisado_en := now();
  new.revisado_por := auth.uid();
  return new;
end $$;
drop trigger if exists validar_solicitud_paciente on public.solicitudes_paciente;
create trigger validar_solicitud_paciente before insert or update on public.solicitudes_paciente
  for each row execute function public.validar_solicitud_paciente();
drop trigger if exists bit_solicitudes_paciente on public.solicitudes_paciente;
create trigger bit_solicitudes_paciente after insert or update on public.solicitudes_paciente
  for each row execute function public.registrar_bitacora();

-- Lo que ve el paciente al abrir el enlace (sin sesión). estado: vigente | usado | vencido | anulado; sin fila = no existe.
-- De paso borra los datos de los descartados hace más de 30 días.
create or replace function public.ver_solicitud_paciente(p_token text)
returns table (estado text, servicio text, telefono_servicio text, nombre text, empresa text, motivos jsonb)
language plpgsql security definer set search_path = public as $$
declare v public.solicitudes_paciente;
begin
  update public.solicitudes_paciente set datos = '{}'::jsonb
   where resultado = 'descartada' and revisado_en < now() - interval '30 days' and datos <> '{}'::jsonb;
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v.id is null then return; end if;
  return query
    select case when v.anulado_en is not null then 'anulado' when v.recibido_en is not null then 'usado'
                when v.vence < now() then 'vencido' else 'vigente' end,
           o.nombre, o.telefono,
           case when v.recibido_en is null and v.anulado_en is null and v.vence >= now() then v.nombre end,
           (select coalesce(e.nombre_comercial, e.razon_social) from public.empresas e where e.id = v.empresa_id),
           case when v.recibido_en is null and v.anulado_en is null and v.vence >= now() then
             coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre) order by i.orden, i.nombre)
                         from public.lista_items i where i.org_id = v.org_id and i.lista = 'motivo_consulta' and i.activo), '[]'::jsonb)
           end
      from public.organizaciones o where o.id = v.org_id;
end $$;
revoke execute on function public.ver_solicitud_paciente(text) from public;
-- Pública a propósito (como ver_invitacion): el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.ver_solicitud_paciente(text) to anon, authenticated;

-- El paciente envía sus datos (sin sesión). Una sola vez por enlace. Solo se guardan los campos conocidos, limpios y
-- con su límite; lo demás se ignora. Devuelve 'ok' o el problema en palabras simples. Avisa al servicio (campana y
-- celular).
create or replace function public.enviar_solicitud_paciente(p_token text, p_datos jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.solicitudes_paciente;
  d jsonb := coalesce(p_datos, '{}'::jsonb);
  t text;
  limpio jsonb := '{}'::jsonb;
  cedula text; nombres text; apellidos text; nac date; tel text; correo text; tipo text; motivo uuid; fecha date;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return 'Enlace no válido'; end if;
  if jsonb_typeof(d) <> 'object' or pg_column_size(d) > 8192 then return 'Datos no válidos'; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8')) for update;
  if v.id is null then return 'Enlace no válido'; end if;
  if v.anulado_en is not null then return 'Este enlace fue anulado. Pida uno nuevo al servicio médico.'; end if;
  if v.recibido_en is not null then return 'Sus datos ya se enviaron con este enlace.'; end if;
  if v.vence < now() then return 'Este enlace venció. Pida uno nuevo al servicio médico.'; end if;

  cedula := upper(regexp_replace(coalesce(d->>'cedula', ''), '[.\s-]', '', 'g'));
  if cedula !~ '^[VEP]?[0-9]{5,9}$' then return 'Revise la cédula (ejemplo: V-12345678).'; end if;
  if cedula ~ '^[0-9]' then cedula := 'V' || cedula; end if;
  cedula := left(cedula, 1) || '-' || substr(cedula, 2);
  nombres := left(btrim(regexp_replace(coalesce(d->>'nombres', ''), '\s+', ' ', 'g')), 80);
  apellidos := left(btrim(regexp_replace(coalesce(d->>'apellidos', ''), '\s+', ' ', 'g')), 80);
  if length(nombres) < 2 or length(apellidos) < 2 then return 'Escriba sus nombres y apellidos.'; end if;
  begin nac := (d->>'fecha_nacimiento')::date; exception when others then nac := null; end;
  if nac is null or nac < date '1900-01-01' or nac > public.hoy_caracas() then return 'Revise su fecha de nacimiento.'; end if;
  tel := regexp_replace(coalesce(d->>'telefono', ''), '\D', '', 'g');
  if tel ~ '^0' then tel := '58' || substr(tel, 2); elsif length(tel) = 10 and tel ~ '^4' then tel := '58' || tel; end if;
  if tel !~ '^[1-9][0-9]{9,14}$' then return 'Revise su número de teléfono (ejemplo: 0414-1234567).'; end if;
  correo := lower(btrim(coalesce(d->>'correo', '')));
  if correo <> '' and (length(correo) > 120 or correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then return 'Revise su correo.'; end if;
  tipo := coalesce(d->>'tipo', 'particular');
  if tipo not in ('particular', 'empresa') then tipo := 'particular'; end if;
  begin motivo := (d->>'motivo_id')::uuid; exception when others then motivo := null; end;
  if motivo is not null and not exists (select 1 from public.lista_items i where i.id = motivo and i.org_id = v.org_id and i.lista = 'motivo_consulta' and i.activo) then
    motivo := null;
  end if;
  begin fecha := (d->>'fecha')::date; exception when others then fecha := null; end;
  if fecha is not null and (fecha < public.hoy_caracas() or fecha > public.hoy_caracas() + 90) then fecha := null; end if;

  limpio := jsonb_strip_nulls(jsonb_build_object(
    'cedula', cedula, 'nombres', nombres, 'apellidos', apellidos, 'fecha_nacimiento', nac,
    'sexo', case when d->>'sexo' in ('F', 'M') then d->>'sexo' end,
    'telefono', tel, 'correo', nullif(correo, ''),
    'direccion', nullif(left(btrim(coalesce(d->>'direccion', '')), 300), ''),
    'tipo', tipo,
    'empresa', case when tipo = 'empresa' then nullif(left(btrim(coalesce(d->>'empresa', '')), 120), '') end,
    'cargo', case when tipo = 'empresa' then nullif(left(btrim(coalesce(d->>'cargo', '')), 120), '') end,
    'motivo_id', motivo,
    'motivo', nullif(left(btrim(coalesce(d->>'motivo', '')), 500), ''),
    'fecha', fecha,
    'turno', case when d->>'turno' in ('manana', 'tarde') then d->>'turno' end
  ));
  update public.solicitudes_paciente set datos = limpio, recibido_en = now() where id = v.id;
  perform public.notificar(v.org_id, null, 'servicio', 'Paciente envió sus datos',
                           nombres || ' ' || apellidos || ' llenó el enlace. Revísalo y agenda su cita.', '/atencion#por-revisar');
  return 'ok';
end $$;
revoke execute on function public.enviar_solicitud_paciente(text, jsonb) from public;
-- Pública a propósito: el token de 32 bytes es la llave y sirve una sola vez; está en la línea base del guardián
grant execute on function public.enviar_solicitud_paciente(text, jsonb) to anon, authenticated;
