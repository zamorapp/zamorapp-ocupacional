-- Enfermería SÍ llena la investigación de accidente (NT-02) de su empresa (decisión de Cesar, 13-nov-2026: «1 si»).
-- La 933 la había dejado de solo lectura. Ahora:
--  · crea investigaciones (se quita investigaciones_enfermeria_no_crea);
--  · corrige solo las que ella elaboró; la del médico la sigue leyendo sin cambiarla;
--  · no borra (investigaciones_enfermeria_no_borra se queda: borrar es del gerente médico o del administrador).
-- Solo ve y escribe los trabajadores de su empresa (investigaciones_empresa, restrictiva, ve_trabajador) y el autor
-- no se cambia después (validar_investigacion). El resto de la historia médica sigue de solo lectura para ella.
drop policy if exists investigaciones_enfermeria_no_crea on clinico.investigaciones;
drop policy if exists investigaciones_enfermeria_no_edita on clinico.investigaciones;
drop policy if exists investigaciones_enfermeria_edita_suya on clinico.investigaciones;
create policy investigaciones_enfermeria_edita_suya on clinico.investigaciones as restrictive for update
  using (not org_id = any ((select public.orgs_con('{enfermeria}'))::uuid[]) or elaborado_por = (select auth.uid()));
