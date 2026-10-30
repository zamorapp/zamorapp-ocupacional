-- Respuestas con datos médicos: RR. HH. no las ve ni en la tabla, ni en la vista, ni en el bucket; las constancias sí
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.solicitudes (id, org_id, empresa_id, tipo, detalle, solicitada_por) values
 ('c1590000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Informe médico','Para el seguro','00000000-0000-0000-0000-0000000000a3'),
 ('c1590000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Copia','Copia de la constancia','00000000-0000-0000-0000-0000000000a3');
insert into storage.objects (bucket_id,name) values
 ('solicitudes','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/c1590000-0000-0000-0000-000000000001/informe.pdf'),
 ('solicitudes','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/c1590000-0000-0000-0000-000000000002/constancia.pdf');
set role authenticated;

-- El médico responde: el informe solo para salud y la constancia para la empresa
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.solicitudes set estado='respondida', respuesta='Dx: lumbalgia', documento_nombre='Informe médico.pdf', solo_salud=true,
  documento_ruta='10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/c1590000-0000-0000-0000-000000000001/informe.pdf'
 where id='c1590000-0000-0000-0000-000000000001';
update public.solicitudes set estado='respondida', respuesta='Adjunta', documento_nombre='Constancia de aptitud.pdf', solo_salud=false,
  documento_ruta='10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/c1590000-0000-0000-0000-000000000002/constancia.pdf'
 where id='c1590000-0000-0000-0000-000000000002';
select 'el informe queda solo para salud (debe 1): ' || count(*) from public.solicitudes
 where id='c1590000-0000-0000-0000-000000000001' and solo_salud;
select 'el servicio ve las dos respuestas (debe 2): ' || count(*) from public.solicitudes_respuesta
 where id::text like 'c1590000-%' and respuesta is not null and documento_ruta is not null;
select 'el servicio baja los dos archivos (debe 2): ' || count(*) from storage.objects
 where bucket_id='solicitudes' and name like '%/c1590000-%';

-- RR. HH. de A
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH ve el estado de las dos (debe 2): ' || count(*) from public.solicitudes where id::text like 'c1590000-%' and estado='respondida';
do $$ begin perform respuesta from public.solicitudes limit 1;
  raise notice 'RRHH lee la respuesta en la tabla: FALLA';
exception when insufficient_privilege then raise notice 'RRHH no lee la respuesta en la tabla (ok)'; end $$;
do $$ begin perform documento_ruta from public.solicitudes limit 1;
  raise notice 'RRHH lee la ruta en la tabla: FALLA';
exception when insufficient_privilege then raise notice 'RRHH no lee la ruta en la tabla (ok)'; end $$;
select 'RRHH no ve la respuesta médica en la vista (debe 0): ' || count(*) from public.solicitudes_respuesta where id='c1590000-0000-0000-0000-000000000001';
select 'RRHH ve la respuesta de la constancia (debe 1): ' || count(*) from public.solicitudes_respuesta
 where id='c1590000-0000-0000-0000-000000000002' and respuesta='Adjunta';
select 'RRHH no baja el informe del bucket (debe 0): ' || count(*) from storage.objects where bucket_id='solicitudes' and name like '%/c1590000-0000-0000-0000-000000000001/%';
select 'RRHH baja la constancia (debe 1): ' || count(*) from storage.objects where bucket_id='solicitudes' and name like '%/c1590000-0000-0000-0000-000000000002/%';
with x as (update public.solicitudes set solo_salud=false where id='c1590000-0000-0000-0000-000000000001' returning 1)
select 'RRHH no cambia solo_salud (debe 0): ' || count(*) from x;

reset role;
delete from storage.objects where bucket_id='solicitudes' and name like '%/c1590000-%';
delete from public.solicitudes where id::text like 'c1590000-%';
