-- zamorApp Ocupacional · Recordatorio de paraclínicos sin resultado
-- Cada médico recibe en la campana un aviso por sus consultas con exámenes pendientes, cada N días
-- (ajuste de la organización «recordatorio_resultados_dias», 3 por defecto; 0 = apagado).
-- Es solo un aviso: nada se bloquea. «No recordar más» lo apaga para esa consulta.
-- No hay pg_cron: la app llama a recordar_resultados() al abrir Inicio o Atención.

create table public.recordatorios_resultados (
  consulta_id uuid not null references clinico.consultas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  ultimo_aviso timestamptz,
  ignorado boolean not null default false,
  primary key (consulta_id, usuario_id)
);
alter table public.recordatorios_resultados enable row level security;
-- Solo se lee lo propio; se escribe únicamente con las funciones de abajo
create policy recordatorios_propios on public.recordatorios_resultados for select using (usuario_id = auth.uid());
revoke insert, update, delete on public.recordatorios_resultados from anon, authenticated;

-- Exámenes sin resultado ni estado (igual que pendiente() en src/lib/paraclinicos.ts)
create or replace function public.paraclinicos_pendientes(p jsonb)
returns integer language sql immutable set search_path = public as $$
  select count(*)::int from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) e
  where coalesce(btrim(e ->> 'resultado'), '') = '' and coalesce(e ->> 'estado', '') = ''
$$;

-- Avisa al médico que llama por sus consultas propias (no importadas) de los últimos 60 días
-- con exámenes pendientes. Devuelve cuántos avisos creó (máximo 20 por llamada).
create or replace function public.recordar_resultados()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select c.id, c.org_id, c.empresa_id, c.fecha, public.paraclinicos_pendientes(c.paraclinicos) as faltan,
           t.nombres || ' ' || t.apellidos as nombre
    from clinico.consultas c
    join public.miembros m on m.org_id = c.org_id and m.usuario_id = v_uid and m.activo
      and m.rol in ('administrador', 'gerente_medico', 'medico')
    join public.organizaciones o on o.id = c.org_id
    join public.trabajadores t on t.id = c.trabajador_id
    left join public.recordatorios_resultados x on x.consulta_id = c.id and x.usuario_id = v_uid
    cross join lateral (select case when o.ajustes ->> 'recordatorio_resultados_dias' ~ '^[0-9]{1,3}$' then (o.ajustes ->> 'recordatorio_resultados_dias')::int else 3 end as dias) a
    where c.medico_id = v_uid
      and c.origen is null
      and c.estado in ('borrador', 'cerrada')
      and a.dias > 0
      and c.fecha <= current_date - a.dias
      and c.fecha >= current_date - 60
      and public.paraclinicos_pendientes(c.paraclinicos) > 0
      and not coalesce(x.ignorado, false)
      and (x.ultimo_aviso is null or x.ultimo_aviso <= now() - make_interval(days => a.dias))
    order by c.fecha
    limit 20
  loop
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    values (r.org_id, v_uid, r.empresa_id, 'Resultados por recibir',
      r.nombre || ' · ' || case when r.faltan = 1 then 'falta 1 resultado' else 'faltan ' || r.faltan || ' resultados' end
        || ' (consulta del ' || to_char(r.fecha, 'DD/MM/YYYY') || ')',
      '/atencion/' || r.id || '?paso=paraclinicos');
    insert into public.recordatorios_resultados (consulta_id, usuario_id, org_id, ultimo_aviso)
    values (r.id, v_uid, r.org_id, now())
    on conflict (consulta_id, usuario_id) do update set ultimo_aviso = excluded.ultimo_aviso;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- «No recordar más» (o volver a recordar) para una consulta propia
create or replace function public.ignorar_recordatorio_resultados(p_consulta uuid, p_ignorar boolean default true)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  select c.org_id into v_org from clinico.consultas c
  where c.id = p_consulta and c.medico_id = v_uid
    and exists (select 1 from public.miembros m where m.org_id = c.org_id and m.usuario_id = v_uid and m.activo);
  if v_org is null then return false; end if;
  insert into public.recordatorios_resultados (consulta_id, usuario_id, org_id, ignorado)
  values (p_consulta, v_uid, v_org, p_ignorar)
  on conflict (consulta_id, usuario_id) do update set ignorado = excluded.ignorado;
  return true;
end $$;

revoke execute on function public.recordar_resultados() from public, anon;
revoke execute on function public.ignorar_recordatorio_resultados(uuid, boolean) from public, anon;
grant execute on function public.recordar_resultados() to authenticated;
grant execute on function public.ignorar_recordatorio_resultados(uuid, boolean) to authenticated;
