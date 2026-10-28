-- Vencimientos de aptitud y examen periódico por empresa, y accidentabilidad mensual (COVENIN 474).
-- Empresa C propia de esta prueba: periódico cada 6 meses, aviso con 45 días. RR. HH. de A no la ve.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.empresas (id,org_id,razon_social,rif,periodicidad_meses,dias_aviso_examen) values
 ('20000000-0000-0000-0000-0000000000c9','10000000-0000-0000-0000-000000000001','C','J-9',6,45);
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,estado) values
 ('3c000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','c1','Vencido','C','activo'),
 ('3c000000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','c2','Porvencer','C','reposo'),
 ('3c000000-0000-0000-0000-0000000000c3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','c3','Sinevaluar','C','activo'),
 ('3c000000-0000-0000-0000-0000000000c4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','c4','Aldia','C','activo'),
 ('3c000000-0000-0000-0000-0000000000c5','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','c5','Egresado','C','egresado');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('4c000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','3c000000-0000-0000-0000-0000000000c1','cerrada',public.hoy_caracas() - 400),
 ('4c000000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','3c000000-0000-0000-0000-0000000000c2','firmada',(public.hoy_caracas() - interval '5 months')::date),
 ('4c000000-0000-0000-0000-0000000000c4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','3c000000-0000-0000-0000-0000000000c4','cerrada',public.hoy_caracas() - 10);
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion,vigente_hasta) values
 ('10000000-0000-0000-0000-000000000001','4c000000-0000-0000-0000-0000000000c1','3c000000-0000-0000-0000-0000000000c1','elegible',public.hoy_caracas() - 1),
 ('10000000-0000-0000-0000-000000000001','4c000000-0000-0000-0000-0000000000c2','3c000000-0000-0000-0000-0000000000c2','elegible',null),
 ('10000000-0000-0000-0000-000000000001','4c000000-0000-0000-0000-0000000000c4','3c000000-0000-0000-0000-0000000000c4','elegible',public.hoy_caracas() + 200);
insert into public.horas_trabajadas (org_id,empresa_id,mes,horas,trabajadores,metodo) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','2026-03-01',100000,60,'nomina');
insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,incapacidad,dias_perdidos) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','3c000000-0000-0000-0000-0000000000c1','accidente','2026-03-10 08:00-04','temporal',10),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000c9','3c000000-0000-0000-0000-0000000000c2','accidente','2026-03-31 22:30-04','sin_tiempo_perdido',0);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'sin vigencia: próximo examen = último + 6 meses (debe 1): ' || (proximo_examen = (public.hoy_caracas() - interval '5 months' + interval '6 months')::date)::int from public.ultima_aptitud where trabajador_id = '3c000000-0000-0000-0000-0000000000c2';
select 'empresa C: vencidos (debe 1): ' || (x ->> 'vencidos') from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'empresa' = 'C';
select 'empresa C: por vencer en 45 días (debe 1): ' || (x ->> 'por_vencer') from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'empresa' = 'C';
select 'empresa C: sin evaluación, sin el egresado (debe 1): ' || (x ->> 'sin_evaluar') from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'empresa' = 'C';
select 'empresa C: activos (debe 4): ' || (x ->> 'activos') from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'empresa' = 'C';
select 'inicio: vencidos de C (debe 1): ' || (public.resumen_panel('20000000-0000-0000-0000-0000000000c9') ->> 'vencidos');
select 'inicio: por vencer de C con su aviso (debe 1): ' || (public.resumen_panel('20000000-0000-0000-0000-0000000000c9') ->> 'por_vencer');
select 'reporte: vencido, por vencer y sin evaluación (debe 3): ' || jsonb_array_length(public.reporte_indicadores('vencimientos','20000000-0000-0000-0000-0000000000c9',null,null));
select 'reporte: con «todos» sale también el que está al día (debe 4): ' || jsonb_array_length(public.reporte_indicadores('vencimientos','20000000-0000-0000-0000-0000000000c9',null,null,'{"horizonte":"todos"}'));
select 'reporte: a 10 días el de 1 mes no entra (debe 2): ' || jsonb_array_length(public.reporte_indicadores('vencimientos','20000000-0000-0000-0000-0000000000c9',null,null,'{"horizonte":10}'));
select 'reporte: base del cálculo por periodicidad (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_indicadores('vencimientos','20000000-0000-0000-0000-0000000000c9',null,null)) x where x ->> 'base' = 'Periódico cada 6 meses' and x ->> 'situacion' = 'Por vencer';
select 'reporte: el vencido tiene días negativos (debe 1): ' || count(*) from jsonb_array_elements(public.reporte_indicadores('vencimientos','20000000-0000-0000-0000-0000000000c9',null,null)) x where x ->> 'situacion' = 'Vencido' and (x ->> 'dias')::int = -1;
select 'accidentabilidad: marzo y abril de C (debe 2): ' || jsonb_array_length(public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30'));
select 'marzo: dos accidentes, el de las 22:30 del 31 es de marzo (debe 2): ' || (public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30') -> 0 ->> 'accidentes');
select 'marzo: IFN = 1 × 1.000.000 / 100.000 (debe 10): ' || round((public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30') -> 0 ->> 'ifn')::numeric);
select 'marzo: IFB (debe 20): ' || round((public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30') -> 0 ->> 'ifb')::numeric);
select 'marzo: IS = 10 días × 1.000.000 / 100.000 (debe 100): ' || round((public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30') -> 0 ->> 'isev')::numeric);
select 'abril sin nómina: 4 activos × 8 h × 22 días hábiles (debe 704): ' || (public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30') -> 1 ->> 'hht');
select 'abril: método estimado automático (debe 1): ' || ((public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30') -> 1 ->> 'metodo') = 'Estimado automático')::int;
select 'vencimientos no trae datos de salud: grupo sanguíneo ni discapacidad (debe 0): ' || count(*) from jsonb_array_elements(public.reporte_indicadores('vencimientos',null,null,null,'{"horizonte":"todos"}')) x where x ? 'grupo_sanguineo' or x ? 'discapacidad';
select 'consolidado: una fila por mes (debe 2): ' || jsonb_array_length(public.reporte_indicadores('accidentalidad',null,'2026-03-01','2026-04-30','{"nivel":"consolidado"}'));

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A no ve la empresa C en vencimientos (debe 0): ' || count(*) from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'empresa' = 'C';
select 'RR. HH. de A no ve trabajadores de C (debe 0): ' || jsonb_array_length(public.reporte_indicadores('vencimientos','20000000-0000-0000-0000-0000000000c9',null,null,'{"horizonte":"todos"}'));
select 'RR. HH. de A no ve la accidentabilidad de C (debe 0): ' || jsonb_array_length(public.reporte_indicadores('accidentalidad','20000000-0000-0000-0000-0000000000c9','2026-03-01','2026-04-30'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico asignado a A no ve la empresa C (debe 0): ' || count(*) from jsonb_array_elements(public.vencimientos_empresas()) x where x ->> 'empresa' = 'C';
reset role;
