-- Cola de atención en vivo: publica los cambios de citas en Supabase Realtime.
-- Realtime aplica la RLS de citas a cada suscriptor, así que nadie recibe filas que no puede ver.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'citas') then
    alter publication supabase_realtime add table public.citas;
  end if;
end $$;
