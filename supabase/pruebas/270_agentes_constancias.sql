-- Flujo de la puerta, con consultas y cuentas ficticias. Se revierte todo al terminar.
\pset tuples_only on
begin;
reset role;
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos)
values ('32700000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-00000000000a','270001','Trabajador','De prueba');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha)
select ('42700000-0000-0000-0000-00000000000' || n)::uuid, '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-00000000000a', '32700000-0000-0000-0000-000000000001', 'borrador', fecha
from (values (1,date '2025-01-10'),(2,date '2025-01-11'),(3,date '2025-01-12'),
             (4,date '2025-01-13'),(5,date '2025-01-13')) as casos(n,fecha);
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion)
select org_id,id,trabajador_id,'elegible' from clinico.consultas
where trabajador_id='32700000-0000-0000-0000-000000000001' and fecha <> date '2025-01-12';
update clinico.consultas set estado='firmada', firmada_en=public.ahora()
where trabajador_id='32700000-0000-0000-0000-000000000001' and fecha <> date '2025-01-11';
insert into public.organizaciones (id,nombre) values ('12700000-0000-0000-0000-000000000002','Org ficticia 270');
insert into public.empresas (id,org_id,razon_social,rif)
values ('22700000-0000-0000-0000-000000000002','12700000-0000-0000-0000-000000000002','Empresa ficticia 270','J-27002');
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos)
values ('32700000-0000-0000-0000-000000000002','12700000-0000-0000-0000-000000000002',
  '22700000-0000-0000-0000-000000000002','270002','Segunda','Persona');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha)
values ('42700000-0000-0000-0000-000000000006','12700000-0000-0000-0000-000000000002',
  '22700000-0000-0000-0000-000000000002','32700000-0000-0000-0000-000000000002','borrador',date '2025-01-10');
insert into clinico.aptitudes (org_id,consulta_id,trabajador_id,clasificacion)
values ('12700000-0000-0000-0000-000000000002','42700000-0000-0000-0000-000000000006','32700000-0000-0000-0000-000000000002','elegible');
update clinico.consultas set estado='firmada', firmada_en=public.ahora() where id='42700000-0000-0000-0000-000000000006';

set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select k->>'llave' llave, k->>'id' id from
  public.crear_llave_agente('10000000-0000-0000-0000-000000000001','Constancias 270','crear',7) k \gset k270_
select k->>'llave' llave, k->>'id' id from
  public.crear_llave_agente('10000000-0000-0000-0000-000000000001','Lectura 270','consultar',7) k \gset leer270_
select '{"trabajador_id":"32700000-0000-0000-0000-000000000001","consulta_fecha":"2025-01-10"}' as pedido270 \gset
set role anon;
set local request.jwt.claim.sub = '';
select 'constancia exige permiso de documentos (debe 1): ' ||
  ((public.agente(:'k270_llave','preparar_constancia',:'pedido270')->>'ok') = 'false')::int;

set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.agentes_llave_documentos('10000000-0000-0000-0000-000000000001',:'k270_id',true);
select public.agentes_llave_documentos('10000000-0000-0000-0000-000000000001',:'leer270_id',true);
set role anon;
set local request.jwt.claim.sub = '';
select 'llave de lectura no prepara (debe 1): ' ||
  ((public.agente(:'leer270_llave','preparar_constancia',:'pedido270')->>'ok') = 'false')::int;
reset role;
update public.miembros set acceso_clinico=false
where org_id='10000000-0000-0000-0000-000000000001' and usuario_id='00000000-0000-0000-0000-0000000000a1';
set role anon;
select 'un titular sin acceso clínico no puede preparar una constancia (debe 1): ' ||
  ((public.agente(:'k270_llave','preparar_constancia',:'pedido270')->>'ok') = 'false')::int;
reset role;
update public.miembros set acceso_clinico=true
where org_id='10000000-0000-0000-0000-000000000001' and usuario_id='00000000-0000-0000-0000-0000000000a1';
set role anon;
select 'ensayo válido (debe 1): ' || ((public.agente(:'k270_llave','preparar_constancia',:'pedido270',true)->>'ok') = 'true')::int;
select 'no se puede elegir una fecha ausente (debe 1): ' ||
  ((public.agente(:'k270_llave','preparar_constancia',(:'pedido270')::jsonb-'consulta_fecha')->>'ok') = 'false')::int;
select 'la llave no alcanza consultas de otra organización (debe 1): ' ||
  ((public.agente(:'k270_llave','preparar_constancia',
    '{"trabajador_id":"32700000-0000-0000-0000-000000000002","consulta_fecha":"2025-01-10"}')->>'ok') = 'false')::int;
select 'rechaza consultas no firmadas, sin aptitud o ambiguas (debe 3): ' || count(*)
from (values ('2025-01-11'),('2025-01-12'),('2025-01-13')) d(fecha)
where (public.agente(:'k270_llave','preparar_constancia',jsonb_set((:'pedido270')::jsonb,'{consulta_fecha}',to_jsonb(d.fecha)))->>'ok') = 'false';
select 'el ayudante SQL no está expuesto a la puerta anónima ni a sesiones (debe 1): ' ||
  (not has_function_privilege('anon','public.agente_preparar_constancia(uuid,jsonb,boolean,uuid,text)','execute') and
   not has_function_privilege('authenticated','public.agente_preparar_constancia(uuid,jsonb,boolean,uuid,text)','execute'))::int;
reset role;
select 'ensayo y rechazos no guardan borradores (debe 0): ' || count(*) from clinico.agentes_borradores where tipo='constancia';

set role anon;
select (public.agente(:'k270_llave','preparar_constancia',:'pedido270')->'resultado'->>'borrador_id') as b270 \gset
select 'repetir devuelve el mismo borrador (debe 1): ' ||
  ((public.agente(:'k270_llave','preparar_constancia',:'pedido270')->'resultado'->>'borrador_id') = :'b270')::int;
select 'la llave no ofrece aprobación (debe 1): ' ||
  ((public.agente(:'k270_llave','aprobar_constancia',jsonb_build_object('id',:'b270'))->>'ok') = 'false')::int;
select 'el estado de la constancia no expone aptitud ni enlace de impresión (debe 1): ' ||
  (public.agente(:'k270_llave','ver_preparados',(:'pedido270')::jsonb)::text !~ '(elegible|clasificacion|/imprimir/constancia)' )::int;
reset role;
select 'la preparación queda pendiente y conserva la revisión firmada (debe 1): ' || count(*)
from clinico.agentes_borradores where id=:'b270' and estado='por_revisar' and consulta_revision=1
  and consulta_id='42700000-0000-0000-0000-000000000001' and revisado_por is null;
select 'no se generó un PDF ni se preparó un envío (debe 0): ' || count(*)
from public.constancias_listas where consulta_id='42700000-0000-0000-0000-000000000001';

set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select 'RRHH no lee el borrador (debe 0): ' || count(*) from public.agentes_borradores where id=:'b270';
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
with cambio as (update public.agentes_borradores set estado='emitido' where id=:'b270' returning id)
select 'otro médico no aprueba (debe 0): ' || count(*) from cambio;
select 'la bajada de escritorio no incluye el borrador de otro médico (debe 0): ' ||
  (sync.filas_visibles('clinico.agentes_borradores',array[:'b270'::uuid]) ? :'b270')::int;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select 'el titular lo ve pendiente (debe 1): ' || count(*) from public.agentes_borradores where id=:'b270' and estado='por_revisar';
update public.agentes_borradores set estado='emitido', consulta_revision=99 where id=:'b270' and estado='por_revisar';
select 'la aprobación audita al titular y mantiene la revisión original (debe 1): ' || count(*)
from public.agentes_borradores where id=:'b270' and estado='emitido' and consulta_revision=1
  and revisado_por=auth.uid() and revisado_en is not null and indicacion_id is null;

set role anon;
set local request.jwt.claim.sub = '';
select (public.agente(:'k270_llave','preparar_constancia',:'pedido270')->'resultado'->>'borrador_id') as b270v \gset
set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.reabrir_consulta('42700000-0000-0000-0000-000000000001','Corregir dato de prueba');
do $$ begin
  update public.agentes_borradores set estado='emitido' where tipo='constancia' and estado='por_revisar';
  raise exception 'FALLA: aprobó una revisión ya corregida';
exception when sqlstate 'ZA409' then
  raise notice 'bloqueó la aprobación de la consulta corregida (debe 1): 1';
end $$;
update public.agentes_borradores set estado='descartado' where id=:'b270v' and estado='por_revisar';
select 'se puede descartar el borrador desactualizado (debe 1): ' || count(*) from public.agentes_borradores where id=:'b270v' and estado='descartado';
rollback;
