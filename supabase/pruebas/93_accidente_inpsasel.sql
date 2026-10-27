-- Declaración de accidente (COVENIN 474): listas codificadas, días cargados automáticos e índice de severidad.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'acto inseguro copiado a la org (debe 19): ' || count(*) from public.lista_items where lista='acto_inseguro' and org_id='10000000-0000-0000-0000-000000000001' and activo;
select 'condición insegura copiada (debe 9): ' || count(*) from public.lista_items where lista='condicion_insegura' and org_id='10000000-0000-0000-0000-000000000001' and activo;
select 'traumatismo intracraneal 1600 (debe 1): ' || count(*) from public.lista_items where lista='naturaleza_lesion' and org_id='10000000-0000-0000-0000-000000000001' and codigo='1600';
insert into public.horas_trabajadas (org_id,empresa_id,mes,horas,metodo) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','2026-06-01',1000000,'nomina');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,fecha_hora,lugar,incapacidad,dias_perdidos,cargos) values
 ('60000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente','2026-06-10 08:00','Taller','fatal',0,'[]'),
 ('60000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente','2026-06-11 08:00','Taller','parcial_permanente',40,'[{"concepto":"Índice, falange distal","dias":100,"porcentaje":50},{"concepto":"Pulgar, falange próxima","dias":600,"porcentaje":100}]'),
 ('60000000-0000-0000-0000-0000000000f3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente','2026-06-12 08:00','Taller','temporal',5,'[]'),
 ('60000000-0000-0000-0000-0000000000f4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente','2026-06-13 08:00','Taller','parcial_permanente',900,'[{"concepto":"Mano hasta la muñeca","dias":3000,"porcentaje":100},{"concepto":"Pie hasta el tobillo","dias":2400,"porcentaje":100},{"concepto":"Un ojo","dias":1800,"porcentaje":100}]');
select 'fatal carga 6000 (debe 6000): ' || dias_cargados from public.eventos where id='60000000-0000-0000-0000-0000000000f1';
select 'parcial 100x50% + 600 (debe 650): ' || dias_cargados from public.eventos where id='60000000-0000-0000-0000-0000000000f2';
select 'temporal no carga (debe 0): ' || dias_cargados from public.eventos where id='60000000-0000-0000-0000-0000000000f3';
select 'temporal con tiempo perdido (debe 1): ' || con_tiempo_perdido::int from public.eventos where id='60000000-0000-0000-0000-0000000000f3';
select 'parcial con tope (debe 6000): ' || dias_cargados from public.eventos where id='60000000-0000-0000-0000-0000000000f4';
update public.eventos set incapacidad='sin_tiempo_perdido', dias_perdidos=0 where id='60000000-0000-0000-0000-0000000000f3';
select 'sin tiempo perdido al editar (debe 0): ' || con_tiempo_perdido::int from public.eventos where id='60000000-0000-0000-0000-0000000000f3';
-- Severidad: fatal 6000 + parcial max(650, 40) + parcial max(6000, 900) = 12650 días; reposo 940
select 'días perdidos + cargados para IS (debe 12650): ' || ((r->>'dias_perdidos')::int + (r->>'dias_cargados')::int)
  from public.indices_accidentalidad('20000000-0000-0000-0000-00000000000a','2026-06-01','2026-06-30') r;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  insert into public.lista_items (lista,org_id,codigo,nombre) values ('acto_inseguro','10000000-0000-0000-0000-000000000001','9999','x');
  raise notice 'RRHH edita la lista COVENIN: FALLA';
exception when insufficient_privilege then raise notice 'RRHH no edita la lista COVENIN (ok)'; end $$;
reset role;
