-- Correo de «Proponer otra hora» con reintento (coordinador, 04-nov): antes se marcaba como enviado ANTES de mandarlo,
-- y si el envío fallaba no salía nunca y nadie se enteraba. Ahora:
--   · correos_propuestas_por_enviar toma las propuestas pendientes (o con reintento vencido) y las deja «enviando».
--   · la ruta /api/avisos/campana manda el correo y avisa el resultado con resultado_correo_propuesta.
--   · si falla, se reintenta en el siguiente latido (espera 5 min × intentos); al 3.er fallo, o si la empresa no tiene
--     ningún correo, queda «fallido» y el servicio recibe «No salió el correo de la propuesta» (campana y celular).
--   · si la ruta se cae a mitad (sin resultado), a los 10 min se vuelve a tomar.

alter table public.citas
  add column if not exists propuesta_correo_estado text,
  add column if not exists propuesta_correo_intentos smallint not null default 0,
  add column if not exists propuesta_correo_error text;
alter table public.citas drop constraint if exists citas_propuesta_correo_estado;
alter table public.citas add constraint citas_propuesta_correo_estado check (
  propuesta_correo_estado in ('enviando', 'reintentar', 'enviado', 'fallido')
  and coalesce(length(propuesta_correo_error), 0) <= 300);

-- Las propuestas que ya tenían el correo marcado (versión anterior) cuentan como enviadas
update public.citas set propuesta_correo_estado = 'enviado'
 where propuesta_correo_en is not null and propuesta_correo_estado is null and propuesta_fecha is not null;

-- RR. HH. (empresa) no toca la propuesta ni su correo, recordatorio o respuesta (Analizar, 04-nov): la política
-- citas_empresa_cancelar le deja actualizar sus citas «solicitada» en cualquier columna y así podía reiniciar el
-- correo (reenvíos sin límite desde la cuenta del servicio) o marcarlo «enviado» para esconder un fallo.
-- Su respuesta va solo por responder_propuesta (security definer: este trigger no la ve como 'authenticated').
create or replace function public.cita_portal_en_horario()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user is distinct from 'authenticated' or not public.es_empresa(new.org_id) then return new; end if;
  if tg_op = 'UPDATE' and (new.propuesta_fecha, new.propuesta_desde, new.propuesta_hasta, new.propuesta_modo, new.propuesta_nota)
       is distinct from (old.propuesta_fecha, old.propuesta_desde, old.propuesta_hasta, old.propuesta_modo, old.propuesta_nota) then
    raise exception 'La hora propuesta solo la cambia el servicio médico.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.propuesta_en, new.propuesta_recordada_en, new.propuesta_correo_en, new.propuesta_correo_estado,
                           new.propuesta_correo_intentos, new.propuesta_correo_error, new.respuesta_empresa)
       is distinct from (old.propuesta_en, old.propuesta_recordada_en, old.propuesta_correo_en, old.propuesta_correo_estado,
                         old.propuesta_correo_intentos, old.propuesta_correo_error, old.respuesta_empresa) then
    raise exception 'Los avisos de la hora propuesta solo los maneja el servicio médico.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and (new.propuesta_fecha is not null or new.propuesta_en is not null or new.propuesta_recordada_en is not null
       or new.propuesta_correo_en is not null or new.propuesta_correo_estado is not null or new.propuesta_correo_intentos <> 0
       or new.propuesta_correo_error is not null or new.respuesta_empresa is not null) then
    raise exception 'La hora propuesta solo la pone el servicio médico.' using errcode = '42501';
  end if;
  if new.estado = 'solicitada' and (tg_op = 'INSERT' or (new.fecha, new.hora) is distinct from (old.fecha, old.hora)) then
    perform public.validar_hora_portal(new.org_id, new.fecha, new.hora, new.id);
  end if;
  return new;
end $$;
revoke execute on function public.cita_portal_en_horario() from public, anon;

-- Proponer de nuevo reinicia también el correo
create or replace function public.propuesta_de_cita()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.propuesta_fecha is not null and (tg_op = 'INSERT' or (new.propuesta_fecha, new.propuesta_desde, new.propuesta_hasta, new.propuesta_modo)
       is distinct from (old.propuesta_fecha, old.propuesta_desde, old.propuesta_hasta, old.propuesta_modo)) then
    -- Lo que sube del escritorio trae su hora (la de la PC al proponer); en la web la pone la base
    if current_user in ('authenticated', 'anon') or new.propuesta_en is null then new.propuesta_en := public.ahora(); end if;
    new.propuesta_recordada_en := null;
    new.propuesta_correo_en := null;
    new.propuesta_correo_estado := null;
    new.propuesta_correo_intentos := 0;
    new.propuesta_correo_error := null;
    new.respuesta_empresa := null;
  elsif new.propuesta_fecha is null then
    new.propuesta_desde := null; new.propuesta_hasta := null; new.propuesta_modo := null; new.propuesta_nota := null;
  end if;
  return new;
end $$;
revoke execute on function public.propuesta_de_cita() from public, anon, authenticated;

-- Aviso al servicio cuando el correo de una propuesta no salió (interno)
create or replace function public.avisar_correo_propuesta_fallido(p_citas uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select c.org_id, c.empresa_id, c.propuesta_fecha, c.propuesta_desde, c.propuesta_hasta, c.propuesta_modo,
           max(c.propuesta_correo_error) as error, count(*) as n
      from public.citas c where c.id = any (p_citas) and c.propuesta_correo_estado = 'fallido'
     group by 1, 2, 3, 4, 5, 6
  loop
    perform public.notificar(r.org_id, r.empresa_id, 'servicio', 'No salió el correo de la propuesta',
      (select razon_social from public.empresas where id = r.empresa_id) || ' · ' || r.n
        || case when r.n = 1 then ' trabajador · ' else ' trabajadores · ' end
        || public.texto_propuesta(r.propuesta_fecha, r.propuesta_desde, r.propuesta_hasta, r.propuesta_modo)
        || coalesce(' · ' || r.error, '') || ' · RR. HH. sí la ve en su portal; puedes avisarle por WhatsApp',
      '/atencion?dia=' || r.propuesta_fecha);
  end loop;
end $$;
revoke execute on function public.avisar_correo_propuesta_fallido(uuid[]) from public, anon, authenticated;

-- Toma los correos por enviar (cambia lo que devuelve: ahora incluye las citas para informar el resultado)
drop function if exists public.correos_propuestas_por_enviar(text);
create function public.correos_propuestas_por_enviar(p_clave text)
returns table (citas uuid[], para text[], asunto text, texto text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_org uuid;
  v_caidas uuid[];
begin
  if length(coalesce(p_clave, '')) < 32 then return; end if;
  select org_id into v_org from public.avisos_push_clave where clave_hash = v_hash;
  if v_org is null then return; end if;

  -- Envíos que quedaron a mitad 10 min (la ruta se cayó) y ya no tienen intentos: fallidos, con aviso al servicio
  with caidas as (
    update public.citas c set propuesta_correo_estado = 'fallido',
           propuesta_correo_error = coalesce(c.propuesta_correo_error, 'El envío no terminó')
     where c.org_id = v_org and c.propuesta_correo_estado = 'enviando' and c.propuesta_correo_intentos >= 3
       and c.propuesta_correo_en <= public.ahora() - interval '10 minutes'
    returning c.id)
  select array_agg(id) into v_caidas from caidas;
  if v_caidas is not null then perform public.avisar_correo_propuesta_fallido(v_caidas); end if;

  return query
    with marcadas as (
      update public.citas c set propuesta_correo_estado = 'enviando', propuesta_correo_en = public.ahora(),
             propuesta_correo_intentos = c.propuesta_correo_intentos + 1
       where c.org_id = v_org
         and c.estado = 'solicitada' and c.propuesta_fecha is not null and c.propuesta_fecha >= public.hoy_caracas()
         and c.propuesta_correo_intentos < 3
         and (c.propuesta_correo_estado is null
              or (c.propuesta_correo_estado = 'reintentar' and c.propuesta_correo_en <= public.ahora() - interval '5 minutes' * c.propuesta_correo_intentos)
              or (c.propuesta_correo_estado = 'enviando' and c.propuesta_correo_en <= public.ahora() - interval '10 minutes'))
      returning c.id, c.org_id, c.empresa_id, c.trabajador_id, c.propuesta_fecha, c.propuesta_desde, c.propuesta_hasta, c.propuesta_modo, c.propuesta_nota
    ), grupos as (
      select m.org_id, m.empresa_id, m.propuesta_fecha, m.propuesta_desde, m.propuesta_hasta, m.propuesta_modo, m.propuesta_nota,
             array_agg(m.id) as ids,
             string_agg(t.nombres || ' ' || t.apellidos, ', ' order by t.apellidos) as nombres, count(*) as n
        from marcadas m join public.trabajadores t on t.id = m.trabajador_id
       group by 1, 2, 3, 4, 5, 6, 7
    )
    select g.ids,
           array(select distinct x from unnest(
             array(select u.email::text from public.miembros mi join auth.users u on u.id = mi.usuario_id
                    where mi.org_id = g.org_id and mi.activo and mi.rol = 'gerente_empresa' and g.empresa_id = any (mi.empresas_permitidas)
                      and u.email is not null)
             || array(select ec.correo from public.empresa_contactos ec
                       where ec.empresa_id = g.empresa_id and ec.activo and ec.correo is not null)) x),
           'Nueva hora propuesta por el servicio médico · ' || public.texto_propuesta(g.propuesta_fecha, g.propuesta_desde, g.propuesta_hasta, g.propuesta_modo),
           concat_ws(E'\n',
             'Buen día. ' || o.nombre || ' le propone otra hora para ' || case when g.n = 1 then 'la evaluación de ' else 'las evaluaciones de ' end || g.nombres || ':',
             '',
             '  ' || public.texto_propuesta(g.propuesta_fecha, g.propuesta_desde, g.propuesta_hasta, g.propuesta_modo),
             case when g.propuesta_nota is not null then '  Nota: ' || g.propuesta_nota end,
             '',
             'Para aceptarla o pedir otra hora, entre al portal:')
      from grupos g join public.organizaciones o on o.id = g.org_id;
end $$;
revoke execute on function public.correos_propuestas_por_enviar(text) from public;
grant execute on function public.correos_propuestas_por_enviar(text) to anon, authenticated;

-- Resultado del envío (la ruta, con la clave del servidor). Solo toca citas «enviando» de la organización de la clave.
-- p_definitivo: no vale la pena reintentar (p. ej. la empresa no tiene ningún correo).
create or replace function public.resultado_correo_propuesta(p_clave text, p_citas uuid[], p_ok boolean, p_error text, p_definitivo boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hash bytea := sha256(convert_to(coalesce(p_clave, ''), 'UTF8'));
  v_org uuid;
  v_fallidas uuid[];
  v_n integer;
begin
  if length(coalesce(p_clave, '')) < 32 or p_citas is null or cardinality(p_citas) > 500 then return 0; end if;
  select org_id into v_org from public.avisos_push_clave where clave_hash = v_hash;
  if v_org is null then return 0; end if;
  with hechas as (
    update public.citas c set
           propuesta_correo_estado = case when p_ok then 'enviado'
                                          when coalesce(p_definitivo, false) or c.propuesta_correo_intentos >= 3 then 'fallido'
                                          else 'reintentar' end,
           propuesta_correo_error = case when p_ok then null else left(coalesce(nullif(btrim(p_error), ''), 'Error al enviar'), 300) end
     where c.id = any (p_citas) and c.org_id = v_org and c.propuesta_correo_estado = 'enviando'
    returning c.id, c.propuesta_correo_estado)
  select count(*), array_agg(id) filter (where propuesta_correo_estado = 'fallido') into v_n, v_fallidas from hechas;
  if v_fallidas is not null then perform public.avisar_correo_propuesta_fallido(v_fallidas); end if;
  return v_n;
end $$;
revoke execute on function public.resultado_correo_propuesta(text, uuid[], boolean, text, boolean) from public;
grant execute on function public.resultado_correo_propuesta(text, uuid[], boolean, text, boolean) to anon, authenticated;

select public.vistas_al_dia();
