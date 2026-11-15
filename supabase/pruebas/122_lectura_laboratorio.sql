-- Lectura de laboratorio: bitácora de la lectura (solo quien ve la consulta) y motivo «Consulta médica general».
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha,paraclinicos) values
 ('12200000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',current_date,'[]'),
 ('12200000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','borrador',current_date,'[]');
insert into clinico.adjuntos (id,org_id,trabajador_id,consulta_id,nombre,ruta,tipo_mime,tamano) values
 ('12200000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','12200000-0000-0000-0000-00000000000a','lab.jpg','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-00000000000a/lab.jpg','image/jpeg',100);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.registrar_lectura_laboratorio('12200000-0000-0000-0000-00000000000a','12200000-0000-0000-0000-0000000000f1','V-12.345.678',false,true,5) \g /dev/null
reset role;
select 'la cédula ignorada queda en la bitácora con la cédula leída (debe 1): ' || count(*) from public.bitacora
 where tabla = 'clinico.lectura_laboratorio' and registro_id = '12200000-0000-0000-0000-00000000000a'
   and despues ->> 'cedula_leida' = 'V-12.345.678' and (despues ->> 'cedula_ignorada')::boolean and usuario_id = '00000000-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.registrar_lectura_laboratorio('12200000-0000-0000-0000-00000000000b',null,null,false,false,1);
  raise notice 'FALLA: registró en una consulta de otra empresa';
exception when insufficient_privilege then raise notice 'no registra en consultas que no ve (debe 1): 1';
end $$;
do $$ begin
  perform public.registrar_lectura_laboratorio('12200000-0000-0000-0000-00000000000a',null,'<script>',false,false,1);
  raise notice 'FALLA: aceptó una cédula con caracteres raros';
exception when others then
  if sqlerrm like '%Cédula leída no válida%' then raise notice 'rechaza cédulas con caracteres raros (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.registrar_lectura_laboratorio('12200000-0000-0000-0000-00000000000a',null,null,false,false,1);
  raise notice 'FALLA: RR. HH. registró una lectura clínica';
exception when insufficient_privilege then raise notice 'RR. HH. no registra lecturas (debe 1): 1';
end $$;
set role anon;
do $$ begin
  perform public.registrar_lectura_laboratorio('12200000-0000-0000-0000-00000000000a',null,null,false,false,1);
  raise notice 'FALLA: anónimo ejecutó la función';
exception when insufficient_privilege then raise notice 'anónimo no ejecuta (debe 1): 1';
end $$;

reset role;
select 'la organización tiene «Consulta médica general» (debe 1): ' || count(*) from public.lista_items
 where org_id = '10000000-0000-0000-0000-000000000001' and lista = 'motivo_consulta' and codigo = 'CMG';
-- Una organización nueva la recibe al crearse; una que ya la tenía (renombrada) no se duplica ni se pisa
insert into public.organizaciones (id,nombre) values ('12200000-0000-0000-0000-0000000000e1','Nueva');
select 'la organización nueva la recibe (debe 1): ' || count(*) from public.lista_items
 where org_id = '12200000-0000-0000-0000-0000000000e1' and lista = 'motivo_consulta' and codigo = 'CMG';
update public.lista_items set nombre = 'Consulta general' where org_id = '12200000-0000-0000-0000-0000000000e1' and codigo = 'CMG';
select public.copiar_listas_base('12200000-0000-0000-0000-0000000000e1') \g /dev/null
select 'otra copia de listas no la duplica ni la renombra (debe 1): ' || count(*) from public.lista_items
 where org_id = '12200000-0000-0000-0000-0000000000e1' and lista = 'motivo_consulta' and codigo = 'CMG' and nombre = 'Consulta general';
delete from public.organizaciones where id = '12200000-0000-0000-0000-0000000000e1';
delete from clinico.adjuntos where id = '12200000-0000-0000-0000-0000000000f1';
delete from clinico.consultas where id::text like '12200000%';
