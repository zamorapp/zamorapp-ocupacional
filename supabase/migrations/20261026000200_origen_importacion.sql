-- zamorApp Ocupacional · Marcas de origen para importar datos de otros sistemas (Sistema Integral / SAME)
-- origen + codigo_origen: identifican el registro en el sistema de donde vino, para repetir la carga
--   sin duplicar (upsert) y para no confundir datos importados con los creados en zamorApp.
-- lote_importacion: cada carga tiene un id; permite revisar o deshacer una carga completa.
-- No cambia nada para los datos existentes (todas las columnas quedan vacías).

create table if not exists public.importaciones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  origen text not null,                -- 'integral'
  etapa text not null,                 -- 'catalogos', 'historial', …
  resumen jsonb not null default '{}', -- filas por tabla
  creado_por uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  revertido_en timestamptz
);
alter table public.importaciones enable row level security;
drop policy if exists importaciones_admin on public.importaciones;
create policy importaciones_admin on public.importaciones for select using (public.es_admin(org_id));
grant select on public.importaciones to authenticated;

do $$
declare t text;
begin
  foreach t in array array['public.empresas', 'public.sedes', 'public.dependencias', 'public.trabajadores', 'public.lista_items',
                           'clinico.consultas', 'clinico.diagnosticos', 'clinico.aptitudes', 'clinico.reposos'] loop
    execute format('alter table %s add column if not exists origen text, add column if not exists codigo_origen text,
                    add column if not exists lote_importacion uuid references public.importaciones (id) on delete set null', t);
    execute format('create unique index if not exists %s on %s (org_id, origen, codigo_origen) where origen is not null',
                   replace(t, '.', '_') || '_origen', t);
  end loop;
end $$;
