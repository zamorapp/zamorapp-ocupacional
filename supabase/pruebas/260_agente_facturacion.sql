-- Facturar con el agente (20261030961000): casilla «Cobros y precios» apagada por defecto, notas EN BORRADOR (varias
-- empresas a la vez), atendidos sin datos clínicos, descuento como renglón aparte, sin duplicar, nada que modifique
-- o borre, y precios que solo cambian cuando el doctor aprueba la propuesta.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Servicio con su motivo, precio convenido para B y dos atendidos de A en el período (uno ya cobrado)
insert into public.servicios (id,org_id,nombre,precio_usd,motivos) values
 ('70000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','Evaluación pre-empleo FAC',25,'PRE'),
 ('70000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','Charla FAC',100,null);
insert into public.precios_empresa (empresa_id,servicio_id,org_id,precio_usd) values
 ('20000000-0000-0000-0000-00000000000b','70000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001',80);
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,motivo_id) values
 ('60000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2026-09-03',
  (select id from public.lista_items where lista = 'motivo_consulta' and codigo = 'PRE' limit 1)),
 ('60000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2026-09-04',
  (select id from public.lista_items where lista = 'motivo_consulta' and codigo = 'PRE' limit 1)),
 ('60000000-0000-0000-0000-0000000000f3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada','2026-09-05',
  (select id from public.lista_items where lista = 'motivo_consulta' and codigo = 'PRE' limit 1));
insert into public.cobros (id,org_id,empresa_id) values ('80000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a');
insert into public.cobro_items (cobro_id,org_id,consulta_id,descripcion,precio_usd) values
 ('80000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-0000000000f3','Ya cobrada',25);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Cobrador', 'crear', 30) ->> 'llave' as kf \gset
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Mira cobros', 'consultar', 7) ->> 'llave' as kfc \gset
reset role;
select id as kf_id from public.agentes_llaves where nombre = 'Cobrador' \gset
select id as kfc_id from public.agentes_llaves where nombre = 'Mira cobros' \gset
select 'la casilla nace apagada (debe 0): ' || count(*) from public.agentes_llaves where cobros;

-- ===== Solo el administrador enciende la casilla =====
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.agentes_llave_cobros('10000000-0000-0000-0000-000000000001', (select null::uuid), true);
  raise notice 'FALLA: el médico tocó la casilla';
exception when insufficient_privilege then raise notice 'el médico no enciende cobros (debe 1): 1';
end $$;

-- ===== Sin la casilla, el agente no entra a cobros =====
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin casilla no lista cobros (debe 1): ' || ((public.puerta_facturacion(:'kf', 'listar_cobros') ->> 'error') like '%Cobros y precios%')::int;
select 'la llave inventada no entra (debe 1): ' || ((public.puerta_facturacion('zk_' || repeat('0', 64), 'listar_cobros') ->> 'ok') = 'false')::int;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador enciende la casilla (debe 1): ' || (public.agentes_llave_cobros('10000000-0000-0000-0000-000000000001', :'kf_id', true) ->> 'cobros' = 'true')::int;
select 'y la de consulta (debe 1): ' || (public.agentes_llave_cobros('10000000-0000-0000-0000-000000000001', :'kfc_id', true) ->> 'cobros' = 'true')::int;
select 'la pantalla ve la casilla (debe 2): ' || count(*) from jsonb_array_elements(public.agentes_estado('10000000-0000-0000-0000-000000000001') -> 'llaves') l where (l ->> 'cobros')::boolean;

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Consultas
select 'atendidos por cobrar de A: 2 sin cobrar (debe 2): ' || (e ->> 'atendidos')
  from jsonb_array_elements(public.puerta_facturacion(:'kfc', 'atendidos_por_cobrar', '{"desde":"2026-09-01","hasta":"2026-09-30"}') -> 'resultado' -> 'empresas') e
 where e ->> 'empresa_id' = '20000000-0000-0000-0000-00000000000a';
select 'los atendidos no traen nombres ni cédulas (debe 0): ' || (public.puerta_facturacion(:'kfc', 'atendidos_por_cobrar', '{"desde":"2026-09-01","hasta":"2026-09-30"}')::text ~ '(Ana|aptitud|cedula)')::int;
select 'la llave de consulta no crea notas (debe 1): ' || ((public.puerta_facturacion(:'kfc', 'crear_notas_cobro', '{"notas":[{"empresa_id":"20000000-0000-0000-0000-00000000000a","renglones":[{"descripcion":"X","precio_usd":1}]}]}') ->> 'error') like 'Esta llave solo consulta%')::int;
select 'acción que no está en la lista (debe 1): ' || ((public.puerta_facturacion(:'kf', 'emitir_factura', '{}') ->> 'ok') = 'false')::int;

-- Ensayo: no crea nada
select 'ensayo de dos notas (debe 2): ' || jsonb_array_length(public.puerta_facturacion(:'kf', 'crear_notas_cobro',
  '{"notas":[{"empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2026-09-01","hasta":"2026-09-30","atendidos":true},
             {"empresa_id":"20000000-0000-0000-0000-00000000000b","renglones":[{"servicio_id":"70000000-0000-0000-0000-0000000000f2","cantidad":2}]}]}', true) -> 'resultado' -> 'notas');
reset role;
select 'el ensayo no guardó notas (debe 0): ' || count(*) from public.cobros where por_agente is not null;

-- Dos empresas en una orden: A con sus atendidos y 10 % de descuento; B con el precio convenido
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.puerta_facturacion(:'kf', 'crear_notas_cobro',
  '{"notas":[{"empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2026-09-01","hasta":"2026-09-30","atendidos":true,"descuento":{"porcentaje":10,"motivo":"Pedido del doctor"}},
             {"empresa_id":"20000000-0000-0000-0000-00000000000b","renglones":[{"servicio_id":"70000000-0000-0000-0000-0000000000f2","cantidad":2}]}]}') as r \gset
select 'la orden salió bien (debe 1): ' || ((:'r'::jsonb ->> 'ok') = 'true')::int;
select 'total de las dos notas: 45 + 160 (debe 205): ' || (:'r'::jsonb -> 'resultado' ->> 'total_usd')::numeric::int;
select 'repetir la orden no duplica (debe 2): ' || (select count(*) from jsonb_array_elements(public.puerta_facturacion(:'kf', 'crear_notas_cobro',
  '{"notas":[{"empresa_id":"20000000-0000-0000-0000-00000000000a","desde":"2026-09-01","hasta":"2026-09-30","atendidos":true,"descuento":{"porcentaje":10}},
             {"empresa_id":"20000000-0000-0000-0000-00000000000b","renglones":[{"servicio_id":"70000000-0000-0000-0000-0000000000f2","cantidad":2}]}]}') -> 'resultado' -> 'notas') n
  where (n ->> 'ya_existia')::boolean);
select 'el descuento mayor que la nota se rechaza (debe 1): ' || ((public.puerta_facturacion(:'kf', 'crear_notas_cobro',
  '{"notas":[{"empresa_id":"20000000-0000-0000-0000-00000000000b","renglones":[{"descripcion":"Y","precio_usd":10}],"descuento":{"monto_usd":11}}]}') ->> 'error') like '%mayor que la nota%')::int;
select 'otra organización no existe para la llave (debe 1): ' || ((public.puerta_facturacion(:'kf', 'crear_notas_cobro',
  '{"notas":[{"empresa_id":"20000000-0000-0000-0000-0000000000f2","renglones":[{"descripcion":"Z","precio_usd":1}]}]}') ->> 'ok') = 'false')::int;
reset role;
select 'dos notas del agente, en borrador y sin Nº de factura (debe 2): ' || count(*) from public.cobros
 where por_agente = 'Cobrador' and estado = 'borrador' and tipo = 'cobro' and numero_factura_fiscal is null;
select 'la nota de A trae los 2 atendidos sin cobrar (debe 2): ' || count(*) from public.cobro_items i join public.cobros c on c.id = i.cobro_id
 where c.por_agente is not null and c.empresa_id = '20000000-0000-0000-0000-00000000000a' and i.consulta_id is not null;
select 'el descuento va en negativo y aparte (debe -5): ' || i.precio_usd::int from public.cobro_items i join public.cobros c on c.id = i.cobro_id
 where c.por_agente is not null and i.descripcion = 'Descuento 10 %';
select 'B con el precio convenido (debe 80): ' || i.precio_usd::int from public.cobro_items i join public.cobros c on c.id = i.cobro_id
 where c.por_agente is not null and c.empresa_id = '20000000-0000-0000-0000-00000000000b' and i.servicio_id = '70000000-0000-0000-0000-0000000000f2';
select 'quedó en el registro (debe 1): ' || count(*) from public.agentes_registro where llave_nombre = 'Cobrador' and accion = 'crear_notas_cobro' and ok and not ensayo and resumen like '2 nota(s)%';
select 'ninguna ayuda de cobros la ejecuta otro (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'agente\_fac\_%' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
select 'ninguna toca lo clínico, la firma ni el sello (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'agente\_fac\_%' or p.proname = 'puerta_facturacion') and p.prosrc ~* '(clinico\.|grupo_sanguineo|discapacidad|firma_url|sello_)';
select 'ninguna borra ni modifica (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'agente\_fac\_%' or p.proname = 'puerta_facturacion')
   and (p.prosrc ~* 'delete\s+from' or regexp_replace(p.prosrc, 'update public\.agentes_llaves', '', 'g') ~* '\mupdate\s+(public|clinico)\.');

-- ===== Precios: solo propuestas; cambian cuando el doctor aprueba =====
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.puerta_facturacion(:'kf', 'proponer_precio', '{"servicio_id":"70000000-0000-0000-0000-0000000000f1","precio_usd":30,"motivo":"Pedido del doctor"}') -> 'resultado' ->> 'propuesta_id' as pg \gset
select public.puerta_facturacion(:'kf', 'proponer_precio', '{"servicio_id":"70000000-0000-0000-0000-0000000000f2","precio_usd":90,"empresa_id":"20000000-0000-0000-0000-00000000000b"}') -> 'resultado' ->> 'propuesta_id' as pe \gset
select 'repetir la propuesta no duplica (debe 1): ' || ((public.puerta_facturacion(:'kf', 'proponer_precio', '{"servicio_id":"70000000-0000-0000-0000-0000000000f1","precio_usd":30}') -> 'resultado' ->> 'ya_existia') = 'true')::int;
select 'otro precio para el mismo servicio se acepta (debe 1): ' || ((public.puerta_facturacion(:'kf', 'proponer_precio', '{"servicio_id":"70000000-0000-0000-0000-0000000000f1","precio_usd":28}', true) ->> 'ok') = 'true')::int;
select 'la llave de consulta no propone (debe 1): ' || ((public.puerta_facturacion(:'kfc', 'proponer_precio', '{"servicio_id":"70000000-0000-0000-0000-0000000000f1","precio_usd":31}') ->> 'ok') = 'false')::int;
reset role;
select 'proponer no cambia el precio (debe 25): ' || precio_usd::int from public.servicios where id = '70000000-0000-0000-0000-0000000000f1';
select 'ni el de la empresa (debe 80): ' || precio_usd::int from public.precios_empresa where servicio_id = '70000000-0000-0000-0000-0000000000f2';
select 'la propuesta guarda antes 25 y después 30 (debe 1): ' || ((antes ->> 'precio_usd')::numeric = 25 and (propuesto ->> 'precio_usd')::numeric = 30)::int from public.agentes_propuestas where id = :'pg';

-- Quién ve las propuestas de precio: quien factura; nunca enfermería (aunque sea servicio médico)
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
select 'enfermería no ve propuestas de precio (debe 0): ' || count(*) from public.agentes_propuestas where tipo ~ '^precio_';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico (no factura) tampoco (debe 0): ' || count(*) from public.agentes_propuestas where tipo ~ '^precio_';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador sí (debe 2): ' || count(*) from public.agentes_propuestas where tipo ~ '^precio_';
reset role;
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000c7','recFac@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol,empresas_permitidas) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c7','recepcion',null);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000c7',false) \g /dev/null
select 'recepción sí (debe 2): ' || count(*) from public.agentes_propuestas where tipo ~ '^precio_';
reset role;
delete from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000000c7';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.aplicar_propuesta((select id from public.agentes_propuestas where tipo = 'precio_servicio' limit 1));
  if (select precio_usd from public.servicios where id = '70000000-0000-0000-0000-0000000000f1') = 30 then raise notice 'FALLA: RR. HH. cambió un precio'; end if;
  raise notice 'RR. HH. no aprueba precios (debe 1): 1';
exception when others then raise notice 'RR. HH. no aprueba precios (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.aplicar_propuesta(:'pg') \g /dev/null
select public.aplicar_propuesta(:'pe') \g /dev/null
reset role;
select 'aprobada, cambia el precio general (debe 30): ' || precio_usd::int from public.servicios where id = '70000000-0000-0000-0000-0000000000f1';
select 'y el de la empresa (debe 90): ' || precio_usd::int from public.precios_empresa where servicio_id = '70000000-0000-0000-0000-0000000000f2';
select 'las dos quedan aprobadas (debe 2): ' || count(*) from public.agentes_propuestas where id in (:'pg', :'pe') and estado = 'aprobada';
select 'las notas ya hechas no cambian (debe 80): ' || i.precio_usd::int from public.cobro_items i join public.cobros c on c.id = i.cobro_id
 where c.por_agente is not null and i.servicio_id = '70000000-0000-0000-0000-0000000000f2';

-- Una nota con total negativo no se emite
insert into public.cobros (id,org_id,empresa_id) values ('80000000-0000-0000-0000-0000000000f9','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b');
insert into public.cobro_items (cobro_id,org_id,descripcion,precio_usd) values
 ('80000000-0000-0000-0000-0000000000f9','10000000-0000-0000-0000-000000000001','Charla',10),
 ('80000000-0000-0000-0000-0000000000f9','10000000-0000-0000-0000-000000000001','Descuento',-11);
do $$ begin
  update public.cobros set estado = 'emitida' where id = '80000000-0000-0000-0000-0000000000f9';
  raise notice 'FALLA: se emitió una nota en negativo';
exception when others then raise notice 'nota en negativo no se emite (debe 1): 1';
end $$;
update public.cobro_items set precio_usd = -10 where cobro_id = '80000000-0000-0000-0000-0000000000f9' and descripcion = 'Descuento';
update public.cobros set estado = 'emitida' where id = '80000000-0000-0000-0000-0000000000f9';
select 'en cero sí se emite (debe 1): ' || count(*) from public.cobros where id = '80000000-0000-0000-0000-0000000000f9' and estado = 'emitida';
delete from public.cobros where id = '80000000-0000-0000-0000-0000000000f9';

-- Limpieza
delete from public.agentes_propuestas where id in (:'pg', :'pe');
delete from public.cobros where por_agente is not null or id = '80000000-0000-0000-0000-0000000000f1';
delete from clinico.consultas where id in ('60000000-0000-0000-0000-0000000000f1','60000000-0000-0000-0000-0000000000f2','60000000-0000-0000-0000-0000000000f3');
delete from public.precios_empresa where servicio_id = '70000000-0000-0000-0000-0000000000f2';
delete from public.servicios where id in ('70000000-0000-0000-0000-0000000000f1','70000000-0000-0000-0000-0000000000f2');
delete from public.agentes_llaves where nombre in ('Cobrador', 'Mira cobros');
