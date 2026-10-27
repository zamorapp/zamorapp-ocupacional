-- zamorApp Ocupacional · Alcance por empresa de los roles con empresas asignadas (QA de conjunto, 27/10/2026)
-- Las políticas «for all» también valen para leer: puestos_editar dejaba al coordinador SST limitado a una
-- empresa ver (y editar) los puestos de todas, e informes_vigilancia_editar le mostraba el informe consolidado
-- de todas las empresas. Ahora: puestos solo de sus empresas; el consolidado (empresa_id nulo) solo para
-- personal clínico, administrador o quien no tiene empresas limitadas.

drop policy if exists puestos_editar on public.puestos;
create policy puestos_editar on public.puestos for all
  using (public.mi_rol(org_id) in ('administrador', 'coordinador_sst', 'gerente_medico')
         and public.puede_ver_empresa(org_id, empresa_id))
  with check (public.mi_rol(org_id) in ('administrador', 'coordinador_sst', 'gerente_medico')
              and public.puede_ver_empresa(org_id, empresa_id));

drop policy if exists informes_vigilancia_editar on public.informes_vigilancia;
create policy informes_vigilancia_editar on public.informes_vigilancia for all
  using ((public.es_clinico(org_id) or public.mi_rol(org_id) in ('administrador', 'coordinador_sst'))
         and case when empresa_id is null
                  then public.es_clinico(org_id) or public.es_admin(org_id) or public.puede_ver_empresa(org_id, null)
                  else public.puede_ver_empresa(org_id, empresa_id) end)
  with check ((public.es_clinico(org_id) or public.mi_rol(org_id) in ('administrador', 'coordinador_sst'))
              and case when empresa_id is null
                       then public.es_clinico(org_id) or public.es_admin(org_id) or public.puede_ver_empresa(org_id, null)
                       else public.puede_ver_empresa(org_id, empresa_id) end);
