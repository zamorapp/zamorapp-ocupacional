-- zamorApp · Local primero: la campana de «resultados por recibir» también sin internet.
-- recordar_resultados() corre al abrir Inicio o Atención. Sin internet la puerta la corre en la copia de la PC (los
-- avisos salen en la campana al momento) y la guarda como constancia; al volver la conexión la nube la vuelve a
-- correr para ese usuario con sus propios datos, y la PC borra los avisos que había creado (los de la nube bajan
-- con la sincronía). Sin datos nuevos: no hay args, ni hora que validar.
create or replace function public.constancia_diferida(p_equipo uuid, p_secreto text, p_id uuid, p_rpc text, p_args jsonb,
                                                       p_hora timestamptz, p_hora_verificada boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_hora timestamptz := case when coalesce(p_hora_verificada, false) and p_hora <= now() + interval '5 minutes'
                                  and p_hora >= now() - interval '30 days' then least(p_hora, now()) end;
begin
  if auth.uid() is null then raise exception 'Inicia sesión' using errcode = '42501'; end if;
  -- Como todo lo que sube desde una PC (aplicar_cambios): con el segundo paso cumplido
  if not public.dos_pasos_cumplido() then
    raise exception 'Falta la verificación en dos pasos para subir cambios desde este equipo' using errcode = '42501';
  end if;
  v_org := sync.equipo_valido(p_equipo, p_secreto);
  perform set_config('sync.equipo_id', p_equipo::text, true);
  insert into sync.constancias_aplicadas (id, equipo_id) values (p_id, p_equipo) on conflict (id) do nothing;
  if not found then return 'duplicado'; end if;

  if p_rpc = 'registrar_lectura_laboratorio' then
    perform public.registrar_lectura_laboratorio((p_args ->> 'p_consulta')::uuid, (p_args ->> 'p_adjunto')::uuid,
      p_args ->> 'p_cedula_leida', (p_args ->> 'p_cedula_coincide')::boolean, (p_args ->> 'p_cedula_ignorada')::boolean,
      (p_args ->> 'p_examenes')::integer);
    -- La fila que acaba de dejar (misma transacción: en = now()): lleva la hora de la PC y de qué equipo vino
    update public.bitacora set en = coalesce(v_hora, en), equipo_id = p_equipo,
           despues = despues || jsonb_build_object('registrada_sin_internet', true, 'hora_verificada', v_hora is not null)
     where usuario_id = auth.uid() and tabla = 'clinico.lectura_laboratorio' and en = now()
       and registro_id = (p_args ->> 'p_consulta')::uuid;
  elsif p_rpc = 'registrar_acceso' then
    perform public.registrar_acceso((p_args ->> 'p_trabajador')::uuid, (p_args ->> 'p_consulta')::uuid, p_equipo);
    update public.accesos set en = coalesce(v_hora, en), llego_en = now()
     where usuario_id = auth.uid() and en = now() and llego_en is null and trabajador_id = (p_args ->> 'p_trabajador')::uuid;
  elsif p_rpc = 'recordar_resultados' then
    -- La campana de resultados pendientes: la nube la vuelve a calcular con sus datos y su fecha (las consultas de la
    -- PC ya subieron); los avisos que la PC creó sin internet los borra la puerta al recibir «aplicado»
    perform public.recordar_resultados();
  else
    raise exception 'Constancia desconocida: %', p_rpc using errcode = '22023';
  end if;
  return 'aplicado';
end $$;
revoke execute on function public.constancia_diferida(uuid, text, uuid, text, jsonb, timestamptz, boolean) from public, anon;
grant execute on function public.constancia_diferida(uuid, text, uuid, text, jsonb, timestamptz, boolean) to authenticated;
