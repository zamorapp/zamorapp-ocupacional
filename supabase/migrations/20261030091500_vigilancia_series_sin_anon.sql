-- zamorApp Ocupacional · vigilancia_series sin acceso anónimo (auditoría A9)
-- La migración 20261028143000 ya lo hace, pero si se aplicó una copia anterior a ese cambio, anon conserva
-- el permiso por los privilegios por defecto de Supabase. Esto lo deja igual en cualquier base (idempotente).
revoke execute on function public.vigilancia_series(uuid, date, date) from public, anon;
grant execute on function public.vigilancia_series(uuid, date, date) to authenticated;
