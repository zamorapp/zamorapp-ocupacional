-- 103: las llaves foráneas por las que filtran informes, fichas y la réplica tienen índice
do $$
declare v text;
begin
  select string_agg(x, ', ') into v from unnest(array[
    'clinico.diagnosticos(consulta_id)','clinico.consultas(puesto_id)','clinico.reposos(trabajador_id)','clinico.reposos(consulta_id)',
    'clinico.adjuntos(consulta_id)','public.trabajadores(puesto_id)','public.eventos(trabajador_id)','public.eventos(consulta_id)',
    'public.solicitudes(trabajador_id)','public.citas(empresa_id)','public.citas(consulta_id)','public.puestos(empresa_id)',
    'public.dependencias(empresa_id)','public.sedes(empresa_id)','public.notificaciones(empresa_id)','public.informes_vigilancia(empresa_id)',
    'public.envio_aperturas(enlace_id)']) x
  where not exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = split_part(x, '(', 1)::regclass and a.attname = rtrim(split_part(x, '(', 2), ')'));
  if v is not null then raise exception '103 FALLA: sin índice: %', v; end if;
  raise notice '103 ok: llaves foráneas de informes con índice';
end $$;
