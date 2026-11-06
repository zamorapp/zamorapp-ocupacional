-- zamorApp Ocupacional · Documentos que el paciente descarga al terminar su registro (pedido de Cesar, 06-nov-2026)
-- Al crear el enlace /registro/<token>, el servicio marca qué le sale al paciente cuando termine de llenar sus datos:
-- la orden de exámenes (con un perfil de paraclínicos y, si quiere, el tipo de examen), el control de tensión arterial,
-- el plan de alimentación y las recomendaciones de bienestar. Al enviar sus datos, el paciente ve «Puede descargar la
-- información que le envía…» y cada documento sale lleno con su nombre, su cédula y su empresa.
--   · Cesar decidió (06-nov) que la orden salga con su firma y sello sin consulta previa: solo si quien crea el enlace es
--     médico (o administrador/gerente médico con acceso clínico); recepción y enfermería crean enlaces sin firma.
--     Analizar (06-nov): la RPC anónima nunca entrega las imágenes de firma y sello ni el correo del médico; la hoja sale
--     con su nombre, MPPS y «Firmado digitalmente · folio · válida solo para <cédula>».
--   · Lo elegido se guarda al crear el enlace y no se cambia después (como los datos del paciente).
--   · El paciente descarga durante 7 días desde que envió sus datos, salvo que el servicio descarte la solicitud.
--   · documentos_registro_paciente devuelve solo lo que pintan esas hojas: sus propios datos, el membrete del servicio,
--     la empresa sugerida, nombre y registros del médico (si se pidió firma) y lo elegido. Nada de la historia clínica.

alter table public.solicitudes_paciente
  add column if not exists documentos jsonb not null default '{}'::jsonb
    check (jsonb_typeof(documentos) = 'object' and pg_column_size(documentos) <= 8192);

-- Limpia lo elegido: solo claves conocidas, con su forma y su límite. Lo desconocido se descarta.
create or replace function public.limpiar_documentos_registro(p jsonb, p_org uuid)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  salida jsonb := '{}'::jsonb;
  o jsonb; ex jsonb := '[]'::jsonb; e jsonb; m uuid; n int := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  o := p->'orden';
  if jsonb_typeof(o) = 'object' and jsonb_typeof(o->'examenes') = 'array' then
    for e in select * from jsonb_array_elements(o->'examenes') loop
      exit when n >= 60;
      if jsonb_typeof(e) = 'object' and length(btrim(coalesce(e->>'nombre', ''))) between 1 and 120 then
        ex := ex || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'nombre', btrim(e->>'nombre'), 'grupo', nullif(left(btrim(coalesce(e->>'grupo', '')), 80), ''))));
        n := n + 1;
      end if;
    end loop;
    begin m := (o->>'motivo_id')::uuid; exception when others then m := null; end;
    if m is not null and not exists (select 1 from public.lista_items i where i.id = m and i.org_id = p_org and i.lista = 'motivo_consulta') then m := null; end if;
    if jsonb_array_length(ex) > 0 then
      salida := salida || jsonb_build_object('orden', jsonb_strip_nulls(jsonb_build_object(
        'examenes', ex, 'motivo_id', m, 'perfil', nullif(left(btrim(coalesce(o->>'perfil', '')), 120), ''))));
    end if;
  end if;
  if jsonb_typeof(p->'control_ta') = 'object' then
    salida := salida || jsonb_build_object('control_ta', jsonb_build_object('dias', case when p->'control_ta'->>'dias' = '14' then 14 else 7 end));
  end if;
  if jsonb_typeof(p->'dieta') = 'object' then
    salida := salida || jsonb_build_object('dieta', jsonb_build_object(
      'dieta', case when coalesce(p->'dieta'->>'dieta', '') ~ '^[a-z_-]{1,30}$' then p->'dieta'->>'dieta' else 'general' end,
      'plan', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p->'dieta'->'plan') = 'array' then p->'dieta'->'plan' else '[]' end) x
                          where x ~ '^[a-z_-]{1,30}$' limit 10) t), '[]'::jsonb)));
  end if;
  if jsonb_typeof(p->'bienestar') = 'object' then
    salida := salida || jsonb_build_object('bienestar', jsonb_build_object(
      'tema', coalesce((select jsonb_agg(x) from (select x from jsonb_array_elements_text(case when jsonb_typeof(p->'bienestar'->'tema') = 'array' then p->'bienestar'->'tema' else '[]' end) x
                          where x ~ '^[a-z_-]{1,30}$' limit 12) t), '[]'::jsonb)));
  end if;
  if salida <> '{}'::jsonb and p->>'firma' = 'true' then salida := salida || '{"firma": true}'::jsonb; end if;
  return salida;
end $$;
revoke execute on function public.limpiar_documentos_registro(jsonb, uuid) from public, anon;
grant execute on function public.limpiar_documentos_registro(jsonb, uuid) to authenticated;

-- Mismas reglas de 20261030895000 más «documentos»: se limpia al crear (la firma solo de un médico) y no se cambia.
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
    new.documentos := public.limpiar_documentos_registro(new.documentos, new.org_id);
    if new.documentos ? 'firma'
       and not new.org_id = any (public.orgs_con(p_roles => '{administrador,gerente_medico,medico}', p_clinico => true)) then
      raise exception 'Solo un médico envía documentos con su firma y sello';
    end if;
    return new;
  end if;
  -- El formulario público (enviar_solicitud_paciente) y la limpieza corren como dueño
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if (new.id, new.org_id, new.token_hash, new.nombre, new.telefono, new.empresa_id, new.vence, new.recibido_en, new.datos, new.creado_por, new.creado_en, new.documentos)
     is distinct from (old.id, old.org_id, old.token_hash, old.nombre, old.telefono, old.empresa_id, old.vence, old.recibido_en, old.datos, old.creado_por, old.creado_en, old.documentos) then
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

-- Lo que pintan las hojas que descarga el paciente (sin sesión). null = no hay nada que descargar (enlace sin llenar,
-- anulado, descartado, sin documentos o pasados 7 días desde que envió sus datos).
create or replace function public.documentos_registro_paciente(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.solicitudes_paciente; firma boolean;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return null; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v.id is null or v.recibido_en is null or v.anulado_en is not null or v.resultado = 'descartada'
     or v.documentos = '{}'::jsonb or v.recibido_en < now() - interval '7 days' then
    return null;
  end if;
  firma := coalesce((v.documentos->>'firma')::boolean, false);
  return (
    select jsonb_build_object(
      'folio', v.id,
      'recibido', v.recibido_en,
      'documentos', v.documentos - 'firma',
      'persona', jsonb_strip_nulls(jsonb_build_object(
        'cedula', v.datos->>'cedula', 'nombres', v.datos->>'nombres', 'apellidos', v.datos->>'apellidos',
        'fecha_nacimiento', v.datos->>'fecha_nacimiento', 'sexo', v.datos->>'sexo',
        'empresa', v.datos->>'empresa', 'cargo', v.datos->>'cargo', 'tipo', v.datos->>'tipo')),
      'org', jsonb_build_object('nombre', o.nombre, 'rif', o.rif, 'direccion', o.direccion, 'telefono', o.telefono, 'correo', o.correo, 'logo', o.logo,
        -- Solo los ajustes que usan estas hojas (membrete, notas de la orden y firma)
        'ajustes', coalesce((select jsonb_object_agg(k, a) from jsonb_each(coalesce(o.ajustes, '{}'::jsonb)) as j(k, a)
                              where k in ('membrete_lema', 'membrete_titular', 'membrete_credenciales', 'orden_nota', 'orden_nota_preempleo',
                                          'certificacion_trabajador', 'firma_sello_separados')), '{}'::jsonb)),
      'empresa', (select jsonb_build_object('razon_social', e.razon_social, 'rif', e.rif, 'logo', e.logo, 'proyecto', e.proyecto)
                    from public.empresas e where e.id = v.empresa_id),
      'motivo', (select jsonb_build_object('nombre', i.nombre, 'codigo', i.codigo, 'grupo', i.grupo)
                   from public.lista_items i where i.id = (v.documentos->'orden'->>'motivo_id')::uuid and i.org_id = v.org_id),
      -- El médico solo cuando el enlace se creó con su firma (si lo creó recepción, las hojas salen sin médico). NUNCA las
      -- imágenes de firma y sello ni el correo (firma privada, 20261026007000): la hoja dice «Firmado digitalmente» con el folio.
      'firmado', firma,
      'medico', case when firma then (select jsonb_build_object('nombre_completo', p.nombre_completo, 'cedula', p.cedula, 'mpps', p.mpps,
                          'colegio_medicos', p.colegio_medicos, 'registro_inpsasel', p.registro_inpsasel, 'especialidad', p.especialidad)
                   from public.perfiles p where p.id = v.creado_por) end
    )
    from public.organizaciones o where o.id = v.org_id
  );
end $$;
revoke execute on function public.documentos_registro_paciente(text) from public;
-- Pública a propósito (como ver_solicitud_paciente): el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.documentos_registro_paciente(text) to anon, authenticated;
