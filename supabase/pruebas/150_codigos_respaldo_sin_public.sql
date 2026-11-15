-- Códigos de respaldo: anon no ejecuta ninguna de sus funciones; authenticated sí.
\pset tuples_only on
select 'anon no ejecuta las funciones de códigos de respaldo (debe 0): ' || count(*)
  from unnest(array['public.generar_codigos_respaldo()', 'public.codigos_respaldo_restantes()',
                    'public.usar_codigo_respaldo(text)', 'public.reiniciar_dos_pasos(uuid)']) f
 where has_function_privilege('anon', f, 'execute');
select 'authenticated sí las ejecuta (debe 4): ' || count(*)
  from unnest(array['public.generar_codigos_respaldo()', 'public.codigos_respaldo_restantes()',
                    'public.usar_codigo_respaldo(text)', 'public.reiniciar_dos_pasos(uuid)']) f
 where has_function_privilege('authenticated', f, 'execute');
