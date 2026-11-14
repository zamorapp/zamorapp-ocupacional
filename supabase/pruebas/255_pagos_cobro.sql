-- Pagos y abonos de las notas de cobro (20261030956000): quien factura los registra en notas emitidas o pagadas;
-- el médico y RR. HH. no los ven; nada en borradores ni presupuestos.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into auth.users (id,email) values ('25500000-0000-0000-0000-0000000000c1','recep255@x');
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values
 ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000c1','recepcion','{20000000-0000-0000-0000-00000000000a}');
insert into public.cobros (id,org_id,empresa_id,estado,tipo) values
 ('25500000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','emitida','cobro'),
 ('25500000-0000-0000-0000-0000000000e2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','borrador','cobro'),
 ('25500000-0000-0000-0000-0000000000e3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','emitida','presupuesto'),
 ('25500000-0000-0000-0000-0000000000e4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','emitida','cobro');

-- 1. Recepción de la empresa A registra un abono en una nota emitida de A
set role authenticated;
select set_config('request.jwt.claim.sub','25500000-0000-0000-0000-0000000000c1',false) \g /dev/null
insert into public.cobro_pagos (org_id,cobro_id,metodo,referencia,monto_usd,tasa_bcv) values
 ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e1','pago_movil','0012345',40,250.5);
select 'recepción registra un abono (debe 1): ' || count(*) from public.cobro_pagos where cobro_id='25500000-0000-0000-0000-0000000000e1';
select 'con la fecha de Caracas y quien lo anotó (debe 1): ' || count(*) from public.cobro_pagos
 where cobro_id='25500000-0000-0000-0000-0000000000e1' and fecha = public.hoy_caracas() and creado_por='25500000-0000-0000-0000-0000000000c1';
do $$ begin
  insert into public.cobro_pagos (org_id,cobro_id,metodo,monto_usd) values ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e2','zelle',10);
  raise notice 'abono en un borrador: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.cobro_pagos (org_id,cobro_id,metodo,monto_usd) values ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e3','zelle',10);
  raise notice 'abono en un presupuesto: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.cobro_pagos (org_id,cobro_id,metodo,monto_usd) values ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e4','zelle',10);
  raise notice 'recepción de A abona una nota de la empresa B: FALLA';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.cobro_pagos (org_id,cobro_id,metodo,monto_usd) values ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e1','zelle',0);
  raise notice 'abono de 0 $: FALLA';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.cobro_pagos (org_id,cobro_id,metodo,monto_usd) values ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e1','cheque',5);
  raise notice 'método desconocido: FALLA';
exception when check_violation then null; end $$;

-- creado_por no se falsea
insert into public.cobro_pagos (id,org_id,cobro_id,metodo,monto_usd,creado_por) values
 ('25500000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e1','zelle',1,'00000000-0000-0000-0000-0000000000a1');
select 'el autor del abono es quien lo registra (debe 1): ' || count(*) from public.cobro_pagos where id='25500000-0000-0000-0000-0000000000f1' and creado_por='25500000-0000-0000-0000-0000000000c1';
update public.cobro_pagos set creado_por='00000000-0000-0000-0000-0000000000a1' where id='25500000-0000-0000-0000-0000000000f1';
select 'y no se cambia después (debe 1): ' || count(*) from public.cobro_pagos where id='25500000-0000-0000-0000-0000000000f1' and creado_por='25500000-0000-0000-0000-0000000000c1';
delete from public.cobro_pagos where id='25500000-0000-0000-0000-0000000000f1';

-- 2. El administrador ve y abona la nota de B; recepción de A no ve ese abono
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.cobro_pagos (org_id,cobro_id,metodo,referencia,monto_usd) values
 ('10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e4','binance','B-77',15);
select 'el administrador ve los dos abonos (debe 2): ' || count(*) from public.cobro_pagos where cobro_id::text like '25500000%';
select set_config('request.jwt.claim.sub','25500000-0000-0000-0000-0000000000c1',false) \g /dev/null
select 'recepción de A no ve el abono de B (debe 1): ' || count(*) from public.cobro_pagos where cobro_id::text like '25500000%';

-- 3. El médico y RR. HH. no ven pagos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico no ve pagos (debe 0): ' || count(*) from public.cobro_pagos where cobro_id::text like '25500000%';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve pagos (debe 0): ' || count(*) from public.cobro_pagos where cobro_id::text like '25500000%';

-- 4. Al pagarse la nota se puede borrar un abono equivocado; y queda en la réplica del escritorio
select set_config('request.jwt.claim.sub','25500000-0000-0000-0000-0000000000c1',false) \g /dev/null
reset role;
update public.cobros set estado='pagada' where id='25500000-0000-0000-0000-0000000000e1';
set role authenticated;
select set_config('request.jwt.claim.sub','25500000-0000-0000-0000-0000000000c1',false) \g /dev/null
delete from public.cobro_pagos where cobro_id='25500000-0000-0000-0000-0000000000e1';
select 'recepción borra el abono de una nota pagada (debe 0): ' || count(*) from public.cobro_pagos where cobro_id='25500000-0000-0000-0000-0000000000e1';
-- En una nota anulada el abono se ve pero no se cambia ni se borra
reset role;
insert into public.cobro_pagos (id,org_id,cobro_id,metodo,monto_usd) values
 ('25500000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','25500000-0000-0000-0000-0000000000e1','zelle',5);
update public.cobros set estado='anulada' where id='25500000-0000-0000-0000-0000000000e1';
set role authenticated;
select set_config('request.jwt.claim.sub','25500000-0000-0000-0000-0000000000c1',false) \g /dev/null
update public.cobro_pagos set monto_usd=99 where id='25500000-0000-0000-0000-0000000000f2';
delete from public.cobro_pagos where id='25500000-0000-0000-0000-0000000000f2';
select 'en nota anulada el abono queda intacto (debe 1): ' || count(*) from public.cobro_pagos where id='25500000-0000-0000-0000-0000000000f2' and monto_usd=5;
reset role;
select 'la tabla se replica en el escritorio (debe 1): ' || count(*) from sync.tablas where nombre='public.cobro_pagos' and subible;
select 'el alta y el borrado del abono quedan en la bitácora (debe 1): ' || (count(*) >= 2)::int from public.bitacora where tabla='public.cobro_pagos';
select 'cada cambio queda anotado para el escritorio (debe 1): ' || (count(*) >= 3)::int from sync.registro where tabla='public.cobro_pagos';

-- 5. Sin sesión, nada
set role anon;
do $$ begin
  perform 1 from public.cobro_pagos;
  raise notice 'anon lee cobro_pagos: FALLA';
exception when insufficient_privilege then null; end $$;

reset role;
delete from public.cobros where id::text like '25500000%';
delete from public.miembros where usuario_id='25500000-0000-0000-0000-0000000000c1';
delete from auth.users where id='25500000-0000-0000-0000-0000000000c1';
