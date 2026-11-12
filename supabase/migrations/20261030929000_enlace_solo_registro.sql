-- Enlace para pacientes NO registrados con «Solo registro» (Cesar, 12-nov-2026):
-- «Hay pacientes que no están registrados… me preguntan algunas cosas que quiero indicar: exámenes de sangre,
-- recomendaciones… quiero que el enlace incluya la opción de capturar sus datos de registro (nombre y apellido,
-- cédula, fecha de nacimiento, cargo y empresa) y mantener lo que envío: órdenes, recomendaciones…».
-- 1. solo_registro: el paciente llena solo sus datos de registro (1 minuto). No se le pide motivo de consulta,
--    antecedentes ni hábitos. Si dice que viene de una empresa, el cargo es obligatorio (y la empresa, si el
--    servicio no la eligió al crear el enlace). Se fija al crear y no se cambia (la app no tiene update sobre ella).
-- 2. «Recomendaciones» en los documentos: texto libre del médico (hasta 2500 letras), sale en hoja con membrete.
-- Los parches por texto quitan \r de ambos lados (producción y este archivo pegado en el editor tienen \r\n) y
-- revisan que el texto viejo aparezca exactamente una vez.

alter table public.solicitudes_paciente add column if not exists solo_registro boolean not null default false;
comment on column public.solicitudes_paciente.solo_registro is
  'El paciente llena solo sus datos de registro, sin motivo de consulta, antecedentes ni hábitos (20261030929000).';

-- ===== 1. enviar_solicitud_paciente: sin motivo obligatorio con «Solo registro» =====
do $$
declare
  v_def text := replace(pg_get_functiondef('public.enviar_solicitud_paciente(text, jsonb)'::regprocedure), chr(13), '');
  v_motivo text := 'if length(texto_motivo) < 3 then return ''Cuéntenos qué lo motiva a consultar.''; end if;';
  v_guardar text := '''motivo'', texto_motivo,';
  v_aviso text := ''' llenó el enlace. Revísalo y agenda su cita.''';
  v_x text;
begin
  foreach v_x in array array[v_motivo, v_guardar, v_aviso] loop
    if (length(v_def) - length(replace(v_def, v_x, ''))) / length(v_x) <> 1 then
      raise exception 'enviar_solicitud_paciente cambió: revisar 20261030929000 antes de aplicarla (%)', v_x;
    end if;
  end loop;
  v_def := replace(v_def, v_motivo, 'if length(texto_motivo) < 3 and not v.solo_registro then return ''Cuéntenos qué lo motiva a consultar.''; end if;
  if v.solo_registro and tipo = ''empresa'' and btrim(coalesce(d->>''cargo'', '''')) = '''' then return ''Escriba su cargo en la empresa.''; end if;
  if v.solo_registro and tipo = ''empresa'' and v.empresa_id is null and btrim(coalesce(d->>''empresa'', '''')) = '''' then return ''Escriba la empresa donde trabaja.''; end if;');
  v_def := replace(v_def, v_guardar, '''motivo'', nullif(texto_motivo, ''''),');
  v_def := replace(v_def, v_aviso, 'case when v.solo_registro then '' se registró por el enlace. Revísalo para crear su ficha.'' else '' llenó el enlace. Revísalo y agenda su cita.'' end');
  execute v_def;
end $$;

-- ===== 2. catalogo_registro_paciente: la página sabe si es «Solo registro» =====
do $$
declare
  v_def text := replace(pg_get_functiondef('public.catalogo_registro_paciente(text)'::regprocedure), chr(13), '');
  v_viejo text := '''registrado'', v.para_trabajador is not null,';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'catalogo_registro_paciente cambió: revisar 20261030929000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_viejo || '
    ''solo_registro'', v.solo_registro,');
end $$;

-- ===== 3. limpiar_documentos_registro: «Recomendaciones» de texto libre =====
do $$
declare
  v_def text := replace(pg_get_functiondef('public.limpiar_documentos_registro(jsonb, uuid)'::regprocedure), chr(13), '');
  v_viejo text := 'if salida <> ''{}''::jsonb and p->>''firma'' = ''true'' then salida := salida || ''{"firma": true}''::jsonb; end if;';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'limpiar_documentos_registro cambió: revisar 20261030929000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, 'if jsonb_typeof(p->''recomendaciones'') = ''object''
     and length(btrim(coalesce(p->''recomendaciones''->>''texto'', ''''))) between 1 and 2500 then
    salida := salida || jsonb_build_object(''recomendaciones'', jsonb_build_object(''texto'', btrim(p->''recomendaciones''->>''texto'')));
  end if;
  ' || v_viejo);
end $$;
