-- Archivo privado por empresa, contrato y trimestre. La vigilancia general no lee este bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vigilancia-proyectos', 'vigilancia-proyectos', false, 10485760, array['application/pdf']);

create function public.puede_archivar_vigilancia_proyecto(p_ruta text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select case
    when p_ruta ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[A-Z0-9][A-Z0-9-]{0,39}--20[0-9]{2}-T[1-4][.]pdf$'
    then exists (
      select 1 from public.empresas e
      where e.org_id = split_part(p_ruta, '/', 1)::uuid
        and not e.es_particular
        and e.id = split_part(p_ruta, '/', 2)::uuid
        and public.mi_rol(e.org_id) in ('administrador', 'gerente_medico', 'medico')
        and public.puede_ver_empresa(e.org_id, e.id)
    )
    else false
  end
$$;

revoke all on function public.puede_archivar_vigilancia_proyecto(text) from public, anon, authenticated;
grant execute on function public.puede_archivar_vigilancia_proyecto(text) to authenticated;

create policy vigilancia_proyectos_leer on storage.objects for select to authenticated
  using (bucket_id = 'vigilancia-proyectos' and public.puede_archivar_vigilancia_proyecto(name));
create policy vigilancia_proyectos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'vigilancia-proyectos' and public.puede_archivar_vigilancia_proyecto(name));
