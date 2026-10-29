-- Copia local: las tablas que faltaban bajan a la PC (sync.tablas) y anotan sus cambios en sync.registro.
\pset tuples_only on
reset role;
select 'tablas nuevas en sync.tablas (debe 9): ' || count(*) from sync.tablas where nombre in (
  'public.medicos_historicos', 'public.informes_vigilancia', 'public.empresa_contactos', 'public.plantillas_correo',
  'public.solicitudes', 'public.notificaciones', 'public.envios', 'public.envio_enlaces',
  'clinico.consultas_versiones');
select 'todas con sus dos disparadores (debe 18): ' || count(*) from pg_trigger g join sync.tablas t on g.tgrelid = t.nombre::regclass
 where t.nombre in ('public.medicos_historicos', 'public.informes_vigilancia', 'public.empresa_contactos', 'public.plantillas_correo',
  'public.solicitudes', 'public.notificaciones', 'public.envios', 'public.envio_enlaces',
  'clinico.consultas_versiones') and g.tgname in ('sync_version', 'sync_anotar');
select 'todas con columna version (debe 9): ' || count(*) from information_schema.columns
 where table_schema || '.' || table_name in (select nombre from sync.tablas) and column_name = 'version'
   and table_name in ('medicos_historicos', 'informes_vigilancia', 'empresa_contactos', 'plantillas_correo',
  'solicitudes', 'notificaciones', 'envios', 'envio_enlaces', 'consultas_versiones');
-- un médico histórico nuevo queda anotado para bajar a la PC
insert into public.medicos_historicos (org_id, nombre_completo) values ('10000000-0000-0000-0000-000000000001', 'Dr. Prueba Histórico');
select 'el alta de un médico histórico queda en sync.registro (debe 1): ' || count(*) from sync.registro
 where tabla = 'public.medicos_historicos' and op = 'I' and seq = (select max(seq) from sync.registro);
delete from public.medicos_historicos where nombre_completo = 'Dr. Prueba Histórico';
