-- Avisos de los enlaces públicos (Cesar 12-nov-2026: «no me llegan las notificaciones cuando el cliente abre los enlaces,
-- ni cuando RR. HH. abre los suyos; tienen que llegar al celular, a la web y al escritorio»).
--
-- Causa (revisada en producción, 12-nov):
--  1. El enlace del paciente (/registro) SÍ creaba el aviso «Enlace abierto» y la nube lo mandó a los dos aparatos
--     suscritos (Android y Chrome de Windows), pero ninguno lo mostró y nadie se enteró: el envío no tenía acuse.
--  2. Los enlaces de RR. HH. (documentos /e, depurar nómina /nomina) y el del trabajador (/t) nunca creaban aviso.
--  3. El escritorio no tenía aviso de Windows (eso va en la app; esta migración solo da los datos).
--
-- Solución general: public.avisar_enlace() es la ÚNICA puerta para avisar de un enlace público. Crea la notificación
-- de la campana para el personal del servicio y el trigger avisar_al_celular_al_instante (20261030660000) la manda
-- al celular al momento. Todo enlace nuevo la llama al abrirse (la primera vez, sin contar vistas previas de
-- WhatsApp) y al completarse. Las notificaciones leídas se borran solas (limpieza 20261030914000).
-- Y cada celular confirma que el aviso le llegó (acuse_aviso_push): la campana avisa si un aparato deja de confirmar.

-- ===== 1. La puerta única =====
-- ¿Es una vista previa (WhatsApp, Telegram, Facebook…) y no una persona? Esas visitas no cuentan como «abrió».
create or replace function public.es_vista_previa(p_agente text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_agente, '') ~* '(whatsapp|facebookexternalhit|facebot|meta-externalagent|telegrambot|twitterbot|slackbot|discordbot|skypeuripreview|linkedinbot|googlebot|bingbot|applebot|crawler|spider|preview|bot/|bot;|\mbot\M)';
$$;
revoke execute on function public.es_vista_previa(text) from public, anon, authenticated;

create or replace function public.avisar_enlace(p_org uuid, p_empresa uuid, p_titulo text, p_texto text, p_ruta text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_org is null or coalesce(btrim(p_titulo), '') = '' then return; end if;
  -- Un aviso nunca hace fallar lo que el paciente o RR. HH. están haciendo
  begin
    perform public.notificar(p_org, p_empresa, 'servicio', left(p_titulo, 80), left(coalesce(p_texto, ''), 240),
                             case when p_ruta ~ '^/(?!/)' then left(p_ruta, 300) end);
  exception when others then raise warning 'avisar_enlace: %', sqlerrm;
  end;
end $$;
revoke execute on function public.avisar_enlace(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ===== 2. Documentos enviados a RR. HH. por enlace (/e) =====
create or replace function public.avisar_envio_abierto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if public.es_vista_previa(new.agente) then return null; end if;
  -- Solo la primera apertura de verdad (las siguientes quedan en el historial de envíos)
  if exists (select 1 from public.envio_aperturas a where a.enlace_id = new.enlace_id and a.id <> new.id
               and not public.es_vista_previa(a.agente)) then
    return null;
  end if;
  select e.org_id, e.empresa_id, x.razon_social as empresa, e.documentos into v
    from public.envio_enlaces l join public.envios e on e.id = l.envio_id join public.empresas x on x.id = e.empresa_id
   where l.id = new.enlace_id;
  if v.org_id is null then return null; end if;
  perform public.avisar_enlace(v.org_id, v.empresa_id, 'RR. HH. abrió los documentos',
    v.empresa || ' abrió el enlace de ' || case when v.documentos = array['constancia'] then 'constancias' else 'documentos' end || ' que le enviaste.',
    '/envios');
  return null;
end $$;
revoke execute on function public.avisar_envio_abierto() from public, anon, authenticated;
drop trigger if exists avisar_envio_abierto on public.envio_aperturas;
create trigger avisar_envio_abierto after insert on public.envio_aperturas
  for each row execute function public.avisar_envio_abierto();

-- ===== 3. Documentos enviados al trabajador (/t) =====
create or replace function public.avisar_enlace_trabajador_abierto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if public.es_vista_previa(new.agente) then return null; end if;
  if exists (select 1 from public.enlaces_trabajador_aperturas a where a.enlace_id = new.enlace_id and a.id <> new.id
               and not public.es_vista_previa(a.agente)) then
    return null;
  end if;
  select l.org_id, l.empresa_id, l.trabajador_id, btrim(t.nombres || ' ' || t.apellidos) as quien into v
    from public.enlaces_trabajador l join public.trabajadores t on t.id = l.trabajador_id
   where l.id = new.enlace_id;
  if v.org_id is null then return null; end if;
  perform public.avisar_enlace(v.org_id, v.empresa_id, 'Trabajador abrió sus documentos',
    coalesce(nullif(v.quien, ''), 'El trabajador') || ' abrió el enlace que le enviaste.', '/pacientes/' || v.trabajador_id);
  return null;
end $$;
revoke execute on function public.avisar_enlace_trabajador_abierto() from public, anon, authenticated;
drop trigger if exists avisar_enlace_trabajador_abierto on public.enlaces_trabajador_aperturas;
create trigger avisar_enlace_trabajador_abierto after insert on public.enlaces_trabajador_aperturas
  for each row execute function public.avisar_enlace_trabajador_abierto();

-- ===== 4. Depurar nómina con RR. HH. (/nomina) =====
-- «Abrió»: el primer aparato que entró con el teléfono correcto. «Envió»: cada vez que pulsa Enviar (como mucho un
-- aviso cada 30 minutos, por si lo pulsa varias veces seguidas).
create or replace function public.avisar_depuracion_nomina()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_empresa text;
  v_quien text;
  v_salen int;
  v_agregados int;
begin
  select razon_social into v_empresa from public.empresas where id = new.empresa_id;
  v_quien := coalesce(nullif(btrim(new.rrhh_nombre), ''), 'RR. HH.');
  if old.dispositivo_en is null and new.dispositivo_en is not null then
    perform public.avisar_enlace(new.org_id, new.empresa_id, 'RR. HH. abrió la depuración de nómina',
      v_quien || ' (' || coalesce(v_empresa, 'la empresa') || ') abrió el enlace para depurar la nómina.', '/empresas/' || new.empresa_id);
  end if;
  if new.enviado_en is not null and (old.enviado_en is null or old.enviado_en <= new.enviado_en - interval '30 minutes') then
    select count(*) into v_salen from jsonb_each(new.respuestas) r where r.value ->> 'e' = 'no';
    v_agregados := jsonb_array_length(new.agregados);
    perform public.avisar_enlace(new.org_id, new.empresa_id, 'RR. HH. envió la depuración de nómina',
      coalesce(v_empresa, 'La empresa') || ': ' || v_salen || case when v_salen = 1 then ' sale' else ' salen' end
        || case when v_agregados > 0 then ', ' || v_agregados || case when v_agregados = 1 then ' nuevo' else ' nuevos' end else '' end
        || '. Revisa y confirma.', '/empresas/' || new.empresa_id);
  end if;
  return null;
end $$;
revoke execute on function public.avisar_depuracion_nomina() from public, anon, authenticated;
drop trigger if exists avisar_depuracion_nomina on public.depuraciones_nomina;
create trigger avisar_depuracion_nomina after update of dispositivo_en, enviado_en on public.depuraciones_nomina
  for each row execute function public.avisar_depuracion_nomina();

-- ===== 5. Acuse de cada celular =====
-- ultimo_aviso (ya existía) = cuándo la nube le mandó el último; ultimo_acuse = cuándo el aparato confirmó que le llegó
-- (el service worker lo cuenta al recibirlo). Si pasa el tiempo sin acuse, la campana lo dice con «Probar» e «Ignorar».
alter table public.suscripciones_push add column if not exists ultimo_acuse timestamptz;
alter table public.suscripciones_push add column if not exists acuse_mostrado boolean;
comment on column public.suscripciones_push.ultimo_acuse is 'Última vez que el aparato confirmó que recibió un aviso (service worker).';
comment on column public.suscripciones_push.acuse_mostrado is 'En ese acuse, ¿el aparato pudo mostrarlo? (false: notificaciones bloqueadas).';

-- Sin sesión: la llama la ruta /api/avisos/acuse con la clave del servidor (como quitar_suscripcion_vencida_clave).
-- Solo toca el acuse de esa suscripción; el endpoint lo conoce únicamente el aparato y la base.
create or replace function public.acuse_aviso_push(p_endpoint text, p_clave text, p_mostrado boolean)
returns void language sql security definer set search_path = public as $$
  update public.suscripciones_push s set ultimo_acuse = public.ahora(), acuse_mostrado = coalesce(p_mostrado, true)
    from public.avisos_push_clave k
   where s.endpoint = p_endpoint and k.org_id = s.org_id
     and length(coalesce(p_clave, '')) >= 32 and k.clave_hash = sha256(convert_to(p_clave, 'UTF8'));
$$;
revoke execute on function public.acuse_aviso_push(text, text, boolean) from public;
grant execute on function public.acuse_aviso_push(text, text, boolean) to anon, authenticated;
