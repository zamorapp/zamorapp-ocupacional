-- zamorApp Ocupacional · Registrar pacientes nuevos desde la consulta (29/10/2026)
-- Médico, enfermería y recepción pueden crear trabajadores (trabajadores_editar), pero no el cargo ni la
-- dependencia que escriben en la ficha: dependencias solo las creaba el administrador y puestos el
-- administrador, gerente médico o SST. Resultado: «No se pudieron crear las dependencias» y el paciente
-- nuevo no se registraba. Ahora quien registra trabajadores también agrega (solo agrega: no edita ni borra)
-- el cargo y la dependencia, siempre dentro de las empresas que puede ver.
drop policy if exists dependencias_servicio_crear on public.dependencias;
create policy dependencias_servicio_crear on public.dependencias for insert
  with check (public.puede_ver_empresa(org_id, empresa_id)
              and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'coordinador_sst'));

drop policy if exists puestos_servicio_crear on public.puestos;
create policy puestos_servicio_crear on public.puestos for insert
  with check (public.puede_ver_empresa(org_id, empresa_id)
              and public.mi_rol(org_id) in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion', 'coordinador_sst'));
