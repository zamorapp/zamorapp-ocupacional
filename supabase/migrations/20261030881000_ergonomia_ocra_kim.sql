-- zamorApp Ocupacional · Ergonomía: métodos OCRA Checklist (movimientos repetitivos) y KIM-PP (empuje y arrastre) (04-nov-2026)
-- Solo amplía la lista de métodos permitidos; el cálculo vive en la app (src/lib/ergonomia-ocra.ts y ergonomia-kim.ts).
alter table public.evaluaciones_ergonomicas drop constraint if exists evaluaciones_ergonomicas_metodo_check;
alter table public.evaluaciones_ergonomicas add constraint evaluaciones_ergonomicas_metodo_check
  check (metodo in ('rula', 'reba', 'rosa', 'niosh', 'deb', 'ocra', 'kim', 'libre'));
