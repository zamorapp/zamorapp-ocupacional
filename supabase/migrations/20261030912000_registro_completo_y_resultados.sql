-- Enlace del paciente, parte 2 (Cesar, 06-nov):
-- 1. Antes de descargar, el paciente llena todo lo que la consulta necesita: estado civil, lugar de nacimiento,
--    instrucción, mano dominante, profesión, fecha de ingreso, el motivo con sus palabras (obligatorio), sus
--    antecedentes y hábitos, elegidos del catálogo de la organización. Así pasan tal cual a la consulta nueva.
-- 2. Con los resultados en mano, vuelve al mismo enlace y los sube (PDF o fotos). Entran a su historia
--    (clinico.adjuntos, bucket privado «adjuntos») y avisan al médico. Vale 30 días desde que llenó sus datos y solo
--    después de que el servicio aceptó la solicitud (ya tiene ficha). La descarga de documentos sigue en 7 días.
-- Seguridad de la subida sin sesión: el token (32 bytes, solo su huella sha256) es la llave; la base reserva cada
-- ruta antes de subir (la política de Storage solo deja crear esa ruta exacta, por 30 minutos, sin leer, listar,
-- reemplazar ni borrar); el tipo y el tamaño se toman de lo que guardó Storage, no del navegador; tope de 15
-- archivos por enlace y 30 reservas por día.

-- ===== 1. Datos completos =====
alter table public.solicitudes_paciente drop constraint if exists solicitudes_paciente_datos_check;
alter table public.solicitudes_paciente add constraint solicitudes_paciente_datos_check check (pg_column_size(datos) <= 16384);

-- Catálogo que ve el paciente al llenar: antecedentes y hábitos de la organización (solo nombres, nada de nadie)
-- y a nombre de quién va («Dr. César Zamora» del membrete, si no la organización). Solo con el enlace vigente.
create or replace function public.catalogo_registro_paciente(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.solicitudes_paciente;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return null; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v.id is null or v.anulado_en is not null or v.recibido_en is not null or v.vence < now() then return null; end if;
  return jsonb_build_object(
    'remitente', (select coalesce(nullif(btrim(o.ajustes ->> 'membrete_titular'), ''), o.nombre) from public.organizaciones o where o.id = v.org_id),
    'antecedentes', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'grupo', coalesce(i.grupo, 'personal')) order by i.orden, i.nombre)
                                from public.lista_items i where i.org_id = v.org_id and i.lista = 'antecedente_medico' and i.activo), '[]'::jsonb),
    'habitos', coalesce((select jsonb_agg(jsonb_build_object('clave', coalesce(i.codigo, i.id::text), 'nombre', i.nombre) order by i.orden, i.nombre)
                           from public.lista_items i where i.org_id = v.org_id and i.lista = 'habito' and i.activo), '[]'::jsonb));
end $$;
revoke execute on function public.catalogo_registro_paciente(text) from public;
-- Pública a propósito: el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.catalogo_registro_paciente(text) to anon, authenticated;

-- enviar_solicitud_paciente: los mismos datos de antes y, además, los de la consulta. El motivo ahora es obligatorio.
-- Antecedentes y hábitos solo entran si existen en el catálogo de la organización, ya con el formato de la consulta
-- ({id, nombre, grupo, observacion} y {clave, nombre, valor}).
create or replace function public.enviar_solicitud_paciente(p_token text, p_datos jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.solicitudes_paciente;
  d jsonb := coalesce(p_datos, '{}'::jsonb);
  limpio jsonb := '{}'::jsonb;
  cedula text; nombres text; apellidos text; nac date; tel text; correo text; tipo text; motivo uuid; fecha date; ingreso date;
  texto_motivo text; antecedentes jsonb; habitos jsonb;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return 'Enlace no válido'; end if;
  if jsonb_typeof(d) <> 'object' or pg_column_size(d) > 16384 then return 'Datos no válidos'; end if;
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
  begin ingreso := (d->>'fecha_ingreso')::date; exception when others then ingreso := null; end;
  if ingreso is not null and (tipo <> 'empresa' or ingreso < nac or ingreso > public.hoy_caracas()) then ingreso := null; end if;
  texto_motivo := left(btrim(regexp_replace(coalesce(d->>'motivo', ''), '[ \t]+', ' ', 'g')), 1000);
  if length(texto_motivo) < 3 then return 'Cuéntenos qué lo motiva a consultar.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'grupo', coalesce(i.grupo, 'personal'),
                                               'observacion', left(btrim(coalesce(x.a ->> 'detalle', '')), 200)) order by i.orden, i.nombre), '[]'::jsonb)
    into antecedentes
    from (select distinct on (a ->> 'id') a
            from jsonb_array_elements(case when jsonb_typeof(d->'antecedentes') = 'array' then d->'antecedentes' else '[]'::jsonb end) a
           where jsonb_typeof(a) = 'object' limit 60) x
    join public.lista_items i on i.id::text = x.a ->> 'id' and i.org_id = v.org_id and i.lista = 'antecedente_medico' and i.activo;
  select coalesce(jsonb_agg(jsonb_build_object('clave', coalesce(i.codigo, i.id::text), 'nombre', i.nombre,
                                               'valor', left(btrim(x.h ->> 'valor'), 120)) order by i.orden, i.nombre), '[]'::jsonb)
    into habitos
    from (select distinct on (h ->> 'clave') h
            from jsonb_array_elements(case when jsonb_typeof(d->'habitos') = 'array' then d->'habitos' else '[]'::jsonb end) h
           where jsonb_typeof(h) = 'object' and btrim(coalesce(h ->> 'valor', '')) <> '' limit 30) x
    join public.lista_items i on coalesce(i.codigo, i.id::text) = x.h ->> 'clave' and i.org_id = v.org_id and i.lista = 'habito' and i.activo;

  limpio := jsonb_strip_nulls(jsonb_build_object(
    'cedula', cedula, 'nombres', nombres, 'apellidos', apellidos, 'fecha_nacimiento', nac,
    'sexo', case when d->>'sexo' in ('F', 'M') then d->>'sexo' end,
    'telefono', tel, 'correo', nullif(correo, ''),
    'direccion', nullif(left(btrim(coalesce(d->>'direccion', '')), 300), ''),
    'estado_civil', case when d->>'estado_civil' in ('soltero', 'casado', 'concubino', 'divorciado', 'viudo') then d->>'estado_civil' end,
    'lugar_nacimiento', nullif(left(btrim(coalesce(d->>'lugar_nacimiento', '')), 80), ''),
    'nivel_educativo', case when d->>'nivel_educativo' in ('primaria', 'bachiller', 'tecnico', 'universitario', 'postgrado') then d->>'nivel_educativo' end,
    'lateralidad', case when d->>'lateralidad' in ('diestro', 'zurdo', 'ambidiestro') then d->>'lateralidad' end,
    'profesion', nullif(left(btrim(coalesce(d->>'profesion', '')), 80), ''),
    'tipo', tipo,
    'empresa', case when tipo = 'empresa' then nullif(left(btrim(coalesce(d->>'empresa', '')), 120), '') end,
    'cargo', case when tipo = 'empresa' then nullif(left(btrim(coalesce(d->>'cargo', '')), 120), '') end,
    'fecha_ingreso', ingreso,
    'motivo_id', motivo,
    'motivo', texto_motivo,
    'antecedentes', case when jsonb_array_length(antecedentes) > 0 then antecedentes end,
    'habitos', case when jsonb_array_length(habitos) > 0 then habitos end,
    'fecha', fecha,
    'turno', case when d->>'turno' in ('manana', 'tarde') then d->>'turno' end
  ));
  update public.solicitudes_paciente set datos = limpio, recibido_en = now() where id = v.id;
  perform public.notificar(v.org_id, null, 'servicio', 'Paciente envió sus datos',
                           nombres || ' ' || apellidos || ' llenó el enlace. Revísalo y agenda su cita.', '/atencion#por-revisar');
  return 'ok';
end $$;
revoke execute on function public.enviar_solicitud_paciente(text, jsonb) from public;
grant execute on function public.enviar_solicitud_paciente(text, jsonb) to anon, authenticated;

-- ===== 2. Resultados que sube el paciente =====
-- Reservas de subida: nadie de la app las ve (solo las funciones de abajo y la política de Storage)
create table if not exists public.subidas_paciente (
  ruta text primary key,
  solicitud_id uuid not null references public.solicitudes_paciente (id) on delete cascade,
  creado_en timestamptz not null default public.ahora(),
  confirmado_en timestamptz
);
create index if not exists subidas_paciente_solicitud on public.subidas_paciente (solicitud_id, creado_en);
alter table public.subidas_paciente enable row level security;
revoke all on public.subidas_paciente from anon, authenticated;

-- Enlace válido para subir: llenado, aceptado (ya tiene ficha), no anulado y dentro de 30 días desde que lo llenó
create or replace function public.solicitud_para_resultados(p_token text)
returns public.solicitudes_paciente language plpgsql stable security definer set search_path = public as $$
declare v public.solicitudes_paciente;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return null; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v.id is null or v.anulado_en is not null or v.recibido_en is null or v.recibido_en < now() - interval '30 days'
     or v.resultado is distinct from 'aceptada' or v.trabajador_id is null then
    return null;
  end if;
  return v;
end $$;
revoke execute on function public.solicitud_para_resultados(text) from public, anon, authenticated;

-- Lo que ve el paciente en «Enviar mis resultados»: si puede subir, hasta cuándo y lo que ya envió (solo nombre y
-- fecha de sus propios archivos). puede = false con el motivo en palabras simples.
create or replace function public.resultados_registro_paciente(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.solicitudes_paciente; s public.solicitudes_paciente;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return null; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v.id is null or v.recibido_en is null or v.anulado_en is not null or v.resultado = 'descartada' then return null; end if;
  s := public.solicitud_para_resultados(p_token);
  return jsonb_build_object(
    'remitente', (select coalesce(nullif(btrim(o.ajustes ->> 'membrete_titular'), ''), o.nombre) from public.organizaciones o where o.id = v.org_id),
    'puede', s.id is not null,
    'motivo', case when s.id is not null then null
                   when v.recibido_en < now() - interval '30 days' then 'vencido'
                   else 'por_confirmar' end,
    'hasta', public.fecha_caracas(v.recibido_en + interval '30 days'),
    'archivos', coalesce((select jsonb_agg(jsonb_build_object('nombre', a.nombre, 'subido', u.confirmado_en) order by u.confirmado_en)
                            from public.subidas_paciente u join clinico.adjuntos a on a.ruta = u.ruta
                           where u.solicitud_id = v.id and u.confirmado_en is not null), '[]'::jsonb));
end $$;
revoke execute on function public.resultados_registro_paciente(text) from public;
grant execute on function public.resultados_registro_paciente(text) to anon, authenticated;

-- Reserva la ruta de un archivo: <org>/<trabajador>/paciente-<uuid>.<pdf|jpg|png>. Devuelve la ruta o el problema.
create or replace function public.reservar_resultado_paciente(p_token text, p_tipo_mime text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.solicitudes_paciente; v_ruta text;
begin
  s := public.solicitud_para_resultados(p_token);
  if s.id is null then return jsonb_build_object('error', 'Este enlace ya no recibe resultados. Pida uno nuevo al servicio médico.'); end if;
  if p_tipo_mime is null or p_tipo_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    return jsonb_build_object('error', 'Solo PDF o fotos (JPG o PNG).');
  end if;
  if (select count(*) from public.subidas_paciente where solicitud_id = s.id and confirmado_en is not null) >= 15 then
    return jsonb_build_object('error', 'Ya enviaste 15 archivos con este enlace. Si falta alguno, escríbele al servicio médico.');
  end if;
  if (select count(*) from public.subidas_paciente where solicitud_id = s.id and creado_en > now() - interval '1 day') >= 30 then
    return jsonb_build_object('error', 'Demasiados intentos hoy. Prueba mañana.');
  end if;
  -- Reservas viejas sin subir: se limpian (la política de Storage ya no las acepta)
  delete from public.subidas_paciente where confirmado_en is null and creado_en < now() - interval '1 day';
  v_ruta := s.org_id || '/' || s.trabajador_id || '/paciente-' || gen_random_uuid() || '.'
            || case p_tipo_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' else 'jpg' end;
  insert into public.subidas_paciente (ruta, solicitud_id) values (v_ruta, s.id);
  return jsonb_build_object('ruta', v_ruta);
end $$;
revoke execute on function public.reservar_resultado_paciente(text, text) from public;
grant execute on function public.reservar_resultado_paciente(text, text) to anon, authenticated;

-- Para la política de Storage: esa ruta exacta está reservada, sin subir, desde hace menos de 30 minutos
create or replace function public.subida_paciente_permitida(p_ruta text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subidas_paciente u
                  where u.ruta = p_ruta and u.confirmado_en is null and u.creado_en > now() - interval '30 minutes');
$$;
revoke execute on function public.subida_paciente_permitida(text) from public;
grant execute on function public.subida_paciente_permitida(text) to anon;

-- El paciente solo CREA el archivo reservado: no lee, no lista, no reemplaza, no borra (no hay más políticas para anon)
drop policy if exists adjuntos_paciente_subir on storage.objects;
create policy adjuntos_paciente_subir on storage.objects for insert to anon
  with check (bucket_id = 'adjuntos' and public.subida_paciente_permitida(name));

-- Registra el archivo ya subido en su historia y avisa a los médicos. Una vez por ruta.
create or replace function public.confirmar_resultado_paciente(p_token text, p_ruta text, p_nombre text)
returns text language plpgsql security definer set search_path = public as $$
declare s public.solicitudes_paciente; u public.subidas_paciente; v_obj jsonb; v_mime text; v_tamano bigint; v_nombre text;
  v_paciente text; v_empresa uuid; v_avisar boolean;
begin
  s := public.solicitud_para_resultados(p_token);
  if s.id is null then return 'Este enlace ya no recibe resultados.'; end if;
  select * into u from public.subidas_paciente where ruta = p_ruta and solicitud_id = s.id for update;
  if u.ruta is null then return 'No se encontró el archivo. Vuelve a intentarlo.'; end if;
  if u.confirmado_en is not null then return 'ok'; end if;
  -- Tipo y tamaño: los que guardó Storage, no los que dice el navegador (un HTML declarado «pdf» no entra)
  select to_jsonb(o) into v_obj from storage.objects o where o.bucket_id = 'adjuntos' and o.name = p_ruta;
  if v_obj is null then return 'El archivo no llegó. Revisa tu conexión y vuelve a intentarlo.'; end if;
  v_mime := v_obj -> 'metadata' ->> 'mimetype';
  v_tamano := case when v_obj -> 'metadata' ->> 'size' ~ '^\d{1,9}$' then (v_obj -> 'metadata' ->> 'size')::bigint end;
  if v_mime is null or v_mime not in ('application/pdf', 'image/jpeg', 'image/png') or v_tamano is null or v_tamano not between 1 and 10485760
     or p_ruta not like ('%.' || (case v_mime when 'application/pdf' then 'pdf' when 'image/png' then 'png' else 'jpg' end)) then
    return 'Solo PDF o fotos de hasta 10 MB.';
  end if;
  v_nombre := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '[\r\n\t]+', ' ', 'g')), ''), 'Resultado'), 120);
  select nombres || ' ' || apellidos, empresa_id into v_paciente, v_empresa from public.trabajadores where id = s.trabajador_id;
  -- Un solo aviso por tanda: si mandó otro archivo hace menos de 10 minutos, ya se avisó
  v_avisar := not exists (select 1 from public.subidas_paciente where solicitud_id = s.id and confirmado_en > now() - interval '10 minutes');
  insert into clinico.adjuntos (org_id, trabajador_id, consulta_id, nombre, ruta, tipo_mime, tamano, descripcion, subido_por)
  values (s.org_id, s.trabajador_id, null, v_nombre, p_ruta, v_mime, v_tamano, 'Enviado por el paciente con su enlace', null);
  update public.subidas_paciente set confirmado_en = now() where ruta = p_ruta;
  if v_avisar then
    -- Solo al personal clínico que ve esa empresa (nunca a la empresa ni a recepción: son resultados de salud)
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    select s.org_id, m.usuario_id, v_empresa, 'Resultados enviados por el paciente', coalesce(v_paciente, 'Un paciente') || ' subió sus resultados.',
           '/pacientes/' || s.trabajador_id
      from public.miembros m
     where m.org_id = s.org_id and m.activo and m.rol in ('administrador', 'gerente_medico', 'medico')
       and (m.empresas_permitidas is null or v_empresa = any (m.empresas_permitidas));
  end if;
  return 'ok';
end $$;
revoke execute on function public.confirmar_resultado_paciente(text, text, text) from public;
grant execute on function public.confirmar_resultado_paciente(text, text, text) to anon, authenticated;
