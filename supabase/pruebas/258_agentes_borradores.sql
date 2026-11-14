-- Récipes y órdenes que PREPARA el agente (20261030959000): casilla de la llave apagada por defecto, solo borradores,
-- «suelto o adjunto a consulta» lo dice el médico, sin duplicar, el médico emite (con su sesión) o descarta,
-- lo escrito por el agente no cambia, RR. HH. y enfermería no ven los borradores, ver_preparados sin medicinas.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select public.crear_llave_agente('10000000-0000-0000-0000-000000000001', 'Recetas', 'crear', 7) ->> 'llave' as k258 \gset
select (public.agentes_estado('10000000-0000-0000-0000-000000000001') -> 'llaves' -> 0 ->> 'id') as k258id \gset
select 'la casilla viene apagada (debe 0): ' || (select count(*) from jsonb_array_elements(public.agentes_estado('10000000-0000-0000-0000-000000000001') -> 'llaves') l
  where (l ->> 'documentos')::boolean);

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'con la casilla apagada no prepara (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"recipe","adjuntar":"suelto","medicamentos":[{"medicina":"Ibuprofeno","concentracion":"400 mg"}]}') ->> 'error') like 'Esta llave no prepara%')::int;
select 'ni ve borradores (debe 1): ' || ((public.agente(:'k258', 'ver_preparados') ->> 'ok') = 'false')::int;

-- Solo el administrador enciende la casilla
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
do $$ begin
  perform public.agentes_llave_documentos('10000000-0000-0000-0000-000000000001', (select null::uuid), true);
  raise notice 'FALLA: un médico cambió la casilla';
exception when insufficient_privilege then raise notice 'el médico no enciende la casilla (debe 1): 1';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'el administrador la enciende (debe 1): ' || (public.agentes_llave_documentos('10000000-0000-0000-0000-000000000001', :'k258id', true) ->> 'documentos' = 'true')::int;

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin «adjuntar» pregunta al doctor (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"recipe","medicamentos":[{"medicina":"Ibuprofeno"}]}') ->> 'error') like 'Falta «adjuntar»%')::int;
select 'trabajador de otra organización no (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-0000000000f2","tipo":"recipe","adjuntar":"suelto","medicamentos":[{"medicina":"Ibuprofeno"}]}') ->> 'ok') = 'false')::int;
select 'correo sin dirección no (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"examenes","adjuntar":"suelto","examenes":["Hematología completa"],"envio":"correo"}') ->> 'ok') = 'false')::int;
-- Ensayo: dice lo que haría y no guarda; marca lo que falta para el récipe MPPS
select 'el ensayo avisa lo que falta (debe 1): ' || jsonb_array_length(public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"recipe","adjuntar":"suelto","medicamentos":[{"medicina":"Ibuprofeno","concentracion":"400 mg"}]}', true) -> 'resultado' -> 'faltan');
-- Fechas pasadas o futuras sin trabas (Cesar, 14-nov); solo un año imposible se frena
select 'fecha futura vale (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"examenes","adjuntar":"suelto","examenes":["Orina"],"fecha":"2099-11-19"}', true) -> 'resultado' ->> 'fecha') = '2099-11-19')::int;
select 'fecha pasada vale (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"examenes","adjuntar":"suelto","examenes":["Orina"],"fecha":"2001-01-02"}', true) -> 'resultado' ->> 'fecha') = '2001-01-02')::int;
select 'año imposible no (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"examenes","adjuntar":"suelto","examenes":["Orina"],"fecha":"1926-11-19"}', true) ->> 'ok') = 'false')::int;
reset role;
select 'el ensayo no guarda (debe 0): ' || count(*) from clinico.agentes_borradores;
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"recipe","adjuntar":"suelto","envio":"whatsapp","indicaciones":"Después de comer",
    "medicamentos":[{"medicina":"Ibuprofeno","concentracion":"400 mg","presentacion":"Tabletas","via":"Oral","dosis":"1 tableta","frecuencia":"Cada 8 horas","duracion":"5 días","hackeo":"x"}]}') -> 'resultado' ->> 'borrador_id' as b1 \gset
select 'repetirlo no duplica (debe 1): ' || (public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"recipe","adjuntar":"suelto","envio":"whatsapp","indicaciones":"Después de comer",
    "medicamentos":[{"medicina":"Ibuprofeno","concentracion":"400 mg","presentacion":"Tabletas","via":"Oral","dosis":"1 tableta","frecuencia":"Cada 8 horas","duracion":"5 días"}]}') -> 'resultado' ->> 'borrador_id' = :'b1')::int;
select public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000a","tipo":"examenes","adjuntar":"consulta","examenes":["Hematología completa"," Hematología completa ","Glicemia"],"envio":"correo","correo":"Salud@Ejemplo.com"}') -> 'resultado' ->> 'borrador_id' as b2 \gset
select 'adjuntar a consulta sin consultas no (debe 1): ' || ((public.agente(:'k258', 'preparar_documento',
  '{"trabajador_id":"30000000-0000-0000-0000-00000000000b","tipo":"examenes","adjuntar":"consulta","consulta_fecha":"2030-01-01","examenes":["Orina"]}') ->> 'error') like 'No se pudo adjuntar a una consulta%')::int;
select 'al agente no se le dicen fechas de consultas (debe 0): ' || (public.agente(:'k258', 'ver_preparados')::text ~ '\(adjunto a la consulta del')::int;
select 'ver_preparados no devuelve medicinas ni exámenes (debe 0): ' || (public.agente(:'k258', 'ver_preparados')::text ~* '(ibuprofeno|glicemia|hematolog)')::int;
select 'ver_preparados da el estado (debe 2): ' || jsonb_array_length(public.agente(:'k258', 'ver_preparados') -> 'resultado' -> 'borradores');
select 'el agente no inserta directo (debe 1): ' || (not has_table_privilege('anon', 'public.agentes_borradores', 'insert'))::int;
reset role;
select 'guardó el récipe limpio, suelto y por revisar (debe 1): ' || count(*) from clinico.agentes_borradores
 where id = :'b1' and estado = 'por_revisar' and adjuntar = 'suelto' and consulta_id is null and envio = 'whatsapp'
   and empresa_id = '20000000-0000-0000-0000-00000000000a' and llave_nombre = 'Recetas' and not (tratamiento -> 0 ? 'hackeo');
select 'la orden de exámenes va adjunta a la consulta del paciente, sin repetir exámenes (debe 1): ' || count(*) from clinico.agentes_borradores
 where id = :'b2' and consulta_id is not null and jsonb_array_length(examenes) = 2 and correo = 'salud@ejemplo.com';
select 'el registro no guarda medicinas (debe 0): ' || count(*) from public.agentes_registro where resumen ~* 'ibuprofeno|glicemia';

-- Quién ve los borradores
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin perform count(*) from public.agentes_borradores; raise notice 'RR. HH. ve borradores (debe 0): %', (select count(*) from public.agentes_borradores);
exception when insufficient_privilege then raise notice 'RR. HH. ve borradores (debe 0): 0'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
select 'enfermería no ve borradores (debe 0): ' || count(*) from public.agentes_borradores;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico ve los dos (debe 2): ' || count(*) from public.agentes_borradores;
do $$ begin
  insert into public.agentes_borradores (org_id, trabajador_id, tipo, examenes, adjuntar, llave_nombre)
  values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'examenes', '["X"]', 'suelto', 'yo');
  raise notice 'FALLA: el médico creó un borrador a mano';
exception when insufficient_privilege then raise notice 'ni el médico crea borradores a mano (debe 1): 1';
end $$;

-- Enfermería no marca borradores
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
update public.agentes_borradores set estado = 'descartado' where id = :'b2';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'enfermería no descarta (debe 0): ' || count(*) from public.agentes_borradores where id = :'b2' and estado = 'descartado';
select 'emitir sin indicación no se puede (debe 1): ' || (select count(*) from public.agentes_borradores where id = :'b2' and estado = 'por_revisar');

-- El médico lo emite: la indicación es suya (corrige lo que quiera); el borrador queda «emitido» y no cambia
insert into public.indicaciones (id, org_id, trabajador_id, tipo, tratamiento, indicaciones)
values ('24900000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'recipe',
        '[{"medicina":"Ibuprofeno","concentracion":"600 mg","presentacion":"Tabletas","via":"Oral","dosis":"1 tableta","frecuencia":"Cada 8 horas","duracion":"3 días"}]', 'Después de comer');
update public.agentes_borradores set estado = 'emitido', indicacion_id = '24900000-0000-0000-0000-000000000001', tratamiento = '[]' where id = :'b1';
select 'emitido con la indicación del médico; lo del agente no cambia (debe 1): ' || count(*) from public.agentes_borradores
 where id = :'b1' and estado = 'emitido' and revisado_por = '00000000-0000-0000-0000-0000000000a2' and jsonb_array_length(tratamiento) = 1;
update public.agentes_borradores set estado = 'descartado' where id = :'b1';
select 'gana la primera marca (debe 1): ' || count(*) from public.agentes_borradores where id = :'b1' and estado = 'emitido';

-- Orden de exámenes sin consulta y adjunta a una consulta (la del mismo trabajador)
insert into public.indicaciones (id, org_id, trabajador_id, tipo, examenes, consulta_id)
values ('24900000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'examenes',
        '["Hematología completa","Glicemia"]', '40000000-0000-0000-0000-00000000000a');
select 'la orden de exámenes nace emitida y adjunta a la consulta (debe 1): ' || count(*) from public.indicaciones
 where id = '24900000-0000-0000-0000-000000000002' and estado = 'emitida' and consulta_id = '40000000-0000-0000-0000-00000000000a';
do $$ begin insert into public.indicaciones (org_id, trabajador_id, tipo, indicaciones) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'examenes', 'algo');
 raise notice 'FALLA: orden de exámenes sin exámenes'; exception when check_violation then raise notice 'orden de exámenes sin exámenes no se crea (debe 1): 1'; end $$;
do $$ begin insert into public.indicaciones (org_id, trabajador_id, tipo, examenes, consulta_id) values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a', 'examenes', '["Orina"]', '40000000-0000-0000-0000-00000000000b');
 raise notice 'FALLA: adjunta a la consulta de otro trabajador'; exception when others then raise notice 'no se adjunta a la consulta de otro trabajador (debe 1): 1'; end $$;
update public.indicaciones set examenes = '["Otro"]', consulta_id = null where id = '24900000-0000-0000-0000-000000000002';
select 'exámenes y consulta no cambian después (debe 1): ' || count(*) from public.indicaciones
 where id = '24900000-0000-0000-0000-000000000002' and examenes = '["Hematología completa","Glicemia"]' and consulta_id is not null;
update public.agentes_borradores set estado = 'emitido', indicacion_id = '24900000-0000-0000-0000-000000000002' where id = :'b2';
select 'la orden del agente queda emitida (debe 1): ' || count(*) from public.agentes_borradores where id = :'b2' and estado = 'emitido';

-- Autolimpieza a los 30 días
reset role;
set session_replication_role = replica;
update clinico.agentes_borradores set creado_en = public.ahora() - interval '31 days' where id = :'b1';
set session_replication_role = origin;
select 'la limpieza cuenta el borrador viejo (debe 1): ' || cantidad from public.limpieza_correr(false) where clave = 'agentes_borradores';
select set_config('request.jwt.claim.sub','',false) \g /dev/null
