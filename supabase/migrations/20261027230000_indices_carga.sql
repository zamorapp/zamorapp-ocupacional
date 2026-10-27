-- Índices de las llaves foráneas que filtran informes y fichas.
-- Ensayo con el volumen del Integral (2.600 pacientes, 4.487 consultas, 6.700 diagnósticos):
-- sin diagnosticos(consulta_id) el padrón (reporte_listado 'pacientes') pasó de 5 min; con él, 0,7 s.
create index if not exists diagnosticos_consulta on clinico.diagnosticos (consulta_id);
create index if not exists consultas_puesto on clinico.consultas (puesto_id);
create index if not exists reposos_trabajador on clinico.reposos (trabajador_id);
create index if not exists reposos_consulta on clinico.reposos (consulta_id);
create index if not exists adjuntos_consulta on clinico.adjuntos (consulta_id);
create index if not exists trabajadores_puesto on public.trabajadores (puesto_id);
create index if not exists eventos_trabajador on public.eventos (trabajador_id);
create index if not exists eventos_consulta on public.eventos (consulta_id);
create index if not exists solicitudes_trabajador on public.solicitudes (trabajador_id);
create index if not exists citas_empresa on public.citas (empresa_id);
create index if not exists citas_consulta on public.citas (consulta_id);
create index if not exists puestos_empresa on public.puestos (empresa_id);
create index if not exists dependencias_empresa on public.dependencias (empresa_id);
create index if not exists sedes_empresa on public.sedes (empresa_id);
create index if not exists notificaciones_empresa on public.notificaciones (empresa_id);
create index if not exists informes_vigilancia_empresa on public.informes_vigilancia (empresa_id);
create index if not exists envio_aperturas_enlace on public.envio_aperturas (enlace_id);
