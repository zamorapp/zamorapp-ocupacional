-- Fase B: archivos adjuntos guardados en la PC que esperan subir a la nube (ver escritorio/puerta/adjuntos.mjs).
-- Solo la escribe la puerta (superusuario); los usuarios no la ven. Idempotente: se reaplica en cada arranque.
create schema if not exists local;
create table if not exists local.adjuntos_cola (
  id uuid primary key default gen_random_uuid(),
  orden bigserial, -- orden de subida: nunca por fecha (Cesar mueve la fecha de Windows para abrir el SAME)
  bucket text not null,
  ruta text not null,
  tipo text not null,
  tamano integer not null,
  autor uuid not null,
  creado timestamptz not null default clock_timestamp(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'subido', 'rechazado')),
  motivo text,
  intentos integer not null default 0,
  unique (bucket, ruta)
);
create index if not exists adjuntos_cola_pendientes on local.adjuntos_cola (orden) where estado = 'pendiente';
revoke all on local.adjuntos_cola from public;
