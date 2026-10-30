-- Guardián A10 (Analizar, 30-oct): las funciones de los códigos de respaldo (20261030180000) se revocaron solo «from
-- anon», pero en Postgres toda función nace ejecutable por PUBLIC y anon la hereda por ahí. Ninguna era aprovechable
-- (todas exigen auth.uid() o un administrador), pero el freno va en el permiso, no solo dentro de la función.
revoke execute on function public.generar_codigos_respaldo() from public, anon;
revoke execute on function public.codigos_respaldo_restantes() from public, anon;
revoke execute on function public.usar_codigo_respaldo(text) from public, anon;
revoke execute on function public.reiniciar_dos_pasos(uuid) from public, anon;
grant execute on function public.generar_codigos_respaldo(), public.codigos_respaldo_restantes(),
  public.usar_codigo_respaldo(text), public.reiniciar_dos_pasos(uuid) to authenticated;
