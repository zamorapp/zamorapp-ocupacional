-- Historial de enlaces al paciente (Cesar, 12-nov-2026: «quiero tener también un historial de enlaces enviados en donde
-- los pueda alargar, caducar y eliminar»). Caducar ya existía (anular, 20261030917000) y eliminar también.
-- 1. Alargar: el servicio da más días a un enlace.
--    · Sin llenar (esperando o ya vencido): más días para llenarlo. «vence» solo lo cambia esta función.
--    · Ya aceptado: más días para que el paciente envíe sus resultados (columna resultados_hasta; vacía = 30 días desde
--      que llenó sus datos, como hasta hoy). Las descargas de documentos NO se reabren (descarga única de 30 minutos).
--    · Nunca más de 30 días desde hoy. Un enlace caducado (anulado), por revisar o descartado no se alarga.
-- 2. Las dos funciones públicas de resultados usan esa fecha.
-- 3. Los avisos «Enlace abierto» y «Documentos descargados» llevan al historial (/atencion/enlaces).
-- 4. Autolimpieza: los enlaces ya terminados (caducados, descartados o aceptados con el plazo de resultados cumplido) se
--    borran solos N días después de terminar (regla «enlaces_historial», 180 días, de 60 a 730, editable en Configuración > Limpieza).
--    Igual que «Eliminar»: la ficha, la cita y los resultados que subió el paciente (clinico.adjuntos) no se tocan.
-- 5. La pantalla final del paciente saluda con el nombre que escribió el servicio al crear el enlace.
-- Los parches por texto quitan \r de ambos lados y revisan que el texto viejo aparezca exactamente una vez.

alter table public.solicitudes_paciente add column if not exists resultados_hasta timestamptz;
comment on column public.solicitudes_paciente.resultados_hasta is
  'Hasta cuándo el paciente puede enviar resultados con un enlace aceptado. Vacío = 30 días desde que llenó sus datos (20261030931000).';

create or replace function public.parche_unico(p_def text, p_viejo text, p_nuevo text, p_donde text)
returns text language plpgsql immutable set search_path = public as $$
declare v_def text := replace(p_def, chr(13), ''); v_viejo text := replace(p_viejo, chr(13), '');
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception '% cambió: revisar 20261030931000 antes de aplicarla (%)', p_donde, left(v_viejo, 60);
  end if;
  return replace(v_def, v_viejo, replace(p_nuevo, chr(13), ''));
end $$;
revoke execute on function public.parche_unico(text, text, text, text) from public, anon, authenticated;

-- ===== 1. Al crear un enlace la prórroga siempre nace vacía (la app no la puede escribir) =====
do $$
begin
  execute public.parche_unico(pg_get_functiondef('public.validar_solicitud_paciente()'::regprocedure),
    'new.resultado := null; new.revisado_en := null;',
    'new.resultado := null; new.resultados_hasta := null; new.revisado_en := null;', 'validar_solicitud_paciente');
end $$;

-- ===== Alargar =====
create or replace function public.alargar_solicitud_paciente(p_id uuid, p_dias integer)
returns text language plpgsql security definer set search_path = public as $$
declare v public.solicitudes_paciente; v_hasta timestamptz;
begin
  if p_dias is null or p_dias < 1 or p_dias > 30 then return 'Elige entre 1 y 30 días.'; end if;
  select * into v from public.solicitudes_paciente
   where id = p_id
     and org_id = any (public.orgs_con(p_roles => '{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))
   for update;
  if v.id is null then return 'Ese enlace ya no está. Recarga la pantalla.'; end if;
  if v.anulado_en is not null then return 'Ese enlace está caducado: envíale uno nuevo.'; end if;
  if v.recibido_en is null then
    -- Sin llenar: los días se suman desde hoy si ya venció, o desde su vencimiento si sigue vigente
    v_hasta := least(greatest(v.vence, now()) + make_interval(days => p_dias), now() + interval '30 days');
    update public.solicitudes_paciente set vence = v_hasta where id = v.id;
    return 'ok';
  end if;
  if v.resultado is null then return 'Ese paciente está por revisar: acéptalo o descártalo primero.'; end if;
  if v.resultado = 'descartada' then return 'Ese enlace se descartó: si lo necesita, envíale uno nuevo.'; end if;
  v_hasta := least(greatest(coalesce(v.resultados_hasta, v.recibido_en + interval '30 days'), now()) + make_interval(days => p_dias),
                   now() + interval '30 days');
  update public.solicitudes_paciente set resultados_hasta = v_hasta where id = v.id;
  return 'ok';
end $$;
revoke execute on function public.alargar_solicitud_paciente(uuid, integer) from public, anon;
grant execute on function public.alargar_solicitud_paciente(uuid, integer) to authenticated;

-- ===== 2. Resultados: hasta la fecha alargada =====
do $$
declare v_def text;
begin
  execute public.parche_unico(pg_get_functiondef('public.solicitud_para_resultados(text)'::regprocedure),
    'v.recibido_en < now() - interval ''30 days''',
    'coalesce(v.resultados_hasta, v.recibido_en + interval ''30 days'') < now()', 'solicitud_para_resultados');
  v_def := public.parche_unico(pg_get_functiondef('public.resultados_registro_paciente(text)'::regprocedure),
    'when v.recibido_en < now() - interval ''30 days'' then ''vencido''',
    'when coalesce(v.resultados_hasta, v.recibido_en + interval ''30 days'') < now() then ''vencido''', 'resultados_registro_paciente');
  execute public.parche_unico(v_def,
    '''hasta'', public.fecha_caracas(v.recibido_en + interval ''30 days''),',
    '''hasta'', public.fecha_caracas(coalesce(v.resultados_hasta, v.recibido_en + interval ''30 days'')),', 'resultados_registro_paciente');
end $$;

-- ===== 3. Los avisos llevan al historial =====
do $$
declare v_def text := pg_get_functiondef('public.avisar_enlace_paciente()'::regprocedure);
begin
  v_def := public.parche_unico(v_def, 'abrió el enlace que le enviaste.'', ''/atencion#enlaces-enviados''',
    'abrió el enlace que le enviaste.'', ''/atencion/enlaces''', 'avisar_enlace_paciente');
  execute public.parche_unico(v_def, 'descargó sus documentos.'', ''/atencion#enlaces-enviados''',
    'descargó sus documentos.'', ''/atencion/enlaces''', 'avisar_enlace_paciente');
end $$;

-- ===== 4. Autolimpieza de enlaces terminados =====
-- Mínimo 60 días: lo que el paciente escribió (motivo, antecedentes, hábitos) se ofrece al abrir su consulta durante
-- 60 días desde que lo llenó (atencion/acciones.ts); el borrado llega como pronto 30 + 60 = 90 días después.
insert into public.limpieza_plazos (clave, dias, minimo, maximo) values ('enlaces_historial', 180, 60, 730)
on conflict (clave) do nothing;

-- Cuándo terminó un enlace (null = sigue en uso o por revisar). El que nunca se llenó lo limpia «enlaces_paciente».
create or replace function public.fin_solicitud_paciente(s public.solicitudes_paciente)
returns timestamptz language sql immutable set search_path = public as $$
  select case
    when s.recibido_en is null then null
    when s.anulado_en is not null then s.anulado_en
    when s.resultado = 'descartada' then s.revisado_en
    when s.resultado = 'aceptada' then coalesce(s.resultados_hasta, s.recibido_en + interval '30 days')
  end
$$;
revoke execute on function public.fin_solicitud_paciente(public.solicitudes_paciente) from public, anon, authenticated;

do $$
begin
  execute public.parche_unico(pg_get_functiondef('public.limpieza_correr(boolean)'::regprocedure),
    'clave := ''enlaces_paciente''; cantidad := n; bytes := b; return next;',
    'clave := ''enlaces_paciente''; cantidad := n; bytes := b; return next;

  -- Enlaces que el paciente sí llenó y ya terminaron (caducados, descartados o aceptados con el plazo de resultados
  -- cumplido) (20261030931000). Su ficha, su cita y los resultados que subió no se tocan.
  select count(*), coalesce(sum(pg_column_size(s.*)), 0) into n, b from public.solicitudes_paciente s
   where public.fin_solicitud_paciente(s) < public.ahora() - public.limpieza_dias(''enlaces_historial'');
  if p_borrar then
    delete from public.solicitudes_paciente s
     where public.fin_solicitud_paciente(s) < public.ahora() - public.limpieza_dias(''enlaces_historial'');
    get diagnostics n = row_count;
  end if;
  clave := ''enlaces_historial''; cantidad := n; bytes := b; return next;', 'limpieza_correr');
end $$;

-- ===== 5. Saludo con el nombre tal como lo escribió el servicio («Sra. Francis»), no solo la primera palabra =====
do $$
begin
  execute public.parche_unico(pg_get_functiondef('public.documentos_registro_paciente(text)'::regprocedure),
    '''folio'', v.id,', '''folio'', v.id, ''saludo'', v.nombre,', 'documentos_registro_paciente');
end $$;

drop function public.parche_unico(text, text, text, text);
