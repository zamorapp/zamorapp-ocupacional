-- Documentos personales al trabajador por WhatsApp (enlaces_trabajador, /t/<token>): solo personal de salud que ve la
-- consulta; lo clínico exige la consulta firmada; RR. HH. y anónimos no ven nada; se anula una sola vez y borra el PDF.
-- Un envío = varios documentos con el mismo token (sha256(token:documento)) y paquete; lo clínico pide la cédula.
\pset tuples_only on
reset role;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado,fecha) values
 ('4c000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','firmada',public.hoy_caracas()),
 ('4c000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','borrador',public.hoy_caracas());

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
-- Hoja educativa durante la consulta (sin firmar): sí
with x as (
  insert into public.enlaces_trabajador (id,org_id,trabajador_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por,paquete)
  values ('5e000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a',
          '4c000000-0000-0000-0000-00000000000b','dieta','/imprimir/dieta/4c000000-0000-0000-0000-00000000000b?plan=hta,peso&c=QWxv_-9',
          '584141234567',sha256('trab-0123456789-0123456789-0123456789-tok1:dieta'::bytea),'00000000-0000-0000-0000-0000000000a2','5f000000-0000-0000-0000-000000000001')
  returning 1)
select 'médico envía la dieta sin firmar la consulta (debe 1): ' || count(*) from x;
do $$ begin
  insert into public.enlaces_trabajador (org_id,trabajador_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por)
  values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4c000000-0000-0000-0000-00000000000b','recipe',
          '/imprimir/recipe/4c000000-0000-0000-0000-00000000000b','584141234567',sha256('r1'),'00000000-0000-0000-0000-0000000000a2');
  raise notice 'FALLA: récipe de consulta sin firmar';
exception when others then
  if sqlerrm like '%Firma la consulta%' then raise notice 'el récipe exige la consulta firmada (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
with x as (
  insert into public.enlaces_trabajador (id,org_id,trabajador_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por,paquete)
  values ('5e000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a',
          '4c000000-0000-0000-0000-00000000000a','recipe','/imprimir/recipe/4c000000-0000-0000-0000-00000000000a',
          '584141234567',sha256('trab-0123456789-0123456789-0123456789-tok1:recipe'::bytea),'00000000-0000-0000-0000-0000000000a2','5f000000-0000-0000-0000-000000000001')
  returning 1)
select 'médico envía el récipe de la consulta firmada (debe 1): ' || count(*) from x;
insert into public.enlaces_trabajador_archivos (enlace_id,nombre,contenido) values
 ('5e000000-0000-0000-0000-000000000001','dieta.pdf','%PDF-dieta'), ('5e000000-0000-0000-0000-000000000002','recipe.pdf','%PDF-recipe');
do $$ begin
  insert into public.enlaces_trabajador (org_id,trabajador_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por)
  values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000b','4c000000-0000-0000-0000-00000000000a','dieta',
          '/imprimir/dieta/4c000000-0000-0000-0000-00000000000a','584141234567',sha256('r2'),'00000000-0000-0000-0000-0000000000a2');
  raise notice 'FALLA: enlace a otro trabajador';
exception when others then raise notice 'no se manda el documento a otro trabajador (debe 1): 1';
end $$;
do $$ begin
  insert into public.enlaces_trabajador (org_id,trabajador_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por)
  values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4c000000-0000-0000-0000-00000000000a','dieta',
          '/imprimir/informe/4c000000-0000-0000-0000-00000000000a','584141234567',sha256('r3'),'00000000-0000-0000-0000-0000000000a2');
  raise notice 'FALLA: ruta de otro documento';
exception when others then
  if sqlerrm like '%La ruta no corresponde%' then raise notice 'la ruta tiene que ser la del documento (debe 1): 1'; else raise notice 'FALLA: %', sqlerrm; end if;
end $$;
do $$ begin
  insert into public.enlaces_trabajador (org_id,trabajador_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por)
  values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4c000000-0000-0000-0000-00000000000a','informe',
          '/imprimir/informe/4c000000-0000-0000-0000-00000000000a','584141234567',sha256('r4'),'00000000-0000-0000-0000-0000000000a2');
  raise notice 'FALLA: documento no permitido';
exception when others then raise notice 'solo documentos personales permitidos (debe 1): 1';
end $$;

-- RR. HH. de A: no ve ni crea enlaces del trabajador
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no ve los enlaces del trabajador (debe 0): ' || count(*) from public.enlaces_trabajador;
do $$ begin
  insert into public.enlaces_trabajador (org_id,trabajador_id,consulta_id,documento,ruta,telefono,token_hash,enviado_por)
  values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','4c000000-0000-0000-0000-00000000000b','dieta',
          '/imprimir/dieta/4c000000-0000-0000-0000-00000000000b','584141234567',sha256('r5'),'00000000-0000-0000-0000-0000000000a3');
  raise notice 'FALLA: RR. HH. creó un enlace';
exception when others then raise notice 'RR. HH. no crea enlaces del trabajador (debe 1): 1';
end $$;

-- Anónimo (ruta /t/<token>): abre con el token, nunca lee las tablas
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false) \g /dev/null
select 'anónimo ve los 2 documentos del envío con un solo token (debe 2): ' || count(*) from public.listar_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1') where vigente;
select 'el récipe pide cédula y la dieta no (debe 2): ' || count(*) from public.listar_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1') where (documento = 'recipe' and pide_cedula) or (documento = 'dieta' and not pide_cedula);
select 'anónimo abre la dieta sin cédula (debe 1): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'dieta', null, 'prueba') where contenido_base64 is not null;
select 'anónimo con token falso no ve nada (debe 0): ' || count(*) from public.listar_enlace_trabajador('trab-0123456789-0123456789-0123456789-XXXXX');
select 'con un token no se abre un documento que no se envió (debe 0): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'reposo', '5678', null) where contenido_base64 is not null;
do $$ begin
  perform 1 from public.enlaces_trabajador;
  raise notice 'FALLA: anónimo leyó enlaces';
exception when insufficient_privilege then raise notice 'anónimo no lee enlaces del trabajador (debe 1): 1';
end $$;

-- Cédula: el récipe pide los 4 últimos dígitos (V-12345678 → 5678); 5 fallos en el envío lo bloquean
reset role;
update public.trabajadores set cedula = 'V-12345678' where id = '30000000-0000-0000-0000-00000000000a';
set role anon;
select 'sin cédula no abre el récipe (debe 1): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'recipe', null, null) where error = 'cedula' and contenido_base64 is null;
select 'con cédula errada tampoco (debe 1): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'recipe', '9999', null) where error = 'cedula';
select 'con los 4 últimos dígitos sí (debe 1): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'recipe', '5678', null) where contenido_base64 is not null;
select public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'recipe', '0000', null) from generate_series(1, 3) \g /dev/null
select 'el quinto fallo bloquea (debe 1): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'recipe', '1111', null) where error = 'bloqueado';
select 'bloqueado, ni con la cédula correcta (debe 1): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'recipe', '5678', null) where error = 'bloqueado';
select 'la lista lo muestra bloqueado (debe 2): ' || count(*) from public.listar_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1') where bloqueado;
select 'la dieta (sin cédula) sigue abriendo (debe 1): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'dieta', null, null) where contenido_base64 is not null;
reset role;
update public.trabajadores set cedula = '1' where id = '30000000-0000-0000-0000-00000000000a';

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico ve las 3 aperturas buenas (debe 3): ' || count(*) from public.enlaces_trabajador_aperturas a
  join public.enlaces_trabajador l on l.id = a.enlace_id where a.exito and l.consulta_id in ('4c000000-0000-0000-0000-00000000000a','4c000000-0000-0000-0000-00000000000b');
do $$ begin
  perform 1 from public.enlaces_trabajador_archivos;
  raise notice 'FALLA: se leyó el PDF guardado';
exception when insufficient_privilege then raise notice 'nadie lee el PDF guardado directo (debe 1): 1';
end $$;
do $$ begin
  update public.enlaces_trabajador set telefono = '584149999999' where id = '5e000000-0000-0000-0000-000000000001';
  raise notice 'FALLA: se cambió el teléfono';
exception when others then raise notice 'el enlace no cambia de teléfono (debe 1): 1';
end $$;
update public.enlaces_trabajador set revocado_en = now() where id = '5e000000-0000-0000-0000-000000000001';
reset role;
select 'anular borra el PDF de la dieta (debe 0): ' || count(*) from public.enlaces_trabajador_archivos where enlace_id = '5e000000-0000-0000-0000-000000000001';
select 'enlace anulado ya no abre (debe 0): ' || count(*) from public.abrir_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1', 'dieta', null, null) where contenido_base64 is not null;
select 'pero la lista dice a qué servicio pedírselo (debe 1): ' || count(*) from public.listar_enlace_trabajador('trab-0123456789-0123456789-0123456789-tok1') where documento = 'dieta' and not vigente and servicio = 'Org';
-- La consulta firmada se reabre: el récipe enviado se anula solo
update clinico.consultas set estado = 'cerrada' where id = '4c000000-0000-0000-0000-00000000000a';
select 'reabrir la consulta anula el récipe enviado (debe 1): ' || count(*) from public.enlaces_trabajador where id = '5e000000-0000-0000-0000-000000000002' and revocado_en is not null;
select 'y borra su PDF (debe 0): ' || count(*) from public.enlaces_trabajador_archivos where enlace_id = '5e000000-0000-0000-0000-000000000002';
select 'la dieta queda marcada «con cambios» y el récipe no (debe 1): ' || count(*) from public.enlaces_trabajador where (id = '5e000000-0000-0000-0000-000000000001' and con_cambios) or (id = '5e000000-0000-0000-0000-000000000002' and con_cambios);
select 'queda en la bitácora (debe 2): ' || count(distinct registro_id) from public.bitacora where tabla = 'public.enlaces_trabajador';

-- Deja la base como estaba
set session_replication_role = replica;
delete from public.enlaces_trabajador where consulta_id in ('4c000000-0000-0000-0000-00000000000a','4c000000-0000-0000-0000-00000000000b');
delete from public.bitacora where tabla = 'public.enlaces_trabajador';
delete from clinico.consultas where id in ('4c000000-0000-0000-0000-00000000000a','4c000000-0000-0000-0000-00000000000b');
set session_replication_role = origin;
