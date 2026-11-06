-- zamorApp Ocupacional · WhatsApp al trabajador, segunda parte (decisiones de Cesar, 05-nov-2026 05:05 y 05:06)
--   1) Un solo enlace por envío, con los documentos que el médico marca para ese trabajador (récipe, informe, constancia,
--      reposo, dieta…). Cada documento sigue siendo una fila de enlaces_trabajador con sus propias reglas (ruta exacta,
--      firma, anulación) y su PDF; las filas de un mismo envío comparten «paquete». La llave de cada fila es
--      sha256(token || ':' || documento): el trabajador recibe un solo token y nadie puede abrir un documento que no se
--      le mandó.
--   2) Los documentos clínicos (todo salvo tensión, dieta y bienestar) piden los 4 últimos dígitos de la cédula del
--      trabajador. 5 intentos fallidos en un envío lo bloquean (el médico lo vuelve a enviar).
-- Aún no hay enlaces creados (el código de la primera parte sale con esta migración), así que las funciones se rehacen.

alter table public.enlaces_trabajador drop constraint if exists enlaces_trabajador_documento_check;
alter table public.enlaces_trabajador add constraint enlaces_trabajador_documento_check check (documento in (
  'recipe', 'orden', 'referencia', 'informe-trabajador', 'atencion', 'constancia', 'reposo', 'control-ta', 'dieta', 'bienestar'));
alter table public.enlaces_trabajador add column if not exists paquete uuid;
alter table public.enlaces_trabajador add column if not exists pide_cedula boolean not null default false;
create index if not exists enlaces_trabajador_paquete on public.enlaces_trabajador (paquete) where paquete is not null;
alter table public.enlaces_trabajador_aperturas add column if not exists exito boolean not null default true;

-- Igual que en 20261030891000, más: la cédula la decide el tipo de documento (nunca quien envía), la constancia de
-- aptitud y el reposo exigen la consulta firmada, y paquete/pide_cedula tampoco cambian después.
create or replace function public.validar_enlace_trabajador()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_consulta record;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.enviado_por := auth.uid(); end if;
    new.creado_en := now();
    new.revocado_en := null;
    new.revocado_por := null;
    if new.vence > now() + interval '7 days' then new.vence := now() + interval '7 days'; end if;
    select c.org_id, c.empresa_id, c.trabajador_id, c.estado into v_consulta from clinico.consultas c where c.id = new.consulta_id;
    new.empresa_id := v_consulta.empresa_id;
    if v_consulta.org_id is distinct from new.org_id or v_consulta.trabajador_id is distinct from new.trabajador_id then
      raise exception 'El documento no es de este trabajador';
    end if;
    if new.ruta !~ ('^/imprimir/' || new.documento || '/' || new.consulta_id::text || '(\?[A-Za-z0-9=&,._%-]*)?$') then
      raise exception 'La ruta no corresponde al documento';
    end if;
    new.con_cambios := new.ruta ~ '[?&]c=';
    new.pide_cedula := new.documento not in ('control-ta', 'dieta', 'bienestar');
    if new.pide_cedula and v_consulta.estado <> 'firmada' then
      raise exception 'Firma la consulta antes de enviar este documento';
    end if;
    return new;
  end if;
  if (new.id, new.org_id, new.empresa_id, new.trabajador_id, new.consulta_id, new.documento, new.ruta, new.con_cambios,
      new.telefono, new.token_hash, new.vence, new.enviado_por, new.creado_en, new.paquete, new.pide_cedula)
     is distinct from (old.id, old.org_id, old.empresa_id, old.trabajador_id, old.consulta_id, old.documento, old.ruta,
      old.con_cambios, old.telefono, old.token_hash, old.vence, old.enviado_por, old.creado_en, old.paquete, old.pide_cedula)
     or old.revocado_en is not null or new.revocado_en is null then
    raise exception 'Un enlace solo se puede anular';
  end if;
  new.revocado_en := now();
  new.revocado_por := auth.uid();
  delete from public.enlaces_trabajador_archivos where enlace_id = new.id;
  return new;
end $$;
revoke execute on function public.validar_enlace_trabajador() from public, anon, authenticated;

drop function if exists public.abrir_enlace_trabajador(text, text);

-- Documentos de un enlace (página /t/<token>): cuáles hay, cuáles piden cédula y cuáles siguen vigentes, más el nombre
-- y el teléfono del servicio para pedirlo de nuevo. No entrega ningún PDF ni anota aperturas.
create or replace function public.listar_enlace_trabajador(p_token text)
returns table (documento text, pide_cedula boolean, vigente boolean, bloqueado boolean, servicio text, telefono_servicio text)
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 40 or length(p_token) > 64 then return; end if;
  return query
  with filas as (
    select l.* from public.enlaces_trabajador l,
      unnest(array['recipe', 'orden', 'referencia', 'informe-trabajador', 'atencion', 'constancia', 'reposo',
                   'control-ta', 'dieta', 'bienestar']) d
    where l.token_hash = sha256(convert_to(p_token || ':' || d, 'UTF8'))
  ), fallos as (
    select count(*) n from public.enlaces_trabajador_aperturas a join filas f on f.id = a.enlace_id where not a.exito
  )
  select f.documento, f.pide_cedula, (f.revocado_en is null and f.vence >= now()), (select n from fallos) >= 5,
         o.nombre, o.telefono
  from filas f join public.organizaciones o on o.id = f.org_id
  order by f.creado_en, f.documento;
end $$;
revoke execute on function public.listar_enlace_trabajador(text) from public;
-- Pública a propósito (como abrir_enlace): el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.listar_enlace_trabajador(text) to anon, authenticated;

-- Un documento del enlace: el PDF solo si está vigente y, si es clínico, con los 4 últimos dígitos de la cédula.
-- error: 'no_disponible' (vencido, anulado o no enviado), 'cedula' (falta o no coincide) o 'bloqueado' (5 fallos).
-- Anota cada apertura y cada intento fallido. De paso borra los PDF de enlaces vencidos.
create or replace function public.abrir_enlace_trabajador(p_token text, p_documento text, p_cedula text default null, p_agente text default null)
returns table (nombre text, contenido_base64 text, error text)
language plpgsql security definer set search_path = public as $$
declare v_enlace public.enlaces_trabajador; v_fallos int; v_cedula text; v_dada text;
begin
  delete from public.enlaces_trabajador_archivos a using public.enlaces_trabajador l where l.id = a.enlace_id and l.vence < now();
  if p_token is null or length(p_token) < 40 or length(p_token) > 64 or p_documento is null or length(p_documento) > 40 then
    return query select null::text, null::text, 'no_disponible'::text; return;
  end if;
  select * into v_enlace from public.enlaces_trabajador where token_hash = sha256(convert_to(p_token || ':' || p_documento, 'UTF8'));
  if v_enlace.id is null or v_enlace.revocado_en is not null or v_enlace.vence < now() then
    return query select null::text, null::text, 'no_disponible'::text; return;
  end if;
  if v_enlace.pide_cedula then
    select count(*) into v_fallos from public.enlaces_trabajador_aperturas a join public.enlaces_trabajador l on l.id = a.enlace_id
     where not a.exito and (l.id = v_enlace.id or l.paquete = v_enlace.paquete);
    if v_fallos >= 5 then return query select null::text, null::text, 'bloqueado'::text; return; end if;
    select right(regexp_replace(t.cedula, '\D', '', 'g'), 4) into v_cedula from public.trabajadores t where t.id = v_enlace.trabajador_id;
    v_dada := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
    if v_dada = '' then return query select null::text, null::text, 'cedula'::text; return; end if;
    if length(v_cedula) < 4 or v_dada <> v_cedula then
      insert into public.enlaces_trabajador_aperturas (enlace_id, agente, exito) values (v_enlace.id, left(p_agente, 300), false);
      return query select null::text, null::text, case when v_fallos + 1 >= 5 then 'bloqueado' else 'cedula' end; return;
    end if;
  end if;
  insert into public.enlaces_trabajador_aperturas (enlace_id, agente, exito) values (v_enlace.id, left(p_agente, 300), true);
  return query select a.nombre, encode(a.contenido, 'base64'), null::text from public.enlaces_trabajador_archivos a where a.enlace_id = v_enlace.id;
end $$;
revoke execute on function public.abrir_enlace_trabajador(text, text, text, text) from public;
-- Pública a propósito (como abrir_enlace): el token es la llave y lo clínico además pide la cédula; línea base del guardián
grant execute on function public.abrir_enlace_trabajador(text, text, text, text) to anon, authenticated;
