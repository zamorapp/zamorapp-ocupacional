-- zamorApp · Copia local: tablas que faltaban en la PC (hallazgo de Reportes al revisar C11, 29-oct-2026).
-- Con las lecturas saliendo de la copia, el escritorio mostraba vacío el médico histórico de las consultas
-- importadas del SAME, los informes de vigilancia, los contactos y plantillas de Envíos, la bitácora de envíos,
-- las solicitudes, las notificaciones y las versiones de una consulta. (envio_archivos no: guarda los PDF y no tiene id.) Entran en sync.tablas: bajan con la
-- instantánea y con cambios_desde. «subible» marca las que la PC podrá escribir en la fase A (local primero);
-- hoy todas se escriben en la nube.
insert into sync.tablas (nombre, clinica, subible) values
  ('public.medicos_historicos', false, false),
  ('public.informes_vigilancia', false, true),
  ('public.empresa_contactos', false, true),
  ('public.plantillas_correo', false, true),
  ('public.solicitudes', false, false),
  ('public.notificaciones', false, false),
  ('public.envios', false, false),
  ('public.envio_enlaces', false, false),
  ('clinico.consultas_versiones', true, false)
on conflict (nombre) do nothing;

do $$
declare t record;
begin
  for t in select nombre from sync.tablas where nombre in (
      'public.medicos_historicos', 'public.informes_vigilancia', 'public.empresa_contactos', 'public.plantillas_correo',
      'public.solicitudes', 'public.notificaciones', 'public.envios', 'public.envio_enlaces',
      'clinico.consultas_versiones') loop
    execute format('alter table %s add column if not exists version bigint not null default 1', t.nombre);
    execute format('drop trigger if exists sync_version on %s', t.nombre);
    execute format('create trigger sync_version before insert or update on %s for each row execute function sync.versionar()', t.nombre);
    execute format('drop trigger if exists sync_anotar on %s', t.nombre);
    execute format('create trigger sync_anotar after insert or update or delete on %s for each row execute function sync.anotar()', t.nombre);
  end loop;
end $$;
