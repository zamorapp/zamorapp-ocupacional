-- Ninguna organización queda con el proveedor supuesto «TIPURO SERVI MEDIC».
\pset tuples_only on
reset role;
select 'organizaciones con el proveedor erróneo (debe 0): ' || count(*) from public.organizaciones where nombre ilike 'tipuro%';
select 'OcupaVida sin RIF o dirección (debe 0): ' || count(*) from public.organizaciones
where nombre = 'OcupaVida Salud Ocupacional' and (rif is distinct from 'V-13475931-0' or direccion is null);
