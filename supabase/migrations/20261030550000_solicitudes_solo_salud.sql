-- zamorApp Ocupacional · Respuestas de solicitudes con datos médicos: solo el personal de salud
-- Riesgo corregido: si el servicio respondía una solicitud de RR. HH. con un informe médico, una referencia o un reposo
-- (PDF armado desde la consulta, con diagnósticos), RR. HH. lo podía descargar desde su portal, y también directo del
-- bucket con su sesión. Rompía la regla de Cesar: RR. HH. nunca ve diagnósticos.
-- Ahora cada respuesta lleva solo_salud (lo pone el servicio o la base, nunca la empresa):
--   · solo_salud = false: constancia de aptitud y constancia de atención (sin diagnóstico): RR. HH. la ve y la baja.
--   · solo_salud = true: todo lo demás (y por defecto cualquier archivo subido): RR. HH. ve solo el estado.
-- respuesta y documento_ruta dejan de leerse en la tabla; se leen en la vista solicitudes_respuesta, que a RR. HH.
-- solo le muestra las que no son solo_salud. El bucket aplica la misma regla.

alter table public.solicitudes add column if not exists solo_salud boolean not null default false;

-- Respuestas ya dadas con un documento que no es constancia: quedan solo para el personal de salud
update public.solicitudes set solo_salud = true
 where documento_ruta is not null
   and coalesce(documento_nombre, '') not in ('Constancia de aptitud.pdf', 'Constancia de atención médica.pdf');

-- La empresa nunca decide solo_salud; lo decide el servicio al responder (la app siempre lo manda: constancias = false,
-- documentos de la consulta = true, archivo subido = lo que elija, por defecto true).
create or replace function public.solo_salud_solicitud()
returns trigger language plpgsql set search_path = public as $$
begin
  -- La sincronía del escritorio (otro rol) trae el valor que ya decidió el servicio en la PC
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if public.es_empresa(new.org_id) then new.solo_salud := false; end if;
    return new;
  end if;
  if public.es_empresa(new.org_id) and not public.es_servicio(new.org_id) then
    new.solo_salud := old.solo_salud;
  end if;
  return new;
end $$;
drop trigger if exists solo_salud_solicitud on public.solicitudes;
create trigger solo_salud_solicitud before insert or update on public.solicitudes
  for each row execute function public.solo_salud_solicitud();

-- La tabla ya no entrega respuesta ni documento_ruta (ni siquiera al servicio: todos leen la vista).
-- OJO: una columna nueva en solicitudes necesita su propio grant select.
revoke select on public.solicitudes from authenticated;
grant select (id, org_id, empresa_id, tipo_id, tipo, trabajador_id, detalle, estado, documento_nombre, solicitada_por,
              creado_en, atendida_por, actualizado_en, version, en_proceso_en, respondida_en, solo_salud)
  on public.solicitudes to authenticated;

-- Mismo alcance que la política solicitudes_leer, separado en servicio (todo) y empresa (sin lo de salud)
create or replace view public.solicitudes_respuesta as
  select s.id, s.respuesta, s.documento_ruta
  from public.solicitudes s
  where s.org_id = any ((select public.orgs_con('{administrador,gerente_medico,medico,enfermeria,recepcion}', p_sin_limite => true))::uuid[])
     or (s.org_id::text || s.empresa_id::text) = any ((select public.pares_limitados('{administrador,gerente_medico,medico,enfermeria,recepcion}'))::text[])
     or (not s.solo_salud and (
           s.org_id = any ((select public.orgs_con('{gerente_empresa}', p_sin_limite => true))::uuid[])
        or (s.org_id::text || s.empresa_id::text) = any ((select public.pares_limitados('{gerente_empresa}'))::text[])));
revoke all on public.solicitudes_respuesta from public, anon;
grant select on public.solicitudes_respuesta to authenticated;

-- Bucket: la empresa solo lee el documento vigente de una respuesta que no es solo_salud
create or replace function public.ruta_solicitud_visible(p_ruta text, p_servicio boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_partes text[] := string_to_array(p_ruta, '/'); v_org uuid; v_emp uuid; v_sol uuid;
begin
  if cardinality(v_partes) <> 4 then return false; end if;
  begin
    v_org := v_partes[1]::uuid; v_emp := v_partes[2]::uuid; v_sol := v_partes[3]::uuid;
  exception when others then return false;
  end;
  if not exists (select 1 from public.solicitudes where id = v_sol and org_id = v_org and empresa_id = v_emp) then return false; end if;
  if not public.puede_ver_empresa(v_org, v_emp) then return false; end if;
  if public.es_servicio(v_org) then return true; end if;
  return not p_servicio and public.es_empresa(v_org)
     and exists (select 1 from public.solicitudes where id = v_sol and documento_ruta = p_ruta and not solo_salud);
end $$;
