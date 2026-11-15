-- Mantenimiento: borra invitaciones de RR. HH. vencidas o anuladas sin usar a los 30 días; las usadas y las recientes quedan.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
set session_replication_role = replica;
insert into public.invitaciones (id,org_id,empresa_id,token_hash,vence,usada_por,usada_en,revocada_en,creada_por) values
 ('6a000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',sha256('i1'),now() - interval '40 days',null,null,null,'00000000-0000-0000-0000-0000000000a1'),
 ('6a000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',sha256('i2'),now() + interval '1 day',null,null,now() - interval '31 days','00000000-0000-0000-0000-0000000000a1'),
 ('6a000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',sha256('i3'),now() - interval '60 days','00000000-0000-0000-0000-0000000000a1',now() - interval '61 days',null,'00000000-0000-0000-0000-0000000000a1'),
 ('6a000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',sha256('i4'),now() - interval '5 days',null,null,null,'00000000-0000-0000-0000-0000000000a1');
set session_replication_role = origin;
select 'borra la vencida y la anulada viejas (debe 2): ' || (public.mantenimiento_purgar() ->> 'invitaciones_viejas');
select 'la usada queda como registro (debe 1): ' || count(*) from public.invitaciones where id = '6a000000-0000-0000-0000-000000000003';
select 'la vencida hace 5 días sigue (debe 1): ' || count(*) from public.invitaciones where id = '6a000000-0000-0000-0000-000000000004';
delete from public.invitaciones where id::text like '6a000000-%';
