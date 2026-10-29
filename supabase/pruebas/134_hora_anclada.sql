-- Hora anclada (escritorio local primero): la fecha de la PC no cambia la fecha ni la firma de la consulta.
-- En la nube (sin zamorapp.local) la cabecera X-Zamorapp-Ahora no cambia nada.
\pset tuples_only on
reset role;
set timezone = 'UTC';
select set_config('request.headers', '{"x-zamorapp-ahora":"2020-01-15T12:00:00Z"}', false) \g /dev/null
select 'nube: la cabecera no cambia ahora() (debe 1): ' || (public.ahora() = now())::int;
select 'nube: hoy_caracas() sigue siendo hoy (debe 1): ' || (public.hoy_caracas() = (now() at time zone 'America/Caracas')::date)::int;

-- Base local: manda la hora de la puerta
select set_config('zamorapp.local', 'on', false) \g /dev/null
select 'local: ahora() es la hora de la puerta (debe 1): ' || (public.ahora() = timestamptz '2020-01-15 12:00+00')::int;
select set_config('request.headers', '{"x-zamorapp-ahora":"2020-01-16T02:30:00Z"}', false) \g /dev/null
select 'local: 22:30 de Caracas sigue siendo el 15 (debe 1): ' || (public.hoy_caracas() = date '2020-01-15')::int;
select set_config('request.headers', '{"x-zamorapp-ahora":"basura"}', false) \g /dev/null
select 'local: cabecera inválida usa now() (debe 1): ' || (public.ahora() = now())::int;
select set_config('request.headers', '{}', false) \g /dev/null
select set_config('zamorapp.ahora', '2020-02-01T15:00:00Z', false) \g /dev/null
select 'local: conexión propia de la puerta con zamorapp.ahora (debe 1): ' || (public.ahora() = timestamptz '2020-02-01 15:00+00')::int;
select set_config('zamorapp.ahora', '', false) \g /dev/null

-- En local, firmar sin la hora de la puerta se rechaza (no se firma con la fecha de Windows)
select set_config('request.headers', '{}', false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado) values
 ('13400000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','cerrada');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin perform public.firmar_consulta('13400000-0000-0000-0000-0000000000f2'); raise notice 'firmó sin hora verificada: FALLA'; exception when others then raise notice 'firma sin hora verificada rechazada (ok)'; end $$;
reset role;
select 'local: sin hora de la puerta la consulta sigue cerrada (debe 1): ' || count(*) from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f2' and estado = 'cerrada';
delete from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f2';

-- Consulta completa en local con la PC adelantada: fecha, cierre, aptitud y firma salen de la hora anclada
select set_config('request.headers', '{"x-zamorapp-ahora":"2020-03-10T14:00:00Z"}', false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado) values
 ('13400000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select public.guardar_consulta('13400000-0000-0000-0000-0000000000f1','{"tipo":"primera"}','[]','{"clasificacion":"elegible","limitaciones":[]}',null,true) \g /dev/null
select public.firmar_consulta('13400000-0000-0000-0000-0000000000f1') \g /dev/null
reset role;
select 'local: fecha, inicio, cierre y firma con la hora anclada (debe 4): '
  || ((fecha = date '2020-03-10')::int + (hora_inicio = timestamptz '2020-03-10 14:00+00')::int
      + (hora_cierre = timestamptz '2020-03-10 14:00+00')::int + (firmada_en = timestamptz '2020-03-10 14:00+00')::int)
from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f1';
select 'local: la aptitud se emite con la hora anclada (debe 1): ' || count(*)
from clinico.aptitudes where consulta_id = '13400000-0000-0000-0000-0000000000f1' and emitida_en = timestamptz '2020-03-10 14:00+00';

-- Vigilancia: ninguna hora por defecto ni función de la consulta vuelve a usar now() directo
select 'horas por defecto con now() (debe 0): ' || count(*)
from pg_attrdef d join pg_class c on c.oid = d.adrelid and c.relkind = 'r' join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'clinico') and pg_get_expr(d.adbin, d.adrelid) = 'now()';
select 'funciones de la consulta con now() (debe 0): ' || count(*) || coalesce(' → ' || string_agg(p.proname, ', '), '')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('guardar_consulta', 'duplicar_consulta', 'firmar_consulta', 'hoy_caracas', 'tocar_actualizado')
  and p.prosrc ~* '\mnow\(\)';

delete from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f1';

-- Equipo de confianza: en la PC sin hora verificada ningún plazo está vigente (la fecha de Windows no lo alarga)
insert into public.equipos_confianza (usuario_id, hash, vence) values ('00000000-0000-0000-0000-0000000000a2', 'h134', now() + interval '10 days');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
set role authenticated;
select set_config('zamorapp.local', '', false) \g /dev/null
select 'nube: el equipo de confianza está vigente (debe 1): ' || count(*) from public.mis_equipos_confianza();
select set_config('zamorapp.local', 'on', false) \g /dev/null
select set_config('request.headers', '{}', false) \g /dev/null
select 'local sin hora verificada: ningún equipo vigente (debe 0): ' || count(*) from public.mis_equipos_confianza();
select set_config('request.headers', '{"x-zamorapp-ahora":"2099-01-01T00:00:00Z"}', false) \g /dev/null
select 'local con hora verificada posterior: vencido (debe 0): ' || count(*) from public.mis_equipos_confianza();
reset role;
select set_config('zamorapp.local', '', false) \g /dev/null
select set_config('request.headers', '', false) \g /dev/null
delete from public.equipos_confianza where hash = 'h134';

-- En la nube, al aplicar la bandeja: la hora sin verificar del equipo se guarda aparte y vale la de recepción
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado) values
 ('13400000-0000-0000-0000-0000000000f3','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador');
select set_config('sync.cambio_id', gen_random_uuid()::text, false) \g /dev/null
select set_config('sync.hora_anclada', 'off', false) \g /dev/null
update clinico.consultas set hora_cierre = '2020-01-01 10:00+00' where id = '13400000-0000-0000-0000-0000000000f3';
select 'nube: hora sin verificar → vale la de recepción y la del equipo queda aparte (debe 1): ' ||
  ((hora_cierre > now() - interval '1 minute') and (hora_equipo #>> '{hora_cierre,hora}')::timestamptz = timestamptz '2020-01-01 10:00+00'
   and (hora_equipo #>> '{hora_cierre,verificada}')::boolean = false)::int
from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f3';
select set_config('sync.hora_anclada', 'on', false) \g /dev/null
update clinico.consultas set hora_cierre = '2020-01-02 10:00+00' where id = '13400000-0000-0000-0000-0000000000f3';
select 'nube: hora verificada → vale la del equipo (debe 1): ' ||
  ((hora_cierre = timestamptz '2020-01-02 10:00+00') and (hora_equipo #>> '{hora_cierre,verificada}')::boolean)::int
from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f3';
select set_config('sync.cambio_id', '', false) \g /dev/null
select set_config('sync.hora_anclada', '', false) \g /dev/null
update clinico.consultas set hora_cierre = '2020-01-03 10:00+00' where id = '13400000-0000-0000-0000-0000000000f3';
select 'nube: un cambio de la web no toca hora_equipo (debe 1): ' ||
  ((hora_cierre = timestamptz '2020-01-03 10:00+00') and (hora_equipo #>> '{hora_cierre,hora}')::timestamptz = timestamptz '2020-01-02 10:00+00')::int
from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f3';
delete from clinico.consultas where id = '13400000-0000-0000-0000-0000000000f3';
select set_config('zamorapp.local', '', false) \g /dev/null
select set_config('request.headers', '', false) \g /dev/null
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
reset timezone;
