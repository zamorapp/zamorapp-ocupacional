-- Consulta a distancia y sala de espera (Cesar, 14-nov): la registra el médico, «escrito» solo lo da el enlace del
-- paciente, firmada no cambia, el control se enlaza una vez, RR. HH. y anónimos no leen, lo vencido se archiva solo.
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null

-- El médico la registra; empresa, paciente y autor los pone la base; «escrito» no se puede marcar a mano
insert into public.teleconsultas (id, org_id, consulta_id, medio, duracion_min, ubicacion, telefono, identidad, consentimiento, control_id, empresa_id)
values ('25700000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-00000000000a',
        'llamada', 12, '  Maturín  ', '0414-0000000', 'Número de su ficha y fecha de nacimiento', 'escrito',
        '40000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b');
select 'el médico la registra; datos de la consulta, sin escrito ni control (debe 1): ' || count(*) from public.teleconsultas
 where id = '25700000-0000-0000-0000-000000000001' and empresa_id = '20000000-0000-0000-0000-00000000000a'
   and trabajador_id = '30000000-0000-0000-0000-00000000000a' and consentimiento = 'pendiente' and consentimiento_en is null
   and control_id is null and ubicacion = 'Maturín' and creado_por = '00000000-0000-0000-0000-0000000000a2';
do $$ begin insert into public.teleconsultas (org_id, consulta_id, medio) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-00000000000a', 'llamada');
 raise notice 'dos teleconsultas en una consulta: FALLA'; exception when unique_violation then raise notice 'una sola por consulta (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
do $$ begin insert into public.teleconsultas (org_id, consulta_id, medio) values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-00000000000b', 'fax');
 raise notice 'medio inventado aceptado: FALLA'; exception when check_violation then raise notice 'medio fuera de la lista no entra (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null

-- «De palabra» guarda su hora; «escrito» a mano no
update public.teleconsultas set consentimiento = 'verbal' where id = '25700000-0000-0000-0000-000000000001';
select 'de palabra queda con su hora (debe 1): ' || count(*) from public.teleconsultas
 where id = '25700000-0000-0000-0000-000000000001' and consentimiento = 'verbal' and consentimiento_en > now() - interval '1 minute';
update public.teleconsultas set consentimiento = 'escrito' where id = '25700000-0000-0000-0000-000000000001';
select 'escrito a mano no se acepta (debe 1): ' || count(*) from public.teleconsultas where id = '25700000-0000-0000-0000-000000000001' and consentimiento = 'verbal';
update public.teleconsultas set consentimiento = 'pendiente', enlace_hash = sha256(convert_to('EnlaceDePruebaTelemedicina_0123456789abcdef', 'UTF8')),
       enlace_vence = now() + interval '90 days' where id = '25700000-0000-0000-0000-000000000001';

select 'el enlace vence a los 7 días, lo pone la base (debe 1): ' || count(*) from public.teleconsultas
 where id = '25700000-0000-0000-0000-000000000001' and enlace_vence between now() + interval '6 days' and now() + interval '8 days';

-- Enfermería y RR. HH. no la registran; RR. HH. no la ve
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin update public.teleconsultas set fallas = 'x' where id = '25700000-0000-0000-0000-000000000001';
 raise notice 'enfermería cambió la teleconsulta: FALLA'; exception when insufficient_privilege then raise notice 'enfermería no la cambia (ok)'; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no la ve (debe 0): ' || count(*) from public.teleconsultas;
select 'RR. HH. no ve la sala de espera (debe 0): ' || count(*) from public.seguimientos_distancia();
reset role;
set role anon;
do $$ begin perform 1 from public.teleconsultas; raise notice 'anónimo leyó teleconsultas: FALLA';
 exception when insufficient_privilege then raise notice 'anónimo no lee teleconsultas (ok)'; end $$;

-- El paciente acepta con su enlace (sin cuenta); ve quién lo atiende, nada clínico
select 'el enlace muestra el servicio y vigente (debe 1): ' || count(*) from (select public.ver_consentimiento_tele('EnlaceDePruebaTelemedicina_0123456789abcdef') v) x
 where v ->> 'estado' = 'vigente' and v ? 'servicio' and not v ? 'diagnostico';
select 'enlace inventado no existe (debe 1): ' || count(*) from (select public.ver_consentimiento_tele('EnlaceInventado_0123456789abcdef0123456789') v) x where v is null;
select 'acepta (debe 1): ' || count(*) from (select public.aceptar_consentimiento_tele('EnlaceDePruebaTelemedicina_0123456789abcdef') r) x where r = 'ok';
select 'segunda vez dice ya (debe 1): ' || count(*) from (select public.aceptar_consentimiento_tele('EnlaceDePruebaTelemedicina_0123456789abcdef') r) x where r = 'ya';
reset role;
select 'queda escrito con su hora (debe 1): ' || count(*) from clinico.teleconsultas
 where id = '25700000-0000-0000-0000-000000000001' and consentimiento = 'escrito' and consentimiento_en > now() - interval '1 minute';

-- El escrito no se pierde; el control se enlaza una vez y solo con una consulta del mismo paciente
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.teleconsultas set consentimiento = 'verbal', control_id = '40000000-0000-0000-0000-00000000000b' where id = '25700000-0000-0000-0000-000000000001';
select 'el escrito se queda y no enlaza otro paciente (debe 1): ' || count(*) from public.teleconsultas
 where id = '25700000-0000-0000-0000-000000000001' and consentimiento = 'escrito' and control_id is null;

-- Sala de espera: una alerta en la consulta a distancia; vencida, se archiva sola y queda en la historia
insert into public.alertas_clinicas (id, org_id, trabajador_id, consulta_id, texto, revisar_antes)
values ('25700000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-00000000000a',
        '40000000-0000-0000-0000-00000000000a', 'Seguimiento a distancia', public.hoy_caracas() - 1);
select 'está en la sala de espera (debe 1): ' || count(*) from public.seguimientos_distancia() where alerta_id = '25700000-0000-0000-0000-0000000000a1' and medio = 'llamada';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
select 'enfermería no archiva (debe 0): ' || public.archivar_seguimientos_distancia();
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'archiva lo vencido (debe 1): ' || public.archivar_seguimientos_distancia();
select 'pasa a archivados (debe 1): ' || count(*) from public.seguimientos_distancia(true) where alerta_id = '25700000-0000-0000-0000-0000000000a1';
select 'ya no espera (debe 0): ' || count(*) from public.seguimientos_distancia() where alerta_id = '25700000-0000-0000-0000-0000000000a1';
reset role;
select 'archivada sigue en la base, automática (debe 1): ' || count(*) from clinico.alertas_clinicas
 where id = '25700000-0000-0000-0000-0000000000a1' and estado = 'descartada' and automatica and respuesta like 'Archivada%';

-- Firmada la consulta, lo registrado de la llamada no cambia
update clinico.consultas set estado = 'firmada' where id = '40000000-0000-0000-0000-00000000000a';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
update public.teleconsultas set duracion_min = 99, medio = 'whatsapp' where id = '25700000-0000-0000-0000-000000000001';
select 'firmada no cambia (debe 1): ' || count(*) from public.teleconsultas where id = '25700000-0000-0000-0000-000000000001' and duracion_min = 12 and medio = 'llamada';
reset role;
update clinico.consultas set estado = 'borrador' where id = '40000000-0000-0000-0000-00000000000a';
