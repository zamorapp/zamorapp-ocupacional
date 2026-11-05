-- Proyecto u obra de la empresa (Cesar, 05-nov-2026): contratistas que evalúan personal para un contrato
-- (p. ej. «Acciones mecánicas… Contrato #4600141983/…»). Editable en Empresas › ficha; sale en el membrete de
-- la constancia de aptitud, el informe médico y demás documentos de sus trabajadores. Vacío = no se imprime.
-- Tabla real (no vista espejo): no hay vistas que rehacer. RR. HH. ya lee su empresa por RLS; el dato no es clínico.
alter table public.empresas add column if not exists proyecto text;
comment on column public.empresas.proyecto is 'Nombre del proyecto u obra; se imprime en el membrete de los documentos de sus trabajadores';
alter table public.empresas drop constraint if exists empresas_proyecto_largo;
alter table public.empresas add constraint empresas_proyecto_largo check (proyecto is null or char_length(proyecto) <= 300);
select public.vistas_al_dia();
