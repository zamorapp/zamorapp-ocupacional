-- RR. HH. envía estudios digitalizados (Rx, eco, espirometría, audiometría, ECG, laboratorio) al expediente del
-- trabajador (Cesar, 30-oct). Lo que RR. HH. sube es SOLO para el personal de salud: entra a clinico.adjuntos, que la
-- empresa no puede leer (adjuntos_clinico es la única política permisiva), y al bucket privado «adjuntos», donde
-- RR. HH. solo puede crear su archivo: ni verlo, ni listarlo, ni borrarlo después.
-- Ruta del archivo: <org>/<trabajador>/rrhh-<uuid>-<nombre>; solo para trabajadores de las empresas que ve.

-- validar_adjunto: un archivo de la ficha (sin consulta) también se puede ligar a un estudio, siempre que sea un examen
-- del catálogo de paraclínicos de la organización (historial de estudios del expediente). En una consulta sigue igual:
-- solo los exámenes solicitados en ella. Se cambia solo esa línea (texto exacto, una vez) para no pisar otras reglas.
do $$
declare
  v_def text := pg_get_functiondef('public.validar_adjunto()'::regprocedure);
  v_viejo text := 'if new.consulta_id is null then raise exception ''Para ligarlo a un examen, el archivo debe estar en la consulta.''; end if;';
  v_n int := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
begin
  if v_n <> 1 then
    raise exception 'validar_adjunto: la regla de exámenes sin consulta aparece % veces (se esperaba 1)', v_n;
  end if;
  execute replace(v_def, v_viejo, 'if new.consulta_id is null then
      select x into v_falta from unnest(new.examenes) x
       where not exists (select 1 from public.lista_items i where i.id::text = x and i.org_id = new.org_id and i.lista = ''paraclinico'') limit 1;
      if v_falta is not null then raise exception ''Ese estudio no está en el catálogo de paraclínicos.''; end if;
      return new;
    end if;');
end $$;

drop policy if exists adjuntos_empresa_entregar on storage.objects;
create policy adjuntos_empresa_entregar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'adjuntos'
    and array_length(string_to_array(name, '/'), 1) = 3
    and (string_to_array(name, '/'))[3] like 'rrhh-%'
    and public.es_empresa(((storage.foldername(name))[1])::uuid)
    and public.ve_trabajador(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::uuid));

-- Registra el archivo ya subido en el expediente y avisa al personal médico que atiende esa empresa.
-- Devuelve el id del adjunto (RR. HH. no puede leer la fila después).
create or replace function public.entregar_estudio(p_trabajador uuid, p_ruta text, p_nombre text, p_tipo_mime text,
  p_tamano int, p_examen uuid default null, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_empresa uuid; v_trabajador text; v_examen text; v_id uuid;
begin
  select org_id, empresa_id, nombres || ' ' || apellidos into v_org, v_empresa, v_trabajador from public.trabajadores where id = p_trabajador;
  if v_uid is null or v_org is null or not public.es_empresa(v_org) or not public.ve_trabajador(v_org, p_trabajador) then
    raise exception 'No puedes enviar estudios de este trabajador.' using errcode = '42501';
  end if;
  if p_ruta is null or p_ruta not like v_org || '/' || p_trabajador || '/rrhh-%' or p_ruta like '%..%'
     or array_length(string_to_array(p_ruta, '/'), 1) <> 3 then
    raise exception 'Ruta de archivo no válida.' using errcode = '22023';
  end if;
  -- El archivo tiene que existir en el bucket y ser de quien lo registra (owner_id en Supabase)
  if not exists (select 1 from storage.objects o where o.bucket_id = 'adjuntos' and o.name = p_ruta
                   and coalesce(to_jsonb(o) ->> 'owner_id', v_uid::text) = v_uid::text) then
    raise exception 'El archivo no se subió.' using errcode = '22023';
  end if;
  if p_tipo_mime not in ('application/pdf', 'image/jpeg', 'image/png') or p_tamano not between 1 and 10485760 then
    raise exception 'Solo PDF o fotos de hasta 10 MB.' using errcode = '22023';
  end if;
  -- Tope por persona y día (Caracas): evita llenar el almacenamiento gratis
  if (select count(*) from clinico.adjuntos where subido_por = v_uid and public.fecha_caracas(creado_en) = public.hoy_caracas()) >= 40 then
    raise exception 'Ya enviaste 40 estudios hoy. Sigue mañana.' using errcode = '54000';
  end if;
  if p_examen is not null then
    select nombre into v_examen from public.lista_items where id = p_examen and org_id = v_org and lista = 'paraclinico';
  end if;
  insert into clinico.adjuntos (org_id, trabajador_id, consulta_id, nombre, ruta, tipo_mime, tamano, descripcion, examenes, subido_por)
  values (v_org, p_trabajador, null, left(coalesce(nullif(btrim(p_nombre), ''), 'Estudio'), 200), p_ruta, p_tipo_mime, p_tamano,
          left('Enviado por RR. HH.' || coalesce(': ' || nullif(btrim(p_nota), ''), ''), 500),
          case when v_examen is null then '{}'::text[] else array[p_examen::text] end, v_uid)
  returning id into v_id;
  -- Aviso al personal médico de la organización que ve esa empresa (nunca a la empresa)
  insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
  select v_org, m.usuario_id, v_empresa, 'Estudio recibido de RR. HH.',
         v_trabajador || coalesce(' · ' || v_examen, ''), '/pacientes/' || p_trabajador
    from public.miembros m
   where m.org_id = v_org and m.activo and m.rol in ('administrador', 'gerente_medico', 'medico')
     and (m.empresas_permitidas is null or v_empresa = any (m.empresas_permitidas));
  return v_id;
end $$;
revoke all on function public.entregar_estudio(uuid, text, text, text, int, uuid, text) from public, anon;
grant execute on function public.entregar_estudio(uuid, text, text, text, int, uuid, text) to authenticated;
