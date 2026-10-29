-- Registrar un paciente nuevo con cargo y dependencia nuevos: médico de A sí (en A), en B no; RR. HH. no por esta vía.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  insert into public.dependencias (org_id, empresa_id, nombre) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Dep129');
  insert into public.puestos (org_id, empresa_id, nombre) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','Cargo129');
  insert into public.trabajadores (org_id, empresa_id, cedula, nombres, apellidos) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','V-129129','Nuevo','Paciente');
  raise notice 'médico registra paciente con cargo y dependencia nuevos (ok)';
exception when others then raise notice 'médico registra paciente con cargo y dependencia nuevos: FALLA %', sqlerrm; end $$;
do $$ begin
  insert into public.dependencias (org_id, empresa_id, nombre) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000b','Dep129B');
  raise notice 'médico de A crea dependencia en B: FALLA';
exception when insufficient_privilege then raise notice 'médico de A no crea dependencia en B (ok)'; end $$;
do $$ declare n int; begin
  update public.dependencias set nombre = 'Cambiada' where nombre = 'Dep129';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'médico no renombra dependencias (ok)'; else raise notice 'médico renombra dependencias: FALLA'; end if;
end $$;
reset role;
delete from public.trabajadores where cedula = 'V-129129';
delete from public.puestos where nombre = 'Cargo129';
delete from public.dependencias where nombre = 'Dep129';
