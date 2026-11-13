-- Enfermería: la historia médica es de solo lectura; corrige solo lo suyo (pedido de Cesar, 13-nov-2026).
-- «La enfermera de COSAPI solo ve los trabajadores de COSAPI y revisa sin modificar las historias médicas. Lo único que
-- puede modificar es su evolución de enfermería y sus registros (curas, tratamientos, tensión…)».
-- Antes la pantalla no le daba botones, pero la base dejaba que el rol «enfermeria» cambiara diagnósticos, aptitud,
-- reposos, estudios escaneados e historia laboral de una consulta sin firmar (es personal clínico). Ahora la base lo
-- impide. Las consultas ya estaban cerradas para ella (20261030927000, políticas consultas_enfermeria_*).
-- Sus atenciones: la autora las corrige cuando quiera (el gerente médico y el administrador también); no se puede
-- cambiar de trabajador, de tipo ni de consulta, y cada corrección queda en la bitácora con el antes y el después.

-- ─── 1) Historia médica: enfermería no crea, cambia ni borra ───
-- La investigación de accidente (NT-02) también queda cerrada mientras Cesar no decida que la enfermera investigue.
-- Restrictivas: se suman a las demás reglas; solo afectan a quien tiene el rol «enfermeria» en esa organización.
do $$
declare t text;
begin
  foreach t in array array['diagnosticos', 'aptitudes', 'reposos', 'adjuntos', 'historia_laboral', 'investigaciones'] loop
    execute format('drop policy if exists %1$s_enfermeria_no_crea on clinico.%1$s', t);
    execute format('create policy %1$s_enfermeria_no_crea on clinico.%1$s as restrictive for insert
                      with check (not org_id = any ((select public.orgs_con(''{enfermeria}''))::uuid[]))', t);
    execute format('drop policy if exists %1$s_enfermeria_no_edita on clinico.%1$s', t);
    execute format('create policy %1$s_enfermeria_no_edita on clinico.%1$s as restrictive for update
                      using (not org_id = any ((select public.orgs_con(''{enfermeria}''))::uuid[]))', t);
    execute format('drop policy if exists %1$s_enfermeria_no_borra on clinico.%1$s', t);
    execute format('create policy %1$s_enfermeria_no_borra on clinico.%1$s as restrictive for delete
                      using (not org_id = any ((select public.orgs_con(''{enfermeria}''))::uuid[]))', t);
  end loop;
end $$;

-- Órdenes y récipes del médico: enfermería no los emite (además del disparador proteger_indicacion, que ya lo exige).
-- Al marcar «Cumplida», proteger_indicacion deja fijo todo lo escrito al emitirla (tratamiento, indicaciones, fecha,
-- médico…) y solo acepta pendiente → cumplida con su nota; anular es del médico. La prueba 232 lo comprueba.
drop policy if exists indicaciones_enfermeria_no_crea on clinico.indicaciones;
create policy indicaciones_enfermeria_no_crea on clinico.indicaciones as restrictive for insert
  with check (not org_id = any ((select public.orgs_con('{enfermeria}'))::uuid[]));

-- ─── 2) Corregir su atención o evolución: lo que identifica el registro no cambia ───
create or replace function public.fijar_atencion_enfermeria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Corregir es cambiar lo anotado (motivo, signos, tratamiento, nota, referido, día); no mover el registro a otro
  -- trabajador, otra consulta u otro tipo (eso es borrar y volver a registrar)
  new.org_id := old.org_id;
  new.trabajador_id := old.trabajador_id;
  new.consulta_id := old.consulta_id;
  new.tipo := old.tipo;
  if old.trabajador_id is not null then new.empresa_id := old.empresa_id; end if;
  return new;
end $$;
revoke execute on function public.fijar_atencion_enfermeria() from public, authenticated, anon;
-- «fijar_…» va antes que «hora_oficial» y «validar_…» (los before corren en orden alfabético)
drop trigger if exists fijar_atencion_enfermeria on clinico.atenciones_enfermeria;
create trigger fijar_atencion_enfermeria before update on clinico.atenciones_enfermeria
  for each row execute function public.fijar_atencion_enfermeria();

-- Cada corrección o borrado queda en la bitácora (la lee el administrador o el gerente médico con acceso clínico)
drop trigger if exists bit_atenciones_enfermeria on clinico.atenciones_enfermeria;
create trigger bit_atenciones_enfermeria after update or delete on clinico.atenciones_enfermeria
  for each row execute function public.registrar_bitacora();
