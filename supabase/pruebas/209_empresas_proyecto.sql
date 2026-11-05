-- Proyecto u obra de la empresa (migración 902000): el administrador lo guarda y RR. HH. de esa empresa lo lee
-- (sale en el membrete de sus documentos). Deja la empresa como estaba.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
with x as (update public.empresas set proyecto = 'Obra de prueba 209, Contrato #123/A-1'
  where id = (select id from public.empresas order by razon_social limit 1) returning 1)
select 'el administrador guarda el proyecto (debe 1): ' || count(*) from x;
select 'queda guardado tal cual (debe 1): ' || count(*) from public.empresas where proyecto = 'Obra de prueba 209, Contrato #123/A-1';
reset role;
update public.empresas set proyecto = null where proyecto = 'Obra de prueba 209, Contrato #123/A-1';
select 'vuelve a vacío (debe 0): ' || count(*) from public.empresas where proyecto is not null;
