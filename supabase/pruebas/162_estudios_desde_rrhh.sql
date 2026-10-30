-- RR. HH. envía un estudio digitalizado: entra al expediente y avisa al médico, pero RR. HH. no puede verlo ni
-- bajarlo después, ni enviarlo a un trabajador de otra empresa. La ficha liga archivos a estudios del catálogo.
\pset tuples_only on
reset role;
-- En Supabase storage guarda el dueño y el tipo y tamaño reales del archivo; el stub no los trae
alter table storage.objects add column if not exists owner_id text, add column if not exists metadata jsonb;
insert into public.lista_items (id,lista,org_id,nombre) values ('16200000-0000-0000-0000-000000000001','paraclinico','10000000-0000-0000-0000-000000000001','Rx 162');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
insert into storage.objects (bucket_id,name,owner_id,metadata) values
 ('adjuntos','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-162-rx.pdf','00000000-0000-0000-0000-0000000000a3','{"mimetype":"application/pdf","size":1000}'),
 ('adjuntos','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-162-html.pdf','00000000-0000-0000-0000-0000000000a3','{"mimetype":"text/html","size":500}'),
 ('adjuntos','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-162-ajeno.pdf',null,'{"mimetype":"application/pdf","size":500}');
select 'RR. HH. sube el archivo de su trabajador (debe 1): 1';
do $$ begin
  insert into storage.objects (bucket_id,name) values ('adjuntos','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000b/rrhh-162-b.pdf');
  raise notice 'FALLA: RR. HH. subió a un trabajador de otra empresa';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into storage.objects (bucket_id,name) values ('adjuntos','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/162-sin-marca.pdf');
  raise notice 'FALLA: RR. HH. subió fuera de su carpeta rrhh-';
exception when insufficient_privilege then null; end $$;
select 'registra el estudio (debe 1): ' || count(*) from (select public.entregar_estudio('30000000-0000-0000-0000-00000000000a',
  '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-162-rx.pdf', 'Rx tórax.pdf', 'application/pdf', 1,
  '16200000-0000-0000-0000-000000000001', 'Hecho el 20/10')) x where x is not null;
select 'RR. HH. no ve el adjunto (debe 0): ' || count(*) from public.adjuntos where ruta like '%rrhh-162%';
select 'RR. HH. no ve el archivo (debe 0): ' || count(*) from storage.objects where name like '%rrhh-162%';
select 'RR. HH. no ve el aviso del médico (debe 0): ' || count(*) from public.notificaciones where titulo = 'Estudio recibido de RR. HH.';
do $$ begin
  perform public.entregar_estudio('30000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000b/rrhh-x.pdf', 'x.pdf', 'application/pdf', 10, null, null);
  raise notice 'FALLA: registró un estudio de un trabajador de otra empresa';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.entregar_estudio('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-no-existe.pdf', 'x.pdf', 'application/pdf', 10, null, null);
  raise notice 'FALLA: registró un archivo que no se subió';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.entregar_estudio('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000b/rrhh-162-b.pdf', 'x.pdf', 'application/pdf', 10, null, null);
  raise notice 'FALLA: aceptó la ruta de otro trabajador';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.entregar_estudio('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-162-html.pdf', 'x.pdf', 'application/pdf', 10, null, null);
  raise notice 'FALLA: aceptó un HTML declarado como PDF';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.entregar_estudio('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-162-ajeno.pdf', 'x.pdf', 'application/pdf', 500, null, null);
  raise notice 'FALLA: aceptó un archivo sin dueño';
exception when invalid_parameter_value then null; end $$;
-- El médico de la empresa A lo ve en el expediente, ligado al estudio, y recibió el aviso
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico lo ve con el tipo y tamaño reales, ligado al estudio (debe 1): ' || count(*) from public.adjuntos where ruta like '%rrhh-162-rx.pdf' and tamano = 1000 and tipo_mime = 'application/pdf' and examenes = '{16200000-0000-0000-0000-000000000001}' and descripcion = 'Enviado por RR. HH.: Hecho el 20/10' and consulta_id is null;
select 'el médico recibió el aviso (debe 1): ' || count(*) from public.notificaciones where titulo = 'Estudio recibido de RR. HH.' and texto like 'Ana A · Rx 162';
do $$ begin
  perform public.entregar_estudio('30000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/rrhh-162-rx.pdf', 'x.pdf', 'application/pdf', 10, null, null);
  raise notice 'FALLA: el personal de salud usó la entrada de RR. HH.';
exception when insufficient_privilege then null; end $$;
-- La ficha: el médico liga un archivo sin consulta a un estudio del catálogo, no a uno inventado
insert into public.adjuntos (org_id,trabajador_id,nombre,ruta,tipo_mime,tamano,examenes) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','eco.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/162-ficha.pdf','application/pdf',10,'{16200000-0000-0000-0000-000000000001}');
select 'la ficha liga el archivo a un estudio del catálogo (debe 1): ' || count(*) from public.adjuntos where ruta like '%162-ficha.pdf';
do $$ begin
  insert into public.adjuntos (org_id,trabajador_id,nombre,ruta,tipo_mime,tamano,examenes) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','x.pdf','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/162-otro.pdf','application/pdf',10,'{inventado}');
  raise notice 'FALLA: ligó la ficha a un estudio que no está en el catálogo';
exception when raise_exception then null; end $$;
reset role;
delete from public.notificaciones where titulo = 'Estudio recibido de RR. HH.';
delete from clinico.adjuntos where ruta like '%162%';
delete from storage.objects where name like '%162%';
delete from public.lista_items where id = '16200000-0000-0000-0000-000000000001';
