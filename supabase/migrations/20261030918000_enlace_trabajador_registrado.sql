-- Enlace del paciente: trabajadores YA registrados y seguimiento del enlace (Cesar, 06-nov-2026).
-- «También quiero enviar enlaces a los clientes que ya tengo registrados… no necesariamente tiene que colocar algún
-- dato, salvo que le falte… Y un apartado donde vea los enlaces enviados: que ya fue abierto, leído y descargado».
-- 1. Se crea desde su ficha («Enviar enlace»): para_trabajador. Si la ficha tiene todo, el trabajador no escribe nada:
--    toca «Ver mis documentos» y le salen llenos con los datos de su ficha; luego puede subir resultados (30 días).
--    Si le falta algo (cédula, nacimiento, sexo, celular, dirección) se le pide SOLO eso y se completa la ficha
--    (solo lo vacío; nunca se pisa un dato que ya estaba). No pasa por «Por revisar».
--    Llave: si la ficha tiene cédula, antes de ver documentos o subir resultados escribe los 4 últimos números
--    (5 intentos por enlace). Así un WhatsApp reenviado o a un número equivocado no abre la historia de nadie.
--    La cédula de la ficha nunca se cambia por el enlace; solo se pide si está vacía.
-- 2. Seguimiento: abierto_en (la página lo marca con el navegador del paciente, no la vista previa de WhatsApp) y aviso
--    al servicio la primera vez que lo abre y la primera vez que descarga.
-- Los parches por texto quitan \r de ambos lados (producción y este archivo pegado en el editor tienen \r\n).

alter table public.solicitudes_paciente add column if not exists para_trabajador uuid;
alter table public.solicitudes_paciente add column if not exists abierto_en timestamptz;
alter table public.solicitudes_paciente add column if not exists intentos_cedula smallint not null default 0;
comment on column public.solicitudes_paciente.para_trabajador is
  'Trabajador ya registrado al que va el enlace (se crea desde su ficha). Sin FK: en el escritorio la ficha nace en la PC.';
comment on column public.solicitudes_paciente.abierto_en is 'Primera vez que el paciente abrió el enlace en su teléfono.';
comment on column public.solicitudes_paciente.intentos_cedula is 'Intentos fallidos de los 4 últimos números de la cédula (máximo 5).';

-- Los 4 últimos números de la cédula de la ficha (la llave del enlace); null si la ficha no tiene cédula
create or replace function public.ultimos_cedula(t public.trabajadores)
returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(t.cedula, ''), '\D', '', 'g')) >= 4
              then right(regexp_replace(t.cedula, '\D', '', 'g'), 4) end
$$;
revoke execute on function public.ultimos_cedula(public.trabajadores) from public, anon, authenticated;

-- ===== 1. Al crear: el trabajador es de la organización =====
create or replace function public.validar_para_trabajador()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.trabajadores;
begin
  if new.para_trabajador is not null then
    select * into t from public.trabajadores x where x.id = new.para_trabajador and x.org_id = new.org_id;
    if t.id is null then
      raise exception 'Ese trabajador todavía no está en la nube: espera la sincronía e inténtalo de nuevo';
    end if;
    -- Cédula con texto pero sin 4 números: no sirve de llave y el enlace no la cambia
    if coalesce(btrim(t.cedula), '') <> '' and public.ultimos_cedula(t) is null then
      raise exception 'La cédula de su ficha no es válida: corrígela en la ficha y envía el enlace de nuevo';
    end if;
  end if;
  new.abierto_en := null;
  new.intentos_cedula := 0;
  return new;
end $$;
revoke execute on function public.validar_para_trabajador() from public, anon, authenticated;
drop trigger if exists validar_para_trabajador on public.solicitudes_paciente;
create trigger validar_para_trabajador before insert on public.solicitudes_paciente
  for each row execute function public.validar_para_trabajador();
-- Después de crearlo no se cambian (la app no tiene permiso de update sobre estas columnas)

-- ===== 2. Qué le falta a la ficha (solo los nombres de los campos, nunca los valores) =====
create or replace function public.faltan_ficha_registro(t public.trabajadores)
returns text[] language sql immutable as $$
  select array_remove(array[
    case when coalesce(btrim(t.cedula), '') = '' then 'cedula' end,
    case when t.fecha_nacimiento is null then 'fecha_nacimiento' end,
    case when t.sexo is null then 'sexo' end,
    case when coalesce(btrim(t.telefono), '') = '' then 'telefono' end,
    case when coalesce(btrim(t.direccion), '') = '' then 'direccion' end], null)
$$;
revoke execute on function public.faltan_ficha_registro(public.trabajadores) from public, anon, authenticated;

-- La página sabe si es registrado y qué pedirle
do $$
declare
  v_def text := replace(pg_get_functiondef('public.catalogo_registro_paciente(text)'::regprocedure), chr(13), '');
  v_viejo text := '''remitente'', (select coalesce(nullif(btrim(o.ajustes ->> ''membrete_titular''), ''''), o.nombre) from public.organizaciones o where o.id = v.org_id),';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'catalogo_registro_paciente cambió: revisar 20261030918000 antes de aplicarla';
  end if;
  execute replace(replace(v_def, v_viejo, '''registrado'', v.para_trabajador is not null,
    ''verificar'', (select public.ultimos_cedula(t) is not null from public.trabajadores t where t.id = v.para_trabajador and t.org_id = v.org_id),
    ''faltan'', (select to_jsonb(public.faltan_ficha_registro(t)) from public.trabajadores t where t.id = v.para_trabajador and t.org_id = v.org_id),
    ' || v_viejo), chr(13), '');
end $$;

-- ===== 3. Envío del trabajador registrado =====
create or replace function public.enviar_registro_trabajador(v public.solicitudes_paciente, d jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  t public.trabajadores; e public.empresas; v_cargo text; faltan text[]; v_llave text;
  v_cedula text; nac date; tel text; dir text; v_sexo text; cambios jsonb := '{}'::jsonb; completo text[] := '{}';
begin
  select * into t from public.trabajadores where id = v.para_trabajador and org_id = v.org_id for update;
  if t.id is null then return 'No encontramos tu ficha. Escríbele al servicio médico para que te envíe un enlace nuevo.'; end if;
  -- Llave: los 4 últimos números de su cédula (5 intentos por enlace)
  v_llave := public.ultimos_cedula(t);
  if v_llave is not null then
    if v.intentos_cedula >= 5 then
      return 'Hiciste demasiados intentos. Escríbele al servicio médico para que te envíe un enlace nuevo.';
    end if;
    if regexp_replace(coalesce(d->>'ultimos4', ''), '\D', '', 'g') <> v_llave then
      update public.solicitudes_paciente set intentos_cedula = intentos_cedula + 1 where id = v.id;
      if v.intentos_cedula + 1 >= 5 then
        return 'Hiciste demasiados intentos. Escríbele al servicio médico para que te envíe un enlace nuevo.';
      end if;
      return 'Esos números no coinciden con tu cédula. Te quedan ' || (5 - v.intentos_cedula - 1) || ' intentos.';
    end if;
  end if;
  faltan := public.faltan_ficha_registro(t);
  -- Solo lo que falta; se valida igual que en el formulario completo
  if 'cedula' = any (faltan) then
    v_cedula := upper(regexp_replace(coalesce(d->>'cedula', ''), '[.\s-]', '', 'g'));
    if v_cedula !~ '^[VEP]?[0-9]{5,9}$' then return 'Revisa la cédula (ejemplo: V-12345678).'; end if;
    if v_cedula ~ '^[0-9]' then v_cedula := 'V' || v_cedula; end if;
    v_cedula := left(v_cedula, 1) || '-' || substr(v_cedula, 2);
    if exists (select 1 from public.trabajadores x where x.org_id = t.org_id and x.id <> t.id
                and regexp_replace(x.cedula, '\D', '', 'g') = regexp_replace(v_cedula, '\D', '', 'g')) then
      return 'Esa cédula ya está en otra ficha. Escríbele al servicio médico.';
    end if;
    cambios := cambios || jsonb_build_object('cedula', v_cedula); completo := array_append(completo, 'cédula');
  end if;
  if 'fecha_nacimiento' = any (faltan) then
    begin nac := (d->>'fecha_nacimiento')::date; exception when others then nac := null; end;
    if nac is null or nac < date '1900-01-01' or nac > public.hoy_caracas() then return 'Revisa tu fecha de nacimiento.'; end if;
    cambios := cambios || jsonb_build_object('fecha_nacimiento', nac); completo := array_append(completo, 'fecha de nacimiento');
  end if;
  if 'sexo' = any (faltan) then
    v_sexo := d->>'sexo';
    if v_sexo is null or v_sexo not in ('F', 'M') then return 'Indica tu sexo.'; end if;
    cambios := cambios || jsonb_build_object('sexo', v_sexo); completo := array_append(completo, 'sexo');
  end if;
  if 'telefono' = any (faltan) then
    tel := regexp_replace(coalesce(d->>'telefono', ''), '\D', '', 'g');
    if tel ~ '^0' then tel := '58' || substr(tel, 2); elsif length(tel) = 10 and tel ~ '^4' then tel := '58' || tel; end if;
    if tel !~ '^[1-9][0-9]{9,14}$' then return 'Revisa tu número de teléfono (ejemplo: 0414-1234567).'; end if;
    cambios := cambios || jsonb_build_object('telefono', tel); completo := array_append(completo, 'celular');
  end if;
  if 'direccion' = any (faltan) then
    dir := left(btrim(regexp_replace(coalesce(d->>'direccion', ''), '\s+', ' ', 'g')), 300);
    if length(dir) < 5 then return 'Escribe tu dirección.'; end if;
    cambios := cambios || jsonb_build_object('direccion', dir); completo := array_append(completo, 'dirección');
  end if;

  -- Completa la ficha: solo los campos que estaban vacíos (lo que ya tenía no se toca)
  if cambios <> '{}'::jsonb then
    update public.trabajadores set
      cedula = coalesce(cambios->>'cedula', cedula),
      fecha_nacimiento = coalesce((cambios->>'fecha_nacimiento')::date, fecha_nacimiento),
      sexo = coalesce((cambios->>'sexo')::public.sexo, sexo),
      telefono = coalesce(cambios->>'telefono', telefono),
      direccion = coalesce(cambios->>'direccion', direccion)
     where id = t.id;
    select * into t from public.trabajadores where id = t.id;
  end if;
  select * into e from public.empresas where id = t.empresa_id;
  select p.nombre into v_cargo from public.puestos p where p.id = t.puesto_id;

  -- Ya tiene ficha: queda aceptado de una vez (sin «Por revisar») y puede subir resultados
  update public.solicitudes_paciente set recibido_en = now(), resultado = 'aceptada', trabajador_id = t.id, revisado_en = now(),
    datos = jsonb_strip_nulls(jsonb_build_object(
      'registrado', true,
      'cedula', t.cedula, 'nombres', t.nombres, 'apellidos', t.apellidos, 'fecha_nacimiento', t.fecha_nacimiento,
      'sexo', t.sexo, 'telefono', t.telefono,
      'tipo', case when coalesce(e.es_particular, false) then 'particular' else 'empresa' end,
      'empresa', case when not coalesce(e.es_particular, false) then e.razon_social end,
      'cargo', case when not coalesce(e.es_particular, false) then v_cargo end))
   where id = v.id;
  if cardinality(completo) > 0 then
    perform public.notificar(v.org_id, null, 'servicio', 'Ficha completada por el enlace',
                             t.nombres || ' ' || t.apellidos || ' completó en su ficha: ' || array_to_string(completo, ', ') || '.',
                             '/pacientes/' || t.id);
  end if;
  return 'ok';
end $$;
revoke execute on function public.enviar_registro_trabajador(public.solicitudes_paciente, jsonb) from public, anon, authenticated;

-- El formulario público desvía al envío corto cuando el enlace es para un trabajador registrado
do $$
declare
  v_def text := replace(pg_get_functiondef('public.enviar_solicitud_paciente(text, jsonb)'::regprocedure), chr(13), '');
  v_viejo text := 'if v.vence < now() then return ''Este enlace venció. Pida uno nuevo al servicio médico.''; end if;';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'enviar_solicitud_paciente cambió: revisar 20261030918000 antes de aplicarla';
  end if;
  execute replace(replace(v_def, v_viejo, v_viejo || '
  if v.para_trabajador is not null then return public.enviar_registro_trabajador(v, d); end if;'), chr(13), '');
end $$;

-- ===== 4. Seguimiento: abierto y descargado =====
-- La página lo llama desde el navegador del paciente (la vista previa de WhatsApp no ejecuta código)
create or replace function public.marcar_abierto_registro(p_token text)
returns void language sql volatile security definer set search_path = public as $$
  update public.solicitudes_paciente set abierto_en = public.ahora()
   where p_token is not null and length(p_token) between 40 and 60
     and token_hash = sha256(convert_to(p_token, 'UTF8')) and abierto_en is null and anulado_en is null;
$$;
revoke execute on function public.marcar_abierto_registro(text) from public;
-- Pública a propósito: el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.marcar_abierto_registro(text) to anon, authenticated;

-- Aviso al servicio la primera vez que lo abre y la primera vez que descarga (una sola vez cada uno)
create or replace function public.avisar_enlace_paciente()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quien text := coalesce(nullif(btrim(coalesce(new.datos ->> 'nombres', '') || ' ' || coalesce(new.datos ->> 'apellidos', '')), ''), new.nombre, 'El paciente');
begin
  if old.abierto_en is null and new.abierto_en is not null then
    perform public.notificar(new.org_id, null, 'servicio', 'Enlace abierto', v_quien || ' abrió el enlace que le enviaste.', '/atencion#enlaces-enviados');
  end if;
  if old.descarga_hasta is null and new.descarga_hasta is not null then
    perform public.notificar(new.org_id, null, 'servicio', 'Documentos descargados', v_quien || ' descargó sus documentos.', '/atencion#enlaces-enviados');
  end if;
  return new;
end $$;
revoke execute on function public.avisar_enlace_paciente() from public, anon, authenticated;
drop trigger if exists avisar_enlace_paciente on public.solicitudes_paciente;
create trigger avisar_enlace_paciente after update of abierto_en, descarga_hasta on public.solicitudes_paciente
  for each row execute function public.avisar_enlace_paciente();
