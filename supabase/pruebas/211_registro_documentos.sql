-- Documentos que el paciente descarga al terminar su registro (solicitudes_paciente.documentos): se limpian al crear,
-- la firma solo la pone un médico, no se cambian, y el anónimo los ve solo con el enlace llenado y vigente.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.perfiles (id, nombre_completo) values ('00000000-0000-0000-0000-0000000000a1', 'Dr. Prueba 211')
on conflict (id) do update set nombre_completo = excluded.nombre_completo;
update public.perfiles set firma_url = 'data:image/png;base64,FIRMA211', sello_url = 'data:image/png;base64,SELLO211', mostrar_firma = true, mostrar_sello = true
 where id = '00000000-0000-0000-0000-0000000000a1';
insert into public.lista_items (id,lista,org_id,nombre) values
 ('5f000000-0000-0000-0000-0000000002f1','motivo_consulta','10000000-0000-0000-0000-000000000001','Pre-empleo prueba 211')
on conflict do nothing;
-- Recepción sin límite (crea enlaces, no firma)
insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000002e1','recep211@x') on conflict do nothing;
insert into public.miembros (org_id,usuario_id,rol) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000002e1','recepcion') on conflict do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,empresa_id,documentos) values
 ('5f000000-0000-0000-0000-000000000211','10000000-0000-0000-0000-000000000001',sha256('reg-0123456789-0123456789-0123456789-uno'),'Gilberto',
  '20000000-0000-0000-0000-00000000000a',
  '{"orden":{"examenes":[{"nombre":"Hematología completa","grupo":"Laboratorio"},{"nombre":"","grupo":"x"},{"x":1}],"motivo_id":"5f000000-0000-0000-0000-0000000002f1","perfil":"Perfil general"},
    "control_ta":{"dias":"14"},"dieta":{"dieta":"hta","plan":["sal","<script>"]},"bienestar":{"tema":[]},"firma":true,"historia":{"dx":"F32"}}'),
 ('5f000000-0000-0000-0000-000000000212','10000000-0000-0000-0000-000000000001',sha256('reg-0123456789-0123456789-0123456789-dos'),null,null,'{}');
select 'limpia lo elegido: solo claves conocidas y exámenes válidos (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000211' and not documentos ? 'historia' and documentos->>'firma' = 'true'
   and jsonb_array_length(documentos->'orden'->'examenes') = 1 and documentos->'control_ta'->>'dias' = '14'
   and documentos->'dieta'->'plan' = '["sal"]' and documentos->'orden'->>'motivo_id' = '5f000000-0000-0000-0000-0000000002f1';
do $$ begin
  update public.solicitudes_paciente set documentos = '{"control_ta":{"dias":7}}' where id = '5f000000-0000-0000-0000-000000000211';
  raise notice 'FALLA: cambió los documentos elegidos';
exception when others then raise notice 'lo elegido no se cambia después (debe 1): 1';
end $$;

-- Recepción: crea enlaces con documentos, pero no con firma
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000002e1',false) \g /dev/null
do $$ begin
  insert into public.solicitudes_paciente (org_id,token_hash,documentos) values ('10000000-0000-0000-0000-000000000001',sha256('reg-recep-firma'),'{"control_ta":{"dias":7},"firma":true}');
  raise notice 'FALLA: recepción envió documentos firmados';
exception when others then raise notice 'recepción no firma documentos (debe 1): 1';
end $$;
with x as (
  insert into public.solicitudes_paciente (org_id,token_hash,documentos) values ('10000000-0000-0000-0000-000000000001',sha256('reg-recep-sin'),'{"bienestar":{"tema":[]}}') returning 1)
select 'recepción sí crea enlaces con documentos sin firma (debe 1): ' || count(*) from x;

-- Anónimo: nada hasta que llena; después ve sus datos, el membrete, el médico con firma y lo elegido
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'sin llenar no hay documentos (debe 1): ' || (public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') is null)::int;
select 'llena sus datos (debe 1): ' || (public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-24680135","nombres":"Gilberto","apellidos":"Gómez","fecha_nacimiento":"1991-02-03","telefono":"04141234567","tipo":"empresa","empresa":"Givaldo","cargo":"Soldador","motivo":"Chequeo"}') = 'ok')::int;
select 've sus documentos con sus datos, la empresa y el médico firmante (debe 1): ' || count(*) from (select public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') j) x
 where j->'persona'->>'cedula' = 'V-24680135' and j->'persona'->>'cargo' = 'Soldador' and j->'empresa'->>'razon_social' = 'A'
   and j->'motivo'->>'nombre' = 'Pre-empleo prueba 211' and j->'medico'->>'nombre_completo' = 'Dr. Prueba 211' and (j->>'firmado')::boolean
   and not j->'documentos' ? 'firma' and j->'documentos'->'orden'->'examenes'->0->>'nombre' = 'Hematología completa';
select 'nunca devuelve la firma, el sello ni el correo del médico (debe 0): ' || count(*) from (select public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') j) x
 where j::text ~ 'FIRMA211|SELLO211|firma_url|sello_url' or j->'medico' ? 'correo';
select 'no devuelve nada de la historia ni el teléfono (debe 0): ' || count(*) from (select public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') j) x
 where j::text ~ '04141234567|584141234567|token_hash|diagnost';
select 'token inventado no devuelve nada (debe 1): ' || (public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-xxx') is null)::int;
select 'enlace sin documentos no devuelve nada (debe 1): ' || ((public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-dos',
  '{"cedula":"V-13579246","nombres":"Ana","apellidos":"Ruiz","fecha_nacimiento":"1990-01-01","telefono":"04141234567","motivo":"Chequeo"}') = 'ok')
  and public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-dos') is null)::int;
select 'un anónimo no ejecuta la limpieza directa (debe 0): ' || has_function_privilege('anon','public.limpiar_documentos_registro(jsonb,uuid)','execute')::int;

-- Sin firma: el médico no sale (ni su firma)
reset role;
select 'enlace de recepción sin médico (debe 1): ' || count(*) from public.solicitudes_paciente where token_hash = sha256('reg-recep-sin') and not documentos ? 'firma';

-- Descartada o pasados 7 días desde que llenó: ya no se descarga
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
update public.solicitudes_paciente set resultado = 'descartada' where id = '5f000000-0000-0000-0000-000000000211';
set role anon;
select 'descartada ya no se descarga (debe 1): ' || (public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') is null)::int;
reset role;
update public.solicitudes_paciente set resultado = null, revisado_en = null, revisado_por = null, recibido_en = now() - interval '8 days' where id = '5f000000-0000-0000-0000-000000000211';
set role anon;
select 'pasados 7 días ya no se descarga (debe 1): ' || (public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') is null)::int;

-- Limpieza: cada prueba deja su propio estado
reset role;
delete from public.solicitudes_paciente where id in ('5f000000-0000-0000-0000-000000000211','5f000000-0000-0000-0000-000000000212') or token_hash in (sha256('reg-recep-sin'));
delete from public.miembros where usuario_id = '00000000-0000-0000-0000-0000000002e1';
delete from public.lista_items where id = '5f000000-0000-0000-0000-0000000002f1';
update public.perfiles set firma_url = null, sello_url = null where id = '00000000-0000-0000-0000-0000000000a1';
