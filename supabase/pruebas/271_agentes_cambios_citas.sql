-- Citas, propuestas y cuentas ficticias. Todas las comprobaciones se revierten.
\pset tuples_only on
begin;
reset role;
select (public.hoy_caracas()+3)::text fecha, (public.hoy_caracas()+4)::text nueva,
       (public.hoy_caracas()-1)::text vencida \gset c271_
insert into public.citas (id,org_id,empresa_id,trabajador_id,fecha,hora,estado)
select ('52710000-0000-0000-0000-00000000000' || n)::uuid,
  '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a',
  '30000000-0000-0000-0000-00000000000a',:'c271_fecha'::date,time '09:00',estado
from (values (1,'citado'),(2,'solicitada'),(3,'citado'),(4,'atendido'),(5,'citado')) casos(n,estado);
-- Otro administrador de la misma organización no es el titular de la llave.
update public.miembros set rol='administrador', empresas_permitidas=null
where org_id='10000000-0000-0000-0000-000000000001' and usuario_id='00000000-0000-0000-0000-0000000000a4';
set role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001','Agenda 271','crear',7)->>'llave' llave \gset crear271_
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001','Lectura agenda 271','consultar',7)->>'llave' llave \gset leer271_
select jsonb_build_object('cita_id','52710000-0000-0000-0000-000000000001','operacion','reprogramar','fecha',:'c271_nueva','hora','10:30') mover,
       '{"cita_id":"52710000-0000-0000-0000-000000000002","operacion":"cancelar"}' cancelar,
       '{"cita_id":"52710000-0000-0000-0000-000000000003","operacion":"cancelar"}' obsoleta,
       '{"cita_id":"52710000-0000-0000-0000-000000000004","operacion":"cancelar"}' atendida,
       '{"cita_id":"52710000-0000-0000-0000-000000000005","operacion":"cancelar"}' descartar \gset p271_

set role anon;
set local request.jwt.claim.sub='';
select 'la llave de lectura no prepara (debe 1): ' ||
  ((public.agente(:'leer271_llave','preparar_cambio_cita',:'p271_mover')->>'ok') = 'false')::int;
select 'ensaya la reprogramación (debe 1): ' ||
  ((public.agente(:'crear271_llave','preparar_cambio_cita',:'p271_mover',true)->'resultado'->>'hora_nueva')='10:30')::int;
select 'la cita atendida no se puede cancelar (debe 1): ' ||
  ((public.agente(:'crear271_llave','preparar_cambio_cita',:'p271_atendida')->>'ok')='false')::int;
select 'una lista o los campos extra se rechazan (debe 2): ' || count(*) from
  (values (jsonb_build_array((:'p271_mover')::jsonb)), ((:'p271_mover')::jsonb || '{"citas":[]}')) d(datos)
where (public.agente(:'crear271_llave','preparar_cambio_cita',d.datos)->>'ok')='false';
select 'no acepta fechas pasadas ni horas inválidas (debe 2): ' || count(*) from
  (values (jsonb_set((:'p271_mover')::jsonb,'{fecha}',to_jsonb(:'c271_vencida'::text))),
          (jsonb_set((:'p271_mover')::jsonb,'{hora}','"24:00"'))) d(datos)
where (public.agente(:'crear271_llave','preparar_cambio_cita',d.datos)->>'ok')='false';
select 'el anónimo no ejecuta la aprobación SQL (debe 1): ' ||
  (not has_function_privilege('anon','public.decidir_cambio_cita_agente(uuid,boolean)','execute'))::int;
reset role;
select 'ensayar o rechazar no crea propuestas (debe 0): ' || count(*) from public.agentes_cambios_citas;

set role anon;
select public.agente(:'crear271_llave','preparar_cambio_cita',:'p271_mover')->'resultado'->>'propuesta_id' mover,
       public.agente(:'crear271_llave','preparar_cambio_cita',:'p271_cancelar')->'resultado'->>'propuesta_id' cancelar,
       public.agente(:'crear271_llave','preparar_cambio_cita',:'p271_obsoleta')->'resultado'->>'propuesta_id' obsoleta,
       public.agente(:'crear271_llave','preparar_cambio_cita',:'p271_descartar')->'resultado'->>'propuesta_id' descartar \gset b271_
select 'reintentar devuelve la misma propuesta (debe 1): ' ||
  ((public.agente(:'crear271_llave','preparar_cambio_cita',:'p271_mover')->'resultado'->>'propuesta_id')=:'b271_mover')::int;
select 'no reemplaza una propuesta pendiente (debe 1): ' ||
  ((public.agente(:'crear271_llave','preparar_cambio_cita',jsonb_set((:'p271_mover')::jsonb,'{hora}','"11:30"'))->>'ok')='false')::int;
select 'la llave carece de una acción para aprobar (debe 1): ' ||
  ((public.agente(:'crear271_llave','decidir_cambio_cita_agente',jsonb_build_object('id',:'b271_mover'))->>'ok')='false')::int;
reset role;
select 'preparar no modifica la agenda ni sus versiones (debe 4): ' || count(*) from public.citas c
join public.agentes_cambios_citas p on p.cita_id=c.id
where c.fecha=p.fecha_anterior and c.hora=p.hora_anterior and c.estado=p.estado_anterior and c.version=p.cita_version;

set role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a4';
select 'otro administrador no puede ver las propuestas (debe 0): ' || count(*) from public.agentes_cambios_citas;
select set_config('zamorapp.prueba_cita271', :'b271_mover', true) \gset
do $$ begin
  perform public.decidir_cambio_cita_agente(current_setting('zamorapp.prueba_cita271')::uuid,true);
  raise exception 'FALLA: otra cuenta aprobó un cambio de cita';
exception when insufficient_privilege then raise notice 'otra cuenta no aprueba (debe 1): 1'; end $$;

set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select 'el titular no escribe directamente la propuesta (debe 1): ' ||
  (not has_table_privilege('authenticated','public.agentes_cambios_citas','update'))::int;
select 'el titular aplica la reprogramación (debe 1): ' ||
  (public.decidir_cambio_cita_agente(:'b271_mover',true)='reprogramar')::int;
select 'mover conserva el estado y aplica la fecha y hora exactas (debe 1): ' || count(*) from public.citas
where id='52710000-0000-0000-0000-000000000001' and fecha=:'c271_nueva'::date and hora=time '10:30' and estado='citado';
select 'aprobar una propuesta deja otra cita pendiente intacta (debe 1): ' || count(*) from public.citas
where id='52710000-0000-0000-0000-000000000002' and fecha=:'c271_fecha'::date and hora=time '09:00' and estado='solicitada';
do $$ begin
  perform public.decidir_cambio_cita_agente(current_setting('zamorapp.prueba_cita271')::uuid,true);
  raise exception 'FALLA: se aplicó dos veces';
exception when insufficient_privilege then raise notice 'no se aplica dos veces (debe 1): 1'; end $$;
select 'el titular aprueba una cancelación por separado (debe 1): ' ||
  (public.decidir_cambio_cita_agente(:'b271_cancelar',true)='cancelar')::int;
select 'cancelar conserva la cita en el historial (debe 1): ' || count(*) from public.citas
where id='52710000-0000-0000-0000-000000000002' and estado='cancelada';

update public.citas set hora=time '11:00' where id='52710000-0000-0000-0000-000000000003';
select set_config('zamorapp.prueba_cita271', :'b271_obsoleta', true) \gset
do $$ begin
  perform public.decidir_cambio_cita_agente(current_setting('zamorapp.prueba_cita271')::uuid,true);
  raise exception 'FALLA: se aprobó una cita que ya cambió';
exception when sqlstate 'ZA409' then raise notice 'se bloquea el cambio desactualizado (debe 1): 1'; end $$;
select 'descartar no modifica la cita (debe 1): ' ||
  (public.decidir_cambio_cita_agente(:'b271_descartar',false)='descartada')::int;
select 'las citas no aprobadas siguen activas (debe 2): ' || count(*) from public.citas
where id in ('52710000-0000-0000-0000-000000000003','52710000-0000-0000-0000-000000000005') and estado='citado';
select 'se guarda el momento de ambas decisiones (debe 2): ' || count(*) from public.agentes_cambios_citas
where estado='aplicada' and decidido_en is not null;
rollback;
