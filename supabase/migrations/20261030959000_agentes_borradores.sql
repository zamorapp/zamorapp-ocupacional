-- Puerta para agentes: el agente PREPARA récipes y órdenes de exámenes; el médico los revisa, los emite y los firma.
-- Pedido del dueño (14-nov-2026): «pacientes me interceptan en un pasillo y me piden un récipe o una orden de exámenes…
-- que yo le diga: elabórame un récipe a nombre de tal paciente con el medicamento tal… lo pones listo para imprimir.
-- Yo lo apruebo, lo audito, lo imprimo y lo envío». Y: «yo indicaría si el récipe lo adjunto a una consulta del paciente
-- o lo dejo como orden por fuera sin consulta».
-- 1. Casilla nueva en la llave, APAGADA por defecto: «Prepara récipes y órdenes» (agentes_llaves.documentos).
-- 2. clinico.agentes_borradores: lo que deja el agente. Es un BORRADOR: no se imprime, no tiene firma, no cuenta en
--    nada. Lo inserta SOLO la puerta (public.agente); el médico lo marca «emitido» (al emitir la indicación con SU
--    sesión) o «descartado». Lo escrito por el agente no cambia: las correcciones del médico van en la indicación.
--    Lo ven solo médico, gerente médico y administrador con acceso clínico (no enfermería, recepción ni RR. HH.).
--    Se borra solo a los 30 días (limpieza «agentes_borradores»); lo emitido queda en clinico.indicaciones.
-- 3. clinico.indicaciones: tipo nuevo «examenes» (orden de exámenes sin consulta, lista libre de nombres) y
--    consulta_id opcional: el médico decide si el documento va suelto o adjunto a una consulta del paciente.
-- 4. Acciones nuevas de la puerta: preparar_documento (escribe) y ver_preparados (estado de lo preparado). Ninguna lee
--    historias, diagnósticos, firma ni sello; ver_preparados no devuelve medicinas ni exámenes.

-- ===== 1. Casilla de la llave =====
alter table public.agentes_llaves add column if not exists documentos boolean not null default false;

create or replace function public.agentes_llave_documentos(p_org uuid, p_llave uuid, p_si boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k public.agentes_llaves;
begin
  if public.es_base_local() then
    raise exception 'La puerta para agentes se cambia con internet.' using errcode = 'P0001';
  end if;
  if not public.agentes_soy_admin(p_org) then
    raise exception 'Solo el administrador cambia las llaves para agentes.' using errcode = '42501';
  end if;
  update public.agentes_llaves set documentos = coalesce(p_si, false)
   where id = p_llave and org_id = p_org and revocada_en is null and vence_en > public.ahora()
  returning * into k;
  if not found then raise exception 'Esa llave ya no sirve (apagada o vencida).' using errcode = 'P0001'; end if;
  insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ensayo, ok, resumen)
  values (p_org, k.id, k.nombre, 'casilla_documentos', false, true,
          case when k.documentos then 'Casilla «Prepara récipes y órdenes» encendida' else 'Casilla «Prepara récipes y órdenes» apagada' end);
  return jsonb_build_object('id', k.id, 'documentos', k.documentos);
end $$;
revoke execute on function public.agentes_llave_documentos(uuid, uuid, boolean) from public, anon;
grant execute on function public.agentes_llave_documentos(uuid, uuid, boolean) to authenticated;

-- agentes_estado devuelve la casilla de cada llave (la pantalla la muestra)
do $$
declare
  v_def text := replace(pg_get_functiondef('public.agentes_estado(uuid, date, date)'::regprocedure), chr(13), '');
  v_viejo text := '''permiso'', l.permiso,';
begin
  -- Ya aplicada (se pegó dos veces): no se toca
  if position('''documentos'', l.documentos' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'agentes_estado cambió: revisar 20261030959000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_viejo || ' ''documentos'', l.documentos,');
end $$;

-- ===== 2. Indicaciones: orden de exámenes y consulta opcional =====
alter table clinico.indicaciones add column if not exists examenes jsonb not null default '[]';
alter table clinico.indicaciones add column if not exists consulta_id uuid references clinico.consultas (id) on delete set null;
create index if not exists indicaciones_consulta on clinico.indicaciones (consulta_id) where consulta_id is not null;

do $$
declare c record;
begin
  -- Se cambian las dos reglas que nombraban solo enfermería y récipe (sus nombres los puso PostgreSQL)
  for c in select conname, pg_get_constraintdef(oid) as d from pg_constraint
            where conrelid = 'clinico.indicaciones'::regclass and contype = 'c' loop
    if (c.d like '%''enfermeria''%' and c.d like '%''recipe''%' and c.d not like '%examenes%')
       or (c.d like '%btrim(indicaciones)%' and c.d like '%jsonb_array_length(tratamiento) > 0%' and c.d not like '%examenes%') then
      execute format('alter table clinico.indicaciones drop constraint %I', c.conname);
    end if;
  end loop;
end $$;
alter table clinico.indicaciones drop constraint if exists indicaciones_tipo_valido;
alter table clinico.indicaciones add constraint indicaciones_tipo_valido check (tipo in ('enfermeria', 'recipe', 'examenes'));
alter table clinico.indicaciones drop constraint if exists indicaciones_con_contenido;
alter table clinico.indicaciones add constraint indicaciones_con_contenido
  check (jsonb_array_length(tratamiento) > 0 or jsonb_array_length(examenes) > 0 or btrim(indicaciones) <> '');
alter table clinico.indicaciones drop constraint if exists indicaciones_examenes_lista;
alter table clinico.indicaciones add constraint indicaciones_examenes_lista check (
  jsonb_typeof(examenes) = 'array' and jsonb_array_length(examenes) <= 40
  and (tipo <> 'examenes' or jsonb_array_length(examenes) > 0));

-- Reglas de la fila: la orden de exámenes nace «emitida» como el récipe; exámenes y consulta no cambian después;
-- la consulta debe ser del mismo trabajador
do $$
declare
  v_def text := replace(pg_get_functiondef('public.proteger_indicacion()'::regprocedure), chr(13), '');
  v_cambios text[][] := array[
    array['new.estado := case when new.tipo = ''recipe'' then ''emitida'' else ''pendiente'' end;',
          'new.estado := case when new.tipo in (''recipe'', ''examenes'') then ''emitida'' else ''pendiente'' end;'],
    array['new.fecha := old.fecha; new.tratamiento := old.tratamiento;',
          'new.fecha := old.fecha; new.tratamiento := old.tratamiento; new.examenes := old.examenes; new.consulta_id := old.consulta_id;'],
    array['if not found then raise exception ''El trabajador no es de esta organización.''; end if;',
          'if not found then raise exception ''El trabajador no es de esta organización.''; end if;
    if new.consulta_id is not null and not exists (select 1 from clinico.consultas c
        where c.id = new.consulta_id and c.trabajador_id = new.trabajador_id and c.org_id = new.org_id) then
      raise exception ''Esa consulta no es de este trabajador.'';
    end if;']];
  i int;
begin
  if position('new.examenes := old.examenes' in v_def) > 0 then return; end if; -- ya aplicada
  for i in 1 .. array_length(v_cambios, 1) loop
    if (length(v_def) - length(replace(v_def, v_cambios[i][1], ''))) / length(v_cambios[i][1]) <> 1 then
      raise exception 'proteger_indicacion cambió (cambio %): revisar 20261030959000 antes de aplicarla', i;
    end if;
    v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
  end loop;
  execute v_def;
end $$;
revoke execute on function public.proteger_indicacion() from public, anon, authenticated;

-- ===== 3. Borradores del agente =====
create table if not exists clinico.agentes_borradores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete set null,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  tipo text not null check (tipo in ('recipe', 'examenes')),
  -- Mismo formato que indicaciones.tratamiento
  tratamiento jsonb not null default '[]' check (jsonb_typeof(tratamiento) = 'array' and jsonb_array_length(tratamiento) <= 20),
  examenes jsonb not null default '[]' check (jsonb_typeof(examenes) = 'array' and jsonb_array_length(examenes) <= 40),
  indicaciones text not null default '' check (length(indicaciones) <= 2000),
  -- Fecha que llevará el documento (Cesar, 14-nov: pasada o futura, sin trabas). Vacía = el día en que se emite
  fecha date check (fecha is null or fecha between date '2000-01-01' and date '2100-12-31'),
  -- Lo decide el médico (el agente lo pregunta): suelto o adjunto a una consulta del paciente
  adjuntar text not null check (adjuntar in ('suelto', 'consulta')),
  consulta_id uuid references clinico.consultas (id) on delete set null,
  -- Por dónde quiere el médico que salga (lo envía él)
  envio text not null default 'imprimir' check (envio in ('imprimir', 'whatsapp', 'correo')),
  correo text check (correo is null or (length(correo) <= 200 and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Sin referencia: las llaves viven solo en la nube y la copia de la PC no las trae
  llave_id uuid,
  llave_nombre text not null check (length(llave_nombre) <= 60),
  creado_en timestamptz not null default public.ahora(),
  estado text not null default 'por_revisar' check (estado in ('por_revisar', 'emitido', 'descartado')),
  indicacion_id uuid references clinico.indicaciones (id) on delete set null,
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_en timestamptz,
  hora_equipo jsonb,
  actualizado_en timestamptz not null default public.ahora(),
  check (tipo <> 'recipe' or jsonb_array_length(tratamiento) > 0),
  check (tipo <> 'examenes' or jsonb_array_length(examenes) > 0),
  check (adjuntar = 'consulta' or consulta_id is null),
  check (envio <> 'correo' or correo is not null)
);
comment on table clinico.agentes_borradores is
  'Récipes y órdenes que PREPARA un agente; el médico los emite (clinico.indicaciones) o los descarta. Los inserta solo public.agente (20261030959000).';
create index if not exists agentes_borradores_por_revisar on clinico.agentes_borradores (org_id, creado_en desc) where estado = 'por_revisar';
create index if not exists agentes_borradores_trabajador on clinico.agentes_borradores (trabajador_id, creado_en desc);

alter table clinico.agentes_borradores enable row level security;
drop policy if exists agentes_borradores_leer on clinico.agentes_borradores;
create policy agentes_borradores_leer on clinico.agentes_borradores for select using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}', p_clinico => true))::text[]));
drop policy if exists agentes_borradores_revisar on clinico.agentes_borradores;
create policy agentes_borradores_revisar on clinico.agentes_borradores for update using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico}', p_clinico => true))::text[]));
revoke all on clinico.agentes_borradores from anon, authenticated;
grant select, update on clinico.agentes_borradores to authenticated;

create or replace view public.agentes_borradores with (security_invoker = true) as select * from clinico.agentes_borradores;
revoke all on public.agentes_borradores from anon, authenticated;
grant select, update on public.agentes_borradores to authenticated;

create or replace function public.proteger_agente_borrador()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bandeja boolean := coalesce(current_setting('sync.cambio_id', true), '') <> '';
begin
  if tg_op = 'INSERT' then
    -- Solo la puerta para agentes (public.agente) crea borradores
    if coalesce(current_setting('zamorapp.agente_borrador', true), '') <> '1' then
      raise exception 'Los borradores los crea solo la puerta para agentes.' using errcode = '42501';
    end if;
    select t.empresa_id into new.empresa_id from public.trabajadores t where t.id = new.trabajador_id and t.org_id = new.org_id;
    if not found then raise exception 'El trabajador no es de esta organización.'; end if;
    new.estado := 'por_revisar'; new.indicacion_id := null; new.revisado_por := null; new.revisado_en := null;
    new.creado_en := public.ahora();
    return new;
  end if;

  -- Lo escrito por el agente no cambia: la corrección del médico queda en la indicación que emite
  new.id := old.id; new.org_id := old.org_id; new.empresa_id := old.empresa_id; new.trabajador_id := old.trabajador_id;
  new.tipo := old.tipo; new.tratamiento := old.tratamiento; new.examenes := old.examenes; new.indicaciones := old.indicaciones; new.fecha := old.fecha;
  new.adjuntar := old.adjuntar; new.consulta_id := old.consulta_id; new.envio := old.envio; new.correo := old.correo;
  new.llave_id := old.llave_id; new.llave_nombre := old.llave_nombre; new.creado_en := old.creado_en;
  new.actualizado_en := public.ahora();

  -- Ya revisado: gana la primera marca (otra PC que marcó después no la pisa)
  if old.estado <> 'por_revisar' or new.estado = old.estado then
    new.estado := old.estado; new.indicacion_id := old.indicacion_id; new.revisado_por := old.revisado_por; new.revisado_en := old.revisado_en;
    return new;
  end if;
  if v_uid is null or not (old.org_id = any (public.orgs_con('{administrador,gerente_medico,medico}', p_clinico => true))) then
    raise exception 'El borrador lo revisa el médico.' using errcode = '42501';
  end if;
  if new.estado = 'emitido' then
    if new.indicacion_id is null or not exists (select 1 from clinico.indicaciones i
        where i.id = new.indicacion_id and i.trabajador_id = old.trabajador_id and i.org_id = old.org_id) then
      raise exception 'Para marcarlo emitido hace falta la indicación emitida de este trabajador.' using errcode = 'P0001';
    end if;
  elsif new.estado = 'descartado' then
    new.indicacion_id := null;
  else
    raise exception 'Cambio no permitido.' using errcode = '42501';
  end if;
  new.revisado_por := v_uid;
  if not v_bandeja or new.revisado_en is null then new.revisado_en := public.ahora(); end if;
  return new;
end $$;
revoke execute on function public.proteger_agente_borrador() from public, anon, authenticated;

drop trigger if exists proteger_agente_borrador on clinico.agentes_borradores;
create trigger proteger_agente_borrador before insert or update on clinico.agentes_borradores
  for each row execute function public.proteger_agente_borrador();
drop trigger if exists hora_oficial on clinico.agentes_borradores;
create trigger hora_oficial before insert or update on clinico.agentes_borradores
  for each row execute function public.hora_oficial_de_la_bandeja('revisado_en');
drop trigger if exists bit_agentes_borradores on clinico.agentes_borradores;
create trigger bit_agentes_borradores after insert or update on clinico.agentes_borradores
  for each row execute function public.registrar_bitacora();

-- Escritorio: baja con la copia; «emitido/descartado» se marca sin internet y sube por la bandeja
insert into sync.tablas (nombre, clinica, subible) values ('clinico.agentes_borradores', true, true)
  on conflict (nombre) do nothing;
alter table clinico.agentes_borradores add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on clinico.agentes_borradores;
create trigger sync_version before insert or update on clinico.agentes_borradores for each row execute function sync.versionar();
drop trigger if exists sync_anotar on clinico.agentes_borradores;
create trigger sync_anotar after insert or update or delete on clinico.agentes_borradores for each row execute function sync.anotar();

-- ===== 4. Acciones de la puerta =====
-- Una medicina del agente → mismo formato que la consulta. Solo textos, con tope.
create or replace function public.agente_medicina(m jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'medicina', left(btrim(coalesce(m ->> 'medicina', '')), 200),
    'concentracion', left(btrim(coalesce(m ->> 'concentracion', '')), 100),
    'presentacion', left(btrim(coalesce(m ->> 'presentacion', '')), 100),
    'via', left(btrim(coalesce(m ->> 'via', '')), 60),
    'dosis', left(btrim(coalesce(m ->> 'dosis', '')), 100),
    'frecuencia', left(btrim(coalesce(m ->> 'frecuencia', '')), 100),
    'duracion', left(btrim(coalesce(m ->> 'duracion', '')), 100),
    'observacion', left(btrim(coalesce(m ->> 'observacion', '')), 300))
$$;

create or replace function public.agente_preparar_documento(o uuid, d jsonb, p_ensayo boolean, p_llave uuid, p_llave_nombre text)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_trab uuid := public.agente_uuid(d, 'trabajador_id');
  v_tipo text := lower(btrim(coalesce(d ->> 'tipo', '')));
  v_adj text := lower(btrim(coalesce(d ->> 'adjuntar', '')));
  v_fecha_c date := public.agente_fecha(d, 'consulta_fecha');
  v_fecha date := public.agente_fecha(d, 'fecha');
  v_envio text := lower(btrim(coalesce(nullif(d ->> 'envio', ''), 'imprimir')));
  v_correo text := nullif(lower(btrim(coalesce(d ->> 'correo', ''))), '');
  v_texto text := left(btrim(coalesce(d ->> 'indicaciones', '')), 2000);
  v_meds jsonb := '[]';
  v_exs jsonb := '[]';
  v_faltan text[] := '{}';
  t public.trabajadores;
  v_cons uuid;
  b clinico.agentes_borradores;
  m jsonb;
  x text;
  v_nombre text;
  v_que text;
begin
  if v_trab is null then perform public.agente_no('Falta «trabajador_id». Búscalo con buscar_trabajadores.'); end if;
  select * into t from public.trabajadores where id = v_trab and org_id = o;
  if not found then perform public.agente_no('No encuentro ese trabajador en esta organización.'); end if;
  v_nombre := btrim(coalesce(t.nombres, '') || ' ' || coalesce(t.apellidos, ''));
  if v_tipo not in ('recipe', 'examenes') then perform public.agente_no('«tipo» va «recipe» (récipe) o «examenes» (orden de exámenes).'); end if;
  if v_adj not in ('suelto', 'consulta') then
    perform public.agente_no('Falta «adjuntar»: pregúntale al doctor si va suelto (sin consulta) o adjunto a una consulta del paciente.');
  end if;
  -- Pasada o futura vale (Cesar, 14-nov); solo se frena un año imposible (error de dictado)
  if v_fecha is not null and v_fecha not between date '2000-01-01' and date '2100-12-31' then
    perform public.agente_no('«fecha» fuera de rango: confírmala con el doctor.');
  end if;
  if v_envio not in ('imprimir', 'whatsapp', 'correo') then perform public.agente_no('«envio» va «imprimir», «whatsapp» o «correo».'); end if;
  if v_envio = 'correo' and (v_correo is null or v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_correo) > 200) then
    perform public.agente_no('Para enviar por correo hace falta «correo» válido: pregúntaselo al doctor.');
  end if;
  if v_envio <> 'correo' then v_correo := null; end if;

  if v_tipo = 'recipe' then
    if jsonb_typeof(d -> 'medicamentos') <> 'array' or jsonb_array_length(d -> 'medicamentos') = 0 then
      perform public.agente_no('Falta «medicamentos»: al menos una medicina.');
    end if;
    if jsonb_array_length(d -> 'medicamentos') > 20 then perform public.agente_no('Máximo 20 medicinas por récipe.'); end if;
    for m in select value from jsonb_array_elements(d -> 'medicamentos') loop
      if jsonb_typeof(m) <> 'object' or btrim(coalesce(m ->> 'medicina', '')) = '' then
        perform public.agente_no('Cada medicamento necesita «medicina» (el nombre).');
      end if;
      m := public.agente_medicina(m);
      v_meds := v_meds || jsonb_build_array(m);
      -- Lo que el récipe MPPS necesita y falta: el médico lo completa al revisar
      if m ->> 'concentracion' = '' and m ->> 'medicina' !~ '\d' then v_faltan := v_faltan || (m ->> 'medicina' || ': concentración'); end if;
      if m ->> 'dosis' = '' or m ->> 'frecuencia' = '' or m ->> 'duracion' = '' then
        v_faltan := v_faltan || (m ->> 'medicina' || ': dosis, frecuencia o duración');
      end if;
    end loop;
  else
    if jsonb_typeof(d -> 'examenes') <> 'array' or jsonb_array_length(d -> 'examenes') = 0 then
      perform public.agente_no('Falta «examenes»: al menos un examen, tal como te lo dio el doctor.');
    end if;
    if jsonb_array_length(d -> 'examenes') > 40 then perform public.agente_no('Máximo 40 exámenes por orden.'); end if;
    for x in select left(btrim(value), 150) from jsonb_array_elements_text(d -> 'examenes') loop
      if x <> '' and not v_exs ? x then v_exs := v_exs || jsonb_build_array(x); end if;
    end loop;
    if jsonb_array_length(v_exs) = 0 then perform public.agente_no('Falta «examenes»: al menos un examen.'); end if;
  end if;

  if v_adj = 'consulta' then
    -- La consulta de ese día (o la más reciente) del trabajador; al agente no se le dice cuál
    select c.id into v_cons from clinico.consultas c
     where c.trabajador_id = t.id and c.org_id = o and (v_fecha_c is null or c.fecha = v_fecha_c)
     order by c.fecha desc, c.creado_en desc limit 1;
    if v_cons is null then
      -- Lo mínimo (Analizar): sin decir fechas de consultas del paciente
      perform public.agente_no('No se pudo adjuntar a una consulta: pregúntale al doctor si va suelto o qué día fue la consulta.');
    end if;
  end if;

  v_que := case v_tipo when 'recipe' then 'Récipe' else 'Orden de exámenes' end || ' para ' || v_nombre
        || case when v_adj = 'consulta' then ' (adjunto a una consulta)' else ' (suelto, sin consulta)' end
        || case when v_fecha is not null then ' con fecha ' || to_char(v_fecha, 'DD/MM/YYYY') else '' end;

  -- Sin duplicar: el mismo pedido por revisar en los últimos 30 minutos es el mismo borrador
  select * into b from clinico.agentes_borradores ab
   where ab.org_id = o and ab.trabajador_id = t.id and ab.tipo = v_tipo and ab.estado = 'por_revisar'
     and ab.tratamiento = v_meds and ab.examenes = v_exs and ab.indicaciones = v_texto and ab.fecha is not distinct from v_fecha
     and ab.creado_en > public.ahora() - interval '30 minutes'
   limit 1;
  if found then
    return jsonb_build_object('borrador_id', b.id, 'ya_existia', true, 'ruta', '/borradores', 'aviso', 'Tienes por revisar: ' || v_que || '.',
      '_empresa', t.empresa_id, '_resumen', 'Borrador ya existía: ' || v_que);
  end if;

  if p_ensayo then
    return jsonb_build_object('se_crearia', v_que, 'medicamentos', v_meds, 'examenes', v_exs, 'indicaciones', v_texto, 'fecha', v_fecha,
      'envio', v_envio, 'correo', v_correo, 'faltan', to_jsonb(v_faltan), 'ya_existia', false,
      'nota', 'Queda como BORRADOR: el doctor lo revisa, lo emite con su firma y sello y lo envía. Nada sale solo.',
      '_empresa', t.empresa_id, '_resumen', 'Prepararía: ' || v_que);
  end if;

  perform set_config('zamorapp.agente_borrador', '1', true);
  insert into clinico.agentes_borradores (org_id, trabajador_id, tipo, tratamiento, examenes, indicaciones, fecha, adjuntar, consulta_id,
                                          envio, correo, llave_id, llave_nombre)
  values (o, t.id, v_tipo, v_meds, v_exs, v_texto, v_fecha, v_adj, v_cons, v_envio, v_correo, p_llave, left(p_llave_nombre, 60))
  returning * into b;
  perform set_config('zamorapp.agente_borrador', '', true);
  return jsonb_build_object('borrador_id', b.id, 'ya_existia', false, 'faltan', to_jsonb(v_faltan),
    'ruta', '/borradores', 'aviso', 'Tienes por revisar: ' || v_que || '.',
    'nota', 'Dale al doctor el enlace para revisarlo y, si quiere, el de WhatsApp para avisarse. Él lo emite, firma y envía.',
    '_empresa', t.empresa_id, '_resumen', 'Preparó: ' || v_que);
end $$;

create or replace function public.agente_ver_preparados(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_trab uuid := public.agente_uuid(d, 'trabajador_id');
begin
  -- Solo el estado: sin medicinas ni exámenes
  return jsonb_build_object('borradores', coalesce((
    select jsonb_agg(jsonb_build_object(
             'borrador_id', b.id,
             'tipo', case b.tipo when 'recipe' then 'Récipe' else 'Orden de exámenes' end,
             'paciente', btrim(coalesce(t.nombres, '') || ' ' || coalesce(t.apellidos, '')),
             'estado', case b.estado when 'por_revisar' then 'Por revisar' when 'emitido' then 'Emitido por el doctor' else 'Descartado' end,
             'preparado', to_char(b.creado_en at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'),
             'ruta', case when b.estado = 'emitido' and b.indicacion_id is not null then '/imprimir/indicacion/' || b.indicacion_id else '/borradores' end)
           order by b.creado_en desc)
      from (select * from clinico.agentes_borradores x
             where x.org_id = o and (v_trab is null or x.trabajador_id = v_trab)
             order by x.creado_en desc limit 50) b
      join public.trabajadores t on t.id = b.trabajador_id), '[]'::jsonb));
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('agente_medicina', 'agente_preparar_documento', 'agente_ver_preparados') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- La puerta: dos acciones nuevas; las dos exigen la casilla «Prepara récipes y órdenes» encendida
do $$
declare
  v_def text := replace(pg_get_functiondef('public.agente(text, text, jsonb, boolean)'::regprocedure), chr(13), '');
  v_cambios text[][] := array[
    array['when v_acc in (''resumen'', ', 'when v_acc in (''ver_preparados'', ''resumen'', '],
    array['when v_acc in (''crear_empresa'', ', 'when v_acc in (''preparar_documento'', ''crear_empresa'', '],
    array['Acción desconocida. Las que hay: resumen, ', 'Acción desconocida. Las que hay: preparar_documento, ver_preparados, resumen, '],
    array['  elsif v_escribe and k.permiso <> ''crear'' then',
          '  elsif v_acc in (''preparar_documento'', ''ver_preparados'') and not k.documentos then
    v_err := ''Esta llave no prepara récipes ni órdenes. El doctor enciende «Prepara récipes y órdenes» en Configuración > Puerta para agentes.'';
  elsif v_escribe and k.permiso <> ''crear'' then'],
    array['when ''resumen'' then public.agente_resumen(k.org_id)',
          'when ''preparar_documento'' then public.agente_preparar_documento(k.org_id, d, v_ensayo, k.id, k.nombre)
        when ''ver_preparados'' then public.agente_ver_preparados(k.org_id, d)
        when ''resumen'' then public.agente_resumen(k.org_id)']];
  i int;
begin
  if position('agente_preparar_documento' in v_def) > 0 then return; end if; -- ya aplicada
  for i in 1 .. array_length(v_cambios, 1) loop
    if (length(v_def) - length(replace(v_def, v_cambios[i][1], ''))) / length(v_cambios[i][1]) <> 1 then
      raise exception 'public.agente cambió (cambio %): revisar 20261030959000 antes de aplicarla', i;
    end if;
    v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
  end loop;
  execute v_def;
end $$;
revoke execute on function public.agente(text, text, jsonb, boolean) from public;
grant execute on function public.agente(text, text, jsonb, boolean) to anon, authenticated;

-- ===== 5. Autolimpieza: los borradores se van a los 30 días (lo emitido vive en clinico.indicaciones) =====
insert into public.limpieza_plazos (clave, dias, minimo, maximo) values ('agentes_borradores', 30, 7, 365)
on conflict (clave) do nothing;

do $$
declare
  v_def text := replace(pg_get_functiondef('public.limpieza_correr(boolean)'::regprocedure), chr(13), '');
  v_viejo text := 'clave := ''agentes_registro''; cantidad := n; bytes := b; return next;';
begin
  if position('clinico.agentes_borradores' in v_def) > 0 then return; end if; -- ya aplicada
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'limpieza_correr cambió: revisar 20261030959000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_viejo || '

  -- Borradores que dejó un agente (20261030959000): lo emitido ya está en clinico.indicaciones
  select count(*), coalesce(sum(pg_column_size(x.*)), 0) into n, b from clinico.agentes_borradores x
   where x.creado_en < public.ahora() - public.limpieza_dias(''agentes_borradores'');
  if p_borrar then
    delete from clinico.agentes_borradores x where x.creado_en < public.ahora() - public.limpieza_dias(''agentes_borradores'');
    get diagnostics n = row_count;
  end if;
  clave := ''agentes_borradores''; cantidad := n; bytes := b; return next;');
end $$;

select public.vistas_al_dia();
