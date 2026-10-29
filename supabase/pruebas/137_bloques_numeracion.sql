-- Fase B (local primero): bloques de números de historia por equipo.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}',false) \g /dev/null
-- un bloque contiguo de 10, y el siguiente empieza después
create temp table b1 as select public.reservar_bloque('e0000000-0000-0000-0000-000000000001','s1',10) r;
select 'bloque de 10 (debe 1): ' || ((r->>'hasta')::bigint - (r->>'desde')::bigint = 9)::int from b1;
create temp table b2 as select public.reservar_bloque('e0000000-0000-0000-0000-000000000001','s1',10) r;
select 'el segundo no se solapa (debe 1): ' || ((select (r->>'desde')::bigint from b2) > (select (r->>'hasta')::bigint from b1))::int;
-- la web, después del bloque, recibe un número fuera de él (aunque mande uno propio)
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos, numero_historia)
 values ('30000000-0000-0000-0000-000000000137','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','137','Web','Numera', 5);
select 'la web no elige su número (debe 1): ' || (numero_historia > (select (r->>'hasta')::bigint from b2))::int
  from public.trabajadores where id='30000000-0000-0000-0000-000000000137';
-- el número de una historia no se cambia después
update public.trabajadores set numero_historia = 1 where id='30000000-0000-0000-0000-000000000137';
select 'el número no cambia (debe 1): ' || (numero_historia > (select (r->>'hasta')::bigint from b2))::int
  from public.trabajadores where id='30000000-0000-0000-0000-000000000137';
-- desde el equipo: un alta con número de su bloque se aplica con ese número
select 'alta con número del bloque (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 jsonb_build_array(jsonb_build_object('id','c0000000-0000-0000-0000-000000000137','tabla','public.trabajadores','fila_id','30000000-0000-0000-0000-000000000138','op','I',
   'datos', jsonb_build_object('org_id','10000000-0000-0000-0000-000000000001','empresa_id','20000000-0000-0000-0000-00000000000a','cedula','138','nombres','PC','apellidos','Bloque',
                               'numero_historia', (select (r->>'desde')::bigint from b1)))))) x where x->>'estado'='aplicado';
select 'quedó con el número de la PC (debe 1): ' || (numero_historia = (select (r->>'desde')::bigint from b1))::int
  from public.trabajadores where id='30000000-0000-0000-0000-000000000138';
-- un número fuera de los bloques del equipo se rechaza
select 'número ajeno rechazado (debe 1): ' || count(*) from jsonb_array_elements(public.aplicar_cambios('e0000000-0000-0000-0000-000000000001','s1',
 '[{"id":"c0000000-0000-0000-0000-000000000139","tabla":"public.trabajadores","fila_id":"30000000-0000-0000-0000-000000000139","op":"I",
   "datos":{"org_id":"10000000-0000-0000-0000-000000000001","empresa_id":"20000000-0000-0000-0000-00000000000a","cedula":"139","nombres":"X","apellidos":"Y","numero_historia":999999}}]')) x
 where x->>'estado'='rechazado' and x->>'motivo' like '%bloque%';
-- equipo desactivado o secreto malo: nada
do $$ begin perform public.reservar_bloque('e0000000-0000-0000-0000-000000000002','s2',10);
  raise notice 'equipo desactivado reservó: FALLA'; exception when insufficient_privilege then raise notice 'equipo desactivado no reserva (ok)'; end $$;
do $$ begin perform public.reservar_bloque('e0000000-0000-0000-0000-000000000001','malo',10);
  raise notice 'secreto malo reservó: FALLA'; exception when insufficient_privilege then raise notice 'secreto malo no reserva (ok)'; end $$;
do $$ begin perform count(*) from sync.bloques;
  raise notice 'el médico lee los bloques: FALLA'; exception when insufficient_privilege then raise notice 'el médico no lee los bloques (ok)'; end $$;
reset role;
