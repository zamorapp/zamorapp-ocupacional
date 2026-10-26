-- zamorApp Ocupacional · Ajustes a las marcas de origen
-- 1) clinico.diagnosticos ya tenía una columna "origen" (común / ocupacional): el índice de importación no aplica ahí.
-- 2) Los puestos (cargos) también pueden venir de otro sistema.
drop index if exists clinico.clinico_diagnosticos_origen;

alter table public.puestos add column if not exists origen text, add column if not exists codigo_origen text,
  add column if not exists lote_importacion uuid references public.importaciones (id) on delete set null;
create unique index if not exists public_puestos_origen on public.puestos (org_id, origen, codigo_origen) where origen is not null;
