-- Enlace del paciente: «no puedo adjuntar mi examen» (paciente y Cesar, 14-nov-2026).
-- Causa 1: el bloque «Enviar mis resultados» solo mostraba los botones DESPUÉS de que el servicio aceptara al paciente en
--   «Por revisar». Antes de eso decía «Podrás subirlos apenas confirme su cita», sin botón: el paciente tocaba y no pasaba nada.
-- Causa 2: aceptar SIN cita (casilla «Agendar también una cita» apagada, lo normal en «Solo registro») fallaba en la base
--   («Al aceptar se indica la ficha y la cita»): la ficha se creaba, pero la solicitud seguía en «Por revisar» para siempre
--   y la subida nunca se abría.
-- Arreglo:
-- 1. Aceptar pide la ficha; la cita es opcional.
-- 2. El paciente puede subir desde que envía sus datos (30 días o la prórroga, como antes). Mientras está «por revisar»
--    no hay ficha: el archivo espera en la carpeta de su solicitud (<org>/<solicitud>/paciente-…), que solo ve el personal
--    clínico (la política de RR. HH. pide un trabajador de esa carpeta y no hay ninguno). No entra a ninguna historia
--    hasta que el servicio lo acepta: la cédula que escribió no está verificada.
-- 3. Al aceptar (o cuando la ficha nacida en la PC llega a la nube) los archivos en espera pasan solos a su ficha.
--    Descartado: nunca pasan a una historia.
-- 4. Mensajes al paciente en «usted».
-- Parches por texto (parche_unico: quita \r y exige que el texto viejo aparezca una sola vez).

-- Ayudante temporal de parches (mismo que 931000/943000; se borra al final)
create or replace function public.parche_unico(p_def text, p_viejo text, p_nuevo text, p_donde text)
returns text language plpgsql immutable set search_path = public as $$
declare v_def text := replace(p_def, chr(13), ''); v_viejo text := replace(p_viejo, chr(13), '');
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception '% cambió: revisar 20261030965000 antes de aplicarla (%)', p_donde, left(v_viejo, 60);
  end if;
  return replace(v_def, v_viejo, replace(p_nuevo, chr(13), ''));
end $$;
revoke execute on function public.parche_unico(text, text, text, text) from public, anon, authenticated;

-- Lo que hace falta para pasar a la ficha un archivo que llegó antes de aceptar
alter table public.subidas_paciente add column if not exists nombre text, add column if not exists tipo_mime text,
  add column if not exists tamano bigint;
create index if not exists solicitudes_paciente_trabajador on public.solicitudes_paciente (trabajador_id) where trabajador_id is not null;

-- ===== 1. Aceptar sin cita =====
do $$
begin
  execute public.parche_unico(pg_get_functiondef('public.validar_solicitud_paciente()'::regprocedure),
    'if new.resultado = ''aceptada'' and (new.trabajador_id is null or new.cita_id is null) then
    raise exception ''Al aceptar se indica la ficha y la cita'';',
    'if new.resultado = ''aceptada'' and new.trabajador_id is null then
    raise exception ''Al aceptar se indica la ficha'';', '965 validar_solicitud_paciente');
end $$;

-- ===== 2. Enlace que recibe archivos: llenado, no descartado ni anulado, dentro del plazo (con o sin ficha) =====
create or replace function public.solicitud_para_subir(p_token text)
returns public.solicitudes_paciente language plpgsql stable security definer set search_path = public as $$
declare v public.solicitudes_paciente;
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 60 then return null; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v.id is null or v.anulado_en is not null or v.recibido_en is null or coalesce(v.resultados_hasta, v.recibido_en + interval '30 days') < public.ahora()
     or v.resultado = 'descartada' or (v.resultado = 'aceptada' and v.trabajador_id is null) then
    return null;
  end if;
  return v;
end $$;
revoke execute on function public.solicitud_para_subir(text) from public, anon, authenticated;

-- Pasa a la ficha los archivos que el paciente subió antes de ser aceptado. Idempotente; si la ficha todavía no está en
-- la nube (nació en la PC), no hace nada y se repite cuando llega.
create or replace function public.pasar_subidas_a_ficha(p_solicitud uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare s public.solicitudes_paciente; n integer;
  -- Si esto corre dentro de la bandeja de una PC (la ficha nació allá), el registro de sync llevaría el equipo de esa PC
  -- y ella lo tomaría como eco suyo y no bajaría el archivo: se anota como cambio de la nube y se restaura después
  v_cambio text := current_setting('sync.cambio_id', true); v_equipo text := current_setting('sync.equipo_id', true);
begin
  select * into s from public.solicitudes_paciente where id = p_solicitud;
  if s.id is null or s.resultado is distinct from 'aceptada' or s.trabajador_id is null
     or not exists (select 1 from public.trabajadores where id = s.trabajador_id) then
    return 0;
  end if;
  perform set_config('sync.cambio_id', '', true), set_config('sync.equipo_id', '', true);
  insert into clinico.adjuntos (org_id, trabajador_id, consulta_id, nombre, ruta, tipo_mime, tamano, descripcion, subido_por)
  select s.org_id, s.trabajador_id, null, coalesce(u.nombre, 'Resultado'), u.ruta, u.tipo_mime, u.tamano, 'Enviado por el paciente con su enlace', null
    from public.subidas_paciente u
   where u.solicitud_id = s.id and u.confirmado_en is not null and u.tipo_mime is not null
     and not exists (select 1 from clinico.adjuntos a where a.ruta = u.ruta)
   order by u.confirmado_en;
  get diagnostics n = row_count;
  perform set_config('sync.cambio_id', coalesce(v_cambio, ''), true), set_config('sync.equipo_id', coalesce(v_equipo, ''), true);
  return n;
end $$;
revoke execute on function public.pasar_subidas_a_ficha(uuid) from public, anon, authenticated;

create or replace function public.al_aceptar_pasar_subidas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'trabajadores' then
    perform public.pasar_subidas_a_ficha(s.id) from public.solicitudes_paciente s where s.trabajador_id = new.id and s.resultado = 'aceptada';
  elsif new.resultado = 'aceptada' and new.trabajador_id is not null then
    perform public.pasar_subidas_a_ficha(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.al_aceptar_pasar_subidas() from public, anon, authenticated;
drop trigger if exists pasar_subidas_a_ficha on public.solicitudes_paciente;
create trigger pasar_subidas_a_ficha after update of resultado, trabajador_id on public.solicitudes_paciente
  for each row execute function public.al_aceptar_pasar_subidas();
drop trigger if exists pasar_subidas_a_ficha on public.trabajadores;
create trigger pasar_subidas_a_ficha after insert on public.trabajadores
  for each row execute function public.al_aceptar_pasar_subidas();

-- El archivo en la carpeta de la solicitud entra a la ficha que el servicio aceptó para esa solicitud (y a ninguna otra)
do $$
begin
  execute public.parche_unico(pg_get_functiondef('public.validar_adjunto()'::regprocedure),
    'if new.ruta not like new.org_id::text || ''/'' || new.trabajador_id::text || ''/%'' then',
    'if new.ruta not like new.org_id::text || ''/'' || new.trabajador_id::text || ''/%''
       and not exists (select 1 from public.subidas_paciente u join public.solicitudes_paciente s on s.id = u.solicitud_id
                        where u.ruta = new.ruta and s.org_id = new.org_id and s.trabajador_id = new.trabajador_id
                          and s.resultado = ''aceptada'' and new.ruta like s.org_id::text || ''/'' || s.id::text || ''/paciente-%'') then',
    '965 validar_adjunto');
end $$;

-- ===== Reservar: con ficha, en su carpeta; por revisar, en la de la solicitud =====
do $$
declare v_def text;
begin
  v_def := public.parche_unico(pg_get_functiondef('public.reservar_resultado_paciente(text,text)'::regprocedure),
    's := public.solicitud_para_resultados(p_token);', 's := public.solicitud_para_subir(p_token);', '965 reservar_resultado_paciente');
  v_def := public.parche_unico(v_def, 'v_ruta := s.org_id || ''/'' || s.trabajador_id || ''/paciente-''',
    'v_ruta := s.org_id || ''/'' || coalesce(s.trabajador_id, s.id) || ''/paciente-''', '965 reservar_resultado_paciente');
  v_def := public.parche_unico(v_def, 'Ya enviaste 15 archivos con este enlace. Si falta alguno, escríbele al servicio médico.',
    'Ya envió 15 archivos con este enlace. Si falta alguno, escríbale al servicio médico.', '965 reservar_resultado_paciente');
  execute public.parche_unico(v_def, 'Este enlace ya no recibe más archivos. Si falta alguno, escríbele al servicio médico.',
    'Este enlace ya no recibe más archivos. Si falta alguno, escríbale al servicio médico.', '965 reservar_resultado_paciente');
end $$;

-- ===== Confirmar: con ficha entra a la historia; por revisar queda guardado y se avisa para revisarlo =====
do $$
declare v_def text;
begin
  v_def := public.parche_unico(pg_get_functiondef('public.confirmar_resultado_paciente(text,text,text)'::regprocedure),
    's := public.solicitud_para_resultados(p_token);', 's := public.solicitud_para_subir(p_token);', '965 confirmar_resultado_paciente');
  v_def := public.parche_unico(v_def, '''No se encontró el archivo. Vuelve a intentarlo.''', '''No se encontró el archivo. Vuelva a intentarlo.''', '965 confirmar_resultado_paciente');
  v_def := public.parche_unico(v_def, '''El archivo no llegó. Revisa tu conexión y vuelve a intentarlo.''',
    '''El archivo no llegó. Revise su conexión y vuelva a intentarlo.''', '965 confirmar_resultado_paciente');
  v_def := public.parche_unico(v_def,
    'select nombres || '' '' || apellidos, empresa_id into v_paciente, v_empresa from public.trabajadores where id = s.trabajador_id;',
    'select nombres || '' '' || apellidos, empresa_id into v_paciente, v_empresa from public.trabajadores where id = s.trabajador_id;
  if v_paciente is null then
    v_paciente := nullif(btrim(coalesce(s.datos ->> ''nombres'', '''') || '' '' || coalesce(s.datos ->> ''apellidos'', '''')), '''');
    v_empresa := s.empresa_id;
  end if;', '965 confirmar_resultado_paciente');
  v_def := public.parche_unico(v_def,
    'insert into clinico.adjuntos (org_id, trabajador_id, consulta_id, nombre, ruta, tipo_mime, tamano, descripcion, subido_por)
  values (s.org_id, s.trabajador_id, null, v_nombre, p_ruta, v_mime, v_tamano, ''Enviado por el paciente con su enlace'', null);
  update public.subidas_paciente set confirmado_en = now() where ruta = p_ruta;',
    'update public.subidas_paciente set confirmado_en = now(), nombre = v_nombre, tipo_mime = v_mime, tamano = v_tamano where ruta = p_ruta;
  -- Con ficha en la nube entra ya a su historia; si no (por revisar o ficha aún en la PC), entra al aceptar
  perform public.pasar_subidas_a_ficha(s.id);', '965 confirmar_resultado_paciente');
  execute public.parche_unico(v_def,
    '''Resultados enviados por el paciente'', coalesce(v_paciente, ''Un paciente'') || '' subió sus resultados.'',
           ''/pacientes/'' || s.trabajador_id',
    '''Resultados enviados por el paciente'',
           coalesce(v_paciente, ''Un paciente'') || case when s.resultado = ''aceptada'' then '' subió sus resultados.''
             else '' (por revisar) subió sus resultados. Acéptalo para pasarlos a su ficha.'' end,
           case when s.resultado = ''aceptada'' then ''/pacientes/'' || s.trabajador_id else ''/atencion'' end',
    '965 confirmar_resultado_paciente');
end $$;

-- ===== Lo que ve el paciente: puede subir desde que envió sus datos; ve también lo que espera revisión =====
do $$
declare v_def text;
begin
  v_def := public.parche_unico(pg_get_functiondef('public.resultados_registro_paciente(text)'::regprocedure),
    's := public.solicitud_para_resultados(p_token);', 's := public.solicitud_para_subir(p_token);', '965 resultados_registro_paciente');
  execute public.parche_unico(v_def,
    'coalesce((select jsonb_agg(jsonb_build_object(''nombre'', a.nombre, ''subido'', u.confirmado_en) order by u.confirmado_en)
                            from public.subidas_paciente u join clinico.adjuntos a on a.ruta = u.ruta',
    'coalesce((select jsonb_agg(jsonb_build_object(''nombre'', coalesce(a.nombre, u.nombre, ''Resultado''), ''subido'', u.confirmado_en) order by u.confirmado_en)
                            from public.subidas_paciente u left join clinico.adjuntos a on a.ruta = u.ruta',
    '965 resultados_registro_paciente');
end $$;

drop function public.parche_unico(text, text, text, text);
