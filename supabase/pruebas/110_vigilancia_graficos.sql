-- Datos de los gráficos del informe de vigilancia (vigilancia_series). Usa los datos de la prueba 70 (empresa B).
\pset tuples_only on
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false) \g /dev/null
select 'meses del trimestre feb-abr (debe 3): ' || jsonb_array_length(s -> 'por_mes') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') s;
select 'consultas de marzo (debe 1): ' || (s -> 'por_mes' -> 1 ->> 'consultas') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') s;
select 'días de reposo de marzo (debe 7): ' || (s -> 'por_mes' -> 1 ->> 'dias_reposo') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') s;
select 'días de reposo de abril, cortados al período (debe 5): ' || (s -> 'por_mes' -> 2 ->> 'dias_reposo') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') s;
select 'lumbago en el capítulo osteomuscular (debe 1): ' || count(*) from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') s, jsonb_array_elements(s -> 'capitulos') c where c ->> 'nombre' = 'Osteomuscular';
select 'trabajador de 45 años en la pirámide 45-54 (debe 1): ' || count(*) from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') s, jsonb_array_elements(s -> 'piramide') g where g ->> 'grupo' = '45-54' and (g ->> 'M')::int >= 1;
select 'informe nuevo sin análisis guardado (debe 0): ' || count(*) from public.informes_vigilancia i, jsonb_object_keys(i.analisis) k;
-- RR. HH. de la empresa A no ve la empresa B ni datos clínicos
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RRHH-A: pirámide de B (debe 0): ' || jsonb_array_length(s -> 'piramide') from public.vigilancia_series('20000000-0000-0000-0000-00000000000b','2026-02-01','2026-04-30') s;
select 'RRHH-A: capítulos CIE-10 (debe 0): ' || jsonb_array_length(s -> 'capitulos') from public.vigilancia_series(null,'2026-01-01','2026-12-31') s;
reset role;
select 'anon no ejecuta vigilancia_series (debe 0): ' || has_function_privilege('anon','public.vigilancia_series(uuid,date,date)','execute')::int;
