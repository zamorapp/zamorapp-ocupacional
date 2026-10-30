-- zamorApp Ocupacional · Solicitudes de RR. HH.: «Responder y enviar»
-- Al responder una solicitud con su documento, el servicio lo manda por correo en el mismo paso, con el mismo registro,
-- texto y bitácora de Envíos (documento «solicitud», ruta /api/solicitudes/<id>). Reglas:
--   · el documento es de una solicitud de ESTA empresa y ya tiene archivo;
--   · si la respuesta es solo_salud (lleva diagnósticos) lo manda solo personal clínico o el administrador, solo por
--     correo y solo al contacto «personal de salud» de la empresa (igual que la consulta médica);
--   · las constancias (solo_salud = false) van a cualquier contacto de la empresa.

alter table public.envios drop constraint if exists envios_documentos_check;
alter table public.envios add constraint envios_documentos_check check (
  cardinality(documentos) > 0
  and (
    (documentos <@ array['constancia', 'consulta', 'atencion', 'referencia', 'recipe']
       and cardinality(consultas) >= 1 and ruta is null)
    or (cardinality(documentos) = 1 and documentos[1] in ('puesto', 'vigilancia', 'atendidos', 'solicitud')
        and cardinality(consultas) = 0 and ruta is not null and length(ruta) <= 300)
  )
);

-- Igual que en 20261030310000_cola_envios.sql, más el caso «solicitud»
create or replace function public.validar_envio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_total int; v_ok int; v_contacto public.empresa_contactos; v_doc text; v_param text; v_solicitud public.solicitudes;
begin
  if auth.uid() is not null then new.enviado_por := auth.uid(); end if;
  new.creado_en := now();
  -- en_cola: el escritorio lo registra y lo envía Vercel (la clave de Gmail nunca sale de allí)
  if new.canal = 'correo' and new.estado not in ('enviando', 'fallido', 'en_cola') then
    raise exception 'El correo se registra antes de enviarlo (estado enviando o en cola)';
  end if;
  if new.canal = 'whatsapp' and new.estado <> 'enlace' then
    raise exception 'Un envío por WhatsApp se registra como enlace';
  end if;
  if not exists (select 1 from public.empresas where id = new.empresa_id and org_id = new.org_id) then
    raise exception 'La empresa no pertenece a la organización';
  end if;
  select count(distinct x), count(distinct c.id) filter (
           where c.org_id = new.org_id and c.empresa_id = new.empresa_id and c.estado = 'firmada'
             and (auth.uid() is null or public.ve_consulta(c.org_id, c.id)))
    into v_total, v_ok
  from unnest(new.consultas) x left join clinico.consultas c on c.id = x;
  if v_total <> v_ok then
    raise exception 'Solo se envían consultas firmadas de esta empresa que puedas ver';
  end if;
  if new.contacto_id is not null then
    select * into v_contacto from public.empresa_contactos where id = new.contacto_id;
    if v_contacto.id is null or v_contacto.empresa_id <> new.empresa_id or not v_contacto.activo then
      raise exception 'El contacto no pertenece a esta empresa';
    end if;
  end if;
  -- Cola del escritorio: solo a contactos guardados de la empresa y con tope diario (ver LÍMITE ACEPTADO arriba)
  new.por_cola := new.estado = 'en_cola';
  if new.por_cola then
    if v_contacto.id is null or v_contacto.correo is null or lower(new.destinatario) <> lower(v_contacto.correo) then
      raise exception 'Desde el escritorio el correo solo va a contactos guardados de la empresa. Agrégalo en Envíos › Contactos o envíalo desde la web';
    end if;
    if (select count(*) from public.envios e where e.enviado_por = new.enviado_por and e.por_cola
          and e.creado_en >= (public.hoy_caracas()::timestamp at time zone 'America/Caracas')) >= 100 then
      raise exception 'Llegaste al tope de 100 correos en cola por día. Envía el resto desde la web o mañana';
    end if;
  end if;
  -- Datos clínicos: solo personal de salud los envía, solo por correo y solo al personal de salud autorizado
  if new.documentos && array['consulta', 'referencia', 'recipe'] then
    if auth.uid() is not null and not public.es_clinico(new.org_id) then
      raise exception 'Solo el personal de salud envía la consulta médica';
    end if;
    if new.canal <> 'correo' or v_contacto.id is null or not v_contacto.recibe_consulta
       or lower(new.destinatario) <> v_contacto.correo then
      raise exception 'La consulta médica solo va por correo al personal de salud autorizado de la empresa';
    end if;
  end if;
  -- Informes: la ruta es siempre la del documento de ESTA empresa (nunca otra página ni otra empresa)
  if new.ruta is not null then
    v_doc := new.documentos[1];
    if v_doc = 'solicitud' then
      -- Documento de respuesta de una solicitud de ESTA empresa. Si es solo para el personal de salud, lo envía solo
      -- personal clínico o el administrador, solo por correo y solo al contacto de salud autorizado (como la consulta).
      v_param := substring(new.ruta from '^/api/solicitudes/([0-9a-f-]{36})$');
      select * into v_solicitud from public.solicitudes s
       where v_param is not null and s.id = v_param::uuid and s.org_id = new.org_id and s.empresa_id = new.empresa_id
         and s.documento_ruta is not null;
      if v_solicitud.id is null then
        raise exception 'El documento no es de una solicitud de esta empresa';
      end if;
      if auth.uid() is not null and not (public.es_servicio(new.org_id)) then
        raise exception 'Solo el servicio envía la respuesta de una solicitud';
      end if;
      if v_solicitud.solo_salud then
        if auth.uid() is not null and not (public.es_clinico(new.org_id) or public.mi_rol(new.org_id) = 'administrador') then
          raise exception 'Solo el personal de salud envía un documento con datos médicos';
        end if;
        if new.canal <> 'correo' or v_contacto.id is null or not v_contacto.recibe_consulta
           or lower(new.destinatario) <> v_contacto.correo then
          raise exception 'Un documento con datos médicos solo va por correo al personal de salud autorizado de la empresa';
        end if;
      end if;
    elsif v_doc = 'puesto' then
      v_param := substring(new.ruta from '^/imprimir/puesto/([0-9a-f-]{36})$');
      if v_param is null or not exists (select 1 from public.puestos p
                                         where p.id = v_param::uuid and p.org_id = new.org_id and p.empresa_id = new.empresa_id) then
        raise exception 'El informe del puesto no es de esta empresa';
      end if;
    elsif v_doc in ('vigilancia', 'atendidos') then
      if new.ruta !~ ('^/imprimir/' || v_doc || '\?[A-Za-z0-9=&_.:-]*$')
         or substring(new.ruta from '[?&]empresa=([0-9a-f-]{36})(&|$)') is distinct from new.empresa_id::text
         or (length(new.ruta) - length(replace(new.ruta, 'empresa=', ''))) <> length('empresa=') then
        raise exception 'El informe no es de esta empresa';
      end if;
      -- La vigilancia va siempre en su versión para la empresa: sin discapacidad ni cifras pequeñas (#41, prueba 98)
      if v_doc = 'vigilancia' and (new.ruta !~ '[?&]para=empresa(&|$)'
         or (length(new.ruta) - length(replace(new.ruta, 'para=', ''))) <> length('para=')) then
        raise exception 'La vigilancia se envía a la empresa sin datos reservados al servicio médico';
      end if;
    end if;
  end if;
  return new;
end $$;
