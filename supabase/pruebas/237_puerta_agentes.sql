-- Puerta para agentes (20261030938000): llaves que solo crea y apaga el administrador, lista cerrada de acciones,
-- nada clínico, nada fuera de la organización, nada que borre o modifique, ensayo sin efectos, sin duplicar,
-- la cédula de otra empresa no se mueve, y registro de cada llamada.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Otra organización con su empresa y su trabajador (para probar que la llave no sale de la suya)
insert into public.organizaciones (id,nombre) values ('10000000-0000-0000-0000-0000000000f2','Otra org') on conflict do nothing;
insert into public.empresas (id,org_id,razon_social,rif) values
 ('20000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-0000000000f2','Ajena','J-99999999-9') on conflict do nothing;
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos) values
 ('30000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-0000000000f2','20000000-0000-0000-0000-0000000000f2','V-55555555','Ajeno','Ajeno') on conflict do nothing;

-- ===== Quién crea llaves =====
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'RRHH', 'crear', 30);
  raise notice 'FALLA: RR. HH. creó una llave';
exception when insufficient_privilege then raise notice 'RR. HH. no crea llaves (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Medico', 'crear', 30);
  raise notice 'FALLA: un médico creó una llave';
exception when insufficient_privilege then raise notice 'el médico no crea llaves (debe 1): 1';
end $$;
do $$ begin
  perform public.agentes_estado('10000000-0000-0000-0000-000000000001');
  raise notice 'FALLA: un médico vio la puerta';
exception when insufficient_privilege then raise notice 'el médico no ve la puerta (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  perform public.crear_llave_agente('10000000-0000-0000-0000-0000000000f2', 'Ajena', 'crear', 30);
  raise notice 'FALLA: el administrador creó una llave en otra organización';
exception when insufficient_privilege then raise notice 'el administrador no crea llaves en otra organización (debe 1): 1';
end $$;
do $$ begin
  perform public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Larga', 'crear', 91);
  raise notice 'FALLA: llave de 91 días';
exception when others then raise notice 'la llave dura 90 días como máximo (debe 1): 1';
end $$;
do $$ begin
  perform count(*) from public.agentes_llaves;
  raise notice 'FALLA: la app leyó las llaves directo';
exception when insufficient_privilege then raise notice 'nadie lee la tabla de llaves directo (debe 1): 1';
end $$;
do $$ begin
  perform count(*) from public.agentes_registro;
  raise notice 'FALLA: la app leyó el registro directo';
exception when insufficient_privilege then raise notice 'nadie lee el registro directo (debe 1): 1';
end $$;
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Claude', 'crear', 30) ->> 'llave' as k \gset
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Solo mira', 'consultar', 7) ->> 'llave' as kc \gset
select 'la llave empieza por zk_ y es larga (debe 1): ' || (:'k' ~ '^zk_[0-9a-f]{64}$')::int;
reset role;
select 'la base guarda la huella, no la llave (debe 0): ' || count(*) from public.agentes_llaves where huella = :'k' or to_jsonb(agentes_llaves)::text like '%' || :'k' || '%';
select 'ninguna ayuda la ejecuta un anónimo ni un usuario (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'agente\_%' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
-- Desde la 950000 (récipes que prepara el agente) hay UNA excepción, revisada por Analizar: escribir sus propios
-- borradores (clinico.agentes_borradores) y ubicar la consulta de un día por su fecha (clinico.consultas, solo id y fecha)
select 'ninguna acción nombra lo clínico (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'agente\_%' or p.proname = 'agente')
   and regexp_replace(p.prosrc, case p.proname when 'agente_preparar_documento' then 'clinico\.(agentes_borradores|consultas)\M'
                                               when 'agente_ver_borradores' then 'clinico\.agentes_borradores\M' else '^$' end, '', 'g')
       ~* '(clinico\.|grupo_sanguineo|discapacidad|firma_|sello_)';
select 'ninguna acción borra ni modifica (debe 0): ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'agente\_%' or p.proname = 'agente')
   and (p.prosrc ~* 'delete\s+from' or regexp_replace(p.prosrc, 'update public\.agentes_llaves', '', 'g') ~* '\mupdate\s+(public|clinico)\.');

-- ===== El agente (anónimo con llave) =====
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin llave no entra (debe 1): ' || ((public.agente('', 'resumen') ->> 'ok') = 'false')::int;
select 'llave inventada no entra (debe 1): ' || ((public.agente('zk_' || repeat('0', 64), 'resumen') ->> 'ok') = 'false')::int;
select 'con llave ve el resumen (debe Org): ' || (public.agente(:'k', 'resumen') -> 'resultado' ->> 'organizacion');
select 'después de la llamada sigue siendo anónimo (debe 1): ' || (auth.uid() is null)::int;
select 'acción que no está en la lista (debe 1): ' || ((public.agente(:'k', 'borrar_empresa', '{"empresa_id":"20000000-0000-0000-0000-00000000000a"}') ->> 'ok') = 'false')::int;
select 'la llave de consulta no crea (debe 1): ' || ((public.agente(:'kc', 'crear_empresa', '{"rif":"J-40000000-1","razon_social":"No"}') ->> 'error') like 'Esta llave solo consulta%')::int;
select 'la llave de consulta sí busca (debe 1): ' || ((public.agente(:'kc', 'buscar_empresas', '{}') ->> 'ok') = 'true')::int;

-- Ensayo: dice lo que haría y no crea nada
select 'ensayo de empresa (debe 1): ' || ((public.agente(:'k', 'crear_empresa', '{"rif":"J-40000000-1","razon_social":"Nueva C.A.","dependencias":["Operaciones","Administración"]}', true) -> 'resultado' ->> 'ya_existia') = 'false')::int;
reset role;
select 'el ensayo no creó la empresa (debe 0): ' || count(*) from public.empresas where rif = 'J-40000000-1';
set role anon;

-- Crear empresa con dependencias; repetir no duplica; solo agrega la dependencia que falta
select public.agente(:'k', 'crear_empresa', '{"rif":"j400000001","razon_social":"Nueva C.A.","estado":"Monagas","dependencias":["Operaciones","Administración","operaciones"]}') -> 'resultado' ->> 'empresa_id' as emp \gset
select 'repetir la empresa no duplica (debe true): ' || (public.agente(:'k', 'crear_empresa', '{"rif":"J-40000000-1","razon_social":"Otro nombre","dependencias":["Operaciones","Ventas"]}') -> 'resultado' ->> 'ya_existia');
reset role;
select 'una sola empresa con ese RIF, con su nombre original (debe 1): ' || count(*) from public.empresas where rif = 'J-40000000-1' and razon_social = 'Nueva C.A.';
select 'tres dependencias, sin repetir (debe 3): ' || count(*) from public.dependencias where empresa_id = :'emp';
select 'la bitácora anota al administrador que creó la llave (debe 1): ' || count(*) from public.bitacora
 where tabla = 'public.empresas' and registro_id = :'emp' and accion = 'INSERT' and usuario_id = '00000000-0000-0000-0000-0000000000a1';
set role anon;

-- No sale de su organización
select 'no ve la empresa de otra organización (debe 1): ' || ((public.agente(:'k', 'ver_empresa', '{"empresa_id":"20000000-0000-0000-0000-0000000000f2"}') ->> 'ok') = 'false')::int;
select 'no la encuentra por RIF (debe 1): ' || ((public.agente(:'k', 'ver_empresa', '{"rif":"J-99999999-9"}') ->> 'ok') = 'false')::int;
select 'buscar no lista empresas ajenas (debe 0): ' || (select count(*) from jsonb_array_elements(public.agente(:'k', 'buscar_empresas', '{}') -> 'resultado' -> 'empresas') x where x ->> 'razon_social' = 'Ajena');
select 'no ve al trabajador de otra organización (debe 0): ' || jsonb_array_length(public.agente(:'k', 'buscar_trabajadores', '{"cedula":"55555555"}') -> 'resultado' -> 'trabajadores');
select 'no crea trabajador en empresa ajena (debe 1): ' || ((public.agente(:'k', 'crear_trabajador', '{"empresa_id":"20000000-0000-0000-0000-0000000000f2","cedula":"V-11111111","nombres":"X","apellidos":"Y"}') ->> 'ok') = 'false')::int;
select 'no presupuesta a empresa ajena (debe 1): ' || ((public.agente(:'k', 'crear_presupuesto', '{"empresa_id":"20000000-0000-0000-0000-0000000000f2","renglones":[{"descripcion":"X","precio_usd":1}]}') ->> 'ok') = 'false')::int;
select 'no cita al trabajador ajeno (debe 1): ' || ((public.agente(:'k', 'crear_cita', jsonb_build_object('trabajador_id','30000000-0000-0000-0000-0000000000f2','fecha',public.hoy_caracas() + 3)) ->> 'ok') = 'false')::int;

-- Trabajador: crea, no duplica y no mueve una cédula que ya está en otra empresa
select public.agente(:'k', 'crear_trabajador', jsonb_build_object('empresa_id', :'emp', 'cedula', '12.345.678', 'nombres', 'Ana', 'apellidos', 'Pérez')) -> 'resultado' ->> 'trabajador_id' as trab \gset
select 'repetir el trabajador no duplica (debe true): ' || (public.agente(:'k', 'crear_trabajador', jsonb_build_object('empresa_id', :'emp', 'cedula', 'V-12345678', 'nombres', 'Otro', 'apellidos', 'Nombre')) -> 'resultado' ->> 'ya_existia');
select 'la cédula de otra empresa no se mueve (debe 1): ' || ((public.agente(:'k', 'crear_trabajador', '{"empresa_id":"20000000-0000-0000-0000-00000000000a","cedula":"V-12345678","nombres":"J","apellidos":"G"}') ->> 'error') like 'La cédula V-12345678 ya está registrada en «Nueva C.A.»%')::int;
select 'cédula mal escrita no pasa (debe 1): ' || ((public.agente(:'k', 'crear_trabajador', jsonb_build_object('empresa_id', :'emp', 'cedula', 'abc', 'nombres', 'J', 'apellidos', 'G')) ->> 'ok') = 'false')::int;
select 'buscar trabajadores no trae datos de salud (debe 0): ' || count(*)
  from jsonb_array_elements(public.agente(:'k', 'buscar_trabajadores', '{"cedula":"12345678"}') -> 'resultado' -> 'trabajadores') x, jsonb_object_keys(x) c
 where c in ('grupo_sanguineo', 'discapacidad', 'lateralidad', 'direccion', 'telefono', 'fecha_nacimiento');
reset role;
select 'un solo trabajador, en su empresa, con historia (debe 1): ' || count(*) from public.trabajadores
 where regexp_replace(cedula, '\D', '', 'g') = '12345678' and empresa_id = :'emp' and cedula = 'V-12345678' and nombres = 'Ana' and numero_historia is not null;
set role anon;

-- Servicio, perfil y presupuesto
select public.agente(:'k', 'crear_servicio', '{"nombre":"Perfil A · Laboratorio","categoria":"paraclinico","unidad":"trabajador","precio_usd":40}') -> 'resultado' ->> 'servicio_id' as serv \gset
select 'repetir el servicio no duplica ni cambia el precio (debe 40): ' || (public.agente(:'k', 'crear_servicio', '{"nombre":"perfil a · laboratorio","precio_usd":55}') -> 'resultado' ->> 'precio_usd')::numeric::int;
select 'categoría inventada no pasa (debe 1): ' || ((public.agente(:'k', 'crear_servicio', '{"nombre":"Z","categoria":"regalo","precio_usd":1}') ->> 'ok') = 'false')::int;
select public.agente(:'k', 'crear_perfil', jsonb_build_object('nombre', 'Perfil A · Prueba', 'codigo', 'A', 'examenes', jsonb_build_array('VDRL', 'GLICEMIA AYUNAS', '1M', '1H', '1C'), 'empresa_ids', jsonb_build_array(:'emp'))) -> 'resultado' ->> 'perfil_id' as perfil \gset
select 'perfil con una empresa ajena no pasa (debe 1): ' || ((public.agente(:'k', 'crear_perfil', '{"nombre":"Perfil malo","examenes":["VDRL"],"empresa_ids":["20000000-0000-0000-0000-0000000000f2"]}') ->> 'ok') = 'false')::int;
reset role;
select 'el perfil guarda los exámenes tal como llegan, siglas incluidas (debe 1): ' || count(*) from public.lista_items
 where id = :'perfil' and lista = 'grupo_paraclinicos' and texto = E'VDRL\nGLICEMIA AYUNAS\n1M\n1H\n1C' and datos -> 'empresas' ->> 0 = :'emp';
set role anon;
select 'ensayo de presupuesto suma bien (debe 100): ' || (public.agente(:'k', 'crear_presupuesto', jsonb_build_object('empresa_id', :'emp', 'renglones', jsonb_build_array(
    jsonb_build_object('servicio_id', :'serv'), jsonb_build_object('descripcion', 'Consulta ocupacional', 'precio_usd', 30), jsonb_build_object('descripcion', 'RX', 'cantidad', 2, 'precio_usd', 15))), true) -> 'resultado' ->> 'total_usd')::numeric::int;
reset role;
select 'el ensayo no creó presupuesto (debe 0): ' || count(*) from public.cobros where empresa_id = :'emp';
set role anon;
select public.agente(:'k', 'crear_presupuesto', jsonb_build_object('empresa_id', :'emp', 'observacion', 'Pre-empleo', 'renglones', jsonb_build_array(
    jsonb_build_object('servicio_id', :'serv'), jsonb_build_object('descripcion', 'Consulta ocupacional', 'precio_usd', 30), jsonb_build_object('descripcion', 'RX', 'cantidad', 2, 'precio_usd', 15)))) -> 'resultado' ->> 'presupuesto_id' as pre \gset
select 'repetir el presupuesto no duplica (debe true): ' || (public.agente(:'k', 'crear_presupuesto', jsonb_build_object('empresa_id', :'emp', 'renglones', jsonb_build_array(
    jsonb_build_object('servicio_id', :'serv'), jsonb_build_object('descripcion', 'Consulta ocupacional', 'precio_usd', 30), jsonb_build_object('descripcion', 'RX', 'cantidad', 2, 'precio_usd', 15)))) -> 'resultado' ->> 'ya_existia');
select 'presupuesto sin renglones no pasa (debe 1): ' || ((public.agente(:'k', 'crear_presupuesto', jsonb_build_object('empresa_id', :'emp', 'renglones', '[]'::jsonb)) ->> 'ok') = 'false')::int;
select 'precio negativo no pasa (debe 1): ' || ((public.agente(:'k', 'crear_presupuesto', jsonb_build_object('empresa_id', :'emp', 'renglones', jsonb_build_array(jsonb_build_object('descripcion', 'X', 'precio_usd', -5)))) ->> 'ok') = 'false')::int;
select 'el presupuesto se lista con su enlace (debe 1): ' || ((public.agente(:'k', 'listar_presupuestos', jsonb_build_object('presupuesto_id', :'pre')) -> 'resultado' -> 'presupuestos' -> 0 ->> 'ruta') = '/imprimir/cobro/' || :'pre')::int;
reset role;
select 'un presupuesto en borrador de 100 USD con 3 renglones (debe 1): ' || count(*) from public.cobros c
 where c.empresa_id = :'emp' and c.tipo = 'presupuesto' and c.estado = 'borrador' and c.vence = public.hoy_caracas() + 15
   and c.creado_por = '00000000-0000-0000-0000-0000000000a1'
   and (select sum(cantidad * precio_usd) from public.cobro_items i where i.cobro_id = c.id) = 100
   and (select count(*) from public.cobro_items i where i.cobro_id = c.id) = 3;
set role anon;

-- Cita
select public.agente(:'k', 'crear_cita', jsonb_build_object('trabajador_id', :'trab', 'fecha', public.hoy_caracas() + 3, 'hora', '09:00', 'observacion', 'Provisional')) -> 'resultado' ->> 'cita_id' as cita \gset
select 'repetir la cita no duplica (debe true): ' || (public.agente(:'k', 'crear_cita', jsonb_build_object('trabajador_id', :'trab', 'fecha', public.hoy_caracas() + 3, 'hora', '10:00')) -> 'resultado' ->> 'ya_existia');
select 'cita en el pasado no pasa (debe 1): ' || ((public.agente(:'k', 'crear_cita', jsonb_build_object('trabajador_id', :'trab', 'fecha', public.hoy_caracas() - 1)) ->> 'ok') = 'false')::int;
select 'hora mal escrita no pasa (debe 1): ' || ((public.agente(:'k', 'crear_cita', jsonb_build_object('trabajador_id', :'trab', 'fecha', public.hoy_caracas() + 5, 'hora', '9 am')) ->> 'ok') = 'false')::int;
select 'la cita sale en la lista (debe 1): ' || jsonb_array_length(public.agente(:'k', 'listar_citas', jsonb_build_object('empresa_id', :'emp')) -> 'resultado' -> 'citas');
select 'enlaces de presupuesto y órdenes (debe 1): ' || ((r -> 'presupuesto' ->> 'ruta' = '/imprimir/cobro/' || :'pre') and (r -> 'ordenes' -> 'parametros' ->> 'perfil' = :'perfil')
        and (r -> 'ordenes' -> 'parametros' ->> 'nombre' = 'Ana Pérez') and not (r -> 'ordenes' -> 'parametros' ? 'firma'))::int
  from (select public.agente(:'k', 'enlaces', jsonb_build_object('presupuesto_id', :'pre', 'perfil_id', :'perfil', 'trabajador_id', :'trab')) -> 'resultado' as r) x;
select 'el catálogo trae el perfil (debe 1): ' || (select count(*) from jsonb_array_elements(public.agente(:'k', 'catalogo', '{"tipo":"perfiles"}') -> 'resultado' -> 'perfiles') x where x ->> 'perfil_id' = :'perfil');
select 'la respuesta no trae campos internos (debe 0): ' || (select count(*) from jsonb_object_keys(public.agente(:'k', 'ver_empresa', jsonb_build_object('empresa_id', :'emp')) -> 'resultado') c where c like '\_%');
reset role;
select 'una cita, citada, a las 9, a nombre del administrador (debe 1): ' || count(*) from public.citas
 where id = :'cita' and estado = 'citado' and hora = '09:00' and empresa_id = :'emp' and creado_por = '00000000-0000-0000-0000-0000000000a1';
select 'una sola cita ese día (debe 1): ' || count(*) from public.citas where trabajador_id = :'trab';

-- ===== Registro =====
select 'cada llamada con llave válida quedó anotada (debe 1): ' || (count(*) > 30)::int from public.agentes_registro where org_id = '10000000-0000-0000-0000-000000000001';
select 'los ensayos quedan marcados (debe 2): ' || count(*) from public.agentes_registro where ensayo;
select 'los rechazos quedan con su motivo (debe 1): ' || (count(*) > 10)::int from public.agentes_registro where not ok and error is not null;
select 'el registro dice en qué empresa (debe 1): ' || (count(*) > 5)::int from public.agentes_registro where empresa_id = :'emp';
select 'el registro no anota empresas ajenas (debe 0): ' || count(*) from public.agentes_registro where empresa_id = '20000000-0000-0000-0000-0000000000f2';
select 'la llave cuenta sus usos (debe 1): ' || (usos > 30 and ultimo_uso_en is not null)::int from public.agentes_llaves where nombre = 'Claude';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador ve sus dos llaves, sin huella (debe 2): ' || jsonb_array_length(e -> 'llaves') || case when e::text like '%huella%' then ' FALLA' else '' end
  from (select public.agentes_estado('10000000-0000-0000-0000-000000000001') e) x;
select 'y el registro de hoy (debe 1): ' || (jsonb_array_length(e -> 'registro') > 30 and (e ->> 'total')::int > 30)::int
  from (select public.agentes_estado('10000000-0000-0000-0000-000000000001') e) x;
select 'con fechas viejas el registro sale vacío (debe 0): ' || jsonb_array_length(public.agentes_estado('10000000-0000-0000-0000-000000000001', date '2020-01-01', date '2020-01-31') -> 'registro');

-- ===== Apagar, vencer y perder el cargo =====
select 'apagar la llave de consulta (debe true): ' || public.revocar_llave_agente((select (x ->> 'id')::uuid from jsonb_array_elements(public.agentes_estado('10000000-0000-0000-0000-000000000001') -> 'llaves') x where x ->> 'nombre' = 'Solo mira'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.revocar_llave_agente((select id from public.agentes_llaves limit 1));
  raise notice 'FALLA: RR. HH. apagó una llave';
exception when insufficient_privilege then raise notice 'RR. HH. no apaga llaves (debe 1): 1';
end $$;
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'la llave apagada ya no entra (debe 1): ' || ((public.agente(:'kc', 'resumen') ->> 'ok') = 'false')::int;
reset role;
update public.miembros set rol = 'medico' where usuario_id = '00000000-0000-0000-0000-0000000000a1' and org_id = '10000000-0000-0000-0000-000000000001';
set role anon;
select 'si quien la creó deja de administrar, la llave no entra (debe 1): ' || ((public.agente(:'k', 'resumen') ->> 'ok') = 'false')::int;
reset role;
update public.miembros set rol = 'administrador' where usuario_id = '00000000-0000-0000-0000-0000000000a1' and org_id = '10000000-0000-0000-0000-000000000001';
update public.agentes_llaves set vence_en = public.ahora() - interval '1 minute' where nombre = 'Claude';
set role anon;
select 'la llave vencida no entra (debe 1): ' || ((public.agente(:'k', 'resumen') ->> 'ok') = 'false')::int;
reset role;

-- ===== Autolimpieza =====
update public.agentes_registro set en = public.ahora() - interval '400 days' where accion = 'resumen';
update public.agentes_llaves set vence_en = public.ahora() - interval '400 days', revocada_en = null where nombre = 'Claude';
select 'la limpieza cuenta el registro viejo (debe 1): ' || (cantidad >= 1)::int from public.limpieza_correr(false) where clave = 'agentes_registro';
select count(*) from public.limpieza_correr(true) \g /dev/null
select 'el registro viejo se borró (debe 0): ' || count(*) from public.agentes_registro where accion = 'resumen';
select 'la llave vencida hace más de un año se borró (debe 0): ' || count(*) from public.agentes_llaves where nombre = 'Claude';
select 'lo que el agente creó sigue ahí (debe 1): ' || count(*) from public.empresas where id = :'emp';
select 'y el registro reciente también, sin su llave (debe 1): ' || (count(*) > 10)::int from public.agentes_registro where llave_nombre = 'Claude' and llave_id is null;

-- Dejar la base como estaba para las pruebas que siguen
delete from public.citas where trabajador_id = :'trab';
delete from public.cobros where empresa_id = :'emp';
delete from public.trabajadores where id in (:'trab', '30000000-0000-0000-0000-0000000000f2');
delete from public.lista_items where id = :'perfil';
delete from public.servicios where id = :'serv';
delete from public.empresas where id in (:'emp', '20000000-0000-0000-0000-0000000000f2');
delete from public.organizaciones where id = '10000000-0000-0000-0000-0000000000f2';
delete from public.agentes_registro where org_id = '10000000-0000-0000-0000-000000000001';
delete from public.agentes_llaves where org_id = '10000000-0000-0000-0000-000000000001';
