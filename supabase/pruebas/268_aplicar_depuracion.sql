-- Confirmar la depuración de nómina en UNA llamada (migración 20261030970000; Cesar 18-nov: 76 personas, el botón
-- giró y no aplicó nada). La función hace todo dentro de la base: agrupa por motivo, un solo lote, cierra el enlace.
\pset tuples_only on
reset role;
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, estado) values
 ('26800000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-26800001','Renata','Renuncio','activo'),
 ('26800000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-26800002','Despedida','Sale','activo'),
 ('26800000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-26800003','Dereposo','Sale','reposo'),
 ('26800000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-26800004','Sigue','Aqui','activo'),
 ('26800000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-26800005','Yaestaba','Inactiva','inactivo'),
 ('26800000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','V-26800009','Otra','Empresa','activo'),
 ('26800000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-26800010','Desmarcado','Queda','activo');
-- La depuración se arma a mano (el camino del enlace ya lo cubre la 227)
insert into public.depuraciones_nomina (id, org_id, empresa_id, token, vence, telefono_hash, telefono_fin, respuestas)
values ('26800000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
        repeat('a', 32), public.ahora() + interval '7 days', decode(repeat('0', 64), 'hex'), '4567',
        '{"26800000-0000-0000-0000-000000000001":{"e":"no","m":"Renunció"},
          "26800000-0000-0000-0000-000000000002":{"e":"no","m":"Despido"},
          "26800000-0000-0000-0000-000000000003":{"e":"no"},
          "26800000-0000-0000-0000-000000000004":{"e":"si"},
          "26800000-0000-0000-0000-000000000005":{"e":"no"},
          "26800000-0000-0000-0000-000000000009":{"e":"no"}}'),
       ('26800000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
        repeat('b', 32), public.ahora() + interval '7 days', decode(repeat('0', 64), 'hex'), '4567',
        '{"26800000-0000-0000-0000-000000000004":{"e":"si"}}'),
       ('26800000-0000-0000-0000-0000000000d3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b',
        repeat('c', 32), public.ahora() + interval '7 days', decode(repeat('0', 64), 'hex'), '4567',
        '{"26800000-0000-0000-0000-000000000009":{"e":"no"}}'),
       ('26800000-0000-0000-0000-0000000000d4','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
        repeat('d', 32), public.ahora() + interval '7 days', decode(repeat('0', 64), 'hex'), '4567',
        '{"26800000-0000-0000-0000-000000000010":{"e":"no","m":"Despido"}}');

-- Ni el anónimo ni RR. HH. la pueden llamar; el médico de A tampoco toca la de B
set role anon;
do $$ begin
  perform public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d1');
  raise notice 'anónimo confirma: FALLA';
exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d1');
  raise notice 'RR. HH. confirma: FALLA';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d3');
  raise notice 'médico de A confirma la de B: FALLA';
exception when insufficient_privilege then null; end $$;

-- El médico de A confirma la suya en una sola llamada: 3 de una vez (activo, activo y reposo), dos motivos
create temp table r268 as select public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d1') as r;
select 'inactivó a los 3 de una vez (debe 3): ' || (select r ->> 'inactivados' from r268);
select 'devuelve el lote (debe 1): ' || ((select r ->> 'lote' from r268) is not null)::int;
select 'avisa que cerró (debe 1): ' || ((select r ->> 'cerrada' from r268) = 'true')::int;
reset role;
select 'los 3 en el MISMO lote pese a dos motivos (debe 1): ' || (select count(*) from public.nomina_actualizaciones
  where id = ((select r ->> 'lote' from r268))::uuid and jsonb_array_length(inactivados) = 3);
select 'los dos activos inactivos (debe 2): ' || count(*) from public.trabajadores
 where id in ('26800000-0000-0000-0000-000000000001','26800000-0000-0000-0000-000000000002') and estado = 'inactivo';
select 'el de reposo también quedó inactivo (debe 1): ' || count(*) from public.trabajadores
 where id = '26800000-0000-0000-0000-000000000003' and estado = 'inactivo';
select 'el que sigue no se tocó (debe 1): ' || count(*) from public.trabajadores
 where id = '26800000-0000-0000-0000-000000000004' and estado = 'activo' and fecha_inactivo is null;
select 'la ya inactiva no se tocó (debe 1): ' || count(*) from public.trabajadores
 where id = '26800000-0000-0000-0000-000000000005' and fecha_inactivo is null;
select 'la de otra empresa no se tocó (debe 1): ' || count(*) from public.trabajadores
 where id = '26800000-0000-0000-0000-000000000009' and estado = 'activo';
select 'motivo con su texto (debe 1): ' || (select (motivo_inactivo ~ '^Ya no está según RR\. HH\. \([0-9]{2}/[0-9]{2}/[0-9]{4}\): Renunció$')::int
  from public.trabajadores where id = '26800000-0000-0000-0000-000000000001');
select 'sin motivo: solo el texto base (debe 1): ' || (select (motivo_inactivo ~ '^Ya no está según RR\. HH\. \([0-9]{2}/[0-9]{2}/[0-9]{4}\)$')::int
  from public.trabajadores where id = '26800000-0000-0000-0000-000000000003');
select 'la depuración quedó cerrada con su lote (debe 1): ' || (select (aplicado_en is not null and lote_id = ((select r ->> 'lote' from r268))::uuid)::int
  from public.depuraciones_nomina where id = '26800000-0000-0000-0000-0000000000d1');
-- Confirmarla dos veces no hace nada: avisa que ya se cerró
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d1');
  raise notice 'segunda confirmación: FALLA';
exception when invalid_parameter_value then null; end $$;
-- Sin «ya no está» no cierra ni crea lote: la acción decide según los agregados
select 'sin «no»: no inactiva a nadie (debe 0): ' || (public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d2') ->> 'inactivados');
reset role;
select 'sin «no»: la depuración sigue abierta (debe 1): ' || (select (aplicado_en is null and lote_id is null)::int
  from public.depuraciones_nomina where id = '26800000-0000-0000-0000-0000000000d2');
-- El desmarcado en la pantalla se queda (la base solo quita de su lista); al volver a llamar sin exclusión sí sale
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d4', array['26800000-0000-0000-0000-000000000010'::uuid]) \g /dev/null
reset role;
select 'el desmarcado no salió (debe 1): ' || count(*) from public.trabajadores
 where id = '26800000-0000-0000-0000-000000000010' and estado = 'activo';
select 'sin nada que aplicar no cierra (debe 1): ' || (select (aplicado_en is null)::int
  from public.depuraciones_nomina where id = '26800000-0000-0000-0000-0000000000d4');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
create temp table r268b as select public.aplicar_depuracion_nomina('26800000-0000-0000-0000-0000000000d4') as r;
select 'al confirmar de verdad sí sale (debe 1): ' || (select r ->> 'inactivados' from r268b);
reset role;
select 'quedó inactivo (debe 1): ' || count(*) from public.trabajadores
 where id = '26800000-0000-0000-0000-000000000010' and estado = 'inactivo';

reset role;
delete from public.depuraciones_nomina where id::text like '26800000-%';
delete from public.nomina_actualizaciones where id in ((select (r ->> 'lote')::uuid from r268), (select (r ->> 'lote')::uuid from r268b));
delete from public.trabajadores where id::text like '26800000-%';
