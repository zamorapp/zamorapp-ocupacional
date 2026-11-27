\pset tuples_only on
begin;
do $$
declare
  nombre text;
begin
  foreach nombre in array array[
    'aptitud_trabajadores','atenciones','evaluaciones_ergonomicas_rrhh','evaluaciones_psicosociales_rrhh',
    'evaluaciones_riesgos_rrhh','eventos_empresa','solicitudes_respuesta','trabajadores_salud','ultima_aptitud','ultima_consulta'
  ] loop
    if has_table_privilege('anon','public.' || nombre,'SELECT') then
      raise exception 'La vista % acepta consultas anónimas', nombre;
    end if;
  end loop;
end $$;

update public.trabajadores set grupo_sanguineo='O+', discapacidad=true where id in (
  '30000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000b'
);

set local role authenticated;
do $$
declare
  a constant uuid := '20000000-0000-0000-0000-00000000000a';
  b constant uuid := '20000000-0000-0000-0000-00000000000b';
  nombre text;
  expuesta boolean;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',true);
  if not exists (select from public.ultima_consulta where empresa_id = a)
     or exists (select from public.trabajadores_salud where empresa_id = a) then
    raise exception 'RR. HH. debe ver el estado de su empresa con los datos de salud reservados';
  end if;
  foreach nombre in array array[
    'aptitud_trabajadores','atenciones','evaluaciones_ergonomicas_rrhh','evaluaciones_psicosociales_rrhh',
    'evaluaciones_riesgos_rrhh','eventos_empresa','trabajadores_salud','ultima_aptitud','ultima_consulta'
  ] loop
    execute format('select exists(select from public.%I where empresa_id=$1)', nombre) into expuesta using b;
    if expuesta then raise exception 'RR. HH. pudo consultar otra empresa por la vista %', nombre; end if;
  end loop;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true);
  if not exists (select from public.trabajadores_salud where empresa_id = a and grupo_sanguineo='O+')
     or exists (select from public.trabajadores_salud where empresa_id = b) then
    raise exception 'El médico limitado debe ver datos de salud de su empresa';
  end if;
end $$;
reset role;
select 'vistas con acceso anónimo bloqueado y aislamiento de RR. HH. (debe 1): 1';
rollback;
