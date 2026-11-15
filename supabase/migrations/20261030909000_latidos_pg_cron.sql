-- Latidos puntuales desde Supabase (pg_cron + pg_net, incluidos en el plan gratis).
-- Causa: el cron de GitHub Actions («Avisos al celular», */15) corría cada 4 a 7 horas (05-nov: 06:27, 14:54, 21:25,
-- 01:45Z) porque GitHub atrasa o salta los cron programados. Los avisos al celular, el correo diario de constancias
-- a RR. HH. y la tasa BCV salían con horas de atraso.
-- Arreglo: la base llama las mismas rutas de Vercel a la hora exacta. Las rutas no reciben secretos (la clave vive
-- en Vercel), solo devuelven conteos y cada envío sale una sola vez, así que llamarlas de más no repite nada.
-- GitHub queda como respaldo cada hora. En la PC (base local) y donde no exista pg_cron no hace nada.
do $migracion$
begin
  if public.es_base_local() then
    raise notice 'Base local: los latidos corren solo en la nube';
    return;
  end if;
  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_cron o pg_net no están disponibles aquí (%): los latidos siguen por GitHub', sqlerrm;
    return;
  end;
  -- pg_net solo para la base (trigger security definer y estos latidos): los usuarios de la app no pueden pedir URL
  -- desde el servidor (riesgo SSRF, Analizar 06-nov)
  revoke usage on schema net from anon, authenticated;
  revoke execute on all functions in schema net from anon, authenticated, public;

  -- cron.schedule con nombre reemplaza el trabajo si ya existe: la migración se puede correr dos veces
  -- Avisos de la campana al celular (plazos, resultados, alertas, exámenes por vencer, horas propuestas)
  perform cron.schedule('zamorapp-avisos-celular', '*/5 * * * *',
    $$select net.http_get(url := 'https://zamorapp-ocupacional.vercel.app/api/avisos/campana', timeout_milliseconds := 60000)$$);
  -- Correo diario de constancias: la base decide a qué empresa ya le toca (una vez al día por empresa)
  perform cron.schedule('zamorapp-constancias-dia', '*/15 * * * *',
    $$select net.http_get(url := 'https://zamorapp-ocupacional.vercel.app/api/envios/constancias-dia', timeout_milliseconds := 90000)$$);
  -- Tasa BCV: solo sale al BCV si falta la del día; si no, responde «al día» sin salir de Vercel
  perform cron.schedule('zamorapp-tasa-bcv', '*/30 * * * *',
    $$select net.http_get(url := 'https://zamorapp-ocupacional.vercel.app/api/tasa-bcv', timeout_milliseconds := 45000)$$);
  -- Limpieza: el historial de corridas de pg_cron crece ~500 filas al día; se guarda una semana
  perform cron.schedule('zamorapp-limpiar-latidos', '17 9 * * *',
    $$delete from cron.job_run_details where end_time < public.ahora() - interval '7 days'$$);
end $migracion$;
