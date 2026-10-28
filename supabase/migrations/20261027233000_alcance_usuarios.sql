-- zamorApp Ocupacional · Cada usuario de empresa ve solo lo suyo
--   1) Usuarios (miembros y perfiles): el personal del servicio ve a todos; RR. HH. y demás roles de empresa
--      ven al personal del servicio y a los usuarios de sus mismas empresas, nunca los de otras empresas.
--   2) Listas clínicas (paraclínicos, perfiles de examen, medicinas…): solo el servicio y el coordinador SST.
--   3) El rol trabajador ve solo su propia ficha (la que tiene el mismo correo que su cuenta) y lo ligado a ella.

-- ¿El usuario de la sesión tiene esta ficha? (mismo correo que su cuenta; el correo de la cuenta no lo cambia el usuario)
create or replace function public.es_mi_ficha(p_trabajador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trabajadores t join auth.users u on u.id = auth.uid()
    where t.id = p_trabajador and nullif(trim(t.correo), '') is not null and lower(trim(t.correo)) = lower(u.email)
  )
$$;
revoke execute on function public.es_mi_ficha(uuid) from public, anon;
grant execute on function public.es_mi_ficha(uuid) to authenticated;

-- ¿Puede la sesión ver a este usuario de la organización?
create or replace function public.ve_miembro(p_org uuid, p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_usuario = auth.uid() or exists (
    select 1 from public.miembros yo join public.miembros otro on otro.org_id = yo.org_id and otro.usuario_id = p_usuario
    where yo.usuario_id = auth.uid() and yo.org_id = p_org and yo.activo
      and (yo.rol not in ('gerente_empresa', 'trabajador', 'supervisor', 'delegado_prevencion', 'auditor')
           or otro.rol not in ('gerente_empresa', 'trabajador', 'supervisor', 'delegado_prevencion', 'auditor')
           or (yo.rol <> 'trabajador' and yo.empresas_permitidas && otro.empresas_permitidas))
  )
$$;
revoke execute on function public.ve_miembro(uuid, uuid) from public, anon;
grant execute on function public.ve_miembro(uuid, uuid) to authenticated;

create or replace function public.ve_usuario(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_usuario = auth.uid()
      or exists (select 1 from public.miembros yo where yo.usuario_id = auth.uid() and yo.activo and public.ve_miembro(yo.org_id, p_usuario))
$$;
revoke execute on function public.ve_usuario(uuid) from public, anon;
grant execute on function public.ve_usuario(uuid) to authenticated;

drop policy if exists miembros_leer on public.miembros;
create policy miembros_leer on public.miembros for select
  using (org_id in (select public.mis_orgs()) and public.ve_miembro(org_id, usuario_id));
drop policy if exists perfil_colegas on public.perfiles;
create policy perfil_colegas on public.perfiles for select using (public.ve_usuario(id));

-- Listas con contenido clínico (o con nombres de perfiles por empresa)
create or replace function public.lista_clinica(p_lista text)
returns boolean language sql immutable as $$
  select p_lista in ('grupo_paraclinicos', 'paraclinico', 'perfil_examen_fisico', 'perfil_examen_funcional', 'examen_fisico', 'examen_funcional',
    'medicina', 'presentacion_medicina', 'via_administracion', 'frecuencia_dosis', 'duracion_tratamiento', 'antecedente_medico', 'habito',
    'sistema_organico', 'diagnostico_declarable', 'modelo_informe_libre', 'recomendacion_paciente', 'especialidad')
$$;
drop policy if exists items_leer on public.lista_items;
create policy items_leer on public.lista_items for select
  using (org_id is null or (org_id in (select public.mis_orgs())
    and (not public.lista_clinica(lista) or public.es_servicio(org_id) or public.mi_rol(org_id) = 'coordinador_sst')));

-- Trabajador: solo su ficha
drop policy if exists trabajadores_leer on public.trabajadores;
create policy trabajadores_leer on public.trabajadores for select
  using (public.puede_ver_empresa(org_id, empresa_id) and (public.mi_rol(org_id) is distinct from 'trabajador' or public.es_mi_ficha(id)));
drop policy if exists citas_leer on public.citas;
create policy citas_leer on public.citas for select
  using (public.puede_ver_empresa(org_id, empresa_id) and (public.mi_rol(org_id) is distinct from 'trabajador' or public.es_mi_ficha(trabajador_id)));
drop policy if exists eventos_leer on public.eventos;
create policy eventos_leer on public.eventos for select
  using (public.puede_ver_empresa(org_id, empresa_id) and (public.mi_rol(org_id) is distinct from 'trabajador' or public.es_mi_ficha(trabajador_id)));

-- Aptitudes, reposos, historia laboral y adjuntos de empresa pasan por estas dos funciones
create or replace function public.ve_trabajador(p_org uuid, p_trabajador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros m
    where m.usuario_id = auth.uid() and m.org_id = p_org and m.activo
      and (m.empresas_permitidas is null
           or exists (select 1 from public.trabajadores t where t.id = p_trabajador and t.empresa_id = any (m.empresas_permitidas)))
      and (m.rol <> 'trabajador' or public.es_mi_ficha(p_trabajador))
  )
$$;
create or replace function public.ve_consulta(p_org uuid, p_consulta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.miembros m
    where m.usuario_id = auth.uid() and m.org_id = p_org and m.activo
      and (m.empresas_permitidas is null
           or exists (select 1 from clinico.consultas c where c.id = p_consulta and c.empresa_id = any (m.empresas_permitidas)))
      and (m.rol <> 'trabajador' or exists (select 1 from clinico.consultas c where c.id = p_consulta and public.es_mi_ficha(c.trabajador_id)))
  )
$$;
