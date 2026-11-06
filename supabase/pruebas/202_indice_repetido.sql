-- Índices de clinico.consultas: uno solo por (trabajador_id, fecha desc) y es el de las migraciones
\pset tuples_only on
reset role;
select 'un solo índice por trabajador y fecha en consultas (debe 1): ' || count(*)
  from pg_indexes where schemaname = 'clinico' and tablename = 'consultas'
   and replace(indexdef, indexname, '') = replace('CREATE INDEX x ON clinico.consultas USING btree (trabajador_id, fecha DESC)', 'x', '');
select 'queda el de las migraciones (debe 1): ' || count(*)
  from pg_indexes where schemaname = 'clinico' and indexname = 'consultas_trabajador_fecha';
