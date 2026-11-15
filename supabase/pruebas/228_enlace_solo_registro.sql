-- Enlace «Solo registro» y «Recomendaciones» (20261030929000): el paciente no registrado llena solo sus datos de registro
-- (sin motivo, antecedentes ni hábitos), el cargo es obligatorio si viene de una empresa, la marca no se cambia y las
-- recomendaciones de texto libre llegan limpias a sus documentos.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,solo_registro,documentos) values
 ('5f000000-0000-0000-0000-000000000228','10000000-0000-0000-0000-000000000001',sha256('sol-0123456789-0123456789-0123456789-uno'),'Rosa',true,
  '{"orden":{"examenes":[{"nombre":"Glicemia","grupo":"Química","clase":"laboratorio"}]},"recomendaciones":{"texto":"  Acudir en ayunas.\nTomar agua.  ","x":1},"firma":true}'),
 ('5f000000-0000-0000-0000-000000000229','10000000-0000-0000-0000-000000000001',sha256('sol-0123456789-0123456789-0123456789-dos'),'Luis',false,
  '{"recomendaciones":{"texto":"   "}}');
select 'recomendaciones limpias y sin claves extra (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000228' and documentos->'recomendaciones' = '{"texto":"Acudir en ayunas.\nTomar agua."}'::jsonb and documentos->>'firma' = 'true';
select 'recomendaciones vacías no entran (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000229' and documentos = '{}'::jsonb;
do $$ begin
  update public.solicitudes_paciente set solo_registro = false where id = '5f000000-0000-0000-0000-000000000228';
  raise notice 'FALLA: cambió «solo registro» después de crearlo';
exception when others then raise notice '«solo registro» no se cambia después de crearlo (debe 1): 1';
end $$;

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'la página sabe que es solo registro (debe 1): ' || (public.catalogo_registro_paciente('sol-0123456789-0123456789-0123456789-uno') ->> 'solo_registro')::boolean::int;
select 'el enlace normal no es solo registro (debe 0): ' || (public.catalogo_registro_paciente('sol-0123456789-0123456789-0123456789-dos') ->> 'solo_registro')::boolean::int;
select 'de una empresa sin cargo: lo pide (debe 1): ' || (public.enviar_solicitud_paciente('sol-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-22333444","nombres":"Rosa","apellidos":"Mar","fecha_nacimiento":"1990-05-06","telefono":"0414-1234567","tipo":"empresa","empresa":"Constructora"}') = 'Escriba su cargo en la empresa.')::int;
select 'de una empresa sin decir cuál: la pide (debe 1): ' || (public.enviar_solicitud_paciente('sol-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-22333444","nombres":"Rosa","apellidos":"Mar","fecha_nacimiento":"1990-05-06","telefono":"0414-1234567","tipo":"empresa","cargo":"Soldadora"}') = 'Escriba la empresa donde trabaja.')::int;
select 'solo registro entra sin motivo (debe ok): ' || public.enviar_solicitud_paciente('sol-0123456789-0123456789-0123456789-uno',
  '{"cedula":"V-22333444","nombres":"Rosa","apellidos":"Mar","fecha_nacimiento":"1990-05-06","telefono":"0414-1234567","tipo":"empresa","empresa":"Constructora","cargo":"Soldadora"}');
select 'el enlace normal sigue pidiendo el motivo (debe 1): ' || (public.enviar_solicitud_paciente('sol-0123456789-0123456789-0123456789-dos',
  '{"cedula":"V-22333445","nombres":"Luis","apellidos":"Paz","fecha_nacimiento":"1990-05-06","telefono":"0414-1234568","tipo":"particular"}') = 'Cuéntenos qué lo motiva a consultar.')::int;
select 'apenas se registra ve sus documentos con sus datos y las recomendaciones (debe 1): ' || count(*)
  from (select public.documentos_registro_paciente('sol-0123456789-0123456789-0123456789-uno') j) x
 where j -> 'persona' ->> 'cargo' = 'Soldadora' and j -> 'documentos' -> 'recomendaciones' ->> 'texto' = E'Acudir en ayunas.\nTomar agua.';
reset role;
select 'guardó sus datos sin motivo (debe 1): ' || count(*) from public.solicitudes_paciente
 where id = '5f000000-0000-0000-0000-000000000228' and recibido_en is not null and not datos ? 'motivo' and datos->>'cargo' = 'Soldadora';
select 'aviso al servicio: crear su ficha (debe 1): ' || (count(*) > 0)::int from public.notificaciones where texto like 'Rosa Mar se registró por el enlace%';
