-- zamorApp Ocupacional · Envíos a la empresa: todos los documentos (paralelo con el SAME, 9-nov)
-- Además de la constancia de aptitud y la consulta médica, salen por el mismo flujo, bitácora y texto:
--   de cada consulta: constancia de atención (sin diagnóstico), referencias y récipes;
--   informes: evaluación del puesto de trabajo, vigilancia epidemiológica y pacientes atendidos.
-- Reglas: lo que lleva datos clínicos (consulta, referencia, récipe) solo va por correo al personal de salud
-- autorizado de la empresa, igual que la consulta. Los informes no llevan consultas: guardan la ruta del documento
-- (siempre de esa empresa) para poder reintentar el mismo PDF. La vigilancia sale con «para=empresa»: sin la cifra de
-- discapacidad (decisión de Cesar, #41) y con las cifras pequeñas ocultas.

alter table public.envios add column if not exists ruta text;

alter table public.envios drop constraint if exists envios_consultas_check;
alter table public.envios add constraint envios_consultas_check check (cardinality(consultas) between 0 and 300);
alter table public.envios drop constraint if exists envios_documentos_check;
alter table public.envios add constraint envios_documentos_check check (
  cardinality(documentos) > 0
  and (
    -- documentos de consultas: con consultas y sin ruta
    (documentos <@ array['constancia', 'consulta', 'atencion', 'referencia', 'recipe']
       and cardinality(consultas) >= 1 and ruta is null)
    -- un informe: sin consultas y con la ruta de su PDF
    or (cardinality(documentos) = 1 and documentos[1] in ('puesto', 'vigilancia', 'atendidos')
        and cardinality(consultas) = 0 and ruta is not null and length(ruta) <= 300)
  )
);

create or replace function public.validar_envio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_total int; v_ok int; v_contacto public.empresa_contactos; v_doc text; v_param text;
begin
  if auth.uid() is not null then new.enviado_por := auth.uid(); end if;
  new.creado_en := now();
  if new.canal = 'correo' and new.estado not in ('enviando', 'fallido') then
    raise exception 'El correo se registra antes de enviarlo (estado enviando)';
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
    if v_doc = 'puesto' then
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

-- El reintento es el mismo envío: también la misma ruta del informe
create or replace function public.validar_reintento()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.envios;
begin
  if new.reintento_de is null then return new; end if;
  select * into o from public.envios where id = new.reintento_de;
  if o.id is null or o.canal <> 'correo'
     or not (o.estado = 'fallido' or (o.estado = 'enviando' and o.creado_en < now() - interval '10 minutes')) then
    raise exception 'Solo se reintenta un correo fallido o sin confirmar';
  end if;
  if (o.org_id, o.empresa_id, o.fecha_lote, o.canal, o.destinatario, o.contacto_id, o.consultas, o.documentos, o.ruta)
     is distinct from (new.org_id, new.empresa_id, new.fecha_lote, new.canal, new.destinatario, new.contacto_id, new.consultas, new.documentos, new.ruta) then
    raise exception 'El reintento debe ser idéntico al envío original';
  end if;
  return new;
end $$;
