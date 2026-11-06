-- Enlace para un trabajador ya registrado: si su ficha está completa no escribe nada; si falta algo se le pide solo eso
-- y se completa la ficha. Llave: 4 últimos números de la cédula (5 intentos). Seguimiento: abierto y descargado, con aviso al servicio (20261030918000).
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos,fecha_nacimiento,sexo,telefono,direccion) values
 ('30000000-0000-0000-0000-000000000220','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','12.345.678','Rosa','Mar','1980-02-03','F','584141112233','Calle 1, Maturín'),
 ('30000000-0000-0000-0000-000000000221','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','','Luis','Paz',null,'M','584141112244',null),
 ('30000000-0000-0000-0000-000000000222','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','SIN-1','Ana','Sol','1985-01-01','F','584141112255','Calle 2');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin
  insert into public.solicitudes_paciente (org_id,token_hash,para_trabajador) values ('10000000-0000-0000-0000-000000000001',sha256('x220'),gen_random_uuid());
  raise notice 'FALLA: creó un enlace para un trabajador que no existe';
exception when others then raise notice 'no se crea para un trabajador ajeno o inexistente (debe 1): 1';
end $$;
do $$ begin
  insert into public.solicitudes_paciente (org_id,token_hash,para_trabajador) values ('10000000-0000-0000-0000-000000000001',sha256('x221'),'30000000-0000-0000-0000-000000000222');
  raise notice 'FALLA: creó un enlace con una cédula sin números';
exception when others then raise notice 'cédula sin 4 números: pide corregir la ficha antes (debe 1): 1';
end $$;
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,para_trabajador,documentos) values
 ('5f000000-0000-0000-0000-000000000222','10000000-0000-0000-0000-000000000001',sha256('reg-0123456789-0123456789-0123456789-uno'),'Rosa Mar',
  '30000000-0000-0000-0000-000000000220','{"bienestar":{"tema":["lumbalgia"]}}'),
 ('5f000000-0000-0000-0000-000000000223','10000000-0000-0000-0000-000000000001',sha256('reg-0123456789-0123456789-0123456789-dos'),'Luis Paz',
  '30000000-0000-0000-0000-000000000221','{}'),
 ('5f000000-0000-0000-0000-000000000224','10000000-0000-0000-0000-000000000001',sha256('reg-0123456789-0123456789-0123456789-tre'),null,null,'{}');
do $$ begin
  update public.solicitudes_paciente set para_trabajador = null where id = '5f000000-0000-0000-0000-000000000222';
  raise notice 'FALLA: cambió el trabajador del enlace';
exception when others then raise notice 'el trabajador del enlace no se cambia (debe 1): 1';
end $$;

set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
-- Ficha completa
select 'registrado, con llave y sin nada que pedir aunque la cédula esté mal escrita (debe 1): ' || count(*) from (select public.catalogo_registro_paciente('reg-0123456789-0123456789-0123456789-uno') j) x
 where (j ->> 'registrado')::boolean and (j ->> 'verificar')::boolean and j -> 'faltan' = '[]'::jsonb;
select 'sin la llave no entra (debe 1): ' || (public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-uno','{}') like 'Esos números no coinciden%')::int;
select 'número equivocado no entra y dice cuántos quedan (debe 1): ' || (public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-uno','{"ultimos4":"5679"}') = 'Esos números no coinciden con tu cédula. Te quedan 3 intentos.')::int;
select 'tras fallar no hay documentos (debe 1): ' || (public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') is null)::int;
select 'antes de entrar no hay datos de la ficha (debe 1): ' || (public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') is null)::int;
select 'abre con los 4 números (debe ok): ' || public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-uno','{"ultimos4":"5678","cedula":"V-99999999","nombres":"Otro","fecha_nacimiento":"2000-01-01"}');
select 'las hojas salen con los datos de la ficha (debe 1): ' || count(*) from (select public.documentos_registro_paciente('reg-0123456789-0123456789-0123456789-uno') j) x
 where j -> 'persona' ->> 'nombres' = 'Rosa' and j -> 'persona' ->> 'fecha_nacimiento' = '1980-02-03';
reset role;
select 'la cédula que ya tenía no se toca (debe 1): ' || count(*) from public.trabajadores where id = '30000000-0000-0000-0000-000000000220' and cedula = '12.345.678';
-- 5 intentos y se bloquea, aunque después acierte
insert into public.solicitudes_paciente (id,org_id,token_hash,nombre,para_trabajador,documentos,creado_por) values
 ('5f000000-0000-0000-0000-000000000225','10000000-0000-0000-0000-000000000001',sha256('reg-0123456789-0123456789-0123456789-cua'),'Rosa Mar','30000000-0000-0000-0000-000000000220','{}','00000000-0000-0000-0000-0000000000a1');
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-cua','{"ultimos4":"0000"}') from generate_series(1,5) \g /dev/null
select 'tras 5 intentos queda bloqueado (debe 1): ' || (public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-cua','{"ultimos4":"5678"}') like 'Hiciste demasiados intentos%')::int;
select 'ya puede subir resultados (debe 1): ' || (public.resultados_registro_paciente('reg-0123456789-0123456789-0123456789-uno') ->> 'puede')::boolean::int;

-- Ficha con datos que faltan: solo pide eso
select 'pide solo lo que falta, sin llave porque no tiene cédula (debe 1): ' || count(*) from (select public.catalogo_registro_paciente('reg-0123456789-0123456789-0123456789-dos') j) x
 where j -> 'faltan' = '["cedula", "fecha_nacimiento", "direccion"]'::jsonb and not (j ->> 'verificar')::boolean;
select 'sin lo que falta no pasa (debe 1): ' || (public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-dos','{}') <> 'ok')::int;
select 'cédula de otra ficha no pasa (debe 1): ' || (public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-dos',
  '{"cedula":"12.345.678","fecha_nacimiento":"1990-05-05","direccion":"Av. Bolívar 10"}') like 'Esa cédula ya está%')::int;
select 'con lo que falta pasa (debe ok): ' || public.enviar_solicitud_paciente('reg-0123456789-0123456789-0123456789-dos',
  '{"cedula":"20111222","fecha_nacimiento":"1990-05-05","direccion":"Av. Bolívar 10","telefono":"04240000000","sexo":"F"}');
reset role;
select 'completa la ficha y no pisa lo que tenía (debe 1): ' || count(*) from public.trabajadores
 where id = '30000000-0000-0000-0000-000000000221' and cedula = 'V-20111222' and fecha_nacimiento = '1990-05-05'
   and direccion = 'Av. Bolívar 10' and telefono = '584141112244' and sexo = 'M';
select 'queda aceptado sin «Por revisar» (debe 2): ' || count(*) from public.solicitudes_paciente
 where id in ('5f000000-0000-0000-0000-000000000222','5f000000-0000-0000-0000-000000000223') and resultado = 'aceptada' and trabajador_id = para_trabajador;
select 'avisa lo que completó (debe 1): ' || (count(*) > 0)::int from public.notificaciones where titulo = 'Ficha completada por el enlace' and texto like 'Luis Paz completó en su ficha: cédula, fecha de nacimiento, dirección.';

-- Seguimiento: abierto y descargado
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select public.marcar_abierto_registro('reg-0123456789-0123456789-0123456789-tre') \g /dev/null
select public.marcar_abierto_registro('reg-0123456789-0123456789-0123456789-tre') \g /dev/null
select public.marcar_descarga_registro('reg-0123456789-0123456789-0123456789-uno') \g /dev/null
select public.marcar_descarga_registro('reg-0123456789-0123456789-0123456789-uno') \g /dev/null
select 'enlace normal: no dice registrado (debe 0): ' || (public.catalogo_registro_paciente('reg-0123456789-0123456789-0123456789-tre') ->> 'registrado')::boolean::int;
do $$ begin
  update public.solicitudes_paciente set abierto_en = null;
  raise notice 'FALLA: el anónimo cambió abierto_en';
exception when insufficient_privilege then raise notice 'el anónimo no cambia abierto_en a mano (debe 1): 1';
end $$;
reset role;
select 'bloqueado sigue sin aceptar (debe 1): ' || count(*) from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000225' and recibido_en is null and intentos_cedula = 5;
select 'anota cuándo lo abrió (debe 1): ' || count(*) from public.solicitudes_paciente where id = '5f000000-0000-0000-0000-000000000224' and abierto_en is not null;
select 'avisa una sola vez que lo abrió (debe 1): ' || (count(*) > 0 and count(*) = count(distinct usuario_id))::int
  from public.notificaciones where titulo = 'Enlace abierto' and texto = 'El paciente abrió el enlace que le enviaste.';
select 'avisa que descargó (debe 1): ' || (count(*) > 0)::int from public.notificaciones where titulo = 'Documentos descargados' and texto = 'Rosa Mar descargó sus documentos.';

delete from public.solicitudes_paciente where id in ('5f000000-0000-0000-0000-000000000222','5f000000-0000-0000-0000-000000000223','5f000000-0000-0000-0000-000000000224','5f000000-0000-0000-0000-000000000225');
delete from public.notificaciones where titulo in ('Ficha completada por el enlace','Enlace abierto','Documentos descargados');
delete from public.trabajadores where id in ('30000000-0000-0000-0000-000000000220','30000000-0000-0000-0000-000000000221','30000000-0000-0000-0000-000000000222');
