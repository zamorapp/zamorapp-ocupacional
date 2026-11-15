-- zamorApp Ocupacional · Identificación de riesgos por puesto y mapa de riesgos (Cesar, 06-nov-2026)
-- Una evaluación por empresa (o por área): qué procesos peligrosos hay en cada puesto, de qué grupo (físico, químico,
-- biológico, mecánico o de seguridad, disergonómico, psicosocial), cuántos expuestos, probabilidad × severidad (la
-- misma matriz 5×5 del puesto), controles existentes, medida recomendada, responsable y plazo; y el mapa de riesgos
-- (plano o croquis con un símbolo numerado por riesgo).
-- Base legal (verificada el 06-nov-2026): LOPCYMAT arts. 40, 53.1, 56.3 y 59; NT-04-2023 (Res. 648, G.O. 42.712 del
-- 12-09-2023) art. 14: identificación con participación de los trabajadores y del Comité, constancia en acta,
-- expuestos por área o zona, y cuándo se repite (lista «motivo_identificacion_riesgo», editable).
-- No guarda datos clínicos de ningún trabajador: la empresa (RR. HH.) lee las cerradas por una vista.
--   · tipo: 'general' (todas las áreas) u 'oficina' (áreas administrativas, con mediciones del ambiente)
--   · puestos: [{clave, puestoId, puesto, area, expuestos, respuestas: {pregunta: 1|0}, mediciones: {temp, lux,
--              ruido, humedad}}] los puestos que entran (paso 2) y la lista de chequeo de cada uno (paso 3)
--   · filas: [{id, puestoId, puesto, area, tarea, grupo, agente, fuente, efecto, expuestos, p, s, controles, medida,
--              tipoMedida, responsable, plazo}]
--   · mapa: {plano: ruta en el bucket «mapas-riesgo» (<org>/<evaluación>/<archivo>) o null, marcas: [{id,x,y,filaId}],
--            areas: [{id,x,y,texto}]} con x, y en % del plano
-- Cerrada = informe entregado: solo cambian las observaciones (y la marca de «aplicada a los puestos»); el
-- administrador o el gerente médico pueden reabrirla.

create table if not exists public.evaluaciones_riesgos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  tipo text not null default 'general' check (tipo in ('general', 'oficina')),
  fecha date not null default public.hoy_caracas(),
  motivo text check (length(motivo) <= 300),
  participantes text check (length(participantes) <= 2000),
  acta text check (length(acta) <= 300),
  puestos jsonb not null default '[]'::jsonb check (jsonb_typeof(puestos) = 'array' and jsonb_array_length(puestos) <= 150),
  filas jsonb not null default '[]'::jsonb check (jsonb_typeof(filas) = 'array' and jsonb_array_length(filas) <= 400),
  mapa jsonb not null default '{"plano": null, "marcas": [], "areas": []}'::jsonb check (jsonb_typeof(mapa) = 'object'),
  conclusion text check (length(conclusion) <= 4000),
  observaciones text check (length(observaciones) <= 4000),
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrada')),
  evaluado_por uuid references auth.users (id) on delete set null default auth.uid(),
  cerrada_en date,
  aplicada_en date,
  creado_en timestamptz not null default public.ahora(),
  actualizado_en timestamptz not null default public.ahora()
);
create index if not exists evaluaciones_riesgos_empresa_fecha on public.evaluaciones_riesgos (empresa_id, fecha desc);
create index if not exists evaluaciones_riesgos_org_fecha on public.evaluaciones_riesgos (org_id, fecha desc);

alter table public.evaluaciones_riesgos enable row level security;
-- Leer la tabla: el servicio en su alcance; recepción, solo cerradas. La empresa lee la vista de abajo.
drop policy if exists evaluaciones_riesgos_leer on public.evaluaciones_riesgos;
create policy evaluaciones_riesgos_leer on public.evaluaciones_riesgos for select using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,coordinador_sst}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,coordinador_sst}'))::text[])
  or (estado = 'cerrada' and (
        org_id = any ((select public.orgs_con('{recepcion}', p_sin_limite => true))::uuid[])
     or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{recepcion}'))::text[]))));
drop policy if exists evaluaciones_riesgos_editar on public.evaluaciones_riesgos;
create policy evaluaciones_riesgos_editar on public.evaluaciones_riesgos for all
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]))
  with check (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]));
grant select, insert, update, delete on public.evaluaciones_riesgos to authenticated;
revoke all on public.evaluaciones_riesgos from anon;

-- Lo que ve la empresa (RR. HH., supervisor, delegado, auditor): solo las cerradas de sus empresas, sin las
-- observaciones internas del servicio. La identificación de riesgos es del puesto, no de una persona: no lleva
-- datos de salud. Vista con permisos del dueño que filtra por el usuario; security_barrier evita que un filtro del
-- usuario se evalúe antes que el where.
create or replace view public.evaluaciones_riesgos_rrhh with (security_barrier = true) as
  select e.id, e.org_id, e.empresa_id, e.titulo, e.tipo, e.fecha, e.motivo, e.participantes, e.acta, e.puestos, e.filas, e.mapa,
         e.conclusion, e.evaluado_por, e.cerrada_en
  from public.evaluaciones_riesgos e
  where e.estado = 'cerrada'
    and (e.org_id = any ((select public.orgs_con('{gerente_empresa,supervisor,delegado_prevencion,auditor}', p_sin_limite => true))::uuid[])
      or (e.org_id::text || e.empresa_id::text) = any ((select public.pares_limitados('{gerente_empresa,supervisor,delegado_prevencion,auditor}'))::text[]));
revoke all on public.evaluaciones_riesgos_rrhh from public, anon;
grant select on public.evaluaciones_riesgos_rrhh to authenticated;

-- Reglas: la empresa es de la organización; quien evalúa es quien la crea y no cambia; cerrada = solo observaciones
-- y la fecha en que se aplicó a los puestos (o reabrir, sin tocar nada más, si es administrador o gerente médico);
-- una cerrada no se borra. Las filas que nombran un puesto deben ser puestos de la misma empresa.
create or replace function public.validar_evaluacion_riesgos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado = 'cerrada' then
      raise exception 'La evaluación ya está cerrada (informe entregado): no se puede borrar.' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.evaluado_por := auth.uid(); end if;
    new.cerrada_en := case when new.estado = 'cerrada' then public.hoy_caracas() end;
    new.aplicada_en := null;
  else
    new.evaluado_por := old.evaluado_por;
    new.creado_en := old.creado_en;
    if old.estado = 'cerrada' then
      if new.estado = 'borrador' then
        if auth.uid() is not null and public.mi_rol(old.org_id) not in ('administrador', 'gerente_medico') then
          raise exception 'Solo un administrador o el gerente médico pueden reabrir una evaluación cerrada.' using errcode = '42501';
        end if;
        new.cerrada_en := null;
      else
        new.cerrada_en := old.cerrada_en;
      end if;
      if (to_jsonb(new) - '{estado,observaciones,cerrada_en,aplicada_en,actualizado_en,version}'::text[])
         is distinct from (to_jsonb(old) - '{estado,observaciones,cerrada_en,aplicada_en,actualizado_en,version}'::text[]) then
        raise exception 'La evaluación ya está cerrada: solo se pueden cambiar las observaciones. Reábrela para corregirla.' using errcode = '42501';
      end if;
      -- La fecha de «aplicada a los puestos» la pone el servidor, nunca hacia atrás ni en el futuro
      if new.aplicada_en is distinct from old.aplicada_en and new.aplicada_en is not null then
        new.aplicada_en := public.hoy_caracas();
      end if;
    else
      new.aplicada_en := old.aplicada_en;
      if new.estado = 'cerrada' then
        new.cerrada_en := public.hoy_caracas();
      end if;
    end if;
  end if;
  if not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.org_id = new.org_id) then
    raise exception 'La empresa no es de esta organización.' using errcode = '23514';
  end if;
  if exists (
       select 1 from (select jsonb_array_elements(new.filas) union all select jsonb_array_elements(new.puestos)) x(f)
       where jsonb_typeof(f) <> 'object'
          or (f ->> 'puestoId') is not null and (
               (f ->> 'puestoId') !~ '^[0-9a-f-]{36}$'
            or not exists (select 1 from public.puestos p
                            where p.id = (f ->> 'puestoId')::uuid and p.org_id = new.org_id and p.empresa_id = new.empresa_id))) then
    raise exception 'Cada puesto de la evaluación debe ser de la misma empresa.' using errcode = '23514';
  end if;
  if new.mapa ? 'plano' and jsonb_typeof(new.mapa -> 'plano') = 'string'
     and (new.mapa ->> 'plano') not like new.org_id::text || '/' || new.id::text || '/%' then
    raise exception 'El plano debe ser de esta evaluación.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.validar_evaluacion_riesgos() from public, authenticated, anon;
drop trigger if exists validar_evaluacion_riesgos on public.evaluaciones_riesgos;
create trigger validar_evaluacion_riesgos before insert or update or delete on public.evaluaciones_riesgos
  for each row execute function public.validar_evaluacion_riesgos();

drop trigger if exists upd_evaluaciones_riesgos on public.evaluaciones_riesgos;
create trigger upd_evaluaciones_riesgos before update on public.evaluaciones_riesgos for each row execute function public.tocar_actualizado();
drop trigger if exists bit_evaluaciones_riesgos on public.evaluaciones_riesgos;
create trigger bit_evaluaciones_riesgos after insert or update or delete on public.evaluaciones_riesgos for each row execute function public.registrar_bitacora();

-- Plano del mapa de riesgos: bucket privado, solo JPG/PNG de hasta 10 MB (la app lo achica y le quita el EXIF).
-- Ver: quien puede leer la evaluación (el servicio) y, si está cerrada, la empresa de esa evaluación (el plano no
-- tiene datos de personas y el mapa es para publicarlo en el sitio de trabajo). Subir/borrar: quien puede editarla y
-- mientras sea borrador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mapas-riesgo', 'mapas-riesgo', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.evaluacion_riesgos_de_ruta(p_ruta text, p_editar boolean)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (
    select 1 from public.evaluaciones_riesgos e
    where array_length(string_to_array(p_ruta, '/'), 1) = 3
      and (string_to_array(p_ruta, '/'))[1] ~ '^[0-9a-f-]{36}$' and (string_to_array(p_ruta, '/'))[2] ~ '^[0-9a-f-]{36}$'
      and e.id = (string_to_array(p_ruta, '/'))[2]::uuid
      and e.org_id = (string_to_array(p_ruta, '/'))[1]::uuid
      and (not p_editar or (e.estado = 'borrador'
           and public.puede_ver_empresa(e.org_id, e.empresa_id)
           and public.mi_rol(e.org_id) in ('administrador', 'gerente_medico', 'medico', 'coordinador_sst'))))
  or (not p_editar and exists (
    select 1 from public.evaluaciones_riesgos_rrhh r
    where array_length(string_to_array(p_ruta, '/'), 1) = 3
      and (string_to_array(p_ruta, '/'))[2] ~ '^[0-9a-f-]{36}$'
      and r.id = (string_to_array(p_ruta, '/'))[2]::uuid
      and r.org_id::text = (string_to_array(p_ruta, '/'))[1]
      and r.mapa ->> 'plano' = p_ruta))
$$;
revoke execute on function public.evaluacion_riesgos_de_ruta(text, boolean) from public, anon;
grant execute on function public.evaluacion_riesgos_de_ruta(text, boolean) to authenticated;

drop policy if exists mapas_riesgo_leer on storage.objects;
drop policy if exists mapas_riesgo_subir on storage.objects;
drop policy if exists mapas_riesgo_borrar on storage.objects;
create policy mapas_riesgo_leer on storage.objects for select to authenticated
  using (bucket_id = 'mapas-riesgo' and public.evaluacion_riesgos_de_ruta(name, false));
create policy mapas_riesgo_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'mapas-riesgo' and public.evaluacion_riesgos_de_ruta(name, true));
create policy mapas_riesgo_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'mapas-riesgo' and public.evaluacion_riesgos_de_ruta(name, true));

-- Réplica en el programa de escritorio (la evaluación se escribe sin internet; el plano sube con internet)
insert into sync.tablas (nombre, clinica, subible) values ('public.evaluaciones_riesgos', false, true)
  on conflict (nombre) do nothing;
alter table public.evaluaciones_riesgos add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.evaluaciones_riesgos;
create trigger sync_version before insert or update on public.evaluaciones_riesgos for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.evaluaciones_riesgos;
create trigger sync_anotar after insert or update or delete on public.evaluaciones_riesgos for each row execute function sync.anotar();

-- Catálogos editables (Configuración › Listas). Solo en la nube: en la PC llegan por la réplica con sus ids.
-- A cada organización van SOLO los elementos que esta corrida agrega a la base (nunca copiar_listas_base, que
-- repondría lo que una organización borró). Si se vuelve a correr no agrega nada.
insert into public.listas (codigo, nombre, descripcion) values
  ('motivo_identificacion_riesgo', 'Motivos de identificación de riesgos', 'Cuándo se repite la identificación de procesos peligrosos (NT-04-2023, art. 14.2.4)'),
  ('pregunta_riesgo', 'Preguntas para identificar riesgos', 'Lista de chequeo por grupo de riesgo: cada «Sí» agrega el agente con su posible daño, la medida y la fuente'),
  ('pregunta_riesgo_oficina', 'Preguntas para evaluar oficinas', 'Lista de chequeo del puesto administrativo (pantalla, silla, mesa, ambiente, pausas)')
on conflict (codigo) do nothing;

create or replace function public.sembrar_identificacion_riesgos_2026()
returns void language plpgsql set search_path = public as $$
begin
  if public.es_base_local() then return; end if;
  with nuevos as (
    insert into public.lista_items (lista, grupo, nombre, texto, orden)
    select x.lista, x.grupo, x.nombre, x.texto, x.orden
    from (values
      ('motivo_identificacion_riesgo', null, 'Inicio del Programa de Seguridad y Salud en el Trabajo', null, 1),
      ('motivo_identificacion_riesgo', null, 'Nueva actividad productiva', null, 2),
      ('motivo_identificacion_riesgo', null, 'Proyecto de construcción, mantenimiento o reparación', null, 3),
      ('motivo_identificacion_riesgo', null, 'Cambio de equipos, sustancias o tecnología', null, 4),
      ('motivo_identificacion_riesgo', null, 'Cambio de instalaciones, organización o métodos de trabajo', null, 5),
      ('motivo_identificacion_riesgo', null, 'Daños a la salud de los trabajadores', null, 6),
      ('motivo_identificacion_riesgo', null, 'Prevención inadecuada o insuficiente', null, 7),
      ('motivo_identificacion_riesgo', null, 'Nuevos riesgos señalados por los trabajadores', null, 8),
      ('motivo_identificacion_riesgo', null, 'Solicitud de delegados, Comité o trabajadores', null, 9),
      ('motivo_identificacion_riesgo', null, 'Revisión periódica o indicación del INPSASEL', null, 10),
      -- Agentes mecánicos o de seguridad que faltaban para el mapa de riesgos
      ('agente_riesgo', 'mecanico', 'Orden y limpieza deficientes', null, 201),
      ('agente_riesgo', 'mecanico', 'Almacenamiento o apilamiento inadecuado', null, 202),
      ('agente_riesgo', 'mecanico', 'Trabajo en caliente (soldadura, corte)', null, 203),
      ('agente_riesgo', 'mecanico', 'Vehículos y montacargas en movimiento', null, 204),
      ('agente_riesgo', 'mecanico', 'Contacto eléctrico', null, 205),
      -- Lista de chequeo (Cesar, 06-nov: «que se contemplen todos los riesgos posibles»). «Sí» = el peligro está.
      ('pregunta_riesgo', 'fisico', '¿Trabaja al aire libre bajo el sol directo, sobre todo entre las 10 y las 16 horas?', E'Agente: Radiación no ionizante (sol, soldadura)\nDaño: Quemaduras, golpe de calor, cáncer de piel, daño ocular\nMedida: Toldos o sombra, horario rotativo, ropa manga larga, sombrero, lentes UV y protector solar\nFuente: OMS, Índice UV solar mundial (2002)', 1),
      ('pregunta_riesgo', 'fisico', '¿Hay calor intenso en el puesto (sol, hornos, calderas, techos de zinc, cocina)?', E'Agente: Calor\nDaño: Golpe de calor, agotamiento, deshidratación, calambres\nMedida: Medir el índice TGBH y comparar con COVENIN 2254; ventilación, pausas en sombra, aclimatación\nFuente: COVENIN 2254:1995 Calor y frío, límites de exposición', 2),
      ('pregunta_riesgo', 'fisico', '¿Los trabajadores sudan mucho o cambian la ropa empapada durante la jornada?', E'Agente: Calor\nDaño: Deshidratación, golpe de calor, lesiones de piel\nMedida: Pausas de recuperación, agua fresca a libre disposición, ropa transpirable\nFuente: NIOSH 2016-106, exposición ocupacional al calor', 3),
      ('pregunta_riesgo', 'fisico', '¿Falta agua potable fresca al alcance durante toda la jornada (a menos de 50 m)?', E'Agente: Calor\nDaño: Deshidratación, golpe de calor, cálculos renales\nMedida: Bebederos o termos con agua fresca cerca del puesto; tomar un vaso cada 15-20 minutos con calor\nFuente: NIOSH 2016-106, exposición ocupacional al calor', 4),
      ('pregunta_riesgo', 'fisico', '¿Hay frío intenso (cavas, cuartos refrigerados, aire acondicionado muy bajo)?', E'Agente: Frío\nDaño: Hipotermia, lesiones por frío, dolor articular\nMedida: Ropa térmica, tiempos máximos en cava, pausas en zona templada\nFuente: COVENIN 2254:1995 Calor y frío, límites de exposición', 5),
      ('pregunta_riesgo', 'fisico', '¿Hay que alzar la voz para hablar con alguien a un metro de distancia?', E'Agente: Ruido\nDaño: Hipoacusia, tinnitus, estrés, accidentes por no oír alarmas\nMedida: Medir el ruido (dosimetría), aislar la fuente, protectores auditivos, audiometrías\nFuente: COVENIN 1565:1995 Ruido ocupacional', 6),
      ('pregunta_riesgo', 'fisico', '¿Usan herramientas o máquinas que vibran (taladro, martillo, compactadora) o manejan vehículos pesados?', E'Agente: Vibración\nDaño: Síndrome de vibración mano-brazo, lumbalgia\nMedida: Herramientas antivibración, mantenimiento, rotación y límite de tiempo de uso\nFuente: ISO 5349-1:2001 e ISO 2631-1:1997', 7),
      ('pregunta_riesgo', 'fisico', '¿La luz es insuficiente, hay sombras o reflejos que obligan a forzar la vista?', E'Agente: Iluminación deficiente\nDaño: Fatiga visual, cefalea, accidentes\nMedida: Medir la iluminancia y ajustar a COVENIN 2249; luminarias y limpieza de lámparas\nFuente: COVENIN 2249:1993 Iluminancias en tareas y áreas de trabajo', 8),
      ('pregunta_riesgo', 'fisico', '¿El ambiente es húmedo, hay charcos o trabajo con agua de forma continua?', E'Agente: Humedad\nDaño: Micosis, dermatitis, resfriados, caídas\nMedida: Drenajes, botas y guantes impermeables, ropa seca de recambio\nFuente: NT-04-2023 art. 18 (agentes físicos)', 9),
      ('pregunta_riesgo', 'fisico', '¿Falta ventilación o el aire se siente pesado o encerrado?', E'Agente: Ventilación deficiente\nDaño: Cefalea, fatiga, acumulación de contaminantes\nMedida: Ventilación natural o extracción; medir CO2 o contaminantes si hay fuentes\nFuente: NT-04-2023 art. 18 (agentes físicos)', 10),
      ('pregunta_riesgo', 'fisico', '¿Hay soldadura, láser, luz ultravioleta o equipos de radiofrecuencia?', E'Agente: Radiación no ionizante (sol, soldadura)\nDaño: Quemaduras de córnea, lesiones de piel\nMedida: Careta y pantallas de soldar, señalización y distancia\nFuente: NT-04-2023 art. 18 (agentes físicos)', 11),
      ('pregunta_riesgo', 'fisico', '¿Hay rayos X, fuentes radiactivas o medidores nucleares?', E'Agente: Radiación ionizante\nDaño: Cáncer, lesiones por radiación\nMedida: Dosimetría personal, blindaje, autorización y vigilancia médica específica\nFuente: NT-04-2023 art. 18 (agentes físicos)', 12),
      ('pregunta_riesgo', 'quimico', '¿Hay polvo en el aire (cemento, harina, madera, granos, tierra, sílice)?', E'Agente: Polvos\nDaño: Asma, neumoconiosis, silicosis, alergias\nMedida: Humedecer, extracción localizada, mascarilla con filtro adecuado y espirometría\nFuente: COVENIN 2253:2001 Concentraciones ambientales permisibles', 13),
      ('pregunta_riesgo', 'quimico', '¿Manipulan sustancias químicas (solventes, pinturas, ácidos, álcalis, plaguicidas)?', E'Agente: Solventes\nDaño: Intoxicación, dermatitis, quemaduras químicas\nMedida: Hojas de seguridad visibles, sustitución por productos menos tóxicos, guantes y lentes\nFuente: COVENIN 2253:2001 Concentraciones ambientales permisibles', 14),
      ('pregunta_riesgo', 'quimico', '¿Hay olores fuertes, gases o vapores (combustibles, amoníaco, cloro)?', E'Agente: Gases y vapores\nDaño: Irritación, mareo, intoxicación, asfixia\nMedida: Ventilación o extracción, detectores de gases, respirador adecuado\nFuente: COVENIN 2253:2001 Concentraciones ambientales permisibles', 15),
      ('pregunta_riesgo', 'quimico', '¿Se suelda, se corta metal o se funde (humos metálicos)?', E'Agente: Humos metálicos\nDaño: Fiebre de los metales, daño pulmonar\nMedida: Extracción localizada en la soldadura y respirador para humos\nFuente: COVENIN 2253:2001 Concentraciones ambientales permisibles', 16),
      ('pregunta_riesgo', 'quimico', '¿Usan productos de limpieza o desinfección concentrados, o los mezclan?', E'Agente: Productos de limpieza y desinfección\nDaño: Irritación respiratoria y de piel, intoxicación por mezclas\nMedida: Prohibir mezclas, diluir según la etiqueta, guantes y lentes\nFuente: NT-04-2023 art. 18 (agentes químicos)', 17),
      ('pregunta_riesgo', 'quimico', '¿Los envases de sustancias están sin etiqueta o sin hoja de seguridad?', E'Agente: Productos de limpieza y desinfección\nDaño: Intoxicación por uso equivocado\nMedida: Etiquetar todo envase y tener la hoja de seguridad en español en el sitio\nFuente: LOPCYMAT art. 56.3 (informar los riesgos por escrito)', 18),
      ('pregunta_riesgo', 'quimico', '¿Se manipulan combustibles o hay riesgo de derrames?', E'Agente: Combustibles\nDaño: Intoxicación, dermatitis, incendio\nMedida: Bandejas antiderrame, kit de derrames, almacenamiento ventilado\nFuente: NT-04-2023 art. 18 (agentes químicos)', 19),
      ('pregunta_riesgo', 'quimico', '¿Se aplican plaguicidas o fumigación?', E'Agente: Plaguicidas\nDaño: Intoxicación aguda, daño neurológico\nMedida: Personal entrenado, equipo de protección completo, colinesterasa en la vigilancia\nFuente: NT-04-2023 art. 18 (agentes químicos)', 20),
      ('pregunta_riesgo', 'biologico', '¿Hay contacto con sangre, fluidos corporales o material cortopunzante usado?', E'Agente: Fluidos corporales\nDaño: Hepatitis B y C, VIH, infecciones\nMedida: Recipientes rígidos para cortopunzantes, guantes, vacuna de hepatitis B y protocolo de accidente\nFuente: NT-04-2023 art. 18 (agentes biológicos)', 21),
      ('pregunta_riesgo', 'biologico', '¿Se limpian baños, cloacas o se manejan desechos y basura?', E'Agente: Desechos orgánicos\nDaño: Infecciones gastrointestinales, leptospirosis, tétanos\nMedida: Guantes, botas, lavado de manos, vacuna antitetánica\nFuente: NT-04-2023 art. 18 (agentes biológicos)', 22),
      ('pregunta_riesgo', 'biologico', '¿Hay roedores, insectos, palomas o animales en el área?', E'Agente: Animales y vectores\nDaño: Leptospirosis, dengue, mordeduras, alergias\nMedida: Control de plagas, tapar entradas, almacenar alimentos cerrados\nFuente: NT-04-2023 art. 18 (agentes biológicos)', 23),
      ('pregunta_riesgo', 'biologico', '¿Atienden público o pacientes con posibles enfermedades contagiosas?', E'Agente: Virus\nDaño: Infecciones respiratorias, tuberculosis\nMedida: Ventilación, mascarilla cuando haga falta, vacunas al día\nFuente: NT-04-2023 art. 18 (agentes biológicos)', 24),
      ('pregunta_riesgo', 'biologico', '¿Hay agua estancada, moho o humedad en paredes?', E'Agente: Hongos\nDaño: Alergias, asma, micosis\nMedida: Reparar filtraciones, limpieza y ventilación\nFuente: NT-04-2023 art. 18 (agentes biológicos)', 25),
      ('pregunta_riesgo', 'mecanico', '¿Se trabaja a más de 1,8 m de altura (escaleras, techos, andamios)?', E'Agente: Caídas de altura\nDaño: Fracturas, trauma craneal, muerte\nMedida: Permiso de trabajo, arnés con línea de vida, barandas y andamios certificados\nFuente: LOPCYMAT art. 59; OSHA 1926.501 (referencia 1,8 m)', 26),
      ('pregunta_riesgo', 'mecanico', '¿Hay pisos resbaladizos, desniveles, huecos u obstáculos en el paso?', E'Agente: Caídas al mismo nivel\nDaño: Esguinces, fracturas, contusiones\nMedida: Orden y limpieza, señalizar desniveles, calzado antirresbalante\nFuente: COVENIN 187:2003 Señales de seguridad', 27),
      ('pregunta_riesgo', 'mecanico', '¿Hay máquinas con partes móviles (correas, engranajes, rodillos) sin protección?', E'Agente: Máquinas y herramientas en movimiento\nDaño: Atrapamiento, amputación\nMedida: Resguardos fijos, paro de emergencia, bloqueo y etiquetado en mantenimiento\nFuente: LOPCYMAT art. 59; NT-04-2023 art. 14.2.2', 28),
      ('pregunta_riesgo', 'mecanico', '¿Se usan cuchillos, sierras, vidrios o herramientas cortantes?', E'Agente: Cortes y pinchazos\nDaño: Heridas, lesiones de tendones\nMedida: Herramientas en buen estado, guantes anticorte, porta herramientas\nFuente: NT-04-2023 art. 14.2.2', 29),
      ('pregunta_riesgo', 'mecanico', '¿Pueden caer objetos desde estantes, andamios o cargas suspendidas?', E'Agente: Caída de objetos\nDaño: Trauma craneal, fracturas\nMedida: Casco, anclaje de estantes, carga máxima señalizada, zonas restringidas\nFuente: COVENIN 187:2003 Señales de seguridad', 30),
      ('pregunta_riesgo', 'mecanico', '¿Hay montacargas, camiones o vehículos circulando cerca de las personas?', E'Agente: Vehículos y montacargas en movimiento\nDaño: Atropellamiento, aplastamiento\nMedida: Separar el paso peatonal, alarma de retroceso, velocidad máxima, señalero\nFuente: LOPCYMAT art. 59; NT-04-2023 art. 14.2.2', 31),
      ('pregunta_riesgo', 'mecanico', '¿Hay cables pelados, tomas sobrecargadas o tableros eléctricos abiertos?', E'Agente: Contacto eléctrico\nDaño: Electrocución, quemaduras, incendio\nMedida: Revisión por electricista, tableros cerrados y rotulados, puesta a tierra\nFuente: COVENIN 200 Código Eléctrico Nacional', 32),
      ('pregunta_riesgo', 'mecanico', '¿Hay material inflamable, cilindros de gas o riesgo de incendio sin extintores cerca?', E'Agente: Incendio y explosión\nDaño: Quemaduras, intoxicación por humo, muerte\nMedida: Extintores vigentes y señalizados, almacenamiento separado, brigada y simulacros\nFuente: COVENIN 1040 Extintores portátiles', 33),
      ('pregunta_riesgo', 'mecanico', '¿Se entra a tanques, pozos, silos o lugares cerrados con poca ventilación?', E'Agente: Espacios confinados\nDaño: Asfixia, intoxicación, muerte\nMedida: Permiso de entrada, medición de gases antes de entrar, vigía y rescate\nFuente: NIOSH 80-106, trabajo en espacios confinados', 34),
      ('pregunta_riesgo', 'mecanico', '¿Se suelda o se corta con llama fuera de un taller preparado?', E'Agente: Trabajo en caliente (soldadura, corte)\nDaño: Quemaduras, incendio\nMedida: Permiso de trabajo en caliente, retirar inflamables, extintor y vigilante\nFuente: NT-04-2023 art. 14.2.2', 35),
      ('pregunta_riesgo', 'mecanico', '¿Hay superficies o equipos calientes al alcance de la mano?', E'Agente: Superficies calientes y quemaduras\nDaño: Quemaduras\nMedida: Aislar o proteger superficies, guantes térmicos, señalizar\nFuente: NT-04-2023 art. 14.2.2', 36),
      ('pregunta_riesgo', 'mecanico', '¿El área está desordenada, con material en pasillos o salidas obstruidas?', E'Agente: Orden y limpieza deficientes\nDaño: Caídas, golpes, evacuación difícil\nMedida: Programa de orden y limpieza (5S), salidas libres y señalizadas\nFuente: COVENIN 187:2003 Señales de seguridad', 37),
      ('pregunta_riesgo', 'mecanico', '¿El trabajo incluye conducir vehículos en la calle o carretera?', E'Agente: Accidente de tránsito\nDaño: Politraumatismo, muerte\nMedida: Manejo defensivo, revisión del vehículo, límites de horas al volante\nFuente: NT-04-2023 art. 14.2.2', 38),
      ('pregunta_riesgo', 'disergonomico', '¿Levantan o cargan pesos de más de 25 kg (hombres) o 15 kg (mujeres), o cargas pesadas muchas veces al día?', E'Agente: Levantamiento manual de cargas\nDaño: Lumbalgia, hernia discal\nMedida: Ayudas mecánicas, cargas más livianas, evaluar con NIOSH o DEB\nFuente: LOPCYMAT art. 59; ISO 11228-1', 39),
      ('pregunta_riesgo', 'disergonomico', '¿Empujan o arrastran carretillas, carros o cargas pesadas?', E'Agente: Empuje y arrastre\nDaño: Lumbalgia, lesiones de hombro\nMedida: Ruedas en buen estado, pisos lisos, evaluar con KIM\nFuente: ISO 11228-2', 40),
      ('pregunta_riesgo', 'disergonomico', '¿Repiten el mismo movimiento de manos o brazos muchas veces por minuto?', E'Agente: Movimientos repetitivos\nDaño: Tendinitis, túnel carpiano, epicondilitis\nMedida: Rotación de tareas, pausas, evaluar con OCRA\nFuente: ISO 11228-3', 41),
      ('pregunta_riesgo', 'disergonomico', '¿Trabajan con el tronco doblado o girado, los brazos por encima de los hombros o en cuclillas?', E'Agente: Posturas forzadas\nDaño: Lumbalgia, cervicalgia, lesiones de hombro\nMedida: Ajustar alturas de trabajo, evaluar con RULA o REBA\nFuente: LOPCYMAT art. 59; ISO 11226', 42),
      ('pregunta_riesgo', 'disergonomico', '¿Pasan más de 2 horas seguidas de pie sin poder sentarse?', E'Agente: Bipedestación prolongada\nDaño: Várices, dolor lumbar y de pies\nMedida: Alfombras antifatiga, apoyo isquiático, pausas sentados\nFuente: LOPCYMAT art. 59', 43),
      ('pregunta_riesgo', 'disergonomico', '¿Pasan sentados la mayor parte de la jornada?', E'Agente: Sedestación prolongada\nDaño: Lumbalgia, problemas circulatorios\nMedida: Silla ajustable, pausas activas cada hora\nFuente: LOPCYMAT art. 59', 44),
      ('pregunta_riesgo', 'disergonomico', '¿Usan computadora más de 4 horas al día?', E'Agente: Uso de pantallas\nDaño: Fatiga visual, cervicalgia, túnel carpiano\nMedida: Evaluación de oficina o ROSA, pausas visuales 20-20-20\nFuente: ROSA (Sonne 2012)', 45),
      ('pregunta_riesgo', 'psicosocial', '¿Hay metas o tiempos muy apretados que obligan a trabajar a prisa?', E'Agente: Ritmo acelerado o presión de tiempo\nDaño: Estrés, ansiedad, accidentes\nMedida: Planificar cargas, metas realistas, aplicar el cuestionario psicosocial\nFuente: LOPCYMAT art. 59; CoPsoQ-istas21', 46),
      ('pregunta_riesgo', 'disergonomico', '¿El puesto, la mesa o la máquina no se adapta a la estatura del trabajador?', E'Agente: Diseño inadecuado del puesto\nDaño: Posturas forzadas, dolor musculoesquelético\nMedida: Rediseño con medidas antropométricas, superficies regulables\nFuente: LOPCYMAT art. 59', 47),
      ('pregunta_riesgo', 'psicosocial', '¿Trabajan de noche, en turnos rotativos o jornadas de más de 8 horas?', E'Agente: Turnos nocturnos o rotativos\nDaño: Trastornos del sueño, gastritis, accidentes\nMedida: Rotación hacia adelante, descansos, vigilancia médica de trabajadores nocturnos\nFuente: LOPCYMAT art. 59', 48),
      ('pregunta_riesgo', 'psicosocial', '¿Hacen horas extra con frecuencia o se llevan trabajo a casa?', E'Agente: Jornadas extendidas\nDaño: Fatiga crónica, estrés, conflictos familiares\nMedida: Control de horas extra, distribución de cargas\nFuente: LOPCYMAT art. 59', 49),
      ('pregunta_riesgo', 'psicosocial', '¿El trabajo es monótono, siempre igual y sin poder decidir cómo hacerlo?', E'Agente: Trabajo monótono\nDaño: Desmotivación, fatiga, errores\nMedida: Rotación, enriquecimiento de tareas, participación en decisiones\nFuente: CoPsoQ-istas21 (control sobre el trabajo)', 50),
      ('pregunta_riesgo', 'psicosocial', '¿Atienden público o clientes, con quejas o maltrato frecuente?', E'Agente: Atención al público\nDaño: Estrés, agotamiento emocional\nMedida: Protocolos de atención, apoyo del supervisor, pausas\nFuente: CoPsoQ-istas21 (exigencias emocionales)', 51),
      ('pregunta_riesgo', 'psicosocial', '¿Han existido conflictos, gritos, humillaciones o acoso en el área?', E'Agente: Acoso laboral\nDaño: Ansiedad, depresión, ausentismo\nMedida: Canal de denuncia confidencial, investigación y medidas\nFuente: LOPCYMAT art. 56.5 y art. 59', 52),
      ('pregunta_riesgo', 'psicosocial', '¿Hay riesgo de robo, asalto o violencia de terceros (calle, caja, transporte de dinero)?', E'Agente: Violencia o inseguridad\nDaño: Lesiones, estrés postraumático\nMedida: Medidas de seguridad, protocolos ante asaltos, apoyo psicológico\nFuente: LOPCYMAT art. 59', 53),
      ('pregunta_riesgo', 'psicosocial', '¿Trabajan solos, sin nadie que pueda ayudar en una emergencia?', E'Agente: Trabajo aislado\nDaño: Demora en el auxilio, ansiedad\nMedida: Comunicación permanente (radio, teléfono), rondas o compañero\nFuente: NT-04-2023 art. 14.2.2', 54),
      ('pregunta_riesgo', 'psicosocial', '¿Un error en la tarea puede causar daños graves a personas o bienes?', E'Agente: Alta responsabilidad\nDaño: Estrés, ansiedad\nMedida: Procedimientos claros, capacitación, apoyo y pausas\nFuente: CoPsoQ-istas21 (exigencias cognitivas)', 55),
      ('pregunta_riesgo', 'psicosocial', '¿La tarea exige mucha concentración o memoria durante mucho tiempo?', E'Agente: Carga mental\nDaño: Fatiga mental, errores, cefalea\nMedida: Pausas, reducir interrupciones, organizar la información\nFuente: CoPsoQ-istas21 (exigencias cognitivas)', 56),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿El borde superior de la pantalla queda por encima o muy por debajo de la altura de los ojos?', E'Agente: Uso de pantallas\nDaño: Cervicalgia por flexión o extensión del cuello\nMedida: Borde superior a la altura de los ojos (unos 43-47 cm sobre la mesa); usar soporte de monitor\nFuente: Análisis ergonómico de oficinas (INVIN 2013); ROSA (Sonne 2012)', 1),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿La pantalla está a menos de 55 cm de los ojos o de lado, obligando a girar la cabeza?', E'Agente: Uso de pantallas\nDaño: Fatiga visual, cervicalgia, torsión de cuello\nMedida: Pantalla de frente, a más de 55 cm; giro de cabeza menor de 35°\nFuente: Análisis ergonómico de oficinas (INVIN 2013); ROSA (Sonne 2012)', 2),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Usan laptop sin soporte, teclado ni ratón externos?', E'Agente: Uso de pantallas\nDaño: Cervicalgia, dolor de muñecas\nMedida: Soporte para laptop, teclado y ratón externos\nFuente: ROSA (Sonne 2012)', 3),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Hay reflejos de ventanas o lámparas en la pantalla?', E'Agente: Esfuerzo visual\nDaño: Fatiga visual, cefalea\nMedida: Pantalla perpendicular a la ventana, persianas, luminarias con difusor\nFuente: COVENIN 2249:1993 Iluminancias en tareas y áreas de trabajo', 4),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Falta espacio (menos de 10 cm) entre el teclado y el borde de la mesa para apoyar muñecas y antebrazos?', E'Agente: Posturas forzadas\nDaño: Tendinitis, túnel carpiano\nMedida: Teclado a 10 cm del borde, apoyo de muñecas\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 5),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿El ratón queda lejos del teclado o hay que estirar el brazo para usarlo?', E'Agente: Posturas forzadas\nDaño: Dolor de hombro y muñeca\nMedida: Ratón al lado del teclado, a la altura del codo\nFuente: ROSA (Sonne 2012)', 6),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿La silla es fija, sin ruedas o con menos de 5 apoyos al piso?', E'Agente: Diseño inadecuado del puesto\nDaño: Torsión de tronco, lumbalgia\nMedida: Silla giratoria con 5 ruedas y base de más de 50 cm\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 7),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿La altura de la silla no se puede ajustar a la mesa (codos a la altura de la mesa)?', E'Agente: Diseño inadecuado del puesto\nDaño: Elevación de hombros, dolor cervical\nMedida: Silla regulable en altura; mesa a la altura del codo (72 ± 1,5 cm)\nFuente: Análisis ergonómico de oficinas (INVIN 2013); ROSA (Sonne 2012)', 8),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿El respaldo no da apoyo a la zona lumbar o no se puede ajustar?', E'Agente: Sedestación prolongada\nDaño: Lumbalgia\nMedida: Respaldo con apoyo lumbar regulable\nFuente: ROSA (Sonne 2012)', 9),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Los pies no apoyan completos en el piso?', E'Agente: Diseño inadecuado del puesto\nDaño: Compresión de muslos, mala circulación\nMedida: Reposapiés de 33 × 45 cm con inclinación de 10° a 25°\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 10),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿La mesa es pequeña (menos de 160 × 80 cm) o no caben pantalla, teclado y documentos?', E'Agente: Diseño inadecuado del puesto\nDaño: Posturas forzadas, desorden\nMedida: Mesa de 160 × 80 cm o más (180 × 80 recomendada)\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 11),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Falta espacio libre para las piernas debajo de la mesa (cajones, CPU, cajas)?', E'Agente: Diseño inadecuado del puesto\nDaño: Posturas forzadas, golpes en rodillas\nMedida: Espacio libre de 70 cm de ancho y 65 cm de alto como mínimo\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 12),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Teléfono, impresora o archivos quedan fuera del alcance y hay que estirarse o girar?', E'Agente: Posturas forzadas\nDaño: Dolor de hombro y espalda\nMedida: Reorganizar el puesto: lo más usado dentro del alcance del brazo\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 13),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Sostienen el teléfono entre el hombro y la oreja?', E'Agente: Posturas forzadas\nDaño: Cervicalgia\nMedida: Manos libres o auriculares\nFuente: ROSA (Sonne 2012)', 14),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Leen documentos en la mesa sin portadocumentos mientras escriben en la computadora?', E'Agente: Posturas forzadas\nDaño: Cervicalgia por flexión\nMedida: Portadocumentos al lado de la pantalla\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 15),
      ('pregunta_riesgo_oficina', 'disergonomico', '¿Trabajan más de 1 hora seguida en la computadora sin pausas?', E'Agente: Uso de pantallas\nDaño: Fatiga visual y muscular\nMedida: Pausas activas de 5 minutos cada hora; regla 20-20-20 para la vista\nFuente: ROSA (Sonne 2012)', 16),
      ('pregunta_riesgo_oficina', 'fisico', '¿La luz en la mesa se siente insuficiente (menos de 500 lux al medir)?', E'Agente: Iluminación deficiente\nDaño: Fatiga visual, cefalea\nMedida: Iluminancia de 500 a 800 lux en la mesa\nFuente: COVENIN 2249:1993 Iluminancias en tareas y áreas de trabajo', 17),
      ('pregunta_riesgo_oficina', 'fisico', '¿Hace calor o frío en la oficina (fuera de 17 a 26 °C)?', E'Agente: Calor\nDaño: Incomodidad térmica, fatiga\nMedida: Ajustar el aire acondicionado; temperatura entre 17 y 26 °C\nFuente: COVENIN 2254:1995 Calor y frío, límites de exposición', 18),
      ('pregunta_riesgo_oficina', 'fisico', '¿El aire está muy seco o muy húmedo (fuera de 30 a 60 %)?', E'Agente: Humedad\nDaño: Resequedad de ojos y mucosas, moho\nMedida: Humedad relativa entre 30 y 60 %\nFuente: RD 486/1997 Anexo III (referencia)', 19),
      ('pregunta_riesgo_oficina', 'fisico', '¿El ruido de equipos, calle o conversaciones impide concentrarse?', E'Agente: Ruido\nDaño: Estrés, fatiga, errores\nMedida: Separar equipos ruidosos, paneles, normas de convivencia\nFuente: COVENIN 1565:1995 Ruido ocupacional', 20),
      ('pregunta_riesgo_oficina', 'mecanico', '¿Hay cables sueltos en el piso, extensiones o tomas sobrecargadas?', E'Agente: Contacto eléctrico\nDaño: Caídas, electrocución, incendio\nMedida: Mesas electrificadas, canaletas, revisar tomas\nFuente: Análisis ergonómico de oficinas (INVIN 2013); COVENIN 200', 21),
      ('pregunta_riesgo_oficina', 'mecanico', '¿Hay archivos, cajas o equipos en el piso o en pasillos?', E'Agente: Orden y limpieza deficientes\nDaño: Caídas, golpes\nMedida: Orden y limpieza, archivadores, pasillos libres\nFuente: COVENIN 187:2003 Señales de seguridad', 22),
      ('pregunta_riesgo_oficina', 'mecanico', '¿Hay archivos o estantes altos sin anclar o cajas pesadas arriba?', E'Agente: Caída de objetos\nDaño: Golpes, trauma\nMedida: Anclar estantes, lo pesado abajo, escalera segura para alcanzar\nFuente: NT-04-2023 art. 14.2.2', 23),
      ('pregunta_riesgo_oficina', 'psicosocial', '¿Hay picos de trabajo (cierres, metas) con horas extra frecuentes?', E'Agente: Jornadas extendidas\nDaño: Estrés, fatiga crónica\nMedida: Planificar cierres, distribuir cargas, controlar horas extra\nFuente: Análisis ergonómico de oficinas (INVIN 2013); CoPsoQ-istas21', 24),
      ('pregunta_riesgo_oficina', 'psicosocial', '¿El trabajo exige alta concentración con interrupciones constantes?', E'Agente: Carga mental\nDaño: Fatiga mental, errores\nMedida: Bloques de trabajo sin interrupción, ordenar prioridades\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 25),
      ('pregunta_riesgo_oficina', 'psicosocial', '¿El sistema o los equipos son lentos y retrasan el trabajo que se exige?', E'Agente: Ritmo acelerado o presión de tiempo\nDaño: Estrés, frustración\nMedida: Mantenimiento o cambio de equipos y sistemas\nFuente: Análisis ergonómico de oficinas (INVIN 2013)', 26),
      ('pregunta_riesgo_oficina', 'psicosocial', '¿Atienden público en ventanilla o por teléfono con quejas frecuentes?', E'Agente: Atención al público\nDaño: Estrés, agotamiento emocional\nMedida: Protocolo de atención, pausas, apoyo del supervisor\nFuente: CoPsoQ-istas21 (exigencias emocionales)', 27)
    ) as x(lista, grupo, nombre, texto, orden)
    where not exists (select 1 from public.lista_items i
                       where i.lista = x.lista and i.org_id is null and lower(i.nombre) = lower(x.nombre))
    returning id, lista, codigo, nombre, grupo, texto, orden, activo, datos)
  insert into public.lista_items (lista, org_id, codigo, nombre, grupo, texto, orden, activo, datos, base_id)
  select n.lista, o.id, n.codigo, n.nombre, n.grupo, n.texto, n.orden, n.activo, n.datos, n.id
    from nuevos n cross join public.organizaciones o
   where not exists (select 1 from public.lista_items x where x.org_id = o.id and x.base_id = n.id)
     and not exists (select 1 from public.lista_items x where x.org_id = o.id and x.lista = n.lista and lower(x.nombre) = lower(n.nombre));
end $$;
revoke execute on function public.sembrar_identificacion_riesgos_2026() from public, anon, authenticated;
select public.sembrar_identificacion_riesgos_2026();
