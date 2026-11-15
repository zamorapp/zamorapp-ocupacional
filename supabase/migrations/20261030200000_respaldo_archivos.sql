-- zamorApp Ocupacional · Respaldo de los archivos (adjuntos, solicitudes) sin guardar ninguna llave nueva en la PC.
-- El respaldo de la PC, con la clave de la base que ya tiene, deja un pase de un solo uso (solo su huella sha256).
-- La función respaldo-archivos (Supabase, con su service_role que nunca sale de Supabase) canjea el pase y entrega
-- enlaces firmados de 10 minutos, solo de lectura, de los archivos cambiados desde la fecha que pide la PC.

create table if not exists public.pases_respaldo (
  huella text primary key check (length(huella) = 64),
  creado timestamptz not null default now(),
  usado timestamptz
);
-- Nadie de la app la ve: solo el dueño de la base (el respaldo) y las funciones de abajo
alter table public.pases_respaldo enable row level security;
revoke all on public.pases_respaldo from anon, authenticated;

-- Canjea el pase: válido una sola vez y por 10 minutos. Solo la función de Supabase (service_role) lo llama
create or replace function public.canjear_pase_respaldo(p_pase text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_huella text := encode(sha256(convert_to(coalesce(p_pase, ''), 'UTF8')), 'hex');
begin
  delete from public.pases_respaldo where creado < now() - interval '1 day';
  update public.pases_respaldo set usado = now()
   where huella = v_huella and usado is null and creado > now() - interval '10 minutes';
  return found;
end $$;
revoke execute on function public.canjear_pase_respaldo(text) from public, anon, authenticated;
grant execute on function public.canjear_pase_respaldo(text) to service_role;

-- Archivos cambiados desde una fecha, de los buckets con datos (no los huérfanos ya apartados)
create or replace function public.archivos_para_respaldo(p_desde timestamptz)
returns table (bucket text, nombre text, cambiado timestamptz, bytes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
    select o.bucket_id::text, o.name::text, coalesce(o.updated_at, o.created_at), coalesce((o.metadata ->> 'size')::bigint, 0)
      from storage.objects o
     where o.bucket_id in ('adjuntos', 'solicitudes') and o.name is not null
       and coalesce(o.updated_at, o.created_at) > coalesce(p_desde, '-infinity'::timestamptz)
     order by 3;
end $$;
revoke execute on function public.archivos_para_respaldo(timestamptz) from public, anon, authenticated;
grant execute on function public.archivos_para_respaldo(timestamptz) to service_role;

-- Cada respaldo de archivos también queda anotado (tipo «archivos») y el Inicio avisa si falla
alter table public.respaldos drop constraint if exists respaldos_tipo_check;
alter table public.respaldos add constraint respaldos_tipo_check check (tipo in ('respaldo', 'restauracion', 'archivos'));

create or replace function public.estado_respaldo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.miembros where usuario_id = auth.uid() and activo
                 and rol in ('administrador', 'gerente_medico')) then
    return null;
  end if;
  return jsonb_build_object(
    'ultimo', (select to_jsonb(r) - 'id' from public.respaldos r where tipo = 'respaldo' order by fecha desc limit 1),
    'ultimo_ok', (select to_jsonb(r) - 'id' from public.respaldos r where tipo = 'respaldo' and estado in ('ok', 'aviso') order by fecha desc limit 1),
    'ultima_restauracion', (select to_jsonb(r) - 'id' from public.respaldos r where tipo = 'restauracion' order by fecha desc limit 1),
    'ultimo_archivos', (select to_jsonb(r) - 'id' from public.respaldos r where tipo = 'archivos' order by fecha desc limit 1));
end $$;
revoke execute on function public.estado_respaldo() from public, anon;
grant execute on function public.estado_respaldo() to authenticated;
