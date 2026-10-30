-- zamorApp · Alerta para la próxima evaluación (pedido de Cesar, 30-oct-2026)
-- «Veo hoy una lesión infectada en el pie: en la próxima evaluación necesito verificar eso.» La nota queda pegada al
-- trabajador y sale arriba de su próxima consulta hasta que el médico la marca «Revisado» (con una respuesta corta).
-- Puede pedir paraclínicos del catálogo («pedir al paciente»): si la alerta es solo de paraclínicos, se cierra sola
-- cuando se cargan sus resultados. Fecha opcional «revisar antes de» → campana de Inicio (solo personal clínico).
-- Condiciones de Analizar (30-oct): RLS clínica por orgs_con/pares_limitados; sin borrar; texto, trabajador, consulta,
-- autor y hora inmutables; revisada_por/revisada_en los pone el disparador; revisa solo médico, gerente o administrador;
-- con dos PC gana la primera revisión; nunca sale del servicio médico (no va a impresos, envíos ni centinela).

create table if not exists clinico.alertas_clinicas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete set null,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  consulta_id uuid references clinico.consultas (id) on delete set null,
  texto text not null default '' check (length(texto) <= 500),
  -- Del catálogo de paraclínicos: [{"id": "...", "nombre": "Hemoglobina"}]
  paraclinicos jsonb not null default '[]' check (jsonb_typeof(paraclinicos) = 'array' and jsonb_array_length(paraclinicos) <= 30),
  revisar_antes date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'revisada', 'descartada')),
  respuesta text check (length(respuesta) <= 500),
  creada_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default public.ahora(),
  revisada_por uuid references auth.users (id) on delete set null,
  revisada_en timestamptz,
  revisada_en_consulta uuid references clinico.consultas (id) on delete set null,
  automatica boolean not null default false,
  hora_equipo jsonb,
  actualizado_en timestamptz not null default public.ahora(),
  check (btrim(texto) <> '' or jsonb_array_length(paraclinicos) > 0)
);
create index if not exists alertas_clinicas_pendientes on clinico.alertas_clinicas (trabajador_id) where estado = 'pendiente';

alter table clinico.alertas_clinicas enable row level security;
drop policy if exists alertas_leer on clinico.alertas_clinicas;
create policy alertas_leer on clinico.alertas_clinicas for select using (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
drop policy if exists alertas_crear on clinico.alertas_clinicas;
create policy alertas_crear on clinico.alertas_clinicas for insert with check (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
drop policy if exists alertas_revisar on clinico.alertas_clinicas;
create policy alertas_revisar on clinico.alertas_clinicas for update using (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
-- Sin delete: ni política ni permiso. Lo que ya no aplica se marca «descartada».
grant select, insert, update on clinico.alertas_clinicas to authenticated;
revoke delete on clinico.alertas_clinicas from authenticated, anon;

create or replace view public.alertas_clinicas with (security_invoker = true) as select * from clinico.alertas_clinicas;
grant select, insert, update on public.alertas_clinicas to authenticated;
revoke all on public.alertas_clinicas from anon;

-- ─── Reglas de la fila (corren en la nube y en la PC) ───
create or replace function public.proteger_alerta_clinica()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bandeja boolean := coalesce(current_setting('sync.cambio_id', true), '') <> '';
  v_auto boolean := coalesce(current_setting('zamorapp.cierre_automatico', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    select t.empresa_id into new.empresa_id from public.trabajadores t where t.id = new.trabajador_id and t.org_id = new.org_id;
    if not found then raise exception 'El trabajador no es de esta organización.'; end if;
    if new.consulta_id is not null and not exists (
        select 1 from clinico.consultas c where c.id = new.consulta_id and c.trabajador_id = new.trabajador_id and c.org_id = new.org_id) then
      raise exception 'La consulta no es de ese trabajador.';
    end if;
    new.texto := btrim(new.texto);
    new.estado := 'pendiente';
    new.respuesta := null; new.revisada_por := null; new.revisada_en := null; new.revisada_en_consulta := null; new.automatica := false;
    -- Desde la bandeja se respetan autor y hora de la PC (la hora la marca hora_oficial si no venía verificada)
    if not v_bandeja or new.creada_por is null then new.creada_por := v_uid; end if;
    if not v_bandeja then new.creada_en := public.ahora(); end if;
    return new;
  end if;

  -- Lo que se escribió al crearla no cambia
  new.org_id := old.org_id; new.empresa_id := old.empresa_id; new.trabajador_id := old.trabajador_id; new.consulta_id := old.consulta_id;
  new.texto := old.texto; new.paraclinicos := old.paraclinicos; new.creada_por := old.creada_por; new.creada_en := old.creada_en;
  new.actualizado_en := public.ahora();

  -- Ya revisada o descartada: gana la primera revisión (otra PC que revisó después no la pisa)
  if old.estado <> 'pendiente' then
    new.estado := old.estado; new.respuesta := old.respuesta; new.revisada_por := old.revisada_por; new.revisada_en := old.revisada_en;
    new.revisada_en_consulta := old.revisada_en_consulta; new.automatica := old.automatica; new.revisar_antes := old.revisar_antes;
    return new;
  end if;

  if new.estado = 'pendiente' then
    new.respuesta := null; new.revisada_por := null; new.revisada_en := null; new.revisada_en_consulta := null; new.automatica := false;
    return new;
  end if;

  -- Revisar o descartar: solo médico, gerente médico o administrador (el cierre por resultados lo hace la base)
  if v_auto then
    new.automatica := true; new.revisada_por := null;
  else
    if v_uid is null or not old.org_id = any (public.orgs_con('{administrador,gerente_medico,medico}')) then
      raise exception 'La alerta la marca revisada el médico.' using errcode = '42501';
    end if;
    new.automatica := false;
    new.revisada_por := v_uid;
  end if;
  new.respuesta := nullif(btrim(coalesce(new.respuesta, '')), '');
  if new.revisada_en_consulta is not null and not exists (
      select 1 from clinico.consultas c where c.id = new.revisada_en_consulta and c.trabajador_id = old.trabajador_id) then
    new.revisada_en_consulta := null;
  end if;
  if not v_bandeja or new.revisada_en is null then new.revisada_en := public.ahora(); end if;
  return new;
end $$;
revoke execute on function public.proteger_alerta_clinica() from public, anon, authenticated;

-- «proteger_…» corre después de «hora_oficial» (los before van en orden alfabético)
drop trigger if exists proteger_alerta on clinico.alertas_clinicas;
create trigger proteger_alerta before insert or update on clinico.alertas_clinicas
  for each row execute function public.proteger_alerta_clinica();
drop trigger if exists hora_oficial on clinico.alertas_clinicas;
create trigger hora_oficial before insert or update on clinico.alertas_clinicas
  for each row execute function public.hora_oficial_de_la_bandeja('creada_en', 'revisada_en');
drop trigger if exists bit_alertas_clinicas on clinico.alertas_clinicas;
create trigger bit_alertas_clinicas after insert or update on clinico.alertas_clinicas
  for each row execute function public.registrar_bitacora();

-- ─── Se cierra sola: alerta solo de paraclínicos cuyos resultados ya están en una consulta posterior ───
-- Solo en la nube: así la PC no sube un cierre que la nube también haría (sería un conflicto de versión).
create or replace function public.cerrar_alertas_con_resultados()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_con text[];
begin
  if public.es_base_local() then return null; end if;
  select coalesce(array_agg(lower(btrim(e ->> 'nombre'))), '{}') into v_con
    from jsonb_array_elements(case when jsonb_typeof(new.paraclinicos) = 'array' then new.paraclinicos else '[]'::jsonb end) e
   where coalesce(btrim(e ->> 'resultado'), '') <> '' or coalesce(e ->> 'estado', '') <> '';
  if cardinality(v_con) = 0 then return null; end if;
  for a in
    select x.id from clinico.alertas_clinicas x
     where x.trabajador_id = new.trabajador_id and x.estado = 'pendiente' and btrim(x.texto) = ''
       and x.consulta_id is distinct from new.id
       and jsonb_array_length(x.paraclinicos) > 0
       and not exists (select 1 from jsonb_array_elements(x.paraclinicos) p where not lower(btrim(p ->> 'nombre')) = any (v_con))
  loop
    perform set_config('zamorapp.cierre_automatico', 'on', true);
    update clinico.alertas_clinicas set estado = 'revisada', revisada_en_consulta = new.id,
      respuesta = 'Resultados cargados en la consulta del ' || to_char(new.fecha, 'DD/MM/YYYY')
     where id = a.id;
    perform set_config('zamorapp.cierre_automatico', '', true);
  end loop;
  return null;
end $$;
revoke execute on function public.cerrar_alertas_con_resultados() from public, anon, authenticated;
drop trigger if exists cerrar_alertas_con_resultados on clinico.consultas;
create trigger cerrar_alertas_con_resultados after insert or update of paraclinicos on clinico.consultas
  for each row execute function public.cerrar_alertas_con_resultados();

-- ─── Campana de Inicio: «revisar antes de» en 3 días o vencida; solo personal clínico ───
create table if not exists public.recordatorios_alertas (
  alerta_id uuid not null references clinico.alertas_clinicas (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  ultimo_aviso timestamptz not null,
  primary key (alerta_id, usuario_id)
);
alter table public.recordatorios_alertas enable row level security;
drop policy if exists recordatorios_alertas_propios on public.recordatorios_alertas;
create policy recordatorios_alertas_propios on public.recordatorios_alertas for select using (usuario_id = auth.uid());
revoke insert, update, delete on public.recordatorios_alertas from anon, authenticated;

-- Un aviso al entrar en los 3 días y otro el día que vence (fechas de Caracas). El aviso no lleva el texto clínico.
-- Si la alerta es solo de paraclínicos y su consulta aún los espera, ya avisa «Resultados por recibir»: no se duplica.
create or replace function public.recordar_alertas()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select a.id, a.org_id, a.empresa_id, a.revisar_antes, a.trabajador_id, t.nombres || ' ' || t.apellidos as nombre
      from clinico.alertas_clinicas a
      join public.trabajadores t on t.id = a.trabajador_id
      left join clinico.consultas c on c.id = a.consulta_id
      left join public.recordatorios_alertas x on x.alerta_id = a.id and x.usuario_id = v_uid
     where a.estado = 'pendiente' and a.revisar_antes is not null and a.revisar_antes <= v_hoy + 3
       and (a.org_id = any (public.orgs_con(p_clinico => true, p_sin_limite => true))
            or (a.org_id::text || a.empresa_id::text) = any (public.pares_limitados(p_clinico => true)))
       and not (btrim(a.texto) = '' and c.id is not null and public.paraclinicos_pendientes(c.paraclinicos) > 0)
       and (x.ultimo_aviso is null or (a.revisar_antes <= v_hoy and public.fecha_caracas(x.ultimo_aviso) < a.revisar_antes))
     order by a.revisar_antes
     limit 20
  loop
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    values (r.org_id, v_uid, r.empresa_id, 'Alerta para la próxima evaluación',
      r.nombre || case when r.revisar_antes < v_hoy then ' · venció el ' when r.revisar_antes = v_hoy then ' · vence hoy, ' else ' · revisar antes del ' end
        || to_char(r.revisar_antes, 'DD/MM/YYYY'),
      '/pacientes/' || r.trabajador_id);
    insert into public.recordatorios_alertas (alerta_id, usuario_id, org_id, ultimo_aviso)
    values (r.id, v_uid, r.org_id, now())
    on conflict (alerta_id, usuario_id) do update set ultimo_aviso = excluded.ultimo_aviso;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
revoke execute on function public.recordar_alertas() from public, anon;
grant execute on function public.recordar_alertas() to authenticated;

-- ─── Escritorio: baja con la copia y se crea o revisa sin internet (sube por la bandeja) ───
insert into sync.tablas (nombre, clinica, subible) values ('clinico.alertas_clinicas', true, true)
  on conflict (nombre) do nothing;
alter table clinico.alertas_clinicas add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on clinico.alertas_clinicas;
create trigger sync_version before insert or update on clinico.alertas_clinicas for each row execute function sync.versionar();
drop trigger if exists sync_anotar on clinico.alertas_clinicas;
create trigger sync_anotar after insert or update or delete on clinico.alertas_clinicas for each row execute function sync.anotar();
