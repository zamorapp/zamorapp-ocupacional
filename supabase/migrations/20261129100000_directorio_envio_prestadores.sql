create table public.prestadores_examenes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  correo text not null check (
    length(correo) <= 254 and correo = lower(btrim(correo))
    and correo ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
  ),
  activo boolean not null default true,
  unique (org_id, correo)
);
alter table public.prestadores_examenes enable row level security;
revoke all on public.prestadores_examenes from public, anon, authenticated;
grant select, insert on public.prestadores_examenes to authenticated;
grant update (nombre, correo, activo) on public.prestadores_examenes to authenticated;
create policy prestadores_examenes_leer on public.prestadores_examenes for select to authenticated using (
  (activo and org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico}', p_clinico => true))::uuid[]))
  or org_id = any ((select public.orgs_con('{administrador,gerente_medico}', p_clinico => true, p_sin_limite => true))::uuid[])
);
create policy prestadores_examenes_crear on public.prestadores_examenes for insert to authenticated with check (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico}', p_clinico => true, p_sin_limite => true))::uuid[])
);
create policy prestadores_examenes_editar on public.prestadores_examenes for update to authenticated using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico}', p_clinico => true, p_sin_limite => true))::uuid[])
) with check (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico}', p_clinico => true, p_sin_limite => true))::uuid[])
);

alter table clinico.remisiones_examenes
  add column prestador_id uuid references public.prestadores_examenes(id) on delete restrict,
  add column correo_envio text,
  add column intento_envio uuid,
  add column inicio_envio timestamptz,
  add column solicitante_envio uuid,
  add column estado_correo text check (estado_correo in ('enviando', 'enviado', 'por_confirmar'));
create index remisiones_examenes_prestador on clinico.remisiones_examenes(prestador_id);

create function public.preparar_remision_directorio(p_id uuid, p_consulta uuid, p_prestador uuid, p_examenes text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  destino public.prestadores_examenes%rowtype;
  resultado uuid;
begin
  select p.* into destino from public.prestadores_examenes p
  join clinico.consultas c on c.org_id = p.org_id
  where p.id = p_prestador and c.id = p_consulta and p.activo;
  if not found then raise exception 'Selecciona un prestador activo de tu servicio.'; end if;
  resultado := public.preparar_remision_examenes(p_id, p_consulta, destino.nombre, p_examenes);
  update clinico.remisiones_examenes set prestador_id = destino.id
  where id = resultado and prestador_id is null and enviada_en is null and estado_correo is null;
  if not exists (select 1 from clinico.remisiones_examenes r where r.id = resultado and r.prestador_id = destino.id) then
    raise exception 'La remisión ya se registró con otro prestador.';
  end if;
  return resultado;
end $$;

create function public.estado_correo_remisiones(p_consulta uuid)
returns table (id uuid, destino text, estado text)
language sql stable security invoker set search_path = '' as $$
  select r.id, coalesce(r.correo_envio, p.correo), case
    when r.estado_correo = 'enviando' and r.inicio_envio < public.ahora() - interval '3 minutes' then 'por_confirmar'
    else r.estado_correo end
  from clinico.remisiones_examenes r
  join clinico.consultas c on c.id = r.consulta_id and c.org_id = r.org_id
  left join public.prestadores_examenes p on p.id = r.prestador_id and p.org_id = r.org_id and p.activo and p.nombre = r.prestador
  where r.consulta_id = p_consulta and (r.estado_correo is not null or c.estado = 'firmada' and c.origen is null and r.enviada_en is null and p.id is not null)
$$;

-- El canal automático usa exclusivamente la orden registrada y el correo confirmado.
create function public.tomar_correo_remision(p_id uuid, p_destino text, p_intento uuid, p_usuario uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r clinico.remisiones_examenes%rowtype;
  orden jsonb;
begin
  select rx.* into r from clinico.remisiones_examenes rx
  join clinico.consultas c on c.id = rx.consulta_id and c.org_id = rx.org_id
  join public.miembros m on m.org_id = rx.org_id and m.usuario_id = p_usuario and m.activo
  where rx.id = p_id
    and (m.rol in ('gerente_medico', 'medico') or (m.rol = 'administrador' and m.acceso_clinico))
    and (m.empresas_permitidas is null or c.empresa_id = any(m.empresas_permitidas));
  if not found then
    raise exception 'La remisión no está disponible.' using errcode = '42501';
  end if;
  -- La preparación también toma primero la consulta y luego la remisión.
  perform 1 from clinico.consultas where id = r.consulta_id for share;
  select * into r from clinico.remisiones_examenes where id = p_id for update;
  if not found or r.enviada_en is not null or r.estado_correo is not null or p_intento is null then
    raise exception 'Esta orden ya tiene un registro de envío.';
  end if;

  select jsonb_build_object('destino', p.correo, 'prestador', r.prestador,
    'fecha', to_char(r.creada_en at time zone 'America/Caracas', 'DD/MM/YYYY'),
    'servicio', o.nombre, 'paciente', concat_ws(' ', t.nombres, t.apellidos), 'cedula', t.cedula,
    'medico', m.nombre_completo, 'mpps', m.mpps,
    'examenes', (select jsonb_agg(d.nombre order by d.nombre, d.examen_id)
                  from clinico.remisiones_examenes_detalle d where d.remision_id = r.id))
  into orden
  from public.prestadores_examenes p
  join clinico.consultas c on c.org_id = p.org_id and c.id = r.consulta_id
  join public.trabajadores t on t.id = c.trabajador_id and t.org_id = c.org_id
  join public.organizaciones o on o.id = c.org_id
  left join public.perfiles m on m.id = c.medico_id
  where p.id = r.prestador_id and p.org_id = r.org_id and p.activo and p.correo = p_destino
    and p.nombre = r.prestador and c.estado = 'firmada' and c.origen is null
  for share of p;
  if orden is null then raise exception 'Cambió el prestador o la consulta aún debe firmarse. Revisa la orden.'; end if;

  update clinico.remisiones_examenes set estado_correo = 'enviando', inicio_envio = public.ahora(),
    solicitante_envio = p_usuario, intento_envio = p_intento, correo_envio = p_destino where id = r.id;
  return orden;
end $$;

create function public.cerrar_correo_remision(p_id uuid, p_intento uuid, p_estado text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_estado is null or p_estado not in ('enviado', 'por_confirmar') then return false; end if;
  update clinico.remisiones_examenes set estado_correo = p_estado,
    enviada_en = case when p_estado = 'enviado' then public.ahora() end,
    enviada_por = case when p_estado = 'enviado' then solicitante_envio end
    where id = p_id and intento_envio = p_intento and estado_correo = 'enviando';
  return found;
end $$;

-- Un envío en curso se resuelve primero. La confirmación manual exige verificar la entrega anterior.
create function clinico.proteger_envio_remision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.enviada_en is null and new.enviada_en is not null and old.estado_correo = 'enviando'
     and new.estado_correo = 'enviando' then
    if old.inicio_envio > public.ahora() - interval '3 minutes' then
      raise exception 'El envío por correo sigue en curso.';
    end if;
    new.estado_correo := 'por_confirmar';
  end if;
  return new;
end $$;
create trigger proteger_envio_remision before update on clinico.remisiones_examenes
for each row execute function clinico.proteger_envio_remision();

revoke execute on function public.preparar_remision_directorio(uuid,uuid,uuid,text[]),
  public.estado_correo_remisiones(uuid) from public, anon;
grant execute on function public.preparar_remision_directorio(uuid,uuid,uuid,text[]),
  public.estado_correo_remisiones(uuid) to authenticated;
revoke execute on function public.tomar_correo_remision(uuid,text,uuid,uuid), public.cerrar_correo_remision(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.tomar_correo_remision(uuid,text,uuid,uuid), public.cerrar_correo_remision(uuid,uuid,text) to service_role;
revoke execute on function clinico.proteger_envio_remision() from public, anon, authenticated;
