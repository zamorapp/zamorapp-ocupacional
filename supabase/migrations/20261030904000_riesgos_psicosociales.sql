-- zamorApp Ocupacional · Evaluación de riesgos psicosociales (Cesar, «sí psicosocial», 05-nov-2026)
-- Método: CoPsoQ-istas21, VERSIÓN CORTA (ISTAS, marzo 2010; adaptación española del Cuestionario Psicosocial de
-- Copenhague, CoPsoQ © NRCWE). 38 preguntas en 6 apartados; cada apartado se suma y se compara con los tercios de la
-- población ocupada de referencia (verde / amarillo / rojo). Uso gratuito con las condiciones de su licencia:
--   1. finalidad preventiva;  2. participación (acuerdo con el Comité de Seguridad y Salud Laboral o los delegados de
--   prevención, LOPCYMAT arts. 41-46);  3. anonimato y confidencialidad;  4. no modificar el cuestionario;
--   5. acuerdo de implementación escrito. Además: no se cobra por el cuestionario en sí.
-- Cómo lo cumple la base:
--   · las respuestas NO guardan quién respondió, ni cuándo, ni desde dónde: solo el grupo (puesto o área) que el propio
--     trabajador elige, las 38 respuestas y los 6 puntajes. Nadie las lee una por una (ni el servicio): no hay política
--     de lectura; los resultados salen solo agregados por resultados_psicosociales(), que junta los grupos con menos de
--     «mínimo» respuestas en «Otros puestos» (y si aun así no llegan, no los muestra);
--   · cada trabajador recibe un código de un solo uso (papelito o WhatsApp) repartido al azar: el código no queda unido
--     a la respuesta;
--   · sin la fecha del acuerdo con el Comité no se generan códigos ni se cargan cuestionarios (condiciones 2 y 5);
--   · RR. HH., el supervisor, el delegado y el auditor de la empresa ven SOLO el informe agregado de las cerradas.
-- Tablas solo de la nube (no entran en sync.tablas): el trabajador responde desde su celular con internet; en el
-- escritorio, crear, cargar y ver resultados necesitan internet.

create table if not exists public.evaluaciones_psicosociales (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  titulo text not null check (length(titulo) between 3 and 160),
  metodo text not null default 'copsoq_istas21_corta' check (metodo in ('copsoq_istas21_corta')),
  -- Puestos o áreas que el trabajador elige al responder: [{id, nombre}]; acordados con el Comité
  grupos jsonb not null default '[]'::jsonb check (jsonb_typeof(grupos) = 'array' and jsonb_array_length(grupos) <= 40),
  minimo_grupo int not null default 5 check (minimo_grupo between 3 and 50),
  trabajadores int check (trabajadores between 1 and 100000),      -- plantilla a evaluar (para la participación)
  acuerdo_fecha date,                                               -- acuerdo con el Comité / delegados (licencia 2 y 5)
  acuerdo_nota text check (length(acuerdo_nota) <= 1000),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  inicio date not null default public.hoy_caracas(),
  cerrada_en date,
  conclusiones text check (length(conclusiones) <= 8000),
  -- Plan de medidas preventivas: [{id, apartado (1-6), medida, responsable, plazo}]
  medidas jsonb not null default '[]'::jsonb check (jsonb_typeof(medidas) = 'array' and jsonb_array_length(medidas) <= 60),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default public.ahora(),
  actualizado_en timestamptz not null default public.ahora()
);
create index if not exists evaluaciones_psicosociales_org on public.evaluaciones_psicosociales (org_id, inicio desc);
create index if not exists evaluaciones_psicosociales_empresa on public.evaluaciones_psicosociales (empresa_id, inicio desc);

alter table public.evaluaciones_psicosociales enable row level security;
drop policy if exists evaluaciones_psicosociales_leer on public.evaluaciones_psicosociales;
create policy evaluaciones_psicosociales_leer on public.evaluaciones_psicosociales for select using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,coordinador_sst}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,coordinador_sst}'))::text[]));
drop policy if exists evaluaciones_psicosociales_editar on public.evaluaciones_psicosociales;
create policy evaluaciones_psicosociales_editar on public.evaluaciones_psicosociales for all
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]))
  with check (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]));
grant select, insert, update, delete on public.evaluaciones_psicosociales to authenticated;
revoke all on public.evaluaciones_psicosociales from anon;

-- Códigos de un solo uso. Se guarda el código (para reimprimir los que falten) y si ya se usó; nunca a qué respuesta
-- corresponde. Los lee el servicio; nadie los escribe sino las funciones de abajo.
create table if not exists public.codigos_psicosociales (
  evaluacion_id uuid not null references public.evaluaciones_psicosociales (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[2-9A-HJKMNP-Z]{8}$'),
  usado boolean not null default false,
  primary key (evaluacion_id, codigo)
);
alter table public.codigos_psicosociales enable row level security;
drop policy if exists codigos_psicosociales_leer on public.codigos_psicosociales;
-- Lee los códigos quien lee la evaluación (el servicio en su alcance; la empresa no)
create policy codigos_psicosociales_leer on public.codigos_psicosociales for select using (
  exists (select 1 from public.evaluaciones_psicosociales e where e.id = evaluacion_id));
revoke all on public.codigos_psicosociales from anon, authenticated;
grant select on public.codigos_psicosociales to authenticated;

-- Respuestas anónimas: sin usuario, sin hora, sin código. Solo las escriben las funciones; nadie las lee directo.
-- respuestas = la opción marcada en cada pregunta, 0 = primera (Siempre / Muy preocupado / Soy el principal…) a
-- 4 = última (Nunca / Nada preocupado / Ninguna); puntajes = los 6 apartados ya sumados con la corrección del método.
create table if not exists public.respuestas_psicosociales (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.evaluaciones_psicosociales (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  grupo text check (length(grupo) <= 12),
  respuestas smallint[] not null check (cardinality(respuestas) = 38 and 0 <= all (respuestas) and 4 >= all (respuestas)),
  puntajes smallint[] not null check (cardinality(puntajes) = 6),
  origen text not null check (origen in ('enlace', 'papel'))
);
create index if not exists respuestas_psicosociales_eval on public.respuestas_psicosociales (evaluacion_id);
alter table public.respuestas_psicosociales enable row level security;
revoke all on public.respuestas_psicosociales from anon, authenticated;

-- Corrección de la versión corta (manual ISTAS 2010): código = 4 − opción, salvo las preguntas 3, 27 y 37, que van al
-- revés (código = opción). Apartados: 1-6, 7-16, 17-20, 21-30, 31-34, 35-38.
create or replace function public.puntajes_istas21_corta(p smallint[])
returns smallint[] language sql immutable set search_path = public as $$
  select array[
    (select sum(case when i = 3 then p[i] else 4 - p[i] end) from generate_series(1, 6) i),
    (select sum(4 - p[i]) from generate_series(7, 16) i),
    (select sum(4 - p[i]) from generate_series(17, 20) i),
    (select sum(case when i = 27 then p[i] else 4 - p[i] end) from generate_series(21, 30) i),
    (select sum(4 - p[i]) from generate_series(31, 34) i),
    (select sum(case when i = 37 then p[i] else 4 - p[i] end) from generate_series(35, 38) i)
  ]::smallint[]
$$;
-- 0 verde, 1 amarillo, 2 rojo, con los intervalos de la población ocupada de referencia (tabla del manual)
create or replace function public.nivel_istas21_corta(p_apartado int, p_puntaje int)
returns int language sql immutable set search_path = public as $$
  select case p_apartado
    when 1 then case when p_puntaje <= 7 then 0 when p_puntaje <= 11 then 1 else 2 end
    when 2 then case when p_puntaje >= 26 then 0 when p_puntaje >= 19 then 1 else 2 end
    when 3 then case when p_puntaje <= 4 then 0 when p_puntaje <= 9 then 1 else 2 end
    when 4 then case when p_puntaje >= 32 then 0 when p_puntaje >= 25 then 1 else 2 end
    when 5 then case when p_puntaje <= 2 then 0 when p_puntaje <= 6 then 1 else 2 end
    when 6 then case when p_puntaje >= 13 then 0 when p_puntaje >= 10 then 1 else 2 end
  end
$$;
revoke execute on function public.puntajes_istas21_corta(smallint[]) from public, anon;
revoke execute on function public.nivel_istas21_corta(int, int) from public, anon;
grant execute on function public.puntajes_istas21_corta(smallint[]) to authenticated;
grant execute on function public.nivel_istas21_corta(int, int) to authenticated;

create or replace function public.preparar_respuesta_psicosocial()
returns trigger language plpgsql set search_path = public as $$
begin
  new.puntajes := public.puntajes_istas21_corta(new.respuestas);
  return new;
end $$;
drop trigger if exists preparar_respuesta_psicosocial on public.respuestas_psicosociales;
create trigger preparar_respuesta_psicosocial before insert or update on public.respuestas_psicosociales
  for each row execute function public.preparar_respuesta_psicosocial();

-- Reglas de la evaluación: empresa de la misma organización; quien la crea no cambia; grupos con id corto y nombre;
-- cerrada = solo se reabre (administrador o gerente médico, y sin respuestas) o se cambian conclusiones y medidas; con respuestas no se
-- borra (se cierra).
create or replace function public.validar_evaluacion_psicosocial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.respuestas_psicosociales r where r.evaluacion_id = old.id) then
      raise exception 'Esta evaluación ya tiene cuestionarios respondidos: no se borra. Ciérrala.' using errcode = '42501';
    end if;
    return old;
  end if;
  if not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.org_id = new.org_id) then
    raise exception 'La empresa no es de esta organización.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(new.grupos) g
              where jsonb_typeof(g) <> 'object' or coalesce(g->>'id', '') !~ '^[a-z0-9]{1,12}$'
                 or length(btrim(coalesce(g->>'nombre', ''))) not between 1 and 120) then
    raise exception 'Cada puesto o área necesita un nombre (hasta 120 letras).' using errcode = '23514';
  end if;
  if (select count(distinct g->>'id') from jsonb_array_elements(new.grupos) g) <> jsonb_array_length(new.grupos) then
    raise exception 'Hay puestos o áreas repetidos.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.creado_por := auth.uid(); end if;
    new.creado_en := now();
    new.estado := 'abierta'; new.cerrada_en := null;
    return new;
  end if;
  new.creado_por := old.creado_por; new.creado_en := old.creado_en;
  new.org_id := old.org_id; new.empresa_id := old.empresa_id; new.metodo := old.metodo;
  -- Un grupo con respuestas no se quita (sus respuestas quedarían sin puesto)
  if exists (select 1 from public.respuestas_psicosociales r where r.evaluacion_id = old.id and r.grupo is not null
               and not exists (select 1 from jsonb_array_elements(new.grupos) g where g->>'id' = r.grupo)) then
    raise exception 'Ese puesto o área ya tiene cuestionarios respondidos: no se puede quitar (sí cambiarle el nombre).' using errcode = '23514';
  end if;
  if old.estado = 'cerrada' then
    if new.estado = 'abierta' then
      if auth.uid() is not null and public.mi_rol(old.org_id) not in ('administrador', 'gerente_medico') then
        raise exception 'Solo un administrador o el gerente médico pueden reabrir una evaluación cerrada.' using errcode = '42501';
      end if;
      -- Con respuestas no se reabre: comparar el informe de antes y el de después revelaría a quien respondió en medio
      if exists (select 1 from public.respuestas_psicosociales r where r.evaluacion_id = old.id) then
        raise exception 'Esta evaluación ya tiene cuestionarios respondidos: no se reabre (protege el anonimato). Para más respuestas, crea una evaluación nueva.' using errcode = '23514';
      end if;
      new.cerrada_en := null;
    else
      new.cerrada_en := old.cerrada_en;
      if (to_jsonb(new) - '{conclusiones,medidas,actualizado_en}'::text[]) is distinct from (to_jsonb(old) - '{conclusiones,medidas,actualizado_en}'::text[]) then
        raise exception 'La evaluación está cerrada: solo cambian las conclusiones y las medidas. Reábrela para corregir lo demás.' using errcode = '42501';
      end if;
    end if;
  elsif new.estado = 'cerrada' then
    new.cerrada_en := public.hoy_caracas();
  end if;
  return new;
end $$;
revoke execute on function public.validar_evaluacion_psicosocial() from public, authenticated, anon;
drop trigger if exists validar_evaluacion_psicosocial on public.evaluaciones_psicosociales;
create trigger validar_evaluacion_psicosocial before insert or update or delete on public.evaluaciones_psicosociales
  for each row execute function public.validar_evaluacion_psicosocial();
drop trigger if exists upd_evaluaciones_psicosociales on public.evaluaciones_psicosociales;
create trigger upd_evaluaciones_psicosociales before update on public.evaluaciones_psicosociales for each row execute function public.tocar_actualizado();
-- La evaluación no tiene datos personales: va a la bitácora general. Las respuestas, NO (serían un rastro con hora).
drop trigger if exists bit_evaluaciones_psicosociales on public.evaluaciones_psicosociales;
create trigger bit_evaluaciones_psicosociales after insert or update or delete on public.evaluaciones_psicosociales for each row execute function public.registrar_bitacora();

-- ¿Quien llama puede manejar esta evaluación? (servicio con alcance sobre la empresa)
create or replace function public.maneja_evaluacion_psicosocial(p_id uuid)
returns public.evaluaciones_psicosociales language sql stable security definer set search_path = public as $$
  select e.* from public.evaluaciones_psicosociales e
   where e.id = p_id and public.puede_ver_empresa(e.org_id, e.empresa_id)
     and public.mi_rol(e.org_id) in ('administrador', 'gerente_medico', 'medico', 'coordinador_sst')
$$;
revoke execute on function public.maneja_evaluacion_psicosocial(uuid) from public, anon, authenticated;

-- Genera p_cantidad códigos nuevos (máx. 500 por vez y 3000 por evaluación). Exige el acuerdo con el Comité.
create or replace function public.generar_codigos_psicosociales(p_evaluacion uuid, p_cantidad int)
returns int language plpgsql security definer set search_path = public as $$
declare
  e public.evaluaciones_psicosociales;
  letras constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  hechos int := 0; c text; b bytea; intentos int := 0;
begin
  e := public.maneja_evaluacion_psicosocial(p_evaluacion);
  if e.id is null then raise exception 'No tienes permiso sobre esta evaluación.' using errcode = '42501'; end if;
  if e.estado <> 'abierta' then raise exception 'La evaluación está cerrada.' using errcode = '42501'; end if;
  if e.acuerdo_fecha is null then
    raise exception 'Primero anota la fecha del acuerdo con el Comité de Seguridad y Salud Laboral (condición de la licencia del método).' using errcode = '23514';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 500 then raise exception 'Entre 1 y 500 códigos por vez.' using errcode = '22023'; end if;
  if (select count(*) from public.codigos_psicosociales where evaluacion_id = e.id) + p_cantidad > 3000 then
    raise exception 'Máximo 3000 códigos por evaluación.' using errcode = '22023';
  end if;
  while hechos < p_cantidad and intentos < p_cantidad * 5 loop
    intentos := intentos + 1;
    b := uuid_send(gen_random_uuid());  -- 16 bytes al azar (sin pgcrypto: en Supabase vive en otro esquema)
    c := '';
    for i in 0..7 loop c := c || substr(letras, ((get_byte(b, i) * 256 + get_byte(b, i + 8)) % 31) + 1, 1); end loop;
    insert into public.codigos_psicosociales (evaluacion_id, org_id, codigo) values (e.id, e.org_id, c) on conflict do nothing;
    if found then hechos := hechos + 1; end if;
  end loop;
  return hechos;
end $$;
revoke execute on function public.generar_codigos_psicosociales(uuid, int) from public, anon;
grant execute on function public.generar_codigos_psicosociales(uuid, int) to authenticated;

-- Valida y guarda un cuestionario (lo usan las dos puertas de entrada). Devuelve null si está bien o el problema.
create or replace function public.guardar_respuesta_psicosocial(e public.evaluaciones_psicosociales, p_grupo text, p_respuestas int[], p_origen text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if p_respuestas is null or cardinality(p_respuestas) <> 38 or array_position(p_respuestas, null) is not null
     or not (0 <= all (p_respuestas) and 4 >= all (p_respuestas)) then
    return 'Faltan respuestas: contesta las 38 preguntas.';
  end if;
  if jsonb_array_length(e.grupos) > 0 and (p_grupo is null or not exists (select 1 from jsonb_array_elements(e.grupos) g where g->>'id' = p_grupo)) then
    return 'Elige tu puesto o área.';
  end if;
  insert into public.respuestas_psicosociales (evaluacion_id, org_id, grupo, respuestas, puntajes, origen)
  values (e.id, e.org_id, case when jsonb_array_length(e.grupos) > 0 then p_grupo end, p_respuestas::smallint[], '{0,0,0,0,0,0}', p_origen);
  return null;
end $$;
revoke execute on function public.guardar_respuesta_psicosocial(public.evaluaciones_psicosociales, text, int[], text) from public, anon, authenticated;

-- Cargar un cuestionario respondido en papel (lo transcribe el servicio). Exige el acuerdo y la evaluación abierta.
create or replace function public.cargar_respuesta_psicosocial(p_evaluacion uuid, p_grupo text, p_respuestas int[])
returns text language plpgsql security definer set search_path = public as $$
declare e public.evaluaciones_psicosociales; problema text;
begin
  e := public.maneja_evaluacion_psicosocial(p_evaluacion);
  if e.id is null then raise exception 'No tienes permiso sobre esta evaluación.' using errcode = '42501'; end if;
  if e.estado <> 'abierta' then return 'La evaluación está cerrada.'; end if;
  if e.acuerdo_fecha is null then return 'Primero anota la fecha del acuerdo con el Comité.'; end if;
  problema := public.guardar_respuesta_psicosocial(e, p_grupo, p_respuestas, 'papel');
  return coalesce(problema, 'ok');
end $$;
revoke execute on function public.cargar_respuesta_psicosocial(uuid, text, int[]) from public, anon;
grant execute on function public.cargar_respuesta_psicosocial(uuid, text, int[]) to authenticated;

-- Lo que ve el trabajador al abrir su código (sin sesión). estado: vigente | usado | cerrado; sin fila = no existe.
create or replace function public.ver_cuestionario_psicosocial(p_codigo text)
returns table (estado text, servicio text, empresa text, grupos jsonb)
language plpgsql security definer set search_path = public as $$
declare k public.codigos_psicosociales; e public.evaluaciones_psicosociales;
begin
  if p_codigo is null or upper(p_codigo) !~ '^[2-9A-HJKMNP-Z]{8}$' then return; end if;
  select * into k from public.codigos_psicosociales where codigo = upper(p_codigo);
  if k.codigo is null then return; end if;
  select * into e from public.evaluaciones_psicosociales where id = k.evaluacion_id;
  return query
    select case when e.estado <> 'abierta' then 'cerrado' when k.usado then 'usado' else 'vigente' end,
           o.nombre,
           (select coalesce(m.nombre_comercial, m.razon_social) from public.empresas m where m.id = e.empresa_id),
           case when e.estado = 'abierta' and not k.usado then
             (select coalesce(jsonb_agg(jsonb_build_object('id', g->>'id', 'nombre', g->>'nombre') order by g->>'nombre'), '[]'::jsonb)
                from jsonb_array_elements(e.grupos) g) end
      from public.organizaciones o where o.id = e.org_id;
end $$;
revoke execute on function public.ver_cuestionario_psicosocial(text) from public;
-- Pública a propósito: el código de un solo uso es la llave; está en la línea base del guardián
grant execute on function public.ver_cuestionario_psicosocial(text) to anon, authenticated;

-- El trabajador envía su cuestionario (sin sesión). Gasta el código y guarda la respuesta SIN unirla al código.
create or replace function public.enviar_cuestionario_psicosocial(p_codigo text, p_grupo text, p_respuestas int[])
returns text language plpgsql security definer set search_path = public as $$
declare k public.codigos_psicosociales; e public.evaluaciones_psicosociales; problema text;
begin
  if p_codigo is null or upper(p_codigo) !~ '^[2-9A-HJKMNP-Z]{8}$' then return 'Código no válido.'; end if;
  select * into k from public.codigos_psicosociales where codigo = upper(p_codigo) for update;
  if k.codigo is null then return 'Código no válido.'; end if;
  if k.usado then return 'Este código ya se usó. Cada código sirve una sola vez.'; end if;
  select * into e from public.evaluaciones_psicosociales where id = k.evaluacion_id;
  if e.estado <> 'abierta' then return 'Esta evaluación ya cerró.'; end if;
  problema := public.guardar_respuesta_psicosocial(e, p_grupo, p_respuestas, 'enlace');
  if problema is not null then return problema; end if;
  update public.codigos_psicosociales set usado = true where codigo = k.codigo;
  return 'ok';
end $$;
revoke execute on function public.enviar_cuestionario_psicosocial(text, text, int[]) from public;
-- Pública a propósito: el código de un solo uso es la llave; está en la línea base del guardián
grant execute on function public.enviar_cuestionario_psicosocial(text, text, int[]) to anon, authenticated;

-- Resultados AGREGADOS (lo único que existe para leer). El servicio los ve siempre; la empresa (RR. HH., supervisor,
-- delegado, auditor) solo de las cerradas de sus empresas. Nunca una respuesta individual:
--   · con menos de «mínimo» respuestas en total no hay resultados;
--   · cada puesto con menos de «mínimo» se junta en «Otros puestos»; si esa suma tampoco llega, no se muestra
--     (sus respuestas cuentan solo en el total).
-- Por apartado: cuántos en verde / amarillo / rojo y el puntaje medio.
-- Resultados agregados. Dos candados más (Analizar, 05-nov):
--   · Con la evaluación ABIERTA nadie ve niveles, solo la participación: si el servicio viera las cifras después de
--     cada respuesta, comparando dos lecturas sabría qué contestó quien acaba de responder.
--   · Nada se despeja restando: si los grupos pequeños juntos («Otros puestos») no llegan al mínimo, se les suman
--     los grupos visibles más chicos hasta llegar; si al final solo queda «Otros», no se muestran grupos. Así, total
--     = suma de los grupos que se ven, y total − grupos nunca revela a nadie.
create or replace function public.resultados_psicosociales(p_evaluacion uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.evaluaciones_psicosociales; total int; usados int; codigos int; rol public.rol_usuario;
        a_otros text[] := '{}'; n_otros int; f record; con_grupos boolean;
begin
  select * into e from public.evaluaciones_psicosociales where id = p_evaluacion;
  if e.id is null or not public.puede_ver_empresa(e.org_id, e.empresa_id) then return null; end if;
  rol := public.mi_rol(e.org_id);
  if rol is null then return null; end if;
  if rol not in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'coordinador_sst') then
    if rol not in ('gerente_empresa', 'supervisor', 'delegado_prevencion', 'auditor') or e.estado <> 'cerrada' then return null; end if;
  end if;
  select count(*) into total from public.respuestas_psicosociales where evaluacion_id = e.id;
  select count(*), count(*) filter (where usado) into codigos, usados from public.codigos_psicosociales where evaluacion_id = e.id;
  if e.estado <> 'cerrada' or total < e.minimo_grupo then
    return jsonb_build_object('total', total, 'codigos', codigos, 'usados', usados, 'minimo', e.minimo_grupo,
                              'suficiente', false, 'abierta', e.estado <> 'cerrada');
  end if;
  -- Cuántos caen en «Otros» (sin puesto o de grupos con menos del mínimo); si no llegan, se les suman los más chicos
  select total - coalesce(sum(x.n), 0) into n_otros
    from (select count(*) as n from public.respuestas_psicosociales
           where evaluacion_id = e.id and grupo is not null group by grupo having count(*) >= e.minimo_grupo) x;
  if n_otros between 1 and e.minimo_grupo - 1 then
    for f in select grupo, count(*) as n from public.respuestas_psicosociales
              where evaluacion_id = e.id and grupo is not null group by grupo having count(*) >= e.minimo_grupo
              order by count(*), grupo loop
      a_otros := a_otros || f.grupo;
      n_otros := n_otros + f.n;
      exit when n_otros >= e.minimo_grupo;
    end loop;
  end if;
  return (
    with r as (
      select coalesce(r.grupo, '') as g, r.puntajes from public.respuestas_psicosociales r where r.evaluacion_id = e.id
    ), n_g as (
      select g, count(*) as n from r group by g
    ), r2 as (
      -- grupo visible: el suyo si tiene el mínimo y no se fue a completar «Otros»; si no, «Otros»
      select case when n.n >= e.minimo_grupo and r.g <> '' and not (r.g = any (a_otros)) then r.g else '_otros' end as g, r.puntajes
        from r join n_g n using (g)
    ), visibles as (
      select g, count(*) as n from r2 group by g having count(*) >= e.minimo_grupo
    ), mostrar as (
      -- con un solo grupo «Otros» que es toda la empresa no hay nada que mostrar por grupo
      select v.* from visibles v
       where jsonb_array_length(e.grupos) > 0 and exists (select 1 from visibles w where w.g <> '_otros')
    ), dims as (
      select r2.g, a as apartado,
             count(*) filter (where public.nivel_istas21_corta(a, r2.puntajes[a]) = 0) as verde,
             count(*) filter (where public.nivel_istas21_corta(a, r2.puntajes[a]) = 1) as amarillo,
             count(*) filter (where public.nivel_istas21_corta(a, r2.puntajes[a]) = 2) as rojo,
             round(avg(r2.puntajes[a]), 1) as media
        from r2 join mostrar v using (g) cross join generate_series(1, 6) a
       group by r2.g, a
    ), todos as (
      select a as apartado,
             count(*) filter (where public.nivel_istas21_corta(a, r.puntajes[a]) = 0) as verde,
             count(*) filter (where public.nivel_istas21_corta(a, r.puntajes[a]) = 1) as amarillo,
             count(*) filter (where public.nivel_istas21_corta(a, r.puntajes[a]) = 2) as rojo,
             round(avg(r.puntajes[a]), 1) as media
        from r cross join generate_series(1, 6) a group by a
    )
    select jsonb_build_object(
      'total', total, 'codigos', codigos, 'usados', usados, 'minimo', e.minimo_grupo, 'suficiente', true, 'abierta', false,
      'sin_grupo', case when jsonb_array_length(e.grupos) = 0 then 0 else total - coalesce((select sum(n) from mostrar), 0) end,
      'dimensiones', (select jsonb_agg(jsonb_build_object('apartado', apartado, 'verde', verde, 'amarillo', amarillo, 'rojo', rojo, 'media', media) order by apartado) from todos),
      'grupos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', v.g,
                 'nombre', case when v.g = '_otros' then 'Otros puestos (grupos pequeños juntos)'
                                else (select x->>'nombre' from jsonb_array_elements(e.grupos) x where x->>'id' = v.g) end,
                 'n', v.n,
                 'dimensiones', (select jsonb_agg(jsonb_build_object('apartado', d.apartado, 'verde', d.verde, 'amarillo', d.amarillo, 'rojo', d.rojo, 'media', d.media) order by d.apartado)
                                   from dims d where d.g = v.g))
               order by (v.g = '_otros'), v.n desc)
          from mostrar v), '[]'::jsonb))
  );
end $$;
revoke execute on function public.resultados_psicosociales(uuid) from public, anon;
grant execute on function public.resultados_psicosociales(uuid) to authenticated;

-- Lista para la empresa (RR. HH., supervisor, delegado, auditor): solo las cerradas de sus empresas, sin códigos ni
-- respuestas. El servicio usa la tabla.
create or replace view public.evaluaciones_psicosociales_rrhh with (security_barrier = true) as
  select e.id, e.org_id, e.empresa_id, e.titulo, e.metodo, e.inicio, e.cerrada_en, e.trabajadores, e.acuerdo_fecha,
         e.conclusiones, e.medidas, e.creado_por
  from public.evaluaciones_psicosociales e
  where e.estado = 'cerrada'
    and (e.org_id = any ((select public.orgs_con('{gerente_empresa,supervisor,delegado_prevencion,auditor}', p_sin_limite => true))::uuid[])
      or (e.org_id::text || e.empresa_id::text) = any ((select public.pares_limitados('{gerente_empresa,supervisor,delegado_prevencion,auditor}'))::text[]));
revoke all on public.evaluaciones_psicosociales_rrhh from public, anon;
grant select on public.evaluaciones_psicosociales_rrhh to authenticated;
