-- Informe de evaluación del puesto y exámenes escaneados anexados: cada quien ve solo lo suyo.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.puestos (id,org_id,empresa_id,nombre,riesgos,evaluacion,epp,recomendaciones,evaluado_por,evaluado_en) values
 ('58000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Soldador','{"fisico":["Ruido"]}','{"fisico|Ruido":{"p":4,"s":4,"control":"Protector auditivo"}}','Careta','Audiometría anual','00000000-0000-0000-0000-0000000000a2','2026-03-12'),
 ('58000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Chofer','{}','{}','Cinturón',null,null,null);
insert into clinico.adjuntos (org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano) values
 ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a','hematologia.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/x-hematologia.pdf','application/pdf',1000);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. de A ve el EPP de su puesto (debe 1): ' || count(*) from public.puestos where epp is not null and empresa_id = '20000000-0000-0000-0000-00000000000a';
select 'RR. HH. de A no ve el puesto de B (debe 0): ' || count(*) from public.puestos where id = '58000000-0000-0000-0000-00000000000b';
with x as (update public.puestos set recomendaciones = 'otra' where id = '58000000-0000-0000-0000-00000000000a' returning 1)
select 'RR. HH. de A no cambia la evaluación (debe 0): ' || count(*) from x;
select 'RR. HH. de A no ve los escaneados (debe 0): ' || count(*) from public.adjuntos;
do $$ begin
  insert into public.puestos (org_id,empresa_id,nombre,evaluado_por,evaluado_en) values
   ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Falso','00000000-0000-0000-0000-0000000000a2','2026-03-12');
  raise notice 'FALLA: RR. HH. firmó una evaluación a nombre del médico';
exception when others then
  if sqlerrm like '%solo la firma quien la hace%' then raise notice 'RR. HH. no firma por el médico (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'médico de A ve el escaneado de la consulta (debe 1): ' || count(*) from public.adjuntos where consulta_id = '40000000-0000-0000-0000-00000000000a';
with x as (update public.puestos set epp = 'otra' where id = '58000000-0000-0000-0000-00000000000a' returning 1)
select 'médico no edita puestos (debe 0): ' || count(*) from x;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
with x as (update public.puestos set epp = 'Careta y guantes' where id = '58000000-0000-0000-0000-00000000000a' returning 1)
select 'admin edita la evaluación del puesto (debe 1): ' || count(*) from x;
with x as (update public.puestos set evaluado_por = auth.uid(), evaluado_en = '2026-03-13' where id = '58000000-0000-0000-0000-00000000000a' returning 1)
select 'admin firma su propia evaluación (debe 1): ' || count(*) from x;
do $$ begin
  update public.puestos set evaluado_por = '00000000-0000-0000-0000-0000000000a2' where id = '58000000-0000-0000-0000-00000000000a';
  raise notice 'FALLA: el admin puso a otro como evaluador';
exception when others then
  if sqlerrm like '%solo la firma quien la hace%' then raise notice 'admin no pone a otro como evaluador (debe 1): 1';
  else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
reset role;
