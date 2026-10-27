-- zamorApp Ocupacional · Declaración de accidente de trabajo (LOPCYMAT art. 73) con la codificación de la
-- COVENIN 474:1997 (Anexo C) y la planilla de notificación del Anexo D.
-- 1. Listas de la lesión con los códigos de la norma: agente (C.3, grupos principales), tipo de accidente (C.4),
--    acto inseguro (C.5), condición insegura (C.6), parte del cuerpo (C.7) y naturaleza de la lesión (C.8).
--    Las entradas anteriores sin código quedan inactivas; los eventos ya registrados conservan su texto.
-- 2. Campos de la planilla del Anexo D que faltaban en public.eventos.
-- 3. Días cargados (sección 4 de la norma): 6.000 por muerte o incapacidad absoluta permanente; en la parcial
--    permanente, la Tabla 1 por el porcentaje de pérdida (4.5), con tope de 6.000 (4.7). El índice de severidad
--    toma el mayor entre el cargo de la tabla y los días de reposo (4.4).

update public.listas set nombre = 'Agente del accidente (COVENIN 474, C.3)' where codigo = 'agente_lesion';
update public.listas set nombre = 'Tipo de accidente (COVENIN 474, C.4)' where codigo = 'forma_accidente';
update public.listas set nombre = 'Parte del cuerpo afectada (COVENIN 474, C.7)' where codigo = 'parte_cuerpo';
update public.listas set nombre = 'Naturaleza de la lesión (COVENIN 474, C.8)' where codigo = 'naturaleza_lesion';
insert into public.listas (codigo, nombre, descripcion) values
  ('acto_inseguro', 'Acto inseguro (COVENIN 474, C.5)', 'Causa personal del accidente'),
  ('condicion_insegura', 'Condición insegura (COVENIN 474, C.6)', 'Causa física o ambiental del accidente')
on conflict (codigo) do nothing;

update public.lista_items set activo = false
where lista in ('agente_lesion', 'forma_accidente', 'parte_cuerpo', 'naturaleza_lesion') and codigo is null;

insert into public.lista_items (lista, codigo, nombre, orden) values
  ('agente_lesion', '1100', 'Generadores de energía, excepto motores eléctricos', 1),
  ('agente_lesion', '1200', 'Sistemas de transmisión', 2),
  ('agente_lesion', '1300', 'Máquinas para el trabajo en metal', 3),
  ('agente_lesion', '1400', 'Máquinas para trabajar la madera y otras materias similares', 4),
  ('agente_lesion', '1500', 'Máquinas agrícolas', 5),
  ('agente_lesion', '1600', 'Máquinas para trabajo en las minas', 6),
  ('agente_lesion', '1700', 'Máquinas para la industria plástica', 7),
  ('agente_lesion', '1800', 'Máquinas para la industria textil', 8),
  ('agente_lesion', '1900', 'Otras máquinas y accesorios no especificados bajo otros epígrafes', 9),
  ('agente_lesion', '2100', 'Aparatos de izar', 10),
  ('agente_lesion', '2200', 'Medios de transporte por vía férrea', 11),
  ('agente_lesion', '2300', 'Medios de transporte rodantes, a excepción de los transportes por vía férrea', 12),
  ('agente_lesion', '2400', 'Medios de transporte por aire', 13),
  ('agente_lesion', '2500', 'Medio de transporte acuático', 14),
  ('agente_lesion', '2600', 'Otros medios de transporte no especificados bajo otro epígrafe', 15),
  ('agente_lesion', '3100', 'Recipientes', 16),
  ('agente_lesion', '3200', 'Equipo para secado o calentamiento', 17),
  ('agente_lesion', '3300', 'Equipos de refrigeración', 18),
  ('agente_lesion', '3400', 'Instalaciones eléctricas', 19),
  ('agente_lesion', '3500', 'Herramientas eléctricas manuales', 20),
  ('agente_lesion', '3600', 'Herramientas, implementos y utensilios, con excepción de las herramientas eléctricas manuales', 21),
  ('agente_lesion', '3700', 'Escaleras, rampas móviles', 22),
  ('agente_lesion', '3800', 'Andamios', 23),
  ('agente_lesion', '3900', 'Otros aparatos no especificados bajo otro epígrafe', 24),
  ('agente_lesion', '4100', 'Explosivos', 25),
  ('agente_lesion', '4200', 'Polvos, gases, líquidos y productos químicos, exceptuando los explosivos', 26),
  ('agente_lesion', '4300', 'Fragmentos volantes', 27),
  ('agente_lesion', '4400', 'Isótopos o sustancias radiactivas', 28),
  ('agente_lesion', '4500', 'Otros materiales', 29),
  ('agente_lesion', '5100', 'Ambiente de trabajo (en el exterior)', 30),
  ('agente_lesion', '5200', 'Ambiente de trabajo (en el interior)', 31),
  ('agente_lesion', '5300', 'Subterráneos', 32),
  ('agente_lesion', '6100', 'Animales', 33),
  ('agente_lesion', '6200', 'Productos alimenticios', 34),
  ('agente_lesion', '6300', 'Drogas y medicinas', 35),
  ('agente_lesion', '6400', 'Productos minerales', 36),
  ('agente_lesion', '6500', 'Vegetales y productos vegetales', 37),
  ('agente_lesion', '6600', 'Mobiliario y equipos de oficina', 38),
  ('agente_lesion', '6700', 'Transportadores', 39),
  ('agente_lesion', '6800', 'Agentes infecciosos y parasitarios, no especificados en otra parte', 40),
  ('agente_lesion', '6900', 'Vestuario', 41),
  ('agente_lesion', '7000', 'Carbón, petróleo y sus derivados', 42),
  ('agente_lesion', '7100', 'Artículos de metal, no especificados en otra parte', 43),
  ('agente_lesion', '9900', 'Otros agentes, no clasificados en otra parte', 44),
  ('forma_accidente', '1100', 'Golpeado contra', 1),
  ('forma_accidente', '1200', 'Golpeado por', 2),
  ('forma_accidente', '1300', 'Caída de objetos', 3),
  ('forma_accidente', '1400', 'Pisar sobre', 4),
  ('forma_accidente', '1500', 'Caída de diferente nivel', 5),
  ('forma_accidente', '1600', 'Caída de un mismo nivel', 6),
  ('forma_accidente', '1700', 'Atrapado en, debajo, entre o por', 7),
  ('forma_accidente', '1800', 'Contacto con objetos filosos, punzantes', 8),
  ('forma_accidente', '1900', 'Contacto con corriente eléctrica', 9),
  ('forma_accidente', '2000', 'Contacto con sustancias nocivas', 10),
  ('forma_accidente', '2100', 'Contacto con temperatura externa', 11),
  ('forma_accidente', '2200', 'Esfuerzos excesivos o movimientos violentos', 12),
  ('forma_accidente', '2300', 'Mordido o picado', 13),
  ('forma_accidente', '2400', 'Explosión', 14),
  ('forma_accidente', '2500', 'Contacto con sustancias radioactivas', 15),
  ('forma_accidente', '2600', 'Fricción', 16),
  ('forma_accidente', '2900', 'Otra forma de accidente, no clasificado', 17),
  ('acto_inseguro', '1100', 'Efectuar trabajos de mantenimiento a equipos en operación', 1),
  ('acto_inseguro', '1200', 'No usar el equipo de protección personal', 2),
  ('acto_inseguro', '1300', 'Uso inadecuado o impropio del equipo de protección personal', 3),
  ('acto_inseguro', '1400', 'No usar vestimenta apropiada', 4),
  ('acto_inseguro', '1500', 'No proteger y/o prevenir', 5),
  ('acto_inseguro', '1600', 'Distraer, molestar, asustar, fumar', 6),
  ('acto_inseguro', '1700', 'Uso inadecuado de equipos', 7),
  ('acto_inseguro', '1800', 'Uso inadecuado de manos u otras partes del cuerpo', 8),
  ('acto_inseguro', '1900', 'No prestar atención al caminar o a los alrededores', 9),
  ('acto_inseguro', '2000', 'Hacer ineficaces los dispositivos de seguridad', 10),
  ('acto_inseguro', '2100', 'Operar o trabajar a velocidad insegura', 11),
  ('acto_inseguro', '2200', 'Adoptar posición o postura insegura', 12),
  ('acto_inseguro', '2300', 'Conducir vehículo en forma insegura', 13),
  ('acto_inseguro', '2400', 'Depositar, mezclar, combinar en forma insegura', 14),
  ('acto_inseguro', '2500', 'Usar equipo defectuoso', 15),
  ('acto_inseguro', '2600', 'Ejecutar trabajos en equipos impropiamente asegurados', 16),
  ('acto_inseguro', '2700', 'Acto inseguro no clasificado aquí', 17),
  ('acto_inseguro', '2800', 'Ningún acto inseguro', 18),
  ('acto_inseguro', '2900', 'Sin clasificar, datos insuficientes', 19),
  ('condicion_insegura', '1100', 'Defectos de los agentes', 1),
  ('condicion_insegura', '1200', 'Inadecuadamente protegido o resguardado', 2),
  ('condicion_insegura', '1300', 'Falta de equipo de protección personal o equipo defectuoso', 3),
  ('condicion_insegura', '1400', 'Vestimenta inadecuada para la clase de trabajo', 4),
  ('condicion_insegura', '1500', 'Riesgos ambientales', 5),
  ('condicion_insegura', '1600', 'Procedimiento inseguro', 6),
  ('condicion_insegura', '1700', 'Almacenamiento inseguro de materiales, equipos y sustancias', 7),
  ('condicion_insegura', '1800', 'Riesgos ambientales de trabajos en exteriores', 8),
  ('condicion_insegura', '1900', 'Condición insegura no clasificada aquí', 9),
  ('parte_cuerpo', '1110', 'Cuero cabelludo', 1),
  ('parte_cuerpo', '1111', 'Región craneana', 2),
  ('parte_cuerpo', '1112', 'Cerebro', 3),
  ('parte_cuerpo', '1113', 'Ojo(s), incluye la órbita y el nervio óptico', 4),
  ('parte_cuerpo', '1114', 'Oreja(s)', 5),
  ('parte_cuerpo', '1115', 'Oído(s) medio', 6),
  ('parte_cuerpo', '1116', 'Oído(s) interno', 7),
  ('parte_cuerpo', '1117', 'Nariz (incluidas las fosas nasales y el sentido del olfato)', 8),
  ('parte_cuerpo', '1118', 'Boca (incluye labios, dientes, lengua y sentido del gusto)', 9),
  ('parte_cuerpo', '1119', 'Mandíbula (incluye la barbilla)', 10),
  ('parte_cuerpo', '1120', 'Cara, ubicaciones múltiples', 11),
  ('parte_cuerpo', '1121', 'Cara, ubicaciones no especificadas', 12),
  ('parte_cuerpo', '1122', 'Cabeza, ubicaciones múltiples', 13),
  ('parte_cuerpo', '1190', 'Cabeza, ubicaciones no especificadas en otra parte', 14),
  ('parte_cuerpo', '1200', 'Cuello (incluye la garganta)', 15),
  ('parte_cuerpo', '1310', 'Tórax (incluye las costillas, el esternón y órganos internos del tórax)', 16),
  ('parte_cuerpo', '1311', 'Abdomen (incluidos los órganos internos)', 17),
  ('parte_cuerpo', '1312', 'Cintura pélvica (incluye la pelvis, órganos pélvicos y la región glútea)', 18),
  ('parte_cuerpo', '1313', 'Espalda (incluye la columna vertebral, médula espinal y músculos adyacentes)', 19),
  ('parte_cuerpo', '1314', 'Falo', 20),
  ('parte_cuerpo', '1315', 'Testículo(s)', 21),
  ('parte_cuerpo', '1316', 'Mama(s)', 22),
  ('parte_cuerpo', '1317', 'Ano', 23),
  ('parte_cuerpo', '1318', 'Tronco, ubicaciones múltiples', 24),
  ('parte_cuerpo', '1390', 'Tronco, ubicaciones no especificadas', 25),
  ('parte_cuerpo', '1410', 'Cintura escapular (incluye el hombro, la clavícula y el omóplato)', 26),
  ('parte_cuerpo', '1411', 'Brazo', 27),
  ('parte_cuerpo', '1412', 'Codo', 28),
  ('parte_cuerpo', '1413', 'Antebrazo', 29),
  ('parte_cuerpo', '1414', 'Muñeca', 30),
  ('parte_cuerpo', '1415', 'Manos (excepto los dedos)', 31),
  ('parte_cuerpo', '1416', 'Dedos de la mano', 32),
  ('parte_cuerpo', '1417', 'Miembro superior, ubicaciones múltiples', 33),
  ('parte_cuerpo', '1490', 'Miembro superior, ubicaciones no identificadas', 34),
  ('parte_cuerpo', '1510', 'Cadera (no incluye la cintura pélvica)', 35),
  ('parte_cuerpo', '1511', 'Muslo', 36),
  ('parte_cuerpo', '1512', 'Rodilla', 37),
  ('parte_cuerpo', '1513', 'Pierna', 38),
  ('parte_cuerpo', '1514', 'Tobillo', 39),
  ('parte_cuerpo', '1515', 'Pies (excepto los dedos)', 40),
  ('parte_cuerpo', '1516', 'Dedos del pie', 41),
  ('parte_cuerpo', '1517', 'Miembro inferior, ubicaciones múltiples', 42),
  ('parte_cuerpo', '1590', 'Miembro inferior, ubicaciones no especificadas', 43),
  ('parte_cuerpo', '1610', 'Cabeza y tronco, cabeza y miembros superiores o inferiores', 44),
  ('parte_cuerpo', '1611', 'Tronco y miembros superiores o inferiores', 45),
  ('parte_cuerpo', '1612', 'Dos o más miembros', 46),
  ('parte_cuerpo', '1613', 'Otras ubicaciones múltiples', 47),
  ('parte_cuerpo', '1690', 'Ubicaciones múltiples no especificadas', 48),
  ('parte_cuerpo', '1710', 'Sistema circulatorio en general', 49),
  ('parte_cuerpo', '1711', 'Sistema respiratorio en general', 50),
  ('parte_cuerpo', '1712', 'Sistema digestivo en general', 51),
  ('parte_cuerpo', '1713', 'Sistema excretor (riñones, vejiga, intestinos)', 52),
  ('parte_cuerpo', '1714', 'Sistema nervioso en general', 53),
  ('parte_cuerpo', '1790', 'Lesiones generales no especificadas', 54),
  ('parte_cuerpo', '1800', 'Partes del cuerpo no clasificadas bajo otro epígrafe', 55),
  ('parte_cuerpo', '1900', 'Ubicación no especificada', 56),
  ('naturaleza_lesion', '1100', 'Hernia', 1),
  ('naturaleza_lesion', '1200', 'Dermatopatía', 2),
  ('naturaleza_lesion', '1300', 'Fracturas', 3),
  ('naturaleza_lesion', '1400', 'Luxaciones', 4),
  ('naturaleza_lesion', '1500', 'Esguinces, torceduras', 5),
  ('naturaleza_lesion', '1600', 'Traumatismo intracraneal', 6),
  ('naturaleza_lesion', '1700', 'Lesiones internas del tórax, abdomen y pelvis', 7),
  ('naturaleza_lesion', '1800', 'Heridas', 8),
  ('naturaleza_lesion', '1900', 'Amputaciones y enucleaciones', 9),
  ('naturaleza_lesion', '2000', 'Traumatismos superficiales', 10),
  ('naturaleza_lesion', '2100', 'Contusiones y aplastamientos', 11),
  ('naturaleza_lesion', '2200', 'Efectos de un cuerpo extraño que entre por un orificio', 12),
  ('naturaleza_lesion', '2300', 'Quemaduras', 13),
  ('naturaleza_lesion', '2400', 'Traumatismos de los nervios y de la médula espinal', 14),
  ('naturaleza_lesion', '2500', 'Envenenamiento por drogas, medicamentos y productos', 15),
  ('naturaleza_lesion', '2600', 'Efectos tóxicos de sustancias de procedencia no principalmente medicinal', 16),
  ('naturaleza_lesion', '2700', 'Efectos nocivos de las radiaciones', 17),
  ('naturaleza_lesion', '2800', 'Efectos del frío', 18),
  ('naturaleza_lesion', '2900', 'Efectos del calor y de la luz', 19),
  ('naturaleza_lesion', '3000', 'Traumatismo sonoro', 20),
  ('naturaleza_lesion', '3100', 'Efectos de la presión atmosférica', 21),
  ('naturaleza_lesion', '3200', 'Efectos de otras causas externas', 22),
  ('naturaleza_lesion', '3300', 'Ahogamiento por sumersión', 23),
  ('naturaleza_lesion', '3400', 'Asfixia y estrangulación', 24),
  ('naturaleza_lesion', '3500', 'Efectos nocivos de la electricidad', 25),
  ('naturaleza_lesion', '3600', 'Lesiones múltiples de naturaleza diferente', 26),
  ('naturaleza_lesion', '3700', 'Ciertos efectos adversos no clasificados', 27);

select public.copiar_listas_base(id) from public.organizaciones;

alter table public.eventos
  add column if not exists turno text check (turno in ('diurno', 'nocturno', 'mixto')),
  add column if not exists actividad_momento text,          -- Anexo D, 30: qué hacía al ocurrir el accidente
  add column if not exists motivo_actividad text,           -- 31: por qué lo hacía
  add column if not exists lesiones text,                   -- 33: lesiones presentadas
  add column if not exists testigos_detalle jsonb not null default '[]'::jsonb,  -- 34-35: [{nombre, cedula, tipo: presencial|referencial}]
  add column if not exists acto_inseguro text,              -- 37 (C.5)
  add column if not exists condicion_insegura text,         -- 40 (C.6)
  add column if not exists incapacidad text check (incapacidad in ('sin_tiempo_perdido', 'temporal', 'parcial_permanente', 'absoluta_permanente', 'fatal')),
  add column if not exists cargos jsonb not null default '[]'::jsonb,            -- Tabla 1: [{concepto, dias, porcentaje}]
  add column if not exists observaciones text;              -- 42

-- Días cargados según la incapacidad: lo calcula la base para que nadie lo escriba a mano
create or replace function public.calcular_dias_cargados()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo <> 'accidente' or new.incapacidad is null then return new; end if;
  new.dias_cargados := case new.incapacidad
    when 'fatal' then 6000
    when 'absoluta_permanente' then 6000
    when 'parcial_permanente' then least(6000, coalesce((
      select round(sum((c ->> 'dias')::numeric * coalesce((c ->> 'porcentaje')::numeric, 100) / 100))
      from jsonb_array_elements(new.cargos) c
      where (c ->> 'dias') ~ '^[0-9]+(\.[0-9]+)?$' and coalesce(c ->> 'porcentaje', '100') ~ '^[0-9]+(\.[0-9]+)?$'
    ), 0))::int
    else 0 end;
  new.con_tiempo_perdido := new.incapacidad <> 'sin_tiempo_perdido';
  return new;
end $$;

drop trigger if exists dias_cargados_eventos on public.eventos;
create trigger dias_cargados_eventos before insert or update on public.eventos
  for each row execute function public.calcular_dias_cargados();

-- Índices COVENIN 474: en la incapacidad parcial permanente se toma el mayor entre cargo y reposo (4.4)
create or replace function public.indices_accidentalidad(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language sql stable set search_path = public as $$
with ev as (
  select * from public.eventos
  where (p_empresa is null or empresa_id = p_empresa)
    and fecha_hora >= p_desde and fecha_hora < p_hasta + 1
),
hht as (
  select coalesce(sum(horas), 0) as horas,
         count(*) as meses,
         bool_or(metodo = 'estimado') as hay_estimado
  from public.horas_trabajadas
  where (p_empresa is null or empresa_id = p_empresa)
    and mes between date_trunc('month', p_desde)::date and p_hasta
)
select jsonb_build_object(
  'hht', (select horas from hht),
  'meses_con_horas', (select meses from hht),
  'hay_estimado', (select coalesce(hay_estimado, false) from hht),
  'accidentes', (select count(*) from ev where tipo = 'accidente'),
  'con_tiempo_perdido', (select count(*) from ev where tipo = 'accidente' and con_tiempo_perdido),
  'incidentes', (select count(*) from ev where tipo = 'incidente'),
  'enfermedades', (select count(*) from ev where tipo = 'enfermedad'),
  'dias_perdidos', (select coalesce(sum(dias_perdidos), 0) from ev where tipo = 'accidente'),
  'dias_cargados', (select coalesce(sum(case when incapacidad = 'parcial_permanente' then greatest(dias_cargados - dias_perdidos, 0) else dias_cargados end), 0) from ev where tipo = 'accidente'),
  'declarados_a_tiempo', (select count(*) from ev where tipo <> 'incidente' and fecha_declaracion is not null
     and fecha_declaracion <= coalesce(case when tipo = 'enfermedad' then fecha_diagnostico end, fecha_hora) + interval '24 hours'),
  'por_declarar', (select count(*) from ev where tipo <> 'incidente' and fecha_declaracion is null)
)
$$;

grant execute on function public.indices_accidentalidad(uuid, date, date) to authenticated;
