-- Firma: una consulta firmada queda bloqueada (no se edita, reabre ni borra, ni sus diagnósticos, aptitud o reposo).
\pset tuples_only on
reset role;
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado) values
 ('40000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.firmar_consulta('40000000-0000-0000-0000-0000000000f1'); raise notice 'firmó un borrador: FALLA'; exception when others then raise notice 'firmar borrador rechazado (ok): %', sqlerrm; end $$;
select public.guardar_consulta('40000000-0000-0000-0000-0000000000f1','{"tipo":"primera","conclusiones":"final"}',
  '[{"cie10":"J00","descripcion":"Rinofaringitis","origen":"comun","principal":true}]','{"clasificacion":"elegible","limitaciones":[]}',null,true);
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
update clinico.consultas set medico_id='00000000-0000-0000-0000-0000000000a2' where id='40000000-0000-0000-0000-0000000000f1';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin perform public.firmar_consulta('40000000-0000-0000-0000-0000000000f1'); raise notice 'enfermería firmó: FALLA'; exception when others then raise notice 'enfermería no firma (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin perform public.firmar_consulta('40000000-0000-0000-0000-0000000000f1'); raise notice 'otro médico firmó: FALLA'; exception when others then raise notice 'otro médico no firma (ok)'; end $$;
do $$ begin update public.consultas set estado='firmada' where id='40000000-0000-0000-0000-0000000000f1'; raise notice 'otro médico firmó por cambio directo: FALLA'; exception when others then raise notice 'cambio directo bloqueado (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.firmar_consulta('40000000-0000-0000-0000-0000000000f1');
select 'firmada con fecha (debe 1): ' || count(*) from public.consultas where id='40000000-0000-0000-0000-0000000000f1' and estado='firmada' and firmada_en is not null;
do $$ begin perform public.guardar_consulta('40000000-0000-0000-0000-0000000000f1','{"tipo":"primera"}','[]',null,null,false); raise notice 'guardó firmada: FALLA'; exception when others then raise notice 'guardar firmada rechazado (ok)'; end $$;
update public.consultas set estado='borrador' where id='40000000-0000-0000-0000-0000000000f1';
delete from public.diagnosticos where consulta_id='40000000-0000-0000-0000-0000000000f1';
delete from public.aptitudes where consulta_id='40000000-0000-0000-0000-0000000000f1';
delete from public.consultas where id='40000000-0000-0000-0000-0000000000f1';
do $$ begin insert into public.diagnosticos (org_id,consulta_id,cie10,descripcion) values ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-0000000000f1','X','x'); raise notice 'agregó diagnóstico a firmada: FALLA'; exception when others then raise notice 'agregar a firmada rechazado (ok)'; end $$;
reset role;
select 'sigue firmada tras intentos de reabrir/borrar (debe 1): ' || count(*) from clinico.consultas where id='40000000-0000-0000-0000-0000000000f1' and estado='firmada';
select 'diagnóstico y aptitud intactos (debe 2): ' || ((select count(*) from clinico.diagnosticos where consulta_id='40000000-0000-0000-0000-0000000000f1') + (select count(*) from clinico.aptitudes where consulta_id='40000000-0000-0000-0000-0000000000f1'));
-- Roles de la empresa cliente: empresa obligatoria
do $$ begin insert into public.miembros (org_id,usuario_id,rol) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','supervisor'); raise notice 'supervisor sin empresa aceptado: FALLA';
  exception when unique_violation then raise notice 'prueba inválida (usuario repetido)'; when others then raise notice 'supervisor sin empresa rechazado (ok)'; end $$;
