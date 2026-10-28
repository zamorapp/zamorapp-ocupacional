-- Mantenimiento: purga solo PDF de enlaces vencidos/revocados; los usuarios de la app no pueden llamarlo.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set session_replication_role = replica;
insert into public.envios (id,org_id,empresa_id,fecha_lote,canal,destinatario,consultas,documentos,asunto,mensaje,estado,enviado_por)
 values ('5c000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'whatsapp','+584120000000','{50000000-0000-0000-0000-000000000001}','{constancia}','x','x','enlace','00000000-0000-0000-0000-0000000000a1'),
        ('5c000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',public.hoy_caracas(),'whatsapp','+584120000001','{50000000-0000-0000-0000-000000000001}','{constancia}','x','x','enlace','00000000-0000-0000-0000-0000000000a1');
insert into public.envio_enlaces (id,org_id,envio_id,token_hash,vence) values
 ('5d000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','5c000000-0000-0000-0000-000000000001',sha256('m1'),now() - interval '1 day'),
 ('5d000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','5c000000-0000-0000-0000-000000000002',sha256('m2'),now() + interval '1 day');
insert into public.envio_archivos (enlace_id,nombre,contenido) values
 ('5d000000-0000-0000-0000-000000000001','a.pdf','x'), ('5d000000-0000-0000-0000-000000000002','b.pdf','x');
set session_replication_role = origin;
select 'purga solo el enlace vencido (debe 1): ' || (public.mantenimiento_purgar() ->> 'pdf_enlaces_vencidos');
select 'el PDF vigente sigue (debe 1): ' || count(*) from public.envio_archivos where enlace_id = '5d000000-0000-0000-0000-000000000002';
select 'el enlace vencido queda como constancia (debe 1): ' || count(*) from public.envio_enlaces where id = '5d000000-0000-0000-0000-000000000001';
insert into storage.objects (bucket_id,name) values ('adjuntos','10000000-0000-0000-0000-000000000001/x/huerfano.pdf');
select 'detecta el adjunto huérfano (debe 1): ' || (public.mantenimiento_resumen() ->> 'adjuntos_huerfanos');
delete from storage.objects where name like '%huerfano.pdf';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  perform public.mantenimiento_purgar();
  raise notice 'un usuario de la app ejecuta la purga: FALLA';
exception when insufficient_privilege then raise notice 'un usuario de la app no ejecuta la purga (ok)'; end $$;
reset role;
