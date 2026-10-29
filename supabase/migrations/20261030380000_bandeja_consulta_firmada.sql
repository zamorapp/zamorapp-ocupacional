-- zamorApp Ocupacional · Consulta creada y firmada en la PC sin internet
-- La bandeja funde en un solo cambio todo lo que le pasó a una fila mientras no hubo internet: una consulta
-- abierta, cerrada y firmada en la PC llega a la nube como un INSERT ya «firmada», y proteger_autoria lo negaba
-- («no puede crearse ya firmada»), así que la consulta quedaba en Rechazados y nunca subía.
-- Ahora, solo al aplicar la bandeja (sync.cambio_id), se acepta con la misma regla de validar_firma: firma el
-- médico que atendió (o el gerente médico / administrador), nunca enfermería, y la consulta trae su hora de
-- cierre. La hora de firma la decide hora_oficial: si no venía verificada, la nube pone la suya.
-- Sus diagnósticos, aptitud y reposo suben después (en el mismo lote o en el siguiente): consulta_abierta los deja
-- pasar solo si los aplica la bandeja de la misma PC que firmó y nadie tocó la consulta desde entonces.
create or replace function public.proteger_autoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario;
begin
  if auth.uid() is null then return new; end if;
  v_rol := public.mi_rol(new.org_id);
  if tg_op = 'INSERT' then
    new.medico_id := coalesce(new.medico_id, auth.uid());
    if new.medico_id <> auth.uid() and v_rol is distinct from 'gerente_medico' and v_rol is distinct from 'administrador' then
      raise exception 'La consulta queda a nombre de quien la crea.';
    end if;
    if new.estado = 'firmada' or new.firmada_en is not null then
      if coalesce(current_setting('sync.cambio_id', true), '') = '' or new.estado is distinct from 'firmada'
         or new.hora_cierre is null or new.firmada_en is null then
        raise exception 'Una consulta no puede crearse ya firmada: se firma después de cerrarla.';
      end if;
      if not (public.es_clinico(new.org_id) and v_rol is distinct from 'enfermeria'
              and (new.medico_id = auth.uid() or v_rol in ('gerente_medico', 'administrador'))) then
        raise exception 'Solo el médico que atendió (o el gerente médico) puede firmar esta consulta.';
      end if;
    end if;
  elsif new.medico_id is distinct from old.medico_id
        and v_rol is distinct from 'gerente_medico' and v_rol is distinct from 'administrador' then
    raise exception 'Solo el gerente médico o el administrador cambian el médico de una consulta.';
  end if;
  return new;
end $$;
revoke execute on function public.proteger_autoria() from authenticated, anon, public;

-- El aviso de aptitud a la empresa tampoco depende de que la consulta llegue como UPDATE: si llega ya cerrada o
-- firmada en un INSERT, el mismo aviso corre al crearla (la aptitud que suba después avisa por avisar_aptitud).
drop trigger if exists avisar_aptitud_al_crear_cerrada on clinico.consultas;
create trigger avisar_aptitud_al_crear_cerrada after insert on clinico.consultas
  for each row when (new.estado in ('cerrada', 'firmada') and not public.es_base_local())
  execute function public.avisar_aptitud_al_cerrar();

-- Filas hijas de una consulta firmada en la PC: las sube la bandeja de esa misma PC (sync.equipo_id) y el último
-- cambio de la consulta en la nube es el suyo. Una firma hecha en la web, o un cambio posterior, las sigue negando.
-- Ventana abierta mientras nadie toque la consulta: hoy basta porque la base local niega hijas de una firmada.
create or replace function public.consulta_abierta(p_consulta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select estado <> 'firmada' from clinico.consultas where id = p_consulta), true)
      or (coalesce(current_setting('sync.equipo_id', true), '') <> ''
          and (select r.equipo_id from sync.registro r
                where r.tabla = 'clinico.consultas' and r.fila_id = p_consulta
                order by r.version desc, r.seq desc limit 1) = nullif(current_setting('sync.equipo_id', true), '')::uuid)
$$;

-- ═══ Corregir una consulta firmada sin internet (pedido de Cesar, 29-oct; revisado por Analizar) ═══
-- En la PC, reabrir_consulta corre en la base local (solo con la hora anclada y el segundo paso, igual que firmar):
-- guarda la versión firmada en consultas_versiones y deja la consulta en borrador con revision + 1. La bandeja sube
-- la versión y la consulta con la sesión del autor. En la nube:
--  · la versión solo entra por la bandeja (sync.equipo_id) y con la regla de reabrir; si la nube tiene la consulta
--    firmada en esa revisión, el contenido se toma de la nube (nunca de la copia de la PC). Si la nube nunca vio la
--    firma (se firmó y corrigió sin internet), vale la copia de la PC, siempre que el último cambio de la consulta
--    sea de esa misma PC. reabierta_por y reabierta_en los pone la nube.
--  · la consulta firmada solo cambia por la bandeja si existe esa versión, con revision + 1 exacta.
--  · si la web u otra PC la tocó entre tanto, aplicar_cambios da conflicto por version_base; si otra corrección ya
--    subió esa revisión, la versión se rechaza (unique consulta_id, revision). Nada se pierde: queda en la bandeja.
create or replace function public.reabrir_consulta(p_id uuid, p_motivo text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  c clinico.consultas;
  v_rol public.rol_usuario;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Inicia sesión para corregir la consulta.'; end if;
  -- En la PC: la versión guardada lleva la hora oficial; sin hora verificada se espera a internet, como firmar
  if public.es_base_local() and public.ahora_de_la_puerta() is null then
    raise exception 'Para corregir sin internet, esta PC necesita la hora verificada: conéctala a internet una vez y vuelve a intentarlo.';
  end if;
  select * into c from clinico.consultas where id = p_id for update;
  if not found or not public.es_clinico(c.org_id) or not public.ve_consulta(c.org_id, c.id) then
    raise exception 'Consulta no encontrada o sin acceso.';
  end if;
  if c.estado <> 'firmada' then raise exception 'La consulta no está firmada: se edita directamente.'; end if;
  v_rol := public.mi_rol(c.org_id);
  if v_rol is not distinct from 'enfermeria'
     or not (c.medico_id is null or c.medico_id = v_uid or v_rol in ('gerente_medico', 'administrador')) then
    raise exception 'Solo el médico que atendió (o el gerente médico) puede corregir esta consulta.';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe el motivo de la corrección (al menos 10 caracteres).';
  end if;

  insert into clinico.consultas_versiones (org_id, consulta_id, revision, firmada_en, contenido, motivo, reabierta_por, reabierta_en)
  values (c.org_id, c.id, c.revision, c.firmada_en, jsonb_build_object(
      'consulta', to_jsonb(c),
      'diagnosticos', coalesce((select jsonb_agg(to_jsonb(d) order by d.principal desc, d.cie10) from clinico.diagnosticos d where d.consulta_id = c.id), '[]'),
      'aptitud', (select to_jsonb(a) from clinico.aptitudes a where a.consulta_id = c.id),
      'reposo', (select to_jsonb(r) from clinico.reposos r where r.consulta_id = c.id)),
    trim(p_motivo), v_uid, public.ahora())
  -- Una corrección de la PC que chocó con la web dejó guardada esta misma versión (copiada de la nube, que no cambia
  -- mientras está firmada): se conserva y se sigue
  on conflict (consulta_id, revision) do nothing;
  -- Si esa versión la dejó otra persona, la bitácora dice quién reabrió de verdad, con su motivo y la hora
  if exists (select 1 from clinico.consultas_versiones v where v.consulta_id = c.id and v.revision = c.revision and v.reabierta_por <> v_uid) then
    insert into public.bitacora (org_id, usuario_id, tabla, registro_id, accion, despues)
    values (c.org_id, v_uid, 'clinico.consultas_versiones', c.id, 'REABRIR',
            jsonb_build_object('revision', c.revision, 'motivo', trim(p_motivo), 'reabierta_en', public.ahora(),
                               'nota', 'La versión guardada la dejó otra corrección (de una PC) antes que esta'));
  end if;

  update clinico.consultas
     set estado = 'borrador', firmada_en = null, hora_cierre = null, revision = c.revision + 1
   where id = c.id;
  return c.revision + 1;
end $$;
revoke execute on function public.reabrir_consulta(uuid, text) from anon, public;
grant execute on function public.reabrir_consulta(uuid, text) to authenticated;

-- La versión sube desde la PC: solo estas columnas (reabierta_por y reabierta_en las pone la nube)
update sync.tablas set subible = true where nombre = 'clinico.consultas_versiones';
grant insert (id, org_id, consulta_id, revision, firmada_en, contenido, motivo) on clinico.consultas_versiones to authenticated;
drop policy if exists consultas_versiones_bandeja on clinico.consultas_versiones;
create policy consultas_versiones_bandeja on clinico.consultas_versiones for insert to authenticated
  with check (coalesce(current_setting('sync.equipo_id', true), '') <> '' and public.es_clinico(org_id));

create or replace function public.version_desde_la_pc()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c clinico.consultas;
  v_uid uuid := auth.uid();
  v_rol public.rol_usuario;
  v_equipo uuid := nullif(current_setting('sync.equipo_id', true), '')::uuid;
begin
  if public.es_base_local() or v_equipo is null then return new; end if; -- web: reabrir_consulta (la política niega lo demás)
  select * into c from clinico.consultas where id = new.consulta_id;
  if not found or c.org_id <> new.org_id then raise exception 'Consulta no encontrada o sin acceso.'; end if;
  v_rol := public.mi_rol(c.org_id);
  if v_uid is null or not public.es_clinico(c.org_id) or v_rol is not distinct from 'enfermeria'
     or not (c.medico_id is null or c.medico_id = v_uid or v_rol in ('gerente_medico', 'administrador')) then
    raise exception 'Solo el médico que atendió (o el gerente médico) puede corregir esta consulta.';
  end if;
  if c.estado = 'firmada' and c.revision = new.revision then
    -- Lo firmado está en la nube: la versión guardada es la de la nube, no la copia que manda la PC
    new.firmada_en := c.firmada_en;
    new.contenido := jsonb_build_object(
      'consulta', to_jsonb(c),
      'diagnosticos', coalesce((select jsonb_agg(to_jsonb(d) order by d.principal desc, d.cie10) from clinico.diagnosticos d where d.consulta_id = c.id), '[]'),
      'aptitud', (select to_jsonb(a) from clinico.aptitudes a where a.consulta_id = c.id),
      'reposo', (select to_jsonb(r) from clinico.reposos r where r.consulta_id = c.id));
  elsif c.revision = new.revision + 1
        and (select r.equipo_id from sync.registro r where r.tabla = 'clinico.consultas' and r.fila_id = c.id
              order by r.version desc, r.seq desc limit 1) = v_equipo
        and new.contenido #>> '{consulta,estado}' = 'firmada' and new.firmada_en is not null then
    -- Firmada y corregida sin internet: la nube nunca vio la firma; vale la copia de la PC que hizo las dos cosas
    null;
  else
    raise exception 'La consulta cambió en la nube mientras se corregía en la PC: revisa la corrección.';
  end if;
  new.reabierta_por := v_uid;
  new.reabierta_en := now();
  return new;
end $$;
revoke execute on function public.version_desde_la_pc() from public, anon, authenticated;
drop trigger if exists version_desde_la_pc on clinico.consultas_versiones;
create trigger version_desde_la_pc before insert on clinico.consultas_versiones
  for each row execute function public.version_desde_la_pc();

-- La consulta firmada solo cambia por la bandeja si su versión ya está guardada (y solo revision + 1)
drop policy if exists consultas_firmadas_no_editar on clinico.consultas;
create policy consultas_firmadas_no_editar on clinico.consultas as restrictive for update
  using (estado <> 'firmada'
         or (coalesce(current_setting('sync.equipo_id', true), '') <> ''
             and exists (select 1 from clinico.consultas_versiones v
                          where v.consulta_id = consultas.id and v.revision = consultas.revision and v.reabierta_por = auth.uid())))
  with check (true);

create or replace function public.corregir_desde_la_pc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol public.rol_usuario;
begin
  if public.es_base_local() or coalesce(current_setting('sync.equipo_id', true), '') = '' or old.estado <> 'firmada' then return new; end if;
  if new.revision is distinct from old.revision + 1
     or not exists (select 1 from clinico.consultas_versiones v where v.consulta_id = old.id and v.revision = old.revision and v.reabierta_por = auth.uid()) then
    raise exception 'Una consulta firmada solo se corrige con «Corregir» (versión guardada y revisión siguiente).';
  end if;
  if new.estado = 'firmada' then -- corregida y vuelta a firmar en la PC: misma regla de firma que validar_firma
    v_rol := public.mi_rol(new.org_id);
    if new.firmada_en is null or not (public.es_clinico(new.org_id) and v_rol is distinct from 'enfermeria'
         and (new.medico_id is null or new.medico_id = auth.uid() or v_rol in ('gerente_medico', 'administrador'))) then
      raise exception 'Solo el médico que atendió (o el gerente médico) puede firmar esta consulta.';
    end if;
  else
    new.firmada_en := null;
  end if;
  return new;
end $$;
revoke execute on function public.corregir_desde_la_pc() from public, anon, authenticated;
drop trigger if exists corregir_desde_la_pc on clinico.consultas;
create trigger corregir_desde_la_pc before update on clinico.consultas
  for each row execute function public.corregir_desde_la_pc();

-- Corregida y vuelta a firmar en un solo cambio (firmada → firmada con revisión nueva): los enlaces a la versión
-- anterior también se revocan, como cuando pasa por borrador
drop trigger if exists revocar_enlaces_al_corregir on clinico.consultas;
create trigger revocar_enlaces_al_corregir after update of revision on clinico.consultas
  for each row when (old.estado = 'firmada' and new.estado = 'firmada' and new.revision <> old.revision and not public.es_base_local())
  execute function public.revocar_enlaces_consulta();
