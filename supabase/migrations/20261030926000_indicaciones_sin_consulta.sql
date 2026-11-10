-- zamorApp · Indicación de enfermería o récipe SIN consulta (pedido de Cesar, 10-nov-2026)
-- «Va un trabajador a colocarse un tratamiento que ya le indicó su médico externo (p. ej. complejo B): solo tengo que
-- darle la orden a la enfermera para que lo coloque. O darle un récipe de lo que ya toma desde hace tiempo. Sin
-- generar una consulta ni contar como morbilidad.»
-- Por eso es una tabla aparte de clinico.consultas: ningún reporte, estadística, vigilancia, relación mensual ni
-- cobro la cuenta. Queda en la ficha del trabajador (historial) y se imprime.
-- Reglas:
-- · La emite el médico (médico, gerente médico o administrador con acceso clínico). Enfermería la marca «Cumplida».
-- · Lo escrito al emitirla no cambia (ya pudo imprimirse): si hubo un error, se anula y se emite otra.
-- · Sin borrar: ni política ni permiso. Gana la primera marca (dos PC a la vez).
-- · RLS clínica igual que las alertas (orgs_con / pares_limitados): RR. HH. y empresa no la ven.
-- · Escritorio: baja con la copia y se crea o se cumple sin internet (sube por la bandeja).

create table if not exists clinico.indicaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete set null,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  tipo text not null check (tipo in ('enfermeria', 'recipe')),
  fecha date not null default public.hoy_caracas(),
  -- Mismo formato que consultas.tratamiento: [{medicina, concentracion, presentacion, via, dosis, frecuencia, duracion, observacion, notaFarmacia}]
  tratamiento jsonb not null default '[]' check (jsonb_typeof(tratamiento) = 'array' and jsonb_array_length(tratamiento) <= 20),
  indicaciones text not null default '' check (length(indicaciones) <= 2000),
  -- Médico externo que la indicó (opcional): «Dr. Pérez, traumatólogo»
  indicado_por text check (length(indicado_por) <= 200),
  medico_id uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default public.ahora(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cumplida', 'emitida', 'anulada')),
  cumplida_por uuid references auth.users (id) on delete set null,
  cumplida_en timestamptz,
  nota_cumplimiento text check (length(nota_cumplimiento) <= 500),
  motivo_anulacion text check (length(motivo_anulacion) <= 300),
  anulada_por uuid references auth.users (id) on delete set null,
  anulada_en timestamptz,
  hora_equipo jsonb,
  actualizado_en timestamptz not null default public.ahora(),
  check (jsonb_array_length(tratamiento) > 0 or btrim(indicaciones) <> ''),
  check (tipo <> 'recipe' or jsonb_array_length(tratamiento) > 0)
);
create index if not exists indicaciones_trabajador on clinico.indicaciones (trabajador_id, fecha desc);
create index if not exists indicaciones_pendientes on clinico.indicaciones (org_id, fecha) where estado = 'pendiente';

alter table clinico.indicaciones enable row level security;
drop policy if exists indicaciones_leer on clinico.indicaciones;
create policy indicaciones_leer on clinico.indicaciones for select using (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
drop policy if exists indicaciones_crear on clinico.indicaciones;
create policy indicaciones_crear on clinico.indicaciones for insert with check (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
drop policy if exists indicaciones_marcar on clinico.indicaciones;
create policy indicaciones_marcar on clinico.indicaciones for update using (
  org_id = any ((select public.orgs_con(p_clinico => true, p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados(p_clinico => true))::text[]));
grant select, insert, update on clinico.indicaciones to authenticated;
revoke delete on clinico.indicaciones from authenticated, anon;

create or replace view public.indicaciones with (security_invoker = true) as select * from clinico.indicaciones;
grant select, insert, update on public.indicaciones to authenticated;
revoke all on public.indicaciones from anon;

-- ─── Reglas de la fila (corren en la nube y en la PC) ───
create or replace function public.proteger_indicacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bandeja boolean := coalesce(current_setting('sync.cambio_id', true), '') <> '';
  v_medico boolean;
begin
  v_medico := v_uid is not null and coalesce(new.org_id, old.org_id) = any (public.orgs_con('{administrador,gerente_medico,medico}', p_clinico => true));

  if tg_op = 'INSERT' then
    -- La emite el médico: enfermería y recepción no firman órdenes ni récipes
    if not v_medico then
      raise exception 'La indicación o el récipe los emite el médico.' using errcode = '42501';
    end if;
    select t.empresa_id into new.empresa_id from public.trabajadores t where t.id = new.trabajador_id and t.org_id = new.org_id;
    if not found then raise exception 'El trabajador no es de esta organización.'; end if;
    new.indicaciones := btrim(coalesce(new.indicaciones, ''));
    new.indicado_por := nullif(btrim(coalesce(new.indicado_por, '')), '');
    new.estado := case when new.tipo = 'recipe' then 'emitida' else 'pendiente' end;
    new.cumplida_por := null; new.cumplida_en := null; new.nota_cumplimiento := null;
    new.motivo_anulacion := null; new.anulada_por := null; new.anulada_en := null;
    -- Desde la bandeja se respetan autor y hora de la PC (la hora la marca hora_oficial si no venía verificada), pero
    -- el autor solo si es médico activo de esta organización con acceso clínico: su firma y sello salen en la hoja
    -- (Analizar, 10-nov: si no, se podría imprimir con la firma de otro médico). Si no lo es, queda quien sube.
    if not v_bandeja or new.medico_id is null or (new.medico_id is distinct from v_uid and not exists (
        select 1 from public.miembros m
         where m.usuario_id = new.medico_id and m.org_id = new.org_id and m.activo
           and m.rol in ('administrador', 'gerente_medico', 'medico')
           and (m.rol in ('gerente_medico', 'medico') or m.acceso_clinico))) then
      new.medico_id := v_uid;
    end if;
    if not v_bandeja then new.creada_en := public.ahora(); end if;
    return new;
  end if;

  -- Lo escrito al emitirla no cambia (ya pudo imprimirse)
  new.org_id := old.org_id; new.empresa_id := old.empresa_id; new.trabajador_id := old.trabajador_id; new.tipo := old.tipo;
  new.fecha := old.fecha; new.tratamiento := old.tratamiento; new.indicaciones := old.indicaciones; new.indicado_por := old.indicado_por;
  new.medico_id := old.medico_id; new.creada_en := old.creada_en;
  new.actualizado_en := public.ahora();

  -- Ya cumplida o anulada: gana la primera marca (otra PC que marcó después no la pisa)
  if old.estado in ('cumplida', 'anulada') or new.estado = old.estado then
    new.estado := old.estado;
    new.cumplida_por := old.cumplida_por; new.cumplida_en := old.cumplida_en; new.nota_cumplimiento := old.nota_cumplimiento;
    new.motivo_anulacion := old.motivo_anulacion; new.anulada_por := old.anulada_por; new.anulada_en := old.anulada_en;
    return new;
  end if;

  if new.estado = 'cumplida' then
    -- Solo la orden de enfermería se cumple; cualquiera del personal clínico (la política ya lo exige)
    if old.tipo <> 'enfermeria' or v_uid is null then
      raise exception 'Solo la orden de enfermería se marca cumplida.' using errcode = '42501';
    end if;
    new.cumplida_por := v_uid;
    new.nota_cumplimiento := nullif(btrim(coalesce(new.nota_cumplimiento, '')), '');
    if not v_bandeja or new.cumplida_en is null then new.cumplida_en := public.ahora(); end if;
    new.motivo_anulacion := null; new.anulada_por := null; new.anulada_en := null;
    return new;
  end if;

  if new.estado = 'anulada' then
    if not v_medico then
      raise exception 'La anula el médico.' using errcode = '42501';
    end if;
    new.anulada_por := v_uid;
    new.motivo_anulacion := nullif(btrim(coalesce(new.motivo_anulacion, '')), '');
    if not v_bandeja or new.anulada_en is null then new.anulada_en := public.ahora(); end if;
    new.cumplida_por := null; new.cumplida_en := null; new.nota_cumplimiento := null;
    return new;
  end if;

  raise exception 'Cambio no permitido.' using errcode = '42501';
end $$;
revoke execute on function public.proteger_indicacion() from public, anon, authenticated;

-- «proteger_…» corre después de «hora_oficial» (los before van en orden alfabético)
drop trigger if exists proteger_indicacion on clinico.indicaciones;
create trigger proteger_indicacion before insert or update on clinico.indicaciones
  for each row execute function public.proteger_indicacion();
drop trigger if exists hora_oficial on clinico.indicaciones;
create trigger hora_oficial before insert or update on clinico.indicaciones
  for each row execute function public.hora_oficial_de_la_bandeja('creada_en', 'cumplida_en', 'anulada_en');
drop trigger if exists bit_indicaciones on clinico.indicaciones;
create trigger bit_indicaciones after insert or update on clinico.indicaciones
  for each row execute function public.registrar_bitacora();

-- ─── Escritorio: baja con la copia y se crea o cumple sin internet (sube por la bandeja) ───
insert into sync.tablas (nombre, clinica, subible) values ('clinico.indicaciones', true, true)
  on conflict (nombre) do nothing;
alter table clinico.indicaciones add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on clinico.indicaciones;
create trigger sync_version before insert or update on clinico.indicaciones for each row execute function sync.versionar();
drop trigger if exists sync_anotar on clinico.indicaciones;
create trigger sync_anotar after insert or update or delete on clinico.indicaciones for each row execute function sync.anotar();

select public.vistas_al_dia();
