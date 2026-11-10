-- Atenciones de enfermería: la enfermera de A registra y ve solo lo de A; morbilidad aparte, unida y días.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Consulta del médico en A con hipertensión (I10), para unir con la de enfermería
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('22600000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2026-03-02');
insert into clinico.diagnosticos (org_id,consulta_id,cie10,descripcion) values
 ('10000000-0000-0000-0000-000000000001','22600000-0000-0000-0000-00000000000c','I10','Hipertensión esencial');
-- Una atención en B registrada por el administrador
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,fecha,tipo,motivo) values
 ('22600000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','2026-03-03','signos','Control de tensión arterial');

-- La enfermera de A
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
insert into public.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,fecha,tipo,motivo,cie10,signos,referido_medico) values
 ('22600000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-02','signos','Control de tensión arterial','I10','{"ta":"150/95","fc":"80"}',true),
 ('22600000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-04','signos','Control de tensión arterial','I10','{"ta":"130/85"}',false),
 ('22600000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-05','tratamiento','Cefalea','R51','{}',false),
 ('22600000-0000-0000-0000-0000000000a4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',null,'2026-03-05','inspeccion','Comedor y baños',null,'{}',false);
select 'la enfermera de A registra en A (debe 4): ' || count(*) from public.atenciones_enfermeria;
select 'no ve la atención de B (debe 0): ' || count(*) from public.atenciones_enfermeria where empresa_id = '20000000-0000-0000-0000-00000000000b';
select 'el autor queda fijo y es ella (debe 4): ' || count(*) from public.atenciones_enfermeria where registrado_por = '00000000-0000-0000-0000-0000000000a5';
do $$ begin
  insert into public.atenciones_enfermeria (org_id,empresa_id,trabajador_id,tipo,motivo)
  values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000b','signos','x');
  raise notice 'FALLA: registró a un trabajador de B';
exception when others then raise notice 'no registra a un trabajador de otra empresa (debe 1): 1';
end $$;
do $$ begin
  insert into public.atenciones_enfermeria (org_id,empresa_id,tipo,motivo) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','tratamiento','x');
  raise notice 'FALLA: tratamiento sin trabajador';
exception when others then
  if sqlerrm like '%trabajador%' then raise notice 'un tratamiento pide el trabajador (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.atenciones_enfermeria (org_id,empresa_id,trabajador_id,tipo,fecha) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','signos', public.hoy_caracas() + 2);
  raise notice 'FALLA: aceptó una fecha futura';
exception when others then
  if sqlerrm like '%futura%' then raise notice 'fecha futura rechazada (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.atenciones_enfermeria (org_id,empresa_id,trabajador_id,tipo,signos) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','signos','{"diagnostico":"x"}');
  raise notice 'FALLA: aceptó un dato desconocido en los signos';
exception when others then
  if sqlerrm like '%desconocidos%' then raise notice 'signos solo con datos conocidos (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

-- Reportes
select 'morbilidad de enfermería: control de TA con 2 casos (debe 2): ' || (x ->> 'casos')
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', null, '2026-03-01', '2026-03-31')) x where x ->> 'cie10' = 'I10';
select 'la inspección no cuenta como morbilidad (debe 0): ' || count(*)
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', null, '2026-03-01', '2026-03-31')) x where x ->> 'descripcion' = 'Comedor y baños';
select 'unida: I10 con 1 caso del médico y 2 de enfermería (debe 12): ' || (x ->> 'casos_medico') || (x ->> 'casos_enfermeria')
  from jsonb_array_elements(public.reporte_enfermeria('unida', null, '2026-03-01', '2026-03-31')) x where x ->> 'cie10' = 'I10';
select 'unida: días del médico 1 y de enfermería 2 (debe 12): ' || (x ->> 'dias_medico') || (x ->> 'dias_enfermeria')
  from jsonb_array_elements(public.reporte_enfermeria('unida', null, '2026-03-01', '2026-03-31')) x where x ->> 'cie10' = 'I10';
select 'días: el 2 de marzo atendieron los dos (debe 1): ' || count(*)
  from jsonb_array_elements(public.reporte_enfermeria('dias', null, '2026-03-01', '2026-03-31')) x where x ->> 'fecha' = '2026-03-02' and x ->> 'atendio' = 'Médico y enfermería';
select 'indicadores: 4 atenciones, 1 referida, 1 inspección (debe 411): ' || (v ->> 'atenciones') || (v ->> 'referidos') || (v ->> 'inspecciones')
  from public.reporte_enfermeria('indicadores', null, '2026-03-01', '2026-03-31') v;
select 'indicadores: motivos con menos de 3 casos van a «Otros motivos» (debe 0): ' || count(*)
  from jsonb_array_elements(public.reporte_enfermeria('indicadores', null, '2026-03-01', '2026-03-31') -> 'causas') x where x ->> 'nombre' <> 'Otros motivos';

-- Otro médico de A corrige ni borra lo de la enfermera: nada cambia; ella sí puede
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select 'el médico de A ve lo de la enfermera (debe 4): ' || count(*) from public.atenciones_enfermeria;
delete from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a3';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
select 'otro médico no borra lo de la enfermera (debe 1): ' || count(*) from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a3';
delete from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a3';
select 'la autora sí la borra (debe 0): ' || count(*) from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a3';

-- RR. HH. nunca ve atenciones de enfermería
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve atenciones (debe 0): ' || count(*) from public.atenciones_enfermeria;
reset role;
select 'un anónimo no corre el reporte (debe 0): ' || has_function_privilege('anon', 'public.reporte_enfermeria(text, uuid, date, date, jsonb)', 'execute')::int;
delete from clinico.atenciones_enfermeria where id::text like '22600000-%';
delete from clinico.consultas where id = '22600000-0000-0000-0000-00000000000c';
-- Pasadas 24 horas la autora ya no la borra (es dato clínico); el administrador sí.
-- (La fila vieja se arma sin disparadores: por la app la hora de registro siempre es la del servidor)
set session_replication_role = replica;
insert into clinico.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,fecha,tipo,motivo,registrado_por,creado_en) values
 ('22600000-0000-0000-0000-0000000000a9','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-01','signos','x','00000000-0000-0000-0000-0000000000a5', public.ahora() - interval '2 days');
set session_replication_role = origin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
delete from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a9';
select 'la autora no borra después de 24 horas (debe 1): ' || count(*) from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a9';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
delete from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a9';
select 'el administrador sí (debe 0): ' || count(*) from public.atenciones_enfermeria where id = '22600000-0000-0000-0000-0000000000a9';
reset role;
-- Control de tensión: la toma 150/95 sale «Alta»
insert into clinico.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,fecha,tipo,motivo,signos) values
 ('22600000-0000-0000-0000-0000000000a8','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-02','procedimiento','Esguince','{"ta":"150/95"}');
select 'control de tensión: 150/95 es alta (debe 1): ' || count(*)
  from jsonb_array_elements(public.reporte_enfermeria('tension', null, '2026-03-01', '2026-03-31')) x where x ->> 'ta' = '150/95' and x ->> 'clasificacion' like 'Alta%';
delete from clinico.atenciones_enfermeria where id::text like '22600000-%';

-- Quien registra no elige la hora de registro (si no, alargaría el plazo de 24 h para borrar)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
insert into public.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,tipo,motivo,creado_en) values
 ('22600000-0000-0000-0000-0000000000a7','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','signos','x', public.ahora() + interval '30 days');
select 'la hora de registro es la del servidor (debe 1): ' || count(*) from public.atenciones_enfermeria
 where id = '22600000-0000-0000-0000-0000000000a7' and creado_en <= public.ahora() + interval '1 minute';

-- Decisiones: el administrador cambia solo su clave (lo demás de ajustes queda); el médico no
reset role;
update public.organizaciones set ajustes = coalesce(ajustes, '{}'::jsonb) || '{"prueba_226": 1}' where id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.guardar_decision_enfermeria('10000000-0000-0000-0000-000000000001', 'enfermeria_unida', true) \g /dev/null
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.guardar_decision_enfermeria('10000000-0000-0000-0000-000000000001', 'enfermeria_vigilancia', true);
  raise notice 'FALLA: el médico cambió una decisión';
exception when others then raise notice 'el médico no cambia las decisiones (debe 1): 1';
end $$;
reset role;
select 'el administrador la cambió sin pisar otros ajustes (debe 110): ' || (ajustes ->> 'enfermeria_unida')::boolean::int || (ajustes ->> 'prueba_226') || coalesce((ajustes ->> 'enfermeria_vigilancia')::boolean::int, 0)
  from public.organizaciones where id = '10000000-0000-0000-0000-000000000001';
update public.organizaciones set ajustes = ajustes - 'prueba_226' - 'enfermeria_unida' where id = '10000000-0000-0000-0000-000000000001';
delete from clinico.atenciones_enfermeria where id::text like '22600000-%';

-- Enfermería lee la consulta del médico, no la cambia; su evolución se anota en ella (solo si es del mismo trabajador)
reset role;
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos) values
 ('22600000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','226001','Otro','A');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,enfermedad_actual) values
 ('22600000-0000-0000-0000-0000000000cc','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador','2026-03-02','Cefalea');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
select 'la enfermera lee la consulta del médico (debe 1): ' || count(*) from public.consultas where id = '22600000-0000-0000-0000-0000000000cc';
update public.consultas set enfermedad_actual = 'cambiada' where id = '22600000-0000-0000-0000-0000000000cc';
select 'la enfermera no la cambia (debe 0): ' || count(*) from public.consultas where id = '22600000-0000-0000-0000-0000000000cc' and enfermedad_actual = 'cambiada';
do $$ begin
  insert into public.consultas (org_id,empresa_id,trabajador_id,fecha) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-02');
  raise notice 'FALLA: la enfermera abrió una consulta';
exception when others then raise notice 'la enfermera no abre consultas del médico (debe 1): 1';
end $$;
insert into public.atenciones_enfermeria (id,org_id,empresa_id,trabajador_id,fecha,tipo,nota,consulta_id) values
 ('22600000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','2026-03-03','evolucion','Mejoría de la cefalea','22600000-0000-0000-0000-0000000000cc');
select 'su evolución queda en la consulta (debe 1): ' || count(*) from public.atenciones_enfermeria where consulta_id = '22600000-0000-0000-0000-0000000000cc';
do $$ begin
  insert into public.atenciones_enfermeria (org_id,empresa_id,trabajador_id,tipo,nota,consulta_id) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','22600000-0000-0000-0000-0000000000d1','evolucion','x','22600000-0000-0000-0000-0000000000cc');
  raise notice 'FALLA: evolución en la consulta de otro trabajador';
exception when others then raise notice 'no se anota en la consulta de otro trabajador (debe 1): 1';
end $$;
select 'la evolución no suma a la morbilidad (debe 0): ' || count(*)
  from jsonb_array_elements(public.reporte_enfermeria('morbilidad', null, '2026-03-01', '2026-03-31')) x;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico ve la evolución en su consulta (debe 1): ' || count(*) from public.atenciones_enfermeria where consulta_id = '22600000-0000-0000-0000-0000000000cc';
update public.consultas set enfermedad_actual = 'del médico' where id = '22600000-0000-0000-0000-0000000000cc';
select 'el médico sí la cambia (debe 1): ' || count(*) from public.consultas where id = '22600000-0000-0000-0000-0000000000cc' and enfermedad_actual = 'del médico';
reset role;
delete from clinico.atenciones_enfermeria where id::text like '22600000-%';
delete from clinico.consultas where id = '22600000-0000-0000-0000-0000000000cc';
delete from public.trabajadores where id = '22600000-0000-0000-0000-0000000000d1';
