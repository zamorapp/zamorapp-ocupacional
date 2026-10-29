-- zamorApp Ocupacional · Cola de envíos del escritorio (plan «local primero», sección 5.e; contrato de la fase A, sección 6)
-- El escritorio ejecuta Next en la PC y la clave de Gmail vive SOLO en Vercel: el correo no puede salir de la PC.
-- Ahora el escritorio arma el PDF en la PC (Edge, desde su copia), lo deja en el bucket privado «envios-cola» y registra
-- el envío «en_cola»; Vercel (/api/envios/correo, con la sesión de nube de quien envía) lo toma, lo manda y lo cierra.
-- Sin internet, la fila y el PDF quedan en la PC (bandeja de la fase A y cola de adjuntos de la fase B) y salen al volver.
--
-- LÍMITE ACEPTADO (revisión de Analizar): en la cola, el PDF lo arma y lo sube el cliente (Next en la PC), no el servidor.
-- La base no puede comprobar que el archivo sea el documento registrado: la garantía del #41 (sin datos reservados al
-- servicio en lo que va a RR. HH.) y la de la vigilancia «para=empresa» dependen aquí del código del programa de escritorio.
-- Para que no sea un relé abierto del Gmail del consultorio: en cola solo se escribe a un CONTACTO ACTIVO de la empresa
-- (nunca a un correo suelto, que sigue por la web) y con un tope de 100 correos en cola por usuario y día.

-- Marca de origen: cuenta para el tope diario aunque el envío ya haya salido
alter table public.envios add column if not exists por_cola boolean not null default false;

-- 1) Estado nuevo
alter table public.envios drop constraint if exists envios_estado_check;
alter table public.envios add constraint envios_estado_check check (estado in ('en_cola', 'enviando', 'enviado', 'fallido', 'enlace'));

create or replace function public.validar_envio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_total int; v_ok int; v_contacto public.empresa_contactos; v_doc text; v_param text;
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


-- 2) Quien envía avanza su propio envío: en_cola → enviando (Vercel lo toma) o fallido; enviando → enviado o fallido
drop policy if exists envios_cerrar on public.envios;
create policy envios_cerrar on public.envios for update
  using (enviado_por = auth.uid() and estado in ('en_cola', 'enviando'))
  with check (enviado_por = auth.uid() and estado in ('enviando', 'enviado', 'fallido'));

create or replace function public.cerrar_envio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not ((old.estado = 'enviando' and new.estado in ('enviado', 'fallido'))
          or (old.estado = 'en_cola' and new.estado in ('enviando', 'fallido')))
     or (auth.uid() is not null and auth.uid() is distinct from old.enviado_por)
     or (to_jsonb(new) - 'estado' - 'error' - 'version') is distinct from (to_jsonb(old) - 'estado' - 'error' - 'version') then
    raise exception 'El registro de envíos no se modifica';
  end if;
  new.error := left(new.error, 500);
  return new;
end $$;

-- 3) PDF en espera: carpeta del usuario (<uid>/<envío>/<archivo>.pdf), privada; Vercel la borra después de enviar
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('envios-cola', 'envios-cola', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists envios_cola_leer on storage.objects;
drop policy if exists envios_cola_subir on storage.objects;
drop policy if exists envios_cola_borrar on storage.objects;
create policy envios_cola_leer on storage.objects for select to authenticated
  using (bucket_id = 'envios-cola' and (storage.foldername(name))[1] = auth.uid()::text);
-- Sin exigir que el envío ya esté en la nube: con la fase A la fila se guarda en la PC y la bandeja la sube después.
-- Solo PDF, solo en la carpeta propia; la web solo envía PDFs de filas «en_cola» propias (y los borra al enviarlos).
create policy envios_cola_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'envios-cola' and (storage.foldername(name))[1] = auth.uid()::text);
create policy envios_cola_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'envios-cola' and (storage.foldername(name))[1] = auth.uid()::text);

-- 4) Copia en la PC: contactos y plantillas se editan allí (suben); los envíos suben en cola y bajan con su estado;
--    las solicitudes suben y bajan, como decidió el #110 (migración 20261030240000). Enlaces, archivos e invitaciones
--    NUNCA van a la PC.
insert into sync.tablas (nombre, clinica, subible) values
  ('public.empresa_contactos', false, true), ('public.plantillas_correo', false, true),
  ('public.envios', false, true), ('public.solicitudes', false, true)
-- La 240000 (#110) dejó envios como solo bajada: la cola tiene que subir, así que aquí se corrige
on conflict (nombre) do update set subible = excluded.subible;
do $$
declare t text;
begin
  foreach t in array array['public.empresa_contactos', 'public.plantillas_correo', 'public.envios', 'public.solicitudes'] loop
    execute format('alter table %s add column if not exists version bigint not null default 1', t);
    execute format('drop trigger if exists sync_version on %s', t);
    execute format('create trigger sync_version before insert or update on %s for each row execute function sync.versionar()', t);
    execute format('drop trigger if exists sync_anotar on %s', t);
    execute format('create trigger sync_anotar after insert or update or delete on %s for each row execute function sync.anotar()', t);
  end loop;
end $$;
