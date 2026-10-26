-- zamorApp Ocupacional · Firma y sello del médico (imágenes) con la opción de imprimirlos o no, como en SAME
-- perfiles.firma_url / sello_url ya existían: guardan la imagen (data URL, PNG con fondo transparente).
alter table public.perfiles
  add column if not exists mostrar_firma boolean not null default true,
  add column if not exists mostrar_sello boolean not null default true;
