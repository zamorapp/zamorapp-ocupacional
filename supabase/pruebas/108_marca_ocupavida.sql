-- Ninguna organización queda con el proveedor supuesto «TIPURO SERVI MEDIC».
\pset tuples_only on
reset role;
select 'organizaciones con el proveedor erróneo (debe 0): ' || count(*) from public.organizaciones where nombre ilike 'tipuro%';
