-- zamorApp Ocupacional · Ergonomía: métodos ROSA (oficina) y NIOSH (levantamiento de cargas) (04-nov-2026)
-- Solo amplía la lista de métodos permitidos; el cálculo vive en la app (src/lib/ergonomia.ts) y se repite al guardar.
alter table public.evaluaciones_ergonomicas drop constraint if exists evaluaciones_ergonomicas_metodo_check;
alter table public.evaluaciones_ergonomicas add constraint evaluaciones_ergonomicas_metodo_check
  check (metodo in ('rula', 'reba', 'rosa', 'niosh', 'deb', 'libre'));
