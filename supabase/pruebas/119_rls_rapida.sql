-- Reglas rápidas (C14): cada usuario ve exactamente lo mismo que con las funciones de antes, tabla por tabla
\pset tuples_only on
reset role;
-- Más casos: un trabajador con su ficha, un auditor y un miembro inactivo
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'ana@trab'), ('00000000-0000-0000-0000-0000000000c2', 'aud@x'), ('00000000-0000-0000-0000-0000000000c3', 'baja@x') on conflict do nothing;
update public.trabajadores set correo = 'ana@trab' where id = '30000000-0000-0000-0000-00000000000a';
insert into public.miembros (org_id, usuario_id, rol, empresas_permitidas, activo) values
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'trabajador', '{20000000-0000-0000-0000-00000000000a}', true),
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', 'auditor', '{20000000-0000-0000-0000-00000000000b}', true),
 ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', 'medico', null, false)
on conflict do nothing;

create temp table casos (tabla text, antes text);
insert into casos values
 ('public.trabajadores', $$(puede_ver_empresa(org_id, empresa_id) and (mi_rol(org_id) is distinct from 'trabajador' or es_mi_ficha(id))) or (puede_ver_empresa(org_id, empresa_id) and mi_rol(org_id) = any ('{administrador,gerente_medico,medico,enfermeria,recepcion,coordinador_sst}'))$$),
 ('clinico.consultas', $$es_clinico(org_id) and puede_ver_empresa(org_id, empresa_id)$$),
 -- *_empresa es RESTRICTIVA: se suma (AND) a *_clinico
 ('clinico.diagnosticos', $$es_clinico(org_id) and ve_consulta(org_id, consulta_id)$$),
 ('clinico.aptitudes', $$es_clinico(org_id) and ve_consulta(org_id, consulta_id)$$),
 ('public.empresas', $$puede_ver_empresa(org_id, id) or es_admin(org_id)$$),
 ('public.lista_items', $$(org_id is null or (org_id in (select mis_orgs()) and (not lista_clinica(lista) or es_servicio(org_id) or mi_rol(org_id) = 'coordinador_sst'))) or (org_id is not null and mi_rol(org_id) = any ('{administrador,gerente_medico}'))$$);

create temp table resultado (usuario text, tabla text, iguales boolean);
grant all on resultado to authenticated;
do $$
declare u text; c record; v_rls bigint; v_antes bigint;
begin
  foreach u in array array['a1', 'a2', 'a3', 'a4', 'a5', 'c1', 'c2', 'c3'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000' || u, false);
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000' || u, 'role', 'authenticated', 'aal', 'aal2')::text, false);
    for c in select * from casos loop
      -- Lo de antes, sin RLS (como dueño) y con las mismas funciones; lo de ahora, con RLS como el usuario
      execute format('select count(*) from %s where %s', c.tabla, c.antes) into v_antes;
      set local role authenticated;
      execute format('select count(*) from %s', c.tabla) into v_rls;
      reset role;
      insert into resultado values (u, c.tabla, v_rls = v_antes);
    end loop;
  end loop;
end $$;
select 'casos comparados (debe 48): ' || count(*) from resultado;
select 'todos ven lo mismo que antes (debe 1): ' || bool_and(iguales)::int from resultado;
select 'distinto: ' || usuario || ' en ' || tabla from resultado where not iguales;
set role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false); end $$;
select 'trabajador: su propia ficha (debe 1): ' || count(*) from public.trabajadores;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', false); end $$;
select 'miembro inactivo no ve pacientes (debe 0): ' || count(*) from public.trabajadores;
reset role;
-- Las funciones nuevas no las usa anon
select 'anon no ejecuta orgs_con (debe 0): ' || has_function_privilege('anon', 'public.orgs_con(public.rol_usuario[],boolean,boolean,public.rol_usuario)', 'execute')::int;
delete from public.miembros where usuario_id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3');
update public.trabajadores set correo = null where id = '30000000-0000-0000-0000-00000000000a';
