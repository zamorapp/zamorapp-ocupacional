-- RR. HH. reporta accidentes e incidentes de su empresa (Cesar, 13-nov-2026: «sí puedan reportar»).
-- Solo CREA el reporte inicial: no edita, no borra, no declara ni investiga (eso sigue siendo del servicio y de SST).
-- Enfermedad ocupacional no: es un diagnóstico médico. Al reportar, el servicio recibe el aviso en la campana.

-- 1. Permiso solo de INSERT, limitado a su empresa y a un reporte inicial limpio
drop policy if exists eventos_reportar_rrhh on public.eventos;
create policy eventos_reportar_rrhh on public.eventos for insert to authenticated
  with check (
    (org_id::text || empresa_id::text) = any ((select public.pares_limitados('{gerente_empresa}'))::text[])
    and tipo in ('accidente', 'incidente')
    and estado = 'abierto'
    and consulta_id is null
    and fecha_declaracion is null
    and numero_declaracion is null
    -- El lesionado, si lo hay, es de la misma empresa
    and (trabajador_id is null or exists (
      select 1 from public.trabajadores t where t.id = trabajador_id and t.empresa_id = eventos.empresa_id))
  );

-- 2. Lo que RR. HH. manda se limpia en la base (Analizar, 13-nov): solo quedan los datos del reporte.
-- Diagnóstico, discapacidad, incapacidad, certificación, investigación, declaración y origen los llena
-- el servicio después. Corre antes que los demás BEFORE INSERT (orden alfabético: «a_…»).
create or replace function public.limpiar_reporte_rrhh()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_numero int;
begin
  if public.mi_rol(new.org_id) is distinct from 'gerente_empresa' then return new; end if;
  -- El número lo pone la secuencia, nunca la mano
  begin
    v_numero := currval(pg_get_serial_sequence('public.eventos', 'numero'));
  exception when object_not_in_prerequisite_state then v_numero := null;
  end;
  if new.numero is distinct from v_numero then
    raise exception 'El número del evento lo asigna el sistema' using errcode = 'insufficient_privilege';
  end if;
  new.creado_por := auth.uid();
  new.creado_en := public.ahora();
  new.actualizado_en := public.ahora();
  new.estado := 'abierto';
  new.consulta_id := null;
  new.fecha_declaracion := null;
  new.numero_declaracion := null;
  new.naturaleza_lesion := null;
  new.agente := null;
  new.forma := null;
  new.con_tiempo_perdido := false;
  new.dias_perdidos := 0;
  new.dias_cargados := 0;
  new.cie10 := null;
  new.diagnostico := null;
  new.fecha_diagnostico := null;
  new.en_anexo1 := true;
  new.fecha_informe_nt02 := null;
  new.estado_certificacion := null;
  new.causas_inmediatas := null;
  new.causas_basicas := null;
  new.acciones := '[]'::jsonb;
  new.origen := null;
  new.codigo_origen := null;
  new.lote_importacion := null;
  new.acto_inseguro := null;
  new.condicion_insegura := null;
  new.incapacidad := null;
  new.cargos := '[]'::jsonb;
  new.observaciones := null;
  new.potencial_discapacidad := false;
  new.certificacion_fecha := null;
  new.certificacion_numero := null;
  new.discapacidad := null;
  new.discapacidad_pct := null;
  return new;
end $$;
revoke all on function public.limpiar_reporte_rrhh() from public, anon, authenticated;
drop trigger if exists a_limpiar_reporte_rrhh on public.eventos;
create trigger a_limpiar_reporte_rrhh before insert on public.eventos
  for each row execute function public.limpiar_reporte_rrhh();

-- 3. Aviso al servicio cuando lo reporta RR. HH. (sin diagnóstico: tipo, número, empresa y lugar)
create or replace function public.avisar_evento_rrhh()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_empresa text;
begin
  if public.mi_rol(new.org_id) is distinct from 'gerente_empresa' then return new; end if;
  select razon_social into v_empresa from public.empresas where id = new.empresa_id;
  insert into public.notificaciones (org_id, usuario_id, empresa_id, titulo, texto, enlace)
  select new.org_id, m.usuario_id, new.empresa_id,
         case new.tipo when 'accidente' then 'Accidente reportado por RR. HH.' else 'Incidente reportado por RR. HH.' end,
         '#' || new.numero || ' · ' || coalesce(v_empresa, '') || coalesce(' · ' || nullif(new.lugar, ''), '')
           || '. Revise y declare a tiempo.',
         '/accidentes/' || new.id
    from public.miembros m
   where m.org_id = new.org_id and m.activo
     and m.rol in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'coordinador_sst')
     and (m.empresas_permitidas is null or new.empresa_id = any (m.empresas_permitidas));
  return new;
end $$;
revoke all on function public.avisar_evento_rrhh() from public, anon, authenticated;

drop trigger if exists avisar_evento_rrhh on public.eventos;
create trigger avisar_evento_rrhh after insert on public.eventos
  for each row execute function public.avisar_evento_rrhh();
