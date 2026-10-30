-- Vistas al día (Cesar, 30-oct): ninguna vista public «select *» puede quedar sin columnas de su tabla.
-- Si esta prueba falla, la migración que agregó la columna debe terminar con «select public.vistas_al_dia();».
\pset tuples_only on
reset role;
select 'vistas atrasadas respecto de su tabla (debe 0): ' || count(*) || coalesce(' → ' || string_agg(distinct vc.relname, ', '), '')
  from pg_class vc
  join pg_namespace vn on vn.oid = vc.relnamespace and vn.nspname = 'public'
  join pg_rewrite r on r.ev_class = vc.oid
  join pg_depend d on d.objid = r.oid and d.classid = 'pg_rewrite'::regclass and d.refobjid <> vc.oid
  join pg_class t on t.oid = d.refobjid and t.relkind = 'r'
 where vc.relkind = 'v'
   and (select count(distinct d2.refobjid) from pg_rewrite r2 join pg_depend d2 on d2.objid = r2.oid and d2.classid = 'pg_rewrite'::regclass
         where r2.ev_class = vc.oid and d2.refobjid <> vc.oid) = 1
   and (select array_agg(attname order by attnum) from pg_attribute where attrelid = vc.oid and attnum > 0 and not attisdropped)
       = (select (array_agg(attname order by attnum))[1:(select count(*) from pg_attribute where attrelid = vc.oid and attnum > 0 and not attisdropped)]
            from pg_attribute where attrelid = t.oid and attnum > 0 and not attisdropped)
   and exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
                 and not exists (select 1 from pg_attribute b where b.attrelid = vc.oid and b.attname = a.attname));
-- El caso de Cesar: el médico guarda un reposo y al leerlo (como lo lee la consulta y el impreso) está, con la observación
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('16300000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas());
select public.guardar_consulta('16300000-0000-0000-0000-0000000000c1', format('{"tipo":"primera","fecha":"%s"}', public.hoy_caracas())::jsonb,
 '[{"cie10":"M54.5","descripcion":"Lumbago","origen":"comun","principal":true}]', null,
 '{"causa":"enfermedad_comun","ente":"servicio_medico","desde":"2026-10-01","hasta":"2026-10-03"}', false) \g /dev/null
select 'el reposo guardado se lee con todas sus columnas (debe 1): ' || count(*) from public.reposos
 where consulta_id = '16300000-0000-0000-0000-0000000000c1' and desde = '2026-10-01' and hasta = '2026-10-03' and observacion is null;
reset role;
delete from clinico.reposos where consulta_id = '16300000-0000-0000-0000-0000000000c1';
delete from clinico.diagnosticos where consulta_id = '16300000-0000-0000-0000-0000000000c1';
delete from clinico.consultas where id = '16300000-0000-0000-0000-0000000000c1';
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
