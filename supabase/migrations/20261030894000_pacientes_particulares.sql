-- zamorApp · Pacientes particulares sin empresa (Cesar, 05-nov-2026): «la empresa que se llama Particular realmente
-- no es una empresa, son pacientes particulares que registro; crearlo como un tipo de paciente o categoría que se
-- puede atender sin empresa».
--
-- Decisión (cinco líneas):
--   · trabajadores, consultas, cobros y otras 23 tablas exigen empresa_id (RLS, réplica del escritorio, reportes).
--     Volverlo opcional obligaba a rehacer todo eso: alto riesgo para el dato clínico.
--   · En su lugar, la organización tiene UNA «bolsa» marcada empresas.es_particular. La app no la muestra como empresa:
--     se registra con «Particular (sin empresa)», no sale en Empresas, RR. HH., vigilancia ni Inicio.
--   · Nada se mueve: los 25 pacientes y 15 consultas de «PARTICULAR» quedan donde están (mismos ids, misma historia).
--   · Deshacer: Empresas › Particulares › «Volver a tratar como empresa» (quitar_particulares), con bitácora.
--
-- 1. Columna + una sola bolsa por organización.
-- 2. Marca la fila existente (coincidencia exacta del nombre, solo en la nube; a la PC llega por la réplica).
-- 3. empresa_particulares(): id de la bolsa (la crea si falta) para el registro rápido.
-- 4. RR. HH. nunca entra a la bolsa: ni invitaciones ni empresas_permitidas de roles de empresa.
-- 5. Vigilancia, Inicio y alertas por empresa: «todas las empresas» = sin particulares.
-- 6. vistas_al_dia (columna nueva en empresas).

-- ─── 1. Columna ───
alter table public.empresas add column if not exists es_particular boolean not null default false;
create unique index if not exists empresas_una_particular on public.empresas (org_id) where es_particular;
comment on column public.empresas.es_particular is
  'Bolsa de pacientes particulares (sin empresa). Una por organización. No es una empresa: fuera de listas, RR. HH. y vigilancia.';

-- ─── 2. La «empresa» PARTICULAR heredada del SAME pasa a ser la bolsa ───
do $$
declare r record;
begin
  if public.es_base_local() then return; end if;
  for r in
    select distinct on (e.org_id) e.id, e.org_id, e.razon_social
      from public.empresas e
     where upper(trim(e.razon_social)) in ('PARTICULAR', 'PARTICULARES', 'PACIENTES PARTICULARES')
       and not exists (select 1 from public.empresas x where x.org_id = e.org_id and x.es_particular)
     order by e.org_id, (select count(*) from public.trabajadores t where t.empresa_id = e.id) desc
  loop
    -- Exámenes vencidos y post vacacional no aplican a un particular; resultados y próxima evaluación sí (clínicos)
    update public.empresas
       set es_particular = true, activa = true, razon_social = 'Pacientes particulares',
           ignorar_alerta_legal = true,
           avisos_apagados = (select array(select distinct unnest(coalesce(avisos_apagados, '{}') || '{vencimientos,post_vacacional}'::text[])))
     where id = r.id;
    insert into public.bitacora (org_id, accion, tabla, registro_id, despues)
    values (r.org_id, 'marcar_particulares', 'empresas', r.id,
            jsonb_build_object('nombre_anterior', r.razon_social,
                               'trabajadores', (select count(*) from public.trabajadores t where t.empresa_id = r.id),
                               'consultas', (select count(*) from clinico.consultas c where c.empresa_id = r.id),
                               'motivo', 'Cesar 05-nov: Particular no es una empresa'));
  end loop;
end $$;

-- ─── 3. Id de la bolsa (la crea si la organización aún no tiene) ───
create or replace function public.empresa_particulares()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select m.org_id into v_org from public.miembros m
   where m.usuario_id = auth.uid() and m.activo
     and m.rol in ('administrador', 'gerente_medico', 'medico', 'enfermeria', 'recepcion')
   order by m.creado_en limit 1;
  if v_org is null then raise exception 'Solo el personal del servicio registra pacientes particulares' using errcode = '42501'; end if;
  select id into v_id from public.empresas where org_id = v_org and es_particular;
  if v_id is null then
    insert into public.empresas (org_id, razon_social, rif, es_particular, ignorar_alerta_legal, avisos_apagados)
    values (v_org, 'Pacientes particulares', 'PARTICULARES', true, true, '{vencimientos,post_vacacional}')
    on conflict (org_id, rif) do update set es_particular = true
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke execute on function public.empresa_particulares() from public, anon;
grant execute on function public.empresa_particulares() to authenticated;

-- Deshacer (solo administrador): la bolsa vuelve a ser una empresa común, con su nombre anterior
create or replace function public.quitar_particulares(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_nombre text;
begin
  select org_id into v_org from public.empresas where id = p_empresa and es_particular;
  if v_org is null then raise exception 'No es la bolsa de particulares'; end if;
  if not public.es_admin(v_org) then raise exception 'Solo el administrador' using errcode = '42501'; end if;
  select b.despues ->> 'nombre_anterior' into v_nombre from public.bitacora b
   where b.registro_id = p_empresa and b.accion = 'marcar_particulares' order by b.en desc limit 1;
  update public.empresas set es_particular = false, razon_social = coalesce(v_nombre, 'PARTICULAR') where id = p_empresa;
  insert into public.bitacora (org_id, accion, tabla, registro_id, despues)
  values (v_org, 'quitar_particulares', 'empresas', p_empresa, jsonb_build_object('nombre', coalesce(v_nombre, 'PARTICULAR')));
  return jsonb_build_object('id', p_empresa, 'nombre', coalesce(v_nombre, 'PARTICULAR'));
end $$;
revoke execute on function public.quitar_particulares(uuid) from public, anon;
grant execute on function public.quitar_particulares(uuid) to authenticated;

-- ─── 4. RR. HH. nunca entra a la bolsa ───
create or replace function public.particulares_sin_rrhh()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'invitaciones' then
    if exists (select 1 from public.empresas e where e.id = new.empresa_id and e.es_particular) then
      raise exception 'Los pacientes particulares no tienen RR. HH.: no se puede invitar a esa «empresa»' using errcode = '23514';
    end if;
  elsif new.rol in ('gerente_empresa', 'supervisor', 'delegado_prevencion', 'trabajador', 'auditor')
        and exists (select 1 from public.empresas e where e.id = any (coalesce(new.empresas_permitidas, '{}')) and e.es_particular) then
    raise exception 'Los pacientes particulares no tienen RR. HH.: quita «Pacientes particulares» de sus empresas' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists particulares_sin_rrhh on public.invitaciones;
create trigger particulares_sin_rrhh before insert or update of empresa_id on public.invitaciones
  for each row execute function public.particulares_sin_rrhh();
drop trigger if exists particulares_sin_rrhh on public.miembros;
create trigger particulares_sin_rrhh before insert or update of rol, empresas_permitidas on public.miembros
  for each row execute function public.particulares_sin_rrhh();

-- ─── 5. «Todas las empresas» = sin particulares (vigilancia, Inicio, vencimientos) ───
-- Se corrige el texto de la definición vigente (la última de cada función), sin copiarla entera: si una migración
-- futura la redefine sin el filtro, la prueba 203 falla.
do $$
declare
  f record;
  v_def text;
  v_nueva text;
begin
  for f in select * from (values
    ('public.reporte_vigilancia(uuid,date,date)', '(p_empresa is null or t.empresa_id = p_empresa)',
       '(p_empresa is null and not exists (select 1 from public.empresas ep where ep.id = t.empresa_id and ep.es_particular) or t.empresa_id = p_empresa)'),
    ('public.reporte_vigilancia(uuid,date,date)', '(p_empresa is null or e.empresa_id = p_empresa)',
       '(p_empresa is null and not exists (select 1 from public.empresas ep where ep.id = e.empresa_id and ep.es_particular) or e.empresa_id = p_empresa)'),
    ('public.vigilancia_series(uuid,date,date)', '(p_empresa is null or t.empresa_id = p_empresa)',
       '(p_empresa is null and not exists (select 1 from public.empresas ep where ep.id = t.empresa_id and ep.es_particular) or t.empresa_id = p_empresa)'),
    ('public.vigilancia_complemento(uuid,date,date)', '(p_empresa is null or t.empresa_id = p_empresa)',
       '(p_empresa is null and not exists (select 1 from public.empresas ep where ep.id = t.empresa_id and ep.es_particular) or t.empresa_id = p_empresa)'),
    ('public.resumen_panel(uuid)', '(p_empresa is null and e.activa)', '(p_empresa is null and e.activa and not e.es_particular)'),
    ('public.vencimientos_empresas()', 'where e.activa', 'where e.activa and not e.es_particular')
  ) as x(fn, viejo, nuevo)
  loop
    v_def := pg_get_functiondef(f.fn::regprocedure);
    if position(f.nuevo in v_def) > 0 then continue; end if; -- ya corregida
    if position(f.viejo in v_def) = 0 then raise exception 'pacientes_particulares: % cambió; no se encontró «%»', f.fn, f.viejo; end if;
    v_nueva := replace(v_def, f.viejo, f.nuevo);
    execute v_nueva;
  end loop;
end $$;

-- ─── 6. Vistas públicas con la columna nueva ───
select public.vistas_al_dia();
