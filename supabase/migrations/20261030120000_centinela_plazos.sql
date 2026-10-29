-- zamorApp Ocupacional · Centinela de plazos legales
-- Avisa (campana y, si la organización lo permite, correo) cuando un accidente o enfermedad entra en un plazo legal:
--   declaración ante el INPSASEL: 24 h desde el accidente o el diagnóstico (LOPCYMAT art. 73; NT-02-2008, 6)
--   informe de investigación de enfermedad: 15 días continuos (Anexo 1) o 30 (fuera de la lista) (NT-02-2008, 5.2.3)
--   investigación del accidente sin causas registradas: 7 días (criterio interno, igual que plazoInvestigacion())
-- Cada plazo avisa como máximo tres veces: al detectarse, cuando queda poco (12 h; 2 días en los plazos de días) y al vencer.
-- El texto nunca lleva diagnóstico. La campana dice el trabajador, la empresa y el plazo; el correo, solo el evento y la empresa.
-- No hay pg_cron: la app llama a centinela_legal() al abrir Inicio, Atención o Accidentes, y al registrar un evento.

-- Nivel del aviso en la campana: alerta (vencido) y aviso (por vencer) llevan color e ícono
alter table public.notificaciones add column if not exists nivel text not null default 'info'
  check (nivel in ('info', 'aviso', 'alerta'));

create table if not exists public.avisos_legales (
  evento_id uuid not null references public.eventos (id) on delete cascade,
  plazo text not null check (plazo in ('declaracion', 'nt02', 'investigacion')),
  hito text not null check (hito in ('inicio', 'urgente', 'vencido')),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (evento_id, plazo, hito)
);
alter table public.avisos_legales enable row level security;
-- Sin políticas: solo la escribe y la lee centinela_legal()
revoke all on public.avisos_legales from anon, authenticated;

-- Roles que reciben los avisos y que pueden disparar la revisión
create or replace function public.rol_centinela(p_rol public.rol_usuario)
returns boolean language sql immutable set search_path = public as $$
  select p_rol in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'coordinador_sst')
$$;

-- Plazos abiertos de los eventos de una organización, con su vencimiento y el hito en que están ahora.
-- Fuera: eventos importados de otro sistema y los de hace más de 60 días (históricos).
create or replace function public.plazos_legales_abiertos(p_org uuid)
returns table (evento_id uuid, empresa_id uuid, plazo text, vence timestamptz, hito text, trabajador text, empresa text, numero int)
language sql stable security definer set search_path = public as $$
  with base as (
    select e.*, coalesce(t.nombres || ' ' || t.apellidos, 'Sin trabajador') as nombre, em.razon_social
    from public.eventos e
    join public.empresas em on em.id = e.empresa_id
    left join public.trabajadores t on t.id = e.trabajador_id
    where e.org_id = p_org and e.origen is null and e.estado <> 'cerrado'
  ), plazos as (
    select id, empresa_id, 'declaracion'::text as plazo,
           (case when tipo = 'enfermedad' then fecha_diagnostico else fecha_hora end) + interval '24 hours' as vence,
           interval '12 hours' as aviso, nombre, razon_social, numero
    from base
    where tipo in ('accidente', 'enfermedad') and fecha_declaracion is null
      and (case when tipo = 'enfermedad' then fecha_diagnostico else fecha_hora end) is not null
    union all
    select id, empresa_id, 'nt02', fecha_diagnostico + make_interval(days => case when en_anexo1 then 15 else 30 end),
           interval '2 days', nombre, razon_social, numero
    from base
    where tipo = 'enfermedad' and fecha_diagnostico is not null and fecha_informe_nt02 is null
    union all
    select id, empresa_id, 'investigacion', fecha_hora + interval '7 days', interval '2 days', nombre, razon_social, numero
    from base
    where tipo <> 'enfermedad' and coalesce(btrim(causas_inmediatas), '') = '' and coalesce(btrim(causas_basicas), '') = ''
  )
  select id, empresa_id, plazo, vence,
         case when now() >= vence then 'vencido' when now() >= vence - aviso then 'urgente' else 'inicio' end,
         nombre, razon_social, numero
  from plazos
  where vence > now() - interval '60 days'
$$;
revoke execute on function public.plazos_legales_abiertos(uuid) from public, anon, authenticated;

-- Correos por enviar. Nadie la lee directo: el administrador o el gerente médico la vacían con
-- centinela_correos_pendientes() (así ningún otro rol ve los correos de sus colegas).
create table if not exists public.correos_centinela (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  correo text not null,
  titulo text not null,
  texto text not null,
  enlace text not null,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);
create index if not exists correos_centinela_pendientes on public.correos_centinela (org_id) where enviado_en is null;
alter table public.correos_centinela enable row level security;
revoke all on public.correos_centinela from anon, authenticated;

-- Última revisión de cada organización (freno de 10 minutos). Solo la usa centinela_legal().
create table if not exists public.centinela_revisiones (
  org_id uuid primary key references public.organizaciones (id) on delete cascade,
  revisado_en timestamptz not null default now()
);
alter table public.centinela_revisiones enable row level security;
revoke all on public.centinela_revisiones from anon, authenticated;

-- Revisa los plazos de las organizaciones del usuario que llama, crea los avisos nuevos en la campana
-- y deja en cola los correos si la organización encendió «centinela_correo» (viene apagado). El correo sale por un
-- canal externo: lleva solo el número de evento, la empresa y el plazo, nunca el nombre del trabajador; el detalle
-- queda detrás del enlace, que pide sesión. Devuelve cuántos avisos creó.
-- Solo la pueden usar los roles del centinela.
create or replace function public.centinela_legal()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  o record;
  p record;
  v_titulo text;
  v_texto text;
  v_enlace text;
  v_nuevos integer := 0;
  v_filas integer;
  v_nivel text;
begin
  if v_uid is null then return 0; end if;
  for o in
    select m.org_id, coalesce((g.ajustes ->> 'centinela_correo')::boolean, false) as con_correo
    from public.miembros m join public.organizaciones g on g.id = m.org_id
    where m.usuario_id = v_uid and m.activo and public.rol_centinela(m.rol)
  loop
    -- Freno: cada organización se revisa como máximo una vez cada 10 minutos
    insert into public.centinela_revisiones as c (org_id) values (o.org_id)
    on conflict (org_id) do update set revisado_en = now() where c.revisado_en <= now() - interval '10 minutes';
    get diagnostics v_filas = row_count;
    continue when v_filas = 0;
    for p in select * from public.plazos_legales_abiertos(o.org_id) order by vence loop
      exit when v_nuevos >= 30;
      -- Un hito avisado marca también los anteriores: quien llega tarde recibe un solo aviso, no tres
      insert into public.avisos_legales (evento_id, plazo, hito, org_id)
      select p.evento_id, p.plazo, h, o.org_id
      from unnest(case p.hito when 'urgente' then array['inicio'] when 'vencido' then array['inicio', 'urgente'] else array[]::text[] end) h
      on conflict do nothing;
      insert into public.avisos_legales (evento_id, plazo, hito, org_id) values (p.evento_id, p.plazo, p.hito, o.org_id)
      on conflict do nothing;
      get diagnostics v_filas = row_count;
      continue when v_filas = 0; -- ese hito ya se había avisado
      v_nuevos := v_nuevos + 1;
      v_titulo := case p.plazo || '.' || p.hito
        when 'declaracion.inicio' then 'Declaración ante el INPSASEL pendiente'
        when 'declaracion.urgente' then 'Declaración ante el INPSASEL: vence en menos de 12 horas'
        when 'declaracion.vencido' then 'Declaración ante el INPSASEL vencida'
        when 'nt02.inicio' then 'Informe de investigación NT-02 pendiente'
        when 'nt02.urgente' then 'Informe de investigación NT-02: vence en menos de 2 días'
        when 'nt02.vencido' then 'Informe de investigación NT-02 vencido'
        when 'investigacion.inicio' then 'Investigación del accidente pendiente'
        when 'investigacion.urgente' then 'Investigación del accidente: vence en menos de 2 días'
        else 'Investigación del accidente vencida' end;
      v_nivel := case p.hito when 'vencido' then 'alerta' when 'urgente' then 'aviso' else 'info' end;
      v_texto := 'Evento #' || p.numero || ' · ' || p.empresa || ' · vence el '
        || to_char(p.vence at time zone 'America/Caracas', 'DD/MM/YYYY "a las" HH24:MI');
      v_enlace := case p.plazo when 'nt02' then '/accidentes/' || p.evento_id || '/investigacion' else '/accidentes/' || p.evento_id end;
      with destino as (
        insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace, nivel)
        select o.org_id, m.usuario_id, p.empresa_id, v_titulo, p.trabajador || ' · ' || v_texto, v_enlace, v_nivel
        from public.miembros m
        where m.org_id = o.org_id and m.activo and public.rol_centinela(m.rol)
          and (m.empresas_permitidas is null or p.empresa_id = any (m.empresas_permitidas))
        returning usuario_id
      )
      insert into public.correos_centinela (org_id, correo, titulo, texto, enlace)
      select o.org_id, u.email, v_titulo, v_texto, v_enlace
      from destino d join auth.users u on u.id = d.usuario_id
      where o.con_correo and coalesce(u.email, '') <> '';
    end loop;
  end loop;
  return v_nuevos;
end $$;
revoke execute on function public.centinela_legal() from public, anon;
grant execute on function public.centinela_legal() to authenticated;

-- Correos en cola de las organizaciones donde quien llama es administrador o gerente médico (máximo 50)
create or replace function public.centinela_correos_pendientes()
returns table (id uuid, correo text, titulo text, texto text, enlace text)
language sql stable security definer set search_path = public as $$
  select c.id, c.correo, c.titulo, c.texto, c.enlace
  from public.correos_centinela c
  join public.miembros m on m.org_id = c.org_id and m.usuario_id = auth.uid() and m.activo
    and m.rol in ('administrador', 'gerente_medico')
  where c.enviado_en is null
  order by c.creado_en
  limit 50
$$;
revoke execute on function public.centinela_correos_pendientes() from public, anon;
grant execute on function public.centinela_correos_pendientes() to authenticated;

-- Marca como enviados los correos que el servidor ya despachó (mismas reglas que la lectura)
create or replace function public.centinela_correos_enviados(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  update public.correos_centinela c set enviado_en = now()
  where c.id = any (p_ids) and c.enviado_en is null
    and exists (select 1 from public.miembros m where m.org_id = c.org_id and m.usuario_id = auth.uid() and m.activo
                and m.rol in ('administrador', 'gerente_medico'));
  get diagnostics v = row_count;
  return v;
end $$;
revoke execute on function public.centinela_correos_enviados(uuid[]) from public, anon;
grant execute on function public.centinela_correos_enviados(uuid[]) to authenticated;
