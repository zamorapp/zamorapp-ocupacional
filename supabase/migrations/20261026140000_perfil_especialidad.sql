-- zamorApp Ocupacional · Especialidad y correo del médico en los documentos (como el pie del Integral)
alter table public.perfiles add column if not exists especialidad text;
alter table public.perfiles add column if not exists correo text;
-- perfiles se lee por columnas (firma y sello quedan fuera, ver 20261026007000_firma_privada.sql)
grant select (especialidad, correo) on public.perfiles to authenticated;
