-- zamorApp Ocupacional · Resultados adjuntos (PDF o fotos de laboratorio, Rx, informes externos)
-- Los archivos van al bucket privado "adjuntos" en la ruta <org_id>/<trabajador_id>/<archivo>.
-- Solo el personal clínico de la organización puede verlos, subirlos o borrarlos.

create table if not exists clinico.adjuntos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  consulta_id uuid references clinico.consultas (id) on delete set null,
  nombre text not null,
  ruta text not null unique,
  tipo_mime text not null,
  tamano integer not null,
  descripcion text,
  subido_por uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists adjuntos_trabajador on clinico.adjuntos (trabajador_id, creado_en desc);

alter table clinico.adjuntos enable row level security;
drop policy if exists adjuntos_clinico on clinico.adjuntos;
create policy adjuntos_clinico on clinico.adjuntos for all
  using (public.es_clinico(org_id)) with check (public.es_clinico(org_id));
grant select, insert, update, delete on clinico.adjuntos to authenticated;

create or replace view public.adjuntos with (security_invoker = true) as select * from clinico.adjuntos;
grant select, insert, update, delete on public.adjuntos to authenticated;
revoke all on public.adjuntos from anon;

-- Bucket privado, hasta 10 MB por archivo, solo PDF e imágenes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos', 'adjuntos', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists adjuntos_leer on storage.objects;
drop policy if exists adjuntos_subir on storage.objects;
drop policy if exists adjuntos_borrar on storage.objects;
create policy adjuntos_leer on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and public.es_clinico(((storage.foldername(name))[1])::uuid));
create policy adjuntos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and public.es_clinico(((storage.foldername(name))[1])::uuid));
create policy adjuntos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'adjuntos' and public.es_clinico(((storage.foldername(name))[1])::uuid));
