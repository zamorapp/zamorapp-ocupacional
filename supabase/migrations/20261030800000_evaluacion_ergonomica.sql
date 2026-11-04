-- zamorApp Ocupacional · Evaluación ergonómica de puestos (Cesar, 04-nov-2026)
-- Una evaluación por puesto y tarea con un método validado (RULA, REBA; DEB de CENEA cuando llegue su formato),
-- fotos de la inspección, hallazgos priorizados con probabilidad × severidad (la misma matriz 5×5 del puesto) y
-- recomendaciones dirigidas a un departamento (Ingeniería, Operaciones, RR. HH., Seguridad y Salud).
-- No guarda datos clínicos de ningún trabajador: la empresa (RR. HH.) puede leer las evaluaciones cerradas.
--   · datos: respuestas del método {clave: valor} · resultado: puntaje calculado (lo recalcula la app al guardar)
--   · hallazgos: [{id, factor, detalle, p, s, consecuencia, medida, departamento, plazo, origen}]
--   · fotos: [{ruta, nota}] en el bucket privado «ergonomia» (<org>/<evaluación>/<archivo>)
-- Cerrada = informe entregado: solo cambian las observaciones; administrador o gerente médico pueden reabrirla.

create table if not exists public.evaluaciones_ergonomicas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  puesto_id uuid references public.puestos (id) on delete set null,
  puesto text not null,
  tarea text,
  metodo text not null check (metodo in ('rula', 'reba', 'deb', 'libre')),
  lado text check (lado in ('derecho', 'izquierdo', 'ambos')),
  fecha date not null default public.hoy_caracas(),
  trabajadores_observados int check (trabajadores_observados between 0 and 100000),
  datos jsonb not null default '{}'::jsonb,
  resultado jsonb not null default '{}'::jsonb,
  hallazgos jsonb not null default '[]'::jsonb check (jsonb_typeof(hallazgos) = 'array'),
  fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array' and jsonb_array_length(fotos) <= 12),
  conclusion text,
  observaciones text,
  estado text not null default 'borrador' check (estado in ('borrador', 'cerrada')),
  evaluado_por uuid references auth.users (id) on delete set null default auth.uid(),
  cerrada_en date,
  creado_en timestamptz not null default public.ahora(),
  actualizado_en timestamptz not null default public.ahora()
);
create index if not exists evaluaciones_ergonomicas_empresa on public.evaluaciones_ergonomicas (empresa_id, fecha desc);
create index if not exists evaluaciones_ergonomicas_puesto on public.evaluaciones_ergonomicas (puesto_id, fecha desc);
create index if not exists evaluaciones_ergonomicas_org on public.evaluaciones_ergonomicas (org_id, fecha desc);

alter table public.evaluaciones_ergonomicas enable row level security;
-- Leer la tabla (datos del método, fotos, todos los hallazgos): solo el servicio en su alcance; recepción, solo cerradas.
-- La empresa NO lee la tabla ni el bucket (Cesar, 04-nov): ve las cerradas por la vista evaluaciones_ergonomicas_rrhh.
drop policy if exists evaluaciones_ergonomicas_leer on public.evaluaciones_ergonomicas;
create policy evaluaciones_ergonomicas_leer on public.evaluaciones_ergonomicas for select using (
  org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,coordinador_sst}', p_sin_limite => true))::uuid[])
  or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,coordinador_sst}'))::text[])
  or (estado = 'cerrada' and (
        org_id = any ((select public.orgs_con('{recepcion}', p_sin_limite => true))::uuid[])
     or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{recepcion}'))::text[]))));
drop policy if exists evaluaciones_ergonomicas_editar on public.evaluaciones_ergonomicas;
create policy evaluaciones_ergonomicas_editar on public.evaluaciones_ergonomicas for all
  -- = puede_ver_empresa(org_id, empresa_id) y mi_rol en (…), en la forma rápida (C14): una sola llamada por consulta
  using (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]))
  with check (org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,coordinador_sst}', p_sin_limite => true))::uuid[])
         or (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,coordinador_sst}'))::text[]));
grant select, insert, update, delete on public.evaluaciones_ergonomicas to authenticated;
revoke all on public.evaluaciones_ergonomicas from anon;

-- Lo que ve la empresa (RR. HH., supervisor, delegado, auditor): solo las cerradas de sus empresas, sin datos del
-- método, sin fotos y solo los hallazgos dirigidos a RR. HH. Vista con permisos del dueño que filtra por el usuario;
-- security_barrier: un filtro del usuario no se evalúa antes que el where de la vista.
create or replace view public.evaluaciones_ergonomicas_rrhh with (security_barrier = true) as
  select e.id, e.org_id, e.empresa_id, e.puesto, e.tarea, e.metodo, e.fecha, e.trabajadores_observados,
         e.resultado ->> 'nivel' as nivel,
         coalesce(jsonb_path_query_array(e.hallazgos, '$[*] ? (@.departamento == "rrhh")'), '[]'::jsonb) as hallazgos,
         e.conclusion, e.evaluado_por, e.cerrada_en
  from public.evaluaciones_ergonomicas e
  where e.estado = 'cerrada'
    and (e.org_id = any ((select public.orgs_con('{gerente_empresa,supervisor,delegado_prevencion,auditor}', p_sin_limite => true))::uuid[])
      or (e.org_id::text || e.empresa_id::text) = any ((select public.pares_limitados('{gerente_empresa,supervisor,delegado_prevencion,auditor}'))::text[]));
revoke all on public.evaluaciones_ergonomicas_rrhh from public, anon;
grant select on public.evaluaciones_ergonomicas_rrhh to authenticated;

-- Reglas: el puesto es de la misma empresa; quien evalúa es quien la crea y no cambia; cerrada = solo observaciones
-- (o reabrir, sin tocar nada más, si es administrador o gerente médico); una cerrada no se borra.
create or replace function public.validar_evaluacion_ergonomica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.estado = 'cerrada' then
      raise exception 'La evaluación ya está cerrada (informe entregado): no se puede borrar.' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.evaluado_por := auth.uid(); end if;
    new.cerrada_en := case when new.estado = 'cerrada' then public.hoy_caracas() end;
  else
    new.evaluado_por := old.evaluado_por;
    new.creado_en := old.creado_en;
    if old.estado = 'cerrada' then
      if new.estado = 'borrador' then
        if auth.uid() is not null and public.mi_rol(old.org_id) not in ('administrador', 'gerente_medico') then
          raise exception 'Solo un administrador o el gerente médico pueden reabrir una evaluación cerrada.' using errcode = '42501';
        end if;
        new.cerrada_en := null;
      else
        new.cerrada_en := old.cerrada_en;
      end if;
      if (to_jsonb(new) - '{estado,observaciones,cerrada_en,actualizado_en,version}'::text[])
         is distinct from (to_jsonb(old) - '{estado,observaciones,cerrada_en,actualizado_en,version}'::text[]) then
        raise exception 'La evaluación ya está cerrada: solo se pueden cambiar las observaciones. Reábrela para corregirla.' using errcode = '42501';
      end if;
    elsif new.estado = 'cerrada' then
      new.cerrada_en := public.hoy_caracas();
    end if;
  end if;
  if new.puesto_id is not null and not exists (
       select 1 from public.puestos p where p.id = new.puesto_id and p.org_id = new.org_id and p.empresa_id = new.empresa_id) then
    raise exception 'El puesto debe ser de la misma empresa de la evaluación.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.org_id = new.org_id) then
    raise exception 'La empresa no es de esta organización.' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.validar_evaluacion_ergonomica() from public, authenticated, anon;
drop trigger if exists validar_evaluacion_ergonomica on public.evaluaciones_ergonomicas;
create trigger validar_evaluacion_ergonomica before insert or update or delete on public.evaluaciones_ergonomicas
  for each row execute function public.validar_evaluacion_ergonomica();

drop trigger if exists upd_evaluaciones_ergonomicas on public.evaluaciones_ergonomicas;
create trigger upd_evaluaciones_ergonomicas before update on public.evaluaciones_ergonomicas for each row execute function public.tocar_actualizado();
drop trigger if exists bit_evaluaciones_ergonomicas on public.evaluaciones_ergonomicas;
create trigger bit_evaluaciones_ergonomicas after insert or update or delete on public.evaluaciones_ergonomicas for each row execute function public.registrar_bitacora();

-- Fotos de la inspección: bucket privado, solo JPG/PNG de hasta 10 MB (la app las achica y les quita el EXIF).
-- Ver: quien puede leer la tabla (el servicio; la empresa no). Subir/borrar: quien puede editarla y mientras sea borrador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ergonomia', 'ergonomia', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.evaluacion_ergonomica_de_ruta(p_ruta text, p_editar boolean)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (
    select 1 from public.evaluaciones_ergonomicas e
    where array_length(string_to_array(p_ruta, '/'), 1) = 3
      and (string_to_array(p_ruta, '/'))[1] ~ '^[0-9a-f-]{36}$' and (string_to_array(p_ruta, '/'))[2] ~ '^[0-9a-f-]{36}$'
      and e.id = (string_to_array(p_ruta, '/'))[2]::uuid
      and e.org_id = (string_to_array(p_ruta, '/'))[1]::uuid
      and (not p_editar or (e.estado = 'borrador'
           and public.puede_ver_empresa(e.org_id, e.empresa_id)
           and public.mi_rol(e.org_id) in ('administrador', 'gerente_medico', 'medico', 'coordinador_sst'))))
$$;
revoke execute on function public.evaluacion_ergonomica_de_ruta(text, boolean) from public, anon;
grant execute on function public.evaluacion_ergonomica_de_ruta(text, boolean) to authenticated;

drop policy if exists ergonomia_leer on storage.objects;
drop policy if exists ergonomia_subir on storage.objects;
drop policy if exists ergonomia_borrar on storage.objects;
create policy ergonomia_leer on storage.objects for select to authenticated
  using (bucket_id = 'ergonomia' and public.evaluacion_ergonomica_de_ruta(name, false));
create policy ergonomia_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'ergonomia' and public.evaluacion_ergonomica_de_ruta(name, true));
create policy ergonomia_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'ergonomia' and public.evaluacion_ergonomica_de_ruta(name, true));

-- Réplica en el programa de escritorio (la evaluación se escribe sin internet; las fotos suben con internet)
insert into sync.tablas (nombre, clinica, subible) values ('public.evaluaciones_ergonomicas', false, true)
  on conflict (nombre) do nothing;
alter table public.evaluaciones_ergonomicas add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.evaluaciones_ergonomicas;
create trigger sync_version before insert or update on public.evaluaciones_ergonomicas for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.evaluaciones_ergonomicas;
create trigger sync_anotar after insert or update or delete on public.evaluaciones_ergonomicas for each row execute function sync.anotar();
