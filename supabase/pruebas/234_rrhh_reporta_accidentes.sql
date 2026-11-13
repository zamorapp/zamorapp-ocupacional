-- RR. HH. reporta accidentes de su empresa (20261030935000): solo crea el reporte inicial, solo en su empresa,
-- sin enfermedades ni declaración; no edita ni borra. El servicio recibe el aviso en la campana, RR. HH. no.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.notificaciones where titulo like '%reportado por RR. HH.';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null

-- 1. Reporte válido de un accidente con lesionado de A
insert into public.eventos (id,org_id,empresa_id,trabajador_id,tipo,subtipo,fecha_hora,lugar,descripcion,gravedad) values
 ('23400000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
  '30000000-0000-0000-0000-00000000000a','accidente','trabajo',now(),'Taller','Se golpeó la mano','leve');
select 'RR. HH. reporta un accidente de su empresa (debe 1): ' || count(*) from public.eventos where id='23400000-0000-0000-0000-0000000000e1';
-- Incidente sin lesionado
insert into public.eventos (org_id,empresa_id,tipo,fecha_hora,lugar) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','incidente',now(),'Patio');
select 'y un incidente sin lesionado (debe 1): ' || count(*) from public.eventos where tipo='incidente' and lugar='Patio';

-- 2. Lo que no puede
do $$ begin
  insert into public.eventos (org_id,empresa_id,tipo,fecha_hora) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','accidente',now());
  raise notice 'RR. HH. reporta en otra empresa: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000b','accidente',now());
  raise notice 'RR. HH. pone de lesionado a un trabajador de otra empresa: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','enfermedad',now());
  raise notice 'RR. HH. registra una enfermedad ocupacional: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.eventos (org_id,empresa_id,tipo,fecha_hora,estado,fecha_declaracion) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','accidente',now(),'declarado',now());
  raise notice 'RR. HH. lo marca como declarado: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,consulta_id) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente',now(),'40000000-0000-0000-0000-00000000000a');
  raise notice 'RR. HH. lo enlaza a una consulta: FALLA';
exception when insufficient_privilege then null; end $$;
with x as (update public.eventos set gravedad='grave' where id='23400000-0000-0000-0000-0000000000e1' returning 1)
select 'RR. HH. no edita lo reportado (debe 0): ' || count(*) from x;
with x as (delete from public.eventos where id='23400000-0000-0000-0000-0000000000e1' returning 1)
select 'RR. HH. no lo borra (debe 0): ' || count(*) from x;
select 'pero sí lo sigue viendo (debe 1): ' || count(*) from public.eventos where id='23400000-0000-0000-0000-0000000000e1';

-- 3. Avisos: al administrador y al médico de A; nunca a RR. HH.; sin diagnóstico
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'aviso al administrador con número, empresa y lugar (debe 1): ' || count(*) from public.notificaciones
 where titulo='Accidente reportado por RR. HH.' and usuario_id='00000000-0000-0000-0000-0000000000a1'
   and texto like '#% · A · Taller. Revise y declare a tiempo.' and enlace='/accidentes/23400000-0000-0000-0000-0000000000e1';
select 'aviso al médico de A (debe 1): ' || count(*) from public.notificaciones
 where titulo='Accidente reportado por RR. HH.' and usuario_id='00000000-0000-0000-0000-0000000000a2';
select 'el incidente también avisa al administrador y al médico de A (debe 2): ' || count(*) from public.notificaciones
 where titulo='Incidente reportado por RR. HH.' and usuario_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
select 'nadie del servicio de otra empresa recibe el aviso (debe 0): ' || count(*) from public.notificaciones n
  join public.miembros m on m.usuario_id = n.usuario_id and m.org_id = n.org_id
 where n.titulo like '%reportado por RR. HH.' and m.empresas_permitidas is not null and not ('20000000-0000-0000-0000-00000000000a' = any (m.empresas_permitidas));
select 'RR. HH. no recibe su propio aviso (debe 0): ' || count(*) from public.notificaciones
 where titulo like '%reportado por RR. HH.' and usuario_id='00000000-0000-0000-0000-0000000000a3';

-- 4. Si lo registra el médico no sale este aviso (el centinela de plazos sigue igual)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.eventos (org_id,empresa_id,trabajador_id,tipo,fecha_hora,lugar) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','accidente',now(),'Oficina');
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'el médico registra: sin aviso de RR. HH. (debe 0): ' || count(*) from public.notificaciones where texto like '% · Oficina.%';
delete from public.eventos where lugar in ('Taller','Patio','Oficina') and empresa_id='20000000-0000-0000-0000-00000000000a';
delete from public.notificaciones where titulo like '%reportado por RR. HH.';
