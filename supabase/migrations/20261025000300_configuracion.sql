-- zamorApp Ocupacional · Configuración editable
-- 1) Más listas (maestros) para la consulta médica.
-- 2) Cada organización recibe su propia copia de las listas base y las edita a su gusto.
-- 3) Ajustes de la organización (documentos, palabra de aptitud…) en un jsonb.
-- 4) Alta de usuarios por correo con su rol.

-- ─── 1. Listas nuevas ───────────────────────────────────────
insert into public.listas (codigo, nombre, descripcion) values
  ('turno', 'Turnos de trabajo', null),
  ('causa_reposo', 'Causas de reposo y permiso', 'Clasificación del reposo para ausentismo'),
  ('resultado_reubicacion', 'Resultados de reubicación', null),
  ('recomendacion_aptitud', 'Recomendaciones de aptitud', 'Por motivo de consulta'),
  ('antecedente_medico', 'Antecedentes médicos', null),
  ('habito', 'Hábitos', 'Se registran en cada consulta'),
  ('examen_funcional', 'Examen funcional', 'Plantilla precargada; valor por defecto en Texto'),
  ('examen_fisico', 'Examen físico', 'Plantilla precargada; valor por defecto en Texto'),
  ('paraclinico', 'Exámenes paraclínicos', 'Agrupados por perfil (Grupo)'),
  ('medicina', 'Medicinas (vademécum)', 'Por principio activo (DCI), Res. MPPS 028'),
  ('presentacion_medicina', 'Presentaciones de medicina', null),
  ('via_administracion', 'Vías de administración', null),
  ('frecuencia_dosis', 'Frecuencias de dosis', null),
  ('duracion_tratamiento', 'Duraciones de tratamiento', null),
  ('especialidad', 'Especialidades médicas', 'Para interconsultas y referencias'),
  ('sistema_organico', 'Aparatos y sistemas', 'Agrupa la morbilidad del informe trimestral')
on conflict (codigo) do nothing;

insert into public.lista_items (lista, codigo, nombre, grupo, texto, orden) values
  ('turno', 'D', 'Diurno', null, null, 1), ('turno', 'N', 'Nocturno', null, null, 2), ('turno', 'M', 'Mixto', null, null, 3), ('turno', 'R', 'Rotativo', null, null, 4),

  ('causa_reposo', 'enfermedad_comun', 'Enfermedad común', 'reposo', null, 1),
  ('causa_reposo', 'enfermedad_ocupacional', 'Enfermedad ocupacional', 'reposo', null, 2),
  ('causa_reposo', 'accidente_comun', 'Accidente común', 'reposo', null, 3),
  ('causa_reposo', 'accidente_laboral', 'Accidente laboral', 'reposo', null, 4),
  ('causa_reposo', 'prenatal', 'Prenatal', 'reposo', null, 5),
  ('causa_reposo', 'postnatal', 'Postnatal', 'reposo', null, 6),
  ('causa_reposo', 'paternidad', 'Paternidad', 'permiso', null, 7),
  ('causa_reposo', 'lactancia', 'Lactancia', 'permiso', null, 8),

  ('resultado_reubicacion', 'efectiva', 'Reubicación efectiva', null, null, 1),
  ('resultado_reubicacion', 'negada', 'Reubicación negada', null, null, 2),
  ('resultado_reubicacion', 'pendiente', 'En trámite', null, null, 3),

  ('recomendacion_aptitud', 'apto', 'Trabajador apto', null, 'Puede desempeñar las funciones del cargo. Mantener controles periódicos según los riesgos del puesto.', 1),
  ('recomendacion_aptitud', 'preempleo', 'Pre-empleo', null, 'Apto para iniciar labores en el cargo evaluado. Cumplir la inducción y la notificación de riesgos antes del inicio.', 2),
  ('recomendacion_aptitud', 'postvacacional', 'Post vacacional', null, 'Sin cambios en su condición de salud atribuibles al periodo vacacional. Puede reincorporarse a sus labores.', 3),
  ('recomendacion_aptitud', 'egreso', 'Egreso', null, 'Se deja constancia del estado de salud del trabajador al finalizar la relación laboral.', 4),

  ('antecedente_medico', 'hta', 'Hipertensión arterial', 'personal', null, 1),
  ('antecedente_medico', 'dm', 'Diabetes mellitus', 'personal', null, 2),
  ('antecedente_medico', 'asma', 'Asma', 'personal', null, 3),
  ('antecedente_medico', 'alergias', 'Alergias', 'personal', null, 4),
  ('antecedente_medico', 'quirurgicos', 'Quirúrgicos', 'personal', null, 5),
  ('antecedente_medico', 'traumaticos', 'Traumáticos', 'personal', null, 6),
  ('antecedente_medico', 'fam_hta', 'Hipertensión arterial (familiar)', 'familiar', null, 10),
  ('antecedente_medico', 'fam_dm', 'Diabetes mellitus (familiar)', 'familiar', null, 11),
  ('antecedente_medico', 'fam_ca', 'Cáncer (familiar)', 'familiar', null, 12),

  ('habito', 'alcohol', 'Alcohol', null, null, 1), ('habito', 'tabaco', 'Tabáquicos', null, null, 2),
  ('habito', 'cafe', 'Cafeicos', null, null, 3), ('habito', 'medicamentos', 'Medicamentos', null, null, 4),
  ('habito', 'estupefacientes', 'Estupefacientes', null, null, 5), ('habito', 'actividad_fisica', 'Actividad física', null, null, 6),
  ('habito', 'sueno', 'Sueño', null, null, 7), ('habito', 'alimentacion', 'Alimentación', null, null, 8),

  ('examen_funcional', 'general', 'General', null, 'NRS', 1), ('examen_funcional', 'neurologico', 'Neurológico', null, 'NRS', 2),
  ('examen_funcional', 'sentidos', 'Órganos de los sentidos', null, 'NRS', 3), ('examen_funcional', 'cardiovascular', 'Cardiovascular', null, 'NRS', 4),
  ('examen_funcional', 'respiratorio', 'Respiratorio', null, 'NRS', 5), ('examen_funcional', 'digestivo', 'Digestivo', null, 'NRS', 6),
  ('examen_funcional', 'genitourinario', 'Genitourinario', null, 'NRS', 7), ('examen_funcional', 'osteomuscular', 'Osteomuscular', null, 'NRS', 8),
  ('examen_funcional', 'piel', 'Piel y anexos', null, 'NRS', 9),

  ('examen_fisico', 'piel', 'Piel', null, 'Normal', 1), ('examen_fisico', 'cabeza', 'Cabeza', null, 'Normal', 2),
  ('examen_fisico', 'ojos', 'Ojos', null, 'Normal', 3), ('examen_fisico', 'oidos', 'Oídos', null, 'Normal', 4),
  ('examen_fisico', 'nariz', 'Nariz', null, 'Normal', 5), ('examen_fisico', 'boca', 'Boca y faringe', null, 'Normal', 6),
  ('examen_fisico', 'cuello', 'Cuello', null, 'Normal', 7), ('examen_fisico', 'torax', 'Tórax', null, 'Normal', 8),
  ('examen_fisico', 'cardiovascular', 'Cardiovascular', null, 'Normal', 9), ('examen_fisico', 'pulmonar', 'Pulmonar', null, 'Normal', 10),
  ('examen_fisico', 'abdomen', 'Abdomen', null, 'Normal', 11), ('examen_fisico', 'hernias', 'Hernias', null, 'No presenta', 12),
  ('examen_fisico', 'genitourinario', 'Genitourinario', null, 'Normal', 13), ('examen_fisico', 'columna', 'Columna', null, 'Normal', 14),
  ('examen_fisico', 'mmss', 'Miembros superiores', null, 'Normal', 15), ('examen_fisico', 'mmii', 'Miembros inferiores', null, 'Normal', 16),
  ('examen_fisico', 'neurologico', 'Neurológico', null, 'Normal', 17), ('examen_fisico', 'psiquico', 'Estado mental', null, 'Normal', 18),
  ('examen_fisico', 'linfatico', 'Sistema linfático', null, 'Normal', 19),

  ('paraclinico', 'hc', 'Hematología completa', 'Rutina', null, 1), ('paraclinico', 'glicemia', 'Glicemia', 'Rutina', null, 2),
  ('paraclinico', 'urea', 'Urea', 'Rutina', null, 3), ('paraclinico', 'creatinina', 'Creatinina', 'Rutina', null, 4),
  ('paraclinico', 'orina', 'Examen de orina', 'Rutina', null, 5), ('paraclinico', 'heces', 'Examen de heces', 'Rutina', null, 6),
  ('paraclinico', 'vdrl', 'VDRL', 'Rutina', null, 7), ('paraclinico', 'grupo', 'Grupo sanguíneo y factor Rh', 'Rutina', null, 8),
  ('paraclinico', 'colesterol', 'Colesterol total', 'Perfil lipídico', null, 10), ('paraclinico', 'trigliceridos', 'Triglicéridos', 'Perfil lipídico', null, 11),
  ('paraclinico', 'hdl', 'HDL', 'Perfil lipídico', null, 12), ('paraclinico', 'ldl', 'LDL', 'Perfil lipídico', null, 13),
  ('paraclinico', 'tgo', 'TGO', 'Hepático', null, 20), ('paraclinico', 'tgp', 'TGP', 'Hepático', null, 21), ('paraclinico', 'acido_urico', 'Ácido úrico', 'Hepático', null, 22),
  ('paraclinico', 'audiometria', 'Audiometría', 'Ocupacionales', null, 30), ('paraclinico', 'espirometria', 'Espirometría', 'Ocupacionales', null, 31),
  ('paraclinico', 'agudeza_visual', 'Agudeza visual', 'Ocupacionales', null, 32), ('paraclinico', 'rx_torax', 'Rx de tórax PA', 'Ocupacionales', null, 33),
  ('paraclinico', 'rx_lumbosacra', 'Rx de columna lumbosacra', 'Ocupacionales', null, 34), ('paraclinico', 'ecg', 'Electrocardiograma', 'Ocupacionales', null, 35),
  ('paraclinico', 'citologia', 'Citología', 'Mujeres', null, 40), ('paraclinico', 'bhcg', 'Prueba de embarazo (β-HCG)', 'Mujeres', null, 41),
  ('paraclinico', 'mamografia', 'Mamografía', 'Mujeres', null, 42), ('paraclinico', 'psa', 'PSA', 'Hombres mayores de 40', null, 50),

  ('medicina', 'paracetamol', 'Paracetamol', null, null, 1), ('medicina', 'ibuprofeno', 'Ibuprofeno', null, null, 2),
  ('medicina', 'diclofenaco', 'Diclofenaco', null, null, 3), ('medicina', 'loratadina', 'Loratadina', null, null, 4),
  ('medicina', 'omeprazol', 'Omeprazol', null, null, 5), ('medicina', 'amoxicilina', 'Amoxicilina', null, null, 6),

  ('presentacion_medicina', 'tab', 'Tableta', null, null, 1), ('presentacion_medicina', 'cap', 'Cápsula', null, null, 2),
  ('presentacion_medicina', 'jbe', 'Jarabe', null, null, 3), ('presentacion_medicina', 'amp', 'Ampolla', null, null, 4),
  ('presentacion_medicina', 'crema', 'Crema', null, null, 5), ('presentacion_medicina', 'gotas', 'Gotas', null, null, 6),

  ('via_administracion', 'vo', 'Oral', null, null, 1), ('via_administracion', 'im', 'Intramuscular', null, null, 2),
  ('via_administracion', 'ev', 'Endovenosa', null, null, 3), ('via_administracion', 'top', 'Tópica', null, null, 4),
  ('via_administracion', 'sl', 'Sublingual', null, null, 5), ('via_administracion', 'inh', 'Inhalada', null, null, 6),

  ('frecuencia_dosis', 'c6h', 'Cada 6 horas', null, null, 1), ('frecuencia_dosis', 'c8h', 'Cada 8 horas', null, null, 2),
  ('frecuencia_dosis', 'c12h', 'Cada 12 horas', null, null, 3), ('frecuencia_dosis', 'c24h', 'Cada 24 horas', null, null, 4),
  ('frecuencia_dosis', 'sos', 'Si hay dolor (SOS)', null, null, 5),

  ('duracion_tratamiento', '3d', '3 días', null, null, 1), ('duracion_tratamiento', '5d', '5 días', null, null, 2),
  ('duracion_tratamiento', '7d', '7 días', null, null, 3), ('duracion_tratamiento', '10d', '10 días', null, null, 4),
  ('duracion_tratamiento', '14d', '14 días', null, null, 5), ('duracion_tratamiento', '30d', '30 días', null, null, 6),

  ('especialidad', 'traumatologia', 'Traumatología', null, null, 1), ('especialidad', 'cardiologia', 'Cardiología', null, null, 2),
  ('especialidad', 'oftalmologia', 'Oftalmología', null, null, 3), ('especialidad', 'otorrino', 'Otorrinolaringología', null, null, 4),
  ('especialidad', 'neumonologia', 'Neumonología', null, null, 5), ('especialidad', 'dermatologia', 'Dermatología', null, null, 6),
  ('especialidad', 'psicologia', 'Psicología', null, null, 7), ('especialidad', 'ginecologia', 'Ginecología', null, null, 8),
  ('especialidad', 'fisiatria', 'Fisiatría', null, null, 9), ('especialidad', 'medicina_interna', 'Medicina interna', null, null, 10),

  ('sistema_organico', 'respiratorio', 'Respiratorio', null, null, 1), ('sistema_organico', 'digestivo', 'Digestivo', null, null, 2),
  ('sistema_organico', 'osteomuscular', 'Osteomuscular', null, null, 3), ('sistema_organico', 'cardiovascular', 'Cardiovascular', null, null, 4),
  ('sistema_organico', 'piel', 'Piel y anexos', null, null, 5), ('sistema_organico', 'nervioso', 'Nervioso', null, null, 6),
  ('sistema_organico', 'genitourinario', 'Genitourinario', null, null, 7), ('sistema_organico', 'ocular', 'Ocular', null, null, 8),
  ('sistema_organico', 'auditivo', 'Auditivo', null, null, 9), ('sistema_organico', 'endocrino', 'Endocrino y metabólico', null, null, 10),
  ('sistema_organico', 'mental', 'Salud mental', null, null, 11), ('sistema_organico', 'otros', 'Otros', null, null, 12);

-- ─── 2. Copia de listas por organización ─────────────────────
alter table public.lista_items add column if not exists base_id uuid references public.lista_items (id) on delete set null;

create or replace function public.copiar_listas_base(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.lista_items (lista, org_id, codigo, nombre, grupo, texto, orden, activo, datos, base_id)
  select b.lista, p_org, b.codigo, b.nombre, b.grupo, b.texto, b.orden, b.activo, b.datos, b.id
  from public.lista_items b
  where b.org_id is null
    and not exists (select 1 from public.lista_items o where o.org_id = p_org and o.base_id = b.id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Referencias existentes (trabajadores y consultas) pasan a apuntar a la copia de la organización
select public.copiar_listas_base(id) from public.organizaciones;
update public.trabajadores t set tipo_paciente_id = o.id
from public.lista_items o where o.base_id = t.tipo_paciente_id and o.org_id = t.org_id;
update clinico.consultas c set motivo_id = o.id
from public.lista_items o where o.base_id = c.motivo_id and o.org_id = c.org_id;

create or replace function public.al_crear_organizacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.copiar_listas_base(new.id); return new; end $$;

drop trigger if exists listas_nueva_org on public.organizaciones;
create trigger listas_nueva_org after insert on public.organizaciones
  for each row execute function public.al_crear_organizacion();

-- ─── 3. Ajustes de la organización ───────────────────────────
alter table public.organizaciones
  add column if not exists correo text,
  add column if not exists ajustes jsonb not null default '{}'::jsonb;

-- ─── 4. Usuarios: alta por correo ────────────────────────────
-- El administrador agrega a quien ya creó su cuenta en la app.
create or replace function public.agregar_miembro(p_correo text, p_rol public.rol_usuario)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_org uuid; v_usuario uuid; v_id uuid;
begin
  select org_id into v_org from public.miembros
  where usuario_id = auth.uid() and rol = 'administrador' and activo limit 1;
  if v_org is null then raise exception 'Solo un administrador puede agregar usuarios'; end if;

  select id into v_usuario from auth.users where lower(email) = lower(trim(p_correo));
  if v_usuario is null then raise exception 'No existe una cuenta con ese correo. Pídele que la cree en la pantalla de ingreso.'; end if;

  insert into public.miembros (org_id, usuario_id, rol) values (v_org, v_usuario, p_rol)
  on conflict (org_id, usuario_id) do update set rol = excluded.rol, activo = true
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.agregar_miembro(text, public.rol_usuario) to authenticated;

-- Correo visible para los administradores en la lista de usuarios
create or replace function public.miembros_con_correo()
returns table (id uuid, usuario_id uuid, correo text, nombre text, rol public.rol_usuario, activo boolean)
language sql stable security definer set search_path = public, auth as $$
  select m.id, m.usuario_id, u.email::text, p.nombre_completo, m.rol, m.activo
  from public.miembros m
  join auth.users u on u.id = m.usuario_id
  left join public.perfiles p on p.id = m.usuario_id
  where m.org_id in (select public.mis_orgs())
  order by p.nombre_completo
$$;

grant execute on function public.miembros_con_correo() to authenticated;
