-- zamorApp Ocupacional · Reglas de acceso (RLS) rápidas en las tablas grandes (auditoría C14)
-- Antes, cada fila leída llamaba 2 o 3 funciones (puede_ver_empresa, mi_rol, es_clinico…) y cada una consultaba
-- miembros: con 4.200 pacientes un conteo tardaba 36 ms en vez de 1 ms, y los reportes, cientos de ms.
-- Ahora el alcance del usuario se calcula UNA vez por consulta («(select …)» = InitPlan) y cada fila solo se compara
-- con esa lista. Mismas reglas, mismo resultado (la prueba 119 lo compara fila a fila con las funciones de antes).
--   · Solo cambia la parte USING (lo que se puede leer). WITH CHECK (lo que se puede escribir) queda igual.
--   · Lo que no es una lista simple (ve_consulta, ve_trabajador, es_mi_ficha) se conserva tal cual, con un atajo
--     delante que solo deja pasar lo que esa función ya dejaba pasar (las *_empresa de clinico son RESTRICTIVAS:
--     se suman con AND a las *_clinico, y el atajo no cambia eso).
--   · Las funciones de antes siguen existiendo: las usan otras reglas, funciones y pruebas.

-- Organizaciones donde el usuario es miembro activo, con filtros opcionales:
--   p_roles: solo esos roles · p_clinico: solo con acceso clínico (es_clinico) · p_sin_limite: sin empresas_permitidas
--   p_excluir: menos ese rol
create or replace function public.orgs_con(p_roles public.rol_usuario[] default null, p_clinico boolean default false,
                                           p_sin_limite boolean default false, p_excluir public.rol_usuario default null)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(org_id), '{}') from public.miembros
  where usuario_id = auth.uid() and activo
    and (p_roles is null or rol = any (p_roles))
    and (not p_clinico or rol in ('gerente_medico', 'medico', 'enfermeria') or acceso_clinico)
    and (not p_sin_limite or empresas_permitidas is null)
    and (p_excluir is null or rol <> p_excluir)
$$;

-- Pares «org + empresa» de los miembros limitados a algunas empresas (mismos filtros)
create or replace function public.pares_limitados(p_roles public.rol_usuario[] default null, p_clinico boolean default false)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.org_id::text || e::text), '{}') from public.miembros m, unnest(m.empresas_permitidas) e
  where m.usuario_id = auth.uid() and m.activo and m.empresas_permitidas is not null
    and (p_roles is null or m.rol = any (p_roles))
    and (not p_clinico or m.rol in ('gerente_medico', 'medico', 'enfermeria') or m.acceso_clinico)
$$;
-- Solo describen al propio usuario
revoke execute on function public.orgs_con(public.rol_usuario[], boolean, boolean, public.rol_usuario) from public, anon;
revoke execute on function public.pares_limitados(public.rol_usuario[], boolean) from public, anon;
grant execute on function public.orgs_con(public.rol_usuario[], boolean, boolean, public.rol_usuario) to authenticated;
grant execute on function public.pares_limitados(public.rol_usuario[], boolean) to authenticated;

-- Equivalencias (un usuario tiene una sola fila de miembros por organización: miembros_org_id_usuario_id_key):
--   puede_ver_empresa(org_id, empresa_id) [y mi_rol(org_id) en R]
--     = org_id ∈ orgs_con(R, sin límite) ∨ org_id‖empresa_id ∈ pares_limitados(R)
--   es_clinico(org_id) = org_id ∈ orgs_con(clínico) · mi_rol(org_id) en R = org_id ∈ orgs_con(R)
--   mi_rol(org_id) IS DISTINCT FROM 'trabajador' = org_id ∉ orgs_con('trabajador')
--   Atajo de ve_consulta / ve_trabajador: miembro sin límite de empresas y que no es 'trabajador' → siempre true

-- Pacientes
alter policy trabajadores_leer on public.trabajadores using (
  (org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
   or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]))
  and (not org_id = any ((select public.orgs_con('{trabajador}'))::uuid[]) or public.es_mi_ficha(id)));
alter policy trabajadores_editar on public.trabajadores using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion,coordinador_sst}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,recepcion,coordinador_sst}'))::text[]));

-- Consultas y lo que cuelga de ellas
alter policy consultas_clinico on clinico.consultas using (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
alter policy consultas_versiones_leer on clinico.consultas_versiones using (
  org_id = any ((select public.orgs_con(p_clinico => true))::uuid[])
  and (org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[]) or public.ve_consulta(org_id, consulta_id)));

alter policy diagnosticos_clinico on clinico.diagnosticos using (org_id = any ((select public.orgs_con(p_clinico => true))::uuid[]));
alter policy diagnosticos_empresa on clinico.diagnosticos using (
  org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[]) or public.ve_consulta(org_id, consulta_id));
alter policy aptitudes_clinico on clinico.aptitudes using (org_id = any ((select public.orgs_con(p_clinico => true))::uuid[]));
alter policy aptitudes_empresa on clinico.aptitudes using (
  org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[]) or public.ve_consulta(org_id, consulta_id));
alter policy reposos_clinico on clinico.reposos using (org_id = any ((select public.orgs_con(p_clinico => true))::uuid[]));
alter policy reposos_empresa on clinico.reposos using (
  org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[])
  or case when consulta_id is null then public.ve_trabajador(org_id, trabajador_id) else public.ve_consulta(org_id, consulta_id) end);
alter policy adjuntos_clinico on clinico.adjuntos using (org_id = any ((select public.orgs_con(p_clinico => true))::uuid[]));
alter policy adjuntos_empresa on clinico.adjuntos using (
  org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[]) or public.ve_trabajador(org_id, trabajador_id));
alter policy historia_laboral_clinico on clinico.historia_laboral using (org_id = any ((select public.orgs_con(p_clinico => true))::uuid[]));
alter policy historia_laboral_empresa on clinico.historia_laboral using (
  org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[]) or public.ve_trabajador(org_id, trabajador_id));
alter policy investigaciones_clinico on clinico.investigaciones using (org_id = any ((select public.orgs_con(p_clinico => true))::uuid[]));
alter policy investigaciones_empresa on clinico.investigaciones using (
  org_id = any ((select public.orgs_con(p_sin_limite => true, p_excluir => 'trabajador'))::uuid[]) or public.ve_trabajador(org_id, trabajador_id));

-- Empresas, puestos, citas, eventos, cobros, envíos y solicitudes
alter policy empresas_leer on public.empresas using (
  org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
  or (org_id::text || id::text) = any ((select public.pares_limitados())::text[]));
alter policy empresas_admin on public.empresas using (org_id = any ((select public.orgs_con('{administrador}'))::uuid[]));
alter policy puestos_leer on public.puestos using (
  org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]));
alter policy puestos_editar on public.puestos using (
  org_id = any ((select public.orgs_con('{administrador,coordinador_sst,gerente_medico}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,coordinador_sst,gerente_medico}'))::text[]));
alter policy citas_leer on public.citas using (
  (org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
   or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]))
  and (not org_id = any ((select public.orgs_con('{trabajador}'))::uuid[]) or public.es_mi_ficha(trabajador_id)));
alter policy citas_editar on public.citas using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion,coordinador_sst}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,recepcion,coordinador_sst}'))::text[]));
alter policy eventos_leer on public.eventos using (
  (org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
   or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]))
  and (not org_id = any ((select public.orgs_con('{trabajador}'))::uuid[]) or public.es_mi_ficha(trabajador_id)));
alter policy eventos_editar on public.eventos using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,coordinador_sst,supervisor,delegado_prevencion}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,coordinador_sst,supervisor,delegado_prevencion}'))::text[]));
alter policy cobros_todo on public.cobros using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,recepcion}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,recepcion}'))::text[]));
-- puede_enviar = es_clinico ∨ es_admin (misma fila de miembros que el alcance de empresas)
alter policy envios_leer on public.envios using (
  (org_id = any ((select public.orgs_con(p_clinico => true))::uuid[]) or org_id = any ((select public.orgs_con('{administrador}'))::uuid[]))
  and (org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
       or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[])));
-- es_servicio ∨ es_empresa
alter policy solicitudes_leer on public.solicitudes using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,recepcion,gerente_empresa}'))::text[]));

-- Listas (catálogos: miles de filas que se leen en cada formulario)
alter policy items_leer on public.lista_items using (
  org_id is null or (org_id = any ((select public.orgs_con())::uuid[])
    and (not public.lista_clinica(lista)
         or org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion,coordinador_sst}'))::uuid[]))));
alter policy items_admin on public.lista_items using (
  org_id is not null and org_id = any ((select public.orgs_con('{administrador,gerente_medico}'))::uuid[]));

-- Índices para los reportes: consultas por organización y fecha (los de empresa+fecha y fecha ya existen)
create index if not exists consultas_org_fecha on clinico.consultas (org_id, fecha);
create index if not exists trabajadores_org_empresa on public.trabajadores (org_id, empresa_id);

-- Grupo sanguíneo y discapacidad (#41): la vista filtra con el mismo alcance, calculado una vez
-- (es_servicio ∧ puede_ver_empresa = rol de servicio con alcance sobre esa empresa)
create or replace view public.trabajadores_salud as
  select t.id, t.org_id, t.empresa_id, t.grupo_sanguineo, t.discapacidad
  from public.trabajadores t
  where t.org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))::uuid[])
     or (t.org_id::text || t.empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,recepcion}'))::text[]);
