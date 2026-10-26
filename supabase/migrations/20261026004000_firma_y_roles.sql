-- zamorApp Ocupacional · Decisiones del 26/10/2026
-- 1) Consulta firmada = bloqueada para siempre: no se edita, no se reabre y no se borra (ni sus diagnósticos, aptitud o reposo).
-- 2) Los roles de personas de la empresa cliente deben tener su empresa asignada (solo ven esa).

-- ─── 1. Firma ─────────────────────────────────────────────
-- Reemplaza a consultas_no_firmadas, que impedía incluso pasar a "firmada"
drop policy if exists consultas_no_firmadas on clinico.consultas;
drop policy if exists consultas_firmadas_no_editar on clinico.consultas;
create policy consultas_firmadas_no_editar on clinico.consultas as restrictive for update
  using (estado <> 'firmada') with check (true);

create or replace function public.consulta_abierta(p_consulta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select estado <> 'firmada' from clinico.consultas where id = p_consulta), true)
$$;

-- Diagnósticos, aptitud y reposo de una consulta firmada: se leen, pero no se agregan, cambian ni borran
drop policy if exists diagnosticos_firmada_insertar on clinico.diagnosticos;
create policy diagnosticos_firmada_insertar on clinico.diagnosticos as restrictive for insert with check (public.consulta_abierta(consulta_id));
drop policy if exists diagnosticos_firmada_editar on clinico.diagnosticos;
create policy diagnosticos_firmada_editar on clinico.diagnosticos as restrictive for update using (public.consulta_abierta(consulta_id)) with check (true);
drop policy if exists diagnosticos_firmada_borrar on clinico.diagnosticos;
create policy diagnosticos_firmada_borrar on clinico.diagnosticos as restrictive for delete using (public.consulta_abierta(consulta_id));
drop policy if exists aptitudes_firmada_insertar on clinico.aptitudes;
create policy aptitudes_firmada_insertar on clinico.aptitudes as restrictive for insert with check (public.consulta_abierta(consulta_id));
drop policy if exists aptitudes_firmada_editar on clinico.aptitudes;
create policy aptitudes_firmada_editar on clinico.aptitudes as restrictive for update using (public.consulta_abierta(consulta_id)) with check (true);
drop policy if exists aptitudes_firmada_borrar on clinico.aptitudes;
create policy aptitudes_firmada_borrar on clinico.aptitudes as restrictive for delete using (public.consulta_abierta(consulta_id));
drop policy if exists reposos_firmada_insertar on clinico.reposos;
create policy reposos_firmada_insertar on clinico.reposos as restrictive for insert with check ((consulta_id is null or public.consulta_abierta(consulta_id)));
drop policy if exists reposos_firmada_editar on clinico.reposos;
create policy reposos_firmada_editar on clinico.reposos as restrictive for update using ((consulta_id is null or public.consulta_abierta(consulta_id))) with check (true);
drop policy if exists reposos_firmada_borrar on clinico.reposos;
create policy reposos_firmada_borrar on clinico.reposos as restrictive for delete using ((consulta_id is null or public.consulta_abierta(consulta_id)));

-- Firmar: solo personal clínico, solo una consulta cerrada
create or replace function public.firmar_consulta(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_estado text;
begin
  select estado into v_estado from clinico.consultas where id = p_id;
  if v_estado is null then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  if v_estado = 'firmada' then return; end if;
  if v_estado <> 'cerrada' then raise exception 'Cierra la consulta antes de firmarla.'; end if;
  update clinico.consultas set estado = 'firmada', firmada_en = now() where id = p_id;
end $$;
grant execute on function public.firmar_consulta(uuid) to authenticated;

-- ─── 2. Empresa obligatoria para roles de la empresa cliente ─
create or replace function public.validar_empresas_miembro()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.rol in ('gerente_empresa', 'trabajador', 'supervisor', 'delegado_prevencion', 'auditor')
     and coalesce(array_length(new.empresas_permitidas, 1), 0) = 0 then
    raise exception 'Elige la empresa a la que pertenece este usuario';
  end if;
  return new;
end $$;
drop trigger if exists validar_empresas_miembro on public.miembros;
create trigger validar_empresas_miembro before insert or update of rol, empresas_permitidas on public.miembros
  for each row execute function public.validar_empresas_miembro();
