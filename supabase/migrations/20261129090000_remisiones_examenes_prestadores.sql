-- Registro clínico del despacho y de la recepción de cada examen, separado del resultado.
create table clinico.remisiones_examenes (
  id uuid primary key,
  org_id uuid not null references public.organizaciones(id) on delete cascade,
  consulta_id uuid not null references clinico.consultas(id) on delete cascade,
  prestador text not null check (btrim(prestador) <> '' and length(prestador) <= 120),
  creada_en timestamptz not null default public.ahora(),
  creada_por uuid not null,
  enviada_en timestamptz,
  enviada_por uuid,
  check ((enviada_en is null) = (enviada_por is null))
);
create index remisiones_examenes_consulta on clinico.remisiones_examenes(consulta_id, creada_en desc);

create table clinico.remisiones_examenes_detalle (
  remision_id uuid not null references clinico.remisiones_examenes(id) on delete cascade,
  examen_id text not null,
  nombre text not null,
  recibido_en timestamptz,
  recibido_por uuid,
  primary key (remision_id, examen_id),
  check ((recibido_en is null) = (recibido_por is null))
);

alter table clinico.remisiones_examenes enable row level security;
alter table clinico.remisiones_examenes_detalle enable row level security;
revoke all on clinico.remisiones_examenes, clinico.remisiones_examenes_detalle from public, anon, authenticated;
grant select on clinico.remisiones_examenes, clinico.remisiones_examenes_detalle to authenticated;

create policy remisiones_examenes_leer on clinico.remisiones_examenes for select to authenticated
  using (public.es_clinico(org_id) and public.ve_consulta(org_id, consulta_id));
create policy remisiones_examenes_detalle_leer on clinico.remisiones_examenes_detalle for select to authenticated
  using (exists (select 1 from clinico.remisiones_examenes r where r.id = remisiones_examenes_detalle.remision_id));

create function public.listar_remisiones_examenes(p_consulta uuid default null, p_remision uuid default null)
returns table (id uuid, consulta_id uuid, prestador text, creada_en timestamptz, enviada_en timestamptz, examenes jsonb)
language sql stable security invoker set search_path = '' as $$
  select r.id, r.consulta_id, r.prestador, r.creada_en, r.enviada_en,
         coalesce(jsonb_agg(jsonb_build_object('id', d.examen_id, 'nombre', d.nombre, 'recibido_en', d.recibido_en)
           order by d.nombre, d.examen_id), '[]'::jsonb)
    from clinico.remisiones_examenes r
    join clinico.remisiones_examenes_detalle d on d.remision_id = r.id
   where (p_consulta is not null or p_remision is not null)
     and (p_consulta is null or r.consulta_id = p_consulta)
     and (p_remision is null or r.id = p_remision)
   group by r.id order by r.creada_en desc, r.id desc;
$$;

create function public.preparar_remision_examenes(p_id uuid, p_consulta uuid, p_prestador text, p_examenes text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c clinico.consultas%rowtype;
  destino text := btrim(coalesce(p_prestador, ''));
  n integer;
begin
  if p_id is null or length(destino) not between 1 and 120 or coalesce(cardinality(p_examenes), 0) not between 1 and 100
     or exists (select from unnest(p_examenes) e where e is null or length(e) not between 1 and 120)
     or (select count(distinct e) from unnest(p_examenes) e) <> cardinality(p_examenes) then
    raise exception 'Indica el prestador y selecciona exámenes válidos.';
  end if;

  select * into c from clinico.consultas where id = p_consulta;
  if not found or auth.uid() is null or not public.es_clinico(c.org_id)
     or not coalesce(public.mi_rol(c.org_id) in ('administrador', 'gerente_medico', 'medico'), false)
     or not public.ve_consulta(c.org_id, p_consulta) then
    raise exception 'Esta consulta no está disponible para remisiones.' using errcode = '42501';
  end if;

  select * into c from clinico.consultas where id = p_consulta for update;
  if not found then raise exception 'Esta consulta ya no está disponible.'; end if;

  -- La clave del formulario hace idempotente un reintento o un doble clic.
  if exists (select from clinico.remisiones_examenes where id = p_id) then
    if exists (
      select from clinico.remisiones_examenes r where r.id=p_id and r.consulta_id=p_consulta
        and r.creada_por=auth.uid() and r.prestador=destino
        and (select count(*) from clinico.remisiones_examenes_detalle d where d.remision_id=r.id)=cardinality(p_examenes)
        and not exists (select from clinico.remisiones_examenes_detalle d where d.remision_id=r.id and not (d.examen_id=any(p_examenes)))
    ) then return p_id; end if;
    raise exception 'La referencia de esta remisión ya se usó.';
  end if;

  if c.origen is not null or c.estado not in ('cerrada', 'firmada') then
    raise exception 'Guarda y cierra la consulta antes de preparar una remisión.';
  end if;
  insert into clinico.remisiones_examenes(id, org_id, consulta_id, prestador, creada_por)
    values (p_id, c.org_id, c.id, destino, auth.uid());
  insert into clinico.remisiones_examenes_detalle(remision_id, examen_id, nombre)
    select distinct on (e->>'id') p_id, e->>'id', coalesce(nullif(btrim(e->>'nombre'), ''), e->>'id')
      from jsonb_array_elements(case when jsonb_typeof(c.paraclinicos)='array' then c.paraclinicos else '[]'::jsonb end) e
     where (e->>'id')=any(p_examenes);
  get diagnostics n = row_count;
  if n <> cardinality(p_examenes) then
    raise exception 'Selecciona solo exámenes solicitados en esta consulta.';
  end if;
  return p_id;
end $$;

create function public.anotar_remision_examenes(p_remision uuid, p_recibidos text[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r clinico.remisiones_examenes%rowtype;
  momento timestamptz := public.ahora();
  n integer;
begin
  select * into r from clinico.remisiones_examenes where id=p_remision;
  if not found or auth.uid() is null or not public.es_clinico(r.org_id)
     or not coalesce(public.mi_rol(r.org_id) in ('administrador', 'gerente_medico', 'medico'), false)
     or not public.ve_consulta(r.org_id, r.consulta_id) then
    raise exception 'Esta remisión no está disponible para tu cuenta.' using errcode = '42501';
  end if;
  select * into r from clinico.remisiones_examenes where id=p_remision for update;
  if not found then raise exception 'Esta remisión ya no está disponible.'; end if;
  if p_recibidos is null then
    update clinico.remisiones_examenes set enviada_en=momento, enviada_por=auth.uid()
      where id=p_remision and enviada_en is null;
  else
    if r.enviada_en is null then raise exception 'Registra primero el envío al prestador.'; end if;
    if coalesce(cardinality(p_recibidos),0) not between 1 and 100 or exists (
      select from unnest(p_recibidos) x where not exists (
        select from clinico.remisiones_examenes_detalle d where d.remision_id=p_remision and d.examen_id=x
      )
    ) then raise exception 'Selecciona solo exámenes de esta remisión.'; end if;
    update clinico.remisiones_examenes_detalle set recibido_en=momento, recibido_por=auth.uid()
      where remision_id=p_remision and examen_id=any(p_recibidos) and recibido_en is null;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.listar_remisiones_examenes(uuid,uuid), public.preparar_remision_examenes(uuid,uuid,text,text[]),
  public.anotar_remision_examenes(uuid,text[]) from public, anon;
grant execute on function public.listar_remisiones_examenes(uuid,uuid), public.preparar_remision_examenes(uuid,uuid,text,text[]),
  public.anotar_remision_examenes(uuid,text[]) to authenticated;
