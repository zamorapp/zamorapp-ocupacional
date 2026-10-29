-- Números de las pestañas de Envíos: por enviar (firmadas con aptitud sin envío vigente) y correos por reintentar.
-- Mide la diferencia antes y después, así no depende de los datos de otras pruebas. Deja los datos como los encontró.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select por_enviar as por_enviar_antes, pendientes as pendientes_antes from public.contar_envios() \gset
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('c1240000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas()),
 ('c1240000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas()),
 ('c1240000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas());
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion)
select '10000000-0000-0000-0000-000000000001', id, '30000000-0000-0000-0000-00000000000a', 'elegible' from clinico.consultas where id::text like 'c1240000-%' and id <> 'c1240000-0000-0000-0000-000000000003';
-- La 1 ya salió por enlace; un correo de la 2 falló (cuenta como pendiente y la 2 sigue por enviar)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado) values
 ('e1240000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'whatsapp','+584140000000','{c1240000-0000-0000-0000-000000000001}','{constancia}','x','x','enlace'),
 ('e1240000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh@a.com','{c1240000-0000-0000-0000-000000000002}','{constancia}','x','x','enviando');
update public.envios set estado = 'fallido', error = 'prueba' where id = 'e1240000-0000-0000-0000-000000000002';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'por enviar suma solo la firmada con aptitud sin envío vigente (debe 1): ' || (por_enviar - :por_enviar_antes) from public.contar_envios();
select 'el correo fallido cuenta como pendiente (debe 1): ' || (pendientes - :pendientes_antes) from public.contar_envios();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no cuenta consultas ni envíos (debe 0): ' || (por_enviar + pendientes) from public.contar_envios();
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Al reintentar (y salir bien), el fallido deja de estar pendiente
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado,reintento_de) values
 ('e1240000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'correo','rrhh@a.com','{c1240000-0000-0000-0000-000000000002}','{constancia}','x','x','enviando','e1240000-0000-0000-0000-000000000002');
update public.envios set estado = 'enviado' where id = 'e1240000-0000-0000-0000-000000000003';
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'reintentado ya no es pendiente y la 2 ya salió (debe 0): ' || ((pendientes - :pendientes_antes) + (por_enviar - :por_enviar_antes)) from public.contar_envios();
set role anon;
do $$ begin
  perform public.contar_envios();
  raise notice 'FALLA: sin cuenta se cuentan envíos';
exception when insufficient_privilege then raise notice 'sin cuenta no cuenta (debe 1): 1';
end $$;

reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
delete from public.envios where consultas && '{c1240000-0000-0000-0000-000000000001,c1240000-0000-0000-0000-000000000002,c1240000-0000-0000-0000-000000000003}'::uuid[];
delete from clinico.aptitudes where consulta_id::text like 'c1240000-%';
delete from clinico.consultas where id::text like 'c1240000-%';
