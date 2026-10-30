-- zamorApp · Avisos por empresa y alertas editables (Cesar, 30-oct): «tengo empresas con las que trabajo muy poco y
-- otras constantemente: poder desactivar las alertas en unas y activarlas en otras, y poder editar las alertas».
-- 1. empresas.avisos_apagados: qué avisos NO salen para esa empresa. Solo apaga recordatorios (Inicio y campana);
--    los reportes y la ficha del trabajador siguen mostrando todo. Los plazos legales de accidentes (INPSASEL) no se apagan.
--      vencimientos        exámenes periódicos vencidos o por vencer en Inicio
--      proxima_evaluacion  campana de «Alerta para la próxima evaluación» (en la consulta la alerta sigue saliendo)
--      resultados          campana de «Resultados por recibir»
--    El aviso de datos legales ya tiene su propio interruptor (ignorar_alerta_legal).
-- 2. Alerta para la próxima evaluación: pendiente, se corrige el texto y la fecha (su autor o el médico).

alter table public.empresas add column if not exists avisos_apagados text[] not null default '{}';
alter table public.empresas drop constraint if exists empresas_avisos_apagados_validos;
alter table public.empresas add constraint empresas_avisos_apagados_validos
  check (avisos_apagados <@ array['vencimientos', 'proxima_evaluacion', 'resultados']::text[]);

create or replace function public.recordar_alertas()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select a.id, a.org_id, a.empresa_id, a.revisar_antes, a.trabajador_id, t.nombres || ' ' || t.apellidos as nombre
      from clinico.alertas_clinicas a
      join public.trabajadores t on t.id = a.trabajador_id
      left join clinico.consultas c on c.id = a.consulta_id
      left join public.empresas e on e.id = a.empresa_id
      left join public.recordatorios_alertas x on x.alerta_id = a.id and x.usuario_id = v_uid
     where a.estado = 'pendiente' and a.revisar_antes is not null
       and not ('proxima_evaluacion' = any (coalesce(e.avisos_apagados, '{}'))) and a.revisar_antes <= v_hoy + 3
       and (a.org_id = any (public.orgs_con(p_clinico => true, p_sin_limite => true))
            or (a.org_id::text || a.empresa_id::text) = any (public.pares_limitados(p_clinico => true)))
       and not (btrim(a.texto) = '' and c.id is not null and public.paraclinicos_pendientes(c.paraclinicos) > 0)
       and (x.ultimo_aviso is null or (a.revisar_antes <= v_hoy and public.fecha_caracas(x.ultimo_aviso) < a.revisar_antes))
     order by a.revisar_antes
     limit 20
  loop
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    values (r.org_id, v_uid, r.empresa_id, 'Alerta para la próxima evaluación',
      r.nombre || case when r.revisar_antes < v_hoy then ' · venció el ' when r.revisar_antes = v_hoy then ' · vence hoy, ' else ' · revisar antes del ' end
        || to_char(r.revisar_antes, 'DD/MM/YYYY'),
      '/pacientes/' || r.trabajador_id);
    insert into public.recordatorios_alertas (alerta_id, usuario_id, org_id, ultimo_aviso)
    values (r.id, v_uid, r.org_id, now())
    on conflict (alerta_id, usuario_id) do update set ultimo_aviso = excluded.ultimo_aviso;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

create or replace function public.recordar_resultados()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoy date := public.hoy_caracas();
  v_total integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  for r in
    select c.id, c.org_id, c.empresa_id, c.fecha, public.paraclinicos_pendientes(c.paraclinicos) as faltan,
           t.nombres || ' ' || t.apellidos as nombre
    from clinico.consultas c
    join public.miembros m on m.org_id = c.org_id and m.usuario_id = v_uid and m.activo
      and m.rol in ('administrador', 'gerente_medico', 'medico')
    join public.organizaciones o on o.id = c.org_id
    join public.trabajadores t on t.id = c.trabajador_id
    left join public.empresas e on e.id = c.empresa_id
    left join public.recordatorios_resultados x on x.consulta_id = c.id and x.usuario_id = v_uid
    cross join lateral (select case when o.ajustes ->> 'recordatorio_resultados_dias' ~ '^[0-9]{1,3}$' then (o.ajustes ->> 'recordatorio_resultados_dias')::int else 3 end as dias) a
    where c.medico_id = v_uid
      and not ('resultados' = any (coalesce(e.avisos_apagados, '{}')))
      and c.origen is null
      and c.estado in ('borrador', 'cerrada')
      and a.dias > 0
      and c.fecha <= v_hoy - a.dias
      and c.fecha >= v_hoy - 60
      and public.paraclinicos_pendientes(c.paraclinicos) > 0
      and not coalesce(x.ignorado, false)
      and (x.ultimo_aviso is null or x.ultimo_aviso <= now() - make_interval(days => a.dias))
    order by c.fecha
    limit 20
  loop
    insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
    values (r.org_id, v_uid, r.empresa_id, 'Resultados por recibir',
      r.nombre || ' · ' || case when r.faltan = 1 then 'falta 1 resultado' else 'faltan ' || r.faltan || ' resultados' end
        || ' (consulta del ' || to_char(r.fecha, 'DD/MM/YYYY') || ')',
      '/atencion/' || r.id || '?paso=paraclinicos');
    insert into public.recordatorios_resultados (consulta_id, usuario_id, org_id, ultimo_aviso)
    values (r.id, v_uid, r.org_id, now())
    on conflict (consulta_id, usuario_id) do update set ultimo_aviso = excluded.ultimo_aviso;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

create or replace function public.proteger_alerta_clinica()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bandeja boolean := coalesce(current_setting('sync.cambio_id', true), '') <> '';
  v_auto boolean := coalesce(current_setting('zamorapp.cierre_automatico', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    select t.empresa_id into new.empresa_id from public.trabajadores t where t.id = new.trabajador_id and t.org_id = new.org_id;
    if not found then raise exception 'El trabajador no es de esta organización.'; end if;
    if new.consulta_id is not null and not exists (
        select 1 from clinico.consultas c where c.id = new.consulta_id and c.trabajador_id = new.trabajador_id and c.org_id = new.org_id) then
      raise exception 'La consulta no es de ese trabajador.';
    end if;
    new.texto := btrim(new.texto);
    new.estado := 'pendiente';
    new.respuesta := null; new.revisada_por := null; new.revisada_en := null; new.revisada_en_consulta := null; new.automatica := false;
    -- Desde la bandeja se respetan autor y hora de la PC (la hora la marca hora_oficial si no venía verificada)
    if not v_bandeja or new.creada_por is null then new.creada_por := v_uid; end if;
    if not v_bandeja then new.creada_en := public.ahora(); end if;
    return new;
  end if;

  -- Lo que se escribió al crearla no cambia
  new.org_id := old.org_id; new.empresa_id := old.empresa_id; new.trabajador_id := old.trabajador_id; new.consulta_id := old.consulta_id;
  new.paraclinicos := old.paraclinicos; new.creada_por := old.creada_por; new.creada_en := old.creada_en;
  -- Editar (Cesar, 30-oct): mientras está pendiente, su autor o el médico corrigen el texto y la fecha «revisar antes de».
  -- La bitácora guarda el texto anterior. Ya revisada o descartada, nada cambia (abajo).
  new.texto := btrim(coalesce(new.texto, ''));
  if old.estado <> 'pendiente' then
    new.texto := old.texto;
  elsif (new.texto is distinct from old.texto or new.revisar_antes is distinct from old.revisar_antes) and not v_bandeja
        and not (coalesce(v_uid = old.creada_por, false) or old.org_id = any (public.orgs_con('{administrador,gerente_medico,medico}'))) then
    raise exception 'La alerta la corrige quien la dejó o el médico.' using errcode = '42501';
  end if;
  new.actualizado_en := public.ahora();

  -- Ya revisada o descartada: gana la primera revisión (otra PC que revisó después no la pisa)
  if old.estado <> 'pendiente' then
    new.estado := old.estado; new.respuesta := old.respuesta; new.revisada_por := old.revisada_por; new.revisada_en := old.revisada_en;
    new.revisada_en_consulta := old.revisada_en_consulta; new.automatica := old.automatica; new.revisar_antes := old.revisar_antes;
    return new;
  end if;

  if new.estado = 'pendiente' then
    new.respuesta := null; new.revisada_por := null; new.revisada_en := null; new.revisada_en_consulta := null; new.automatica := false;
    return new;
  end if;

  -- Revisar o descartar: solo médico, gerente médico o administrador (el cierre por resultados lo hace la base)
  if v_auto then
    new.automatica := true; new.revisada_por := null;
  else
    if v_uid is null or not old.org_id = any (public.orgs_con('{administrador,gerente_medico,medico}')) then
      raise exception 'La alerta la marca revisada el médico.' using errcode = '42501';
    end if;
    new.automatica := false;
    new.revisada_por := v_uid;
  end if;
  new.respuesta := nullif(btrim(coalesce(new.respuesta, '')), '');
  if new.revisada_en_consulta is not null and not exists (
      select 1 from clinico.consultas c where c.id = new.revisada_en_consulta and c.trabajador_id = old.trabajador_id) then
    new.revisada_en_consulta := null;
  end if;
  if not v_bandeja or new.revisada_en is null then new.revisada_en := public.ahora(); end if;
  return new;
end $$;

select public.vistas_al_dia();
