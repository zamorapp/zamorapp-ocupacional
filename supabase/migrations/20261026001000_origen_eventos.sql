-- zamorApp Ocupacional · Accidentes traídos de otro sistema: misma marca de origen que el resto
alter table public.eventos add column if not exists origen text, add column if not exists codigo_origen text,
  add column if not exists lote_importacion uuid references public.importaciones (id) on delete set null;
create unique index if not exists public_eventos_origen on public.eventos (org_id, origen, codigo_origen) where origen is not null;
