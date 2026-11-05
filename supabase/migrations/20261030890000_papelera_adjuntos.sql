-- zamorApp · Papelera de 30 días para los archivos clínicos adjuntos (decisión de Cesar, 04-nov-2026).
-- Antes, «Borrar» un archivo (examen escaneado, resultado de laboratorio, imagen) lo eliminaba para siempre, con su
-- archivo. Ahora usa la papelera general (20261030795000, public.papelera) con cuatro piezas propias:
--  1. Nuevo tipo «adjunto».
--  2. Lo borra y lo restaura el personal clínico que ve al trabajador (médico, enfermería, gerente médico), no solo
--     el administrador. El motivo es opcional (se pone uno por defecto).
--  3. El archivo se queda en el almacenamiento 30 días; después la app lo quita y borra la entrada (purga en 2 pasos).
--  4. «Restaurar» desde la ficha del paciente (adjuntos_en_papelera).
-- Sin internet (copia local del escritorio) no se borra: la papelera vive en la nube.

alter table public.papelera drop constraint if exists papelera_tipo_check;
alter table public.papelera add constraint papelera_tipo_check check (tipo in ('consulta', 'trabajador', 'adjunto'));
-- Búsqueda de la papelera de un trabajador
create index if not exists papelera_adjunto_trabajador on public.papelera ((filas -> 0 -> 'f' ->> 'trabajador_id')) where tipo = 'adjunto';

-- Permiso común: personal clínico de la organización que ve a ese trabajador (lo mismo que para ver el archivo)
create or replace function public.puede_papelera_adjunto(p_org uuid, p_trabajador uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.es_clinico(p_org) and public.ve_trabajador(p_org, p_trabajador)
$$;

create or replace function public.eliminar_adjunto(p_id uuid, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if public.es_base_local() then
    raise exception 'Sin internet no se borran archivos: la papelera está en la nube. Vuelve a intentarlo con conexión.';
  end if;
  select ad.org_id, ad.trabajador_id, ad.nombre, ad.consulta_id, t.nombres, t.apellidos into a
    from clinico.adjuntos ad join public.trabajadores t on t.id = ad.trabajador_id where ad.id = p_id;
  if a.org_id is null or not public.puede_papelera_adjunto(a.org_id, a.trabajador_id) then
    raise exception 'No encontré ese archivo o no tienes permiso para borrarlo.' using errcode = '42501';
  end if;
  -- papelera_eliminar apaga los disparadores: la regla de validar_adjunto se revisa aquí
  if a.consulta_id is not null and exists (select 1 from clinico.consultas where id = a.consulta_id and estado = 'firmada') then
    raise exception 'La consulta está firmada: sus archivos no se cambian. Usa «Corregir».';
  end if;
  return public.papelera_eliminar(a.org_id, 'adjunto', 'clinico.adjuntos', p_id,
    format('Archivo «%s» · %s %s', a.nombre, a.nombres, a.apellidos),
    case when length(btrim(coalesce(p_motivo, ''))) >= 5 then p_motivo else 'Archivo borrado desde la ficha o la consulta' end);
end $$;

-- Papelera de archivos de un trabajador (últimos 30 días, sin restaurar)
create or replace function public.adjuntos_en_papelera(p_trabajador uuid)
returns table (id uuid, adjunto_id uuid, nombre text, consulta_id uuid, eliminado_en timestamptz, eliminado_por text, vence date)
language sql stable security definer set search_path = '' as $$
  select p.id, p.objeto_id, p.filas -> 0 -> 'f' ->> 'nombre', nullif(p.filas -> 0 -> 'f' ->> 'consulta_id', '')::uuid, p.eliminado_en,
         pf.nombre_completo, public.fecha_caracas(p.eliminado_en + interval '30 days')
    from public.papelera p
    left join public.perfiles pf on pf.id = p.eliminado_por
   where p.tipo = 'adjunto' and p.filas -> 0 -> 'f' ->> 'trabajador_id' = p_trabajador::text
     and p.restaurado_en is null and p.eliminado_en >= public.ahora() - interval '30 days'
     and public.puede_papelera_adjunto(p.org_id, p_trabajador)
   order by p.eliminado_en desc
$$;

-- Purga, paso 1: archivos vencidos que nadie volvió a usar, para quitarlos del almacenamiento
create or replace function public.adjuntos_vencidos(p_limite int default 50)
returns table (id uuid, ruta text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.filas -> 0 -> 'f' ->> 'ruta' from public.papelera p
   where p.tipo = 'adjunto' and p.restaurado_en is null and p.eliminado_en < public.ahora() - interval '30 days'
     and not exists (select 1 from clinico.adjuntos a where a.ruta = p.filas -> 0 -> 'f' ->> 'ruta')
     and public.es_clinico(p.org_id)
   order by p.eliminado_en
   limit least(greatest(p_limite, 1), 200)
$$;

-- Purga, paso 2: quita las entradas vencidas cuyo archivo ya se borró del almacenamiento. Devuelve cuántas.
create or replace function public.purgar_adjuntos(p_ids uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.papelera p
   where p.id = any (p_ids[1:200]) and p.tipo = 'adjunto' and p.restaurado_en is null
     and p.eliminado_en < public.ahora() - interval '30 days'
     and not exists (select 1 from clinico.adjuntos a where a.ruta = p.filas -> 0 -> 'f' ->> 'ruta')
     and public.es_clinico(p.org_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Restaurar (misma función de la papelera general; cambia quién puede y las reglas de los adjuntos)
create or replace function public.restaurar_papelera(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p record;
  v_tablas text[];
  v_pend jsonb;
  v_resto jsonb;
  v_cols text;
  e jsonb;
  v_vuelta int := 0;
  v_falla text;
begin
  select * into p from public.papelera where id = p_id for update;
  if p.id is null then raise exception 'Esa entrada de la papelera no existe.'; end if;
  -- Adjuntos: también los restaura el personal clínico que ve al trabajador, dentro de los 30 días (20261030890000)
  if not ((public.es_admin(p.org_id) and public.es_clinico(p.org_id))
          or (p.tipo = 'adjunto' and public.puede_papelera_adjunto(p.org_id, (p.filas -> 0 -> 'f' ->> 'trabajador_id')::uuid))) then
    raise exception 'Solo el administrador con acceso clínico puede restaurar.' using errcode = '42501';
  end if;
  if p.tipo = 'adjunto' and p.restaurado_en is null and p.eliminado_en < public.ahora() - interval '30 days' then
    raise exception 'Pasaron más de 30 días: ese archivo ya no se puede restaurar.';
  end if;
  -- Con los disparadores apagados, validar_adjunto no corre: no se devuelve un archivo a una consulta firmada
  if p.tipo = 'adjunto' and exists (select 1 from clinico.consultas c
       where c.id = nullif(p.filas -> 0 -> 'f' ->> 'consulta_id', '')::uuid and c.estado = 'firmada') then
    raise exception 'La consulta de ese archivo ya está firmada: usa «Corregir» y súbelo de nuevo, o súbelo a la ficha del paciente.';
  end if;
  if p.restaurado_en is not null then raise exception 'Ya se restauró el %.', to_char(p.restaurado_en at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'); end if;

  v_tablas := public.papelera_tablas(p.filas, p.enlaces);
  perform public.papelera_disparadores(v_tablas, false);

  -- Padres antes que hijas; si una fila espera a otra (orden cruzado), se reintenta en la vuelta siguiente
  v_pend := p.filas;
  while jsonb_array_length(v_pend) > 0 loop
    v_vuelta := v_vuelta + 1;
    v_resto := '[]'::jsonb;
    for e in select x from jsonb_array_elements(v_pend) x loop
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
        from pg_catalog.pg_attribute a
       where a.attrelid = (e ->> 't')::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      begin
        execute format('insert into %s (%s) overriding system value select %s from jsonb_populate_record(null::%s, $1)',
                       e ->> 't', v_cols, v_cols, e ->> 't')
          using e -> 'f';
      exception
        when foreign_key_violation then
          v_resto := v_resto || jsonb_build_array(e);
          get stacked diagnostics v_falla = message_text;
        when unique_violation then
          raise exception 'No se puede restaurar: ya existe otro registro igual (%). Si registraste de nuevo a este trabajador con la misma cédula, elimina o corrige ese registro primero.', e ->> 't';
      end;
    end loop;
    if jsonb_array_length(v_resto) = jsonb_array_length(v_pend) then
      raise exception 'No se puede restaurar: falta un dato del que depende (%). Si es una consulta de un trabajador eliminado, restaura primero al trabajador.', v_falla;
    end if;
    v_pend := v_resto;
  end loop;

  -- Vuelve a unir las hijas sueltas que siguen sin enlace (si alguien ya las cambió, se respeta lo nuevo)
  for e in select x from jsonb_array_elements(p.enlaces) x loop
    execute format('update %s x set %I = $2::%s where x.%I is null and (%s) = (select %s from jsonb_populate_record(null::%s, $1) r)',
                   e ->> 't', e ->> 'c',
                   (select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute where attrelid = (e ->> 't')::regclass and attname = e ->> 'c'),
                   e ->> 'c',
                   (select string_agg(format('x.%I', k), ', ') from jsonb_object_keys(e -> 'k') k),
                   (select string_agg(format('r.%I', k), ', ') from jsonb_object_keys(e -> 'k') k),
                   e ->> 't')
      using e -> 'k', e ->> 'v';
  end loop;

  perform public.papelera_disparadores(v_tablas, true);
  update public.papelera set restaurado_en = public.ahora(), restaurado_por = auth.uid() where id = p_id;
  insert into public.bitacora (org_id, usuario_id, tabla, registro_id, accion, antes, despues)
  values (p.org_id, auth.uid(), case p.tipo when 'consulta' then 'clinico.consultas' when 'adjunto' then 'clinico.adjuntos' else 'public.trabajadores' end, p.objeto_id,
          'RESTAURAR_DE_PAPELERA', null, jsonb_build_object('papelera_id', p.id, 'titulo', p.titulo));
  return p.titulo;
end $$;


revoke execute on function public.puede_papelera_adjunto(uuid, uuid), public.eliminar_adjunto(uuid, text), public.adjuntos_en_papelera(uuid),
  public.adjuntos_vencidos(int), public.purgar_adjuntos(uuid[]) from public, anon;
grant execute on function public.puede_papelera_adjunto(uuid, uuid), public.eliminar_adjunto(uuid, text), public.adjuntos_en_papelera(uuid),
  public.adjuntos_vencidos(int), public.purgar_adjuntos(uuid[]) to authenticated;
