-- zamorApp Ocupacional · Depurar nómina: marcar como egresados, en lote, a quienes ya no se atienden
-- Cuenta (p_aplicar = false) o marca (p_aplicar = true) a los trabajadores activos, en reposo o aspirantes
-- sin ninguna consulta desde p_desde y registrados antes de esa fecha (o traídos de otro sistema).
-- Solo el administrador o el personal clínico de la organización; mira las consultas sin exponerlas.
create or replace function public.depurar_nomina(p_empresa uuid, p_desde date, p_aplicar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_org uuid;
begin
  select org_id into v_org from public.miembros where usuario_id = auth.uid() and activo order by creado_en limit 1;
  if v_org is null or not (public.es_admin(v_org) or public.es_clinico(v_org)) then
    raise exception 'Sin permiso para depurar la nómina';
  end if;

  create temp table _salen on commit drop as
    select t.id from public.trabajadores t
    where t.org_id = v_org
      and (p_empresa is null or t.empresa_id = p_empresa)
      and t.estado in ('activo', 'reposo', 'aspirante')
      and (t.creado_en::date < p_desde or t.origen is not null)
      and not exists (select 1 from clinico.consultas c where c.trabajador_id = t.id and c.fecha >= p_desde);

  if p_aplicar then
    update public.trabajadores t set estado = 'egresado', fecha_egreso = coalesce(t.fecha_egreso, current_date)
    where t.id in (select id from _salen);
  end if;
  select count(*) into n from _salen;
  drop table _salen;
  return n;
end $$;
grant execute on function public.depurar_nomina(uuid, date, boolean) to authenticated;
