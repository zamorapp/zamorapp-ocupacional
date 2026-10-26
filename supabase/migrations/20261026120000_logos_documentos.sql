-- zamorApp Ocupacional · Logos en los documentos impresos
-- Logo del servicio de salud (organizaciones.logo) y de cada empresa cliente (empresas.logo).
-- Se guardan como imagen embebida (data:image/…) en la propia fila, igual que la firma y el sello:
-- así viajan con la réplica del programa de escritorio y se imprimen sin depender de archivos externos.
-- Lectura y escritura siguen las políticas de cada tabla: solo el administrador los cambia y la empresa
-- solo es visible para quien puede verla (RR. HH. de esa empresa ve únicamente su propio logo).
alter table public.organizaciones add column if not exists logo text;
alter table public.empresas add column if not exists logo text;

alter table public.organizaciones drop constraint if exists organizaciones_logo_valido;
alter table public.organizaciones add constraint organizaciones_logo_valido
  check (logo is null or (logo ~ '^data:image/(png|jpeg|webp);base64,' and length(logo) <= 600000));
alter table public.empresas drop constraint if exists empresas_logo_valido;
alter table public.empresas add constraint empresas_logo_valido
  check (logo is null or (logo ~ '^data:image/(png|jpeg|webp);base64,' and length(logo) <= 600000));
