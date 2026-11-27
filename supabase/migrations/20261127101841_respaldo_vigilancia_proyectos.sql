-- Suma los PDF privados por proyecto al inventario que ya usa el respaldo.
-- La Edge Function y su pase de un solo uso conservan su contrato.
create or replace function public.archivos_para_respaldo(p_desde timestamptz)
returns table (bucket text, nombre text, cambiado timestamptz, bytes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
    select o.bucket_id::text, o.name::text, coalesce(o.updated_at, o.created_at),
           coalesce((o.metadata ->> 'size')::bigint, 0)
      from storage.objects o
     where o.bucket_id in ('adjuntos', 'solicitudes', 'vigilancia-proyectos') and o.name is not null
       and coalesce(o.updated_at, o.created_at) > coalesce(p_desde, '-infinity'::timestamptz)
     order by 3;
end $$;
revoke execute on function public.archivos_para_respaldo(timestamptz) from public, anon, authenticated;
grant execute on function public.archivos_para_respaldo(timestamptz) to service_role;
