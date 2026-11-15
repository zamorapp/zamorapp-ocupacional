-- Conclusiones frecuentes y perfiles de examen físico (Cesar, 30-oct): cada organización recibe su copia editable,
-- los perfiles con opciones traen sus llaves y RR. HH. no lee las conclusiones (texto clínico).
\pset tuples_only on
reset role;
select 'conclusiones en la organización (debe 8): ' || count(*) from public.lista_items where lista = 'conclusion_consulta' and org_id = '10000000-0000-0000-0000-000000000001';
select 'perfiles nuevos en la organización (debe 4): ' || count(*) from public.lista_items where lista = 'perfil_examen_fisico' and org_id = '10000000-0000-0000-0000-000000000001'
  and codigo in ('hernia_umbilical', 'anillo_umbilical', 'hernia_inguinal', 'escoliosis');
select 'inguinal y escoliosis con opciones (debe 2): ' || count(*) from public.lista_items where lista = 'perfil_examen_fisico' and org_id = '10000000-0000-0000-0000-000000000001'
  and texto ~ '\{[^{}]+\|[^{}]+\}';
select 'redacción médica: aponeurótico (debe 2): ' || count(*) from public.lista_items where lista = 'perfil_examen_fisico' and org_id = '10000000-0000-0000-0000-000000000001'
  and codigo like 'hernia_%' and texto like '%defecto aponeurótico%';
select 'conclusiones son lista clínica (debe 1): ' || public.lista_clinica('conclusion_consulta')::int;
select 'la regla sigue cubriendo los perfiles (debe 1): ' || public.lista_clinica('perfil_examen_fisico')::int;
-- Volver a correr la migración no duplica nada
\set QUIET on
\i supabase/migrations/20261030720000_conclusiones_y_perfiles_examen.sql
select 'sin duplicados al repetir (debe 8): ' || count(*) from public.lista_items where lista = 'conclusion_consulta' and org_id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
select 'RR. HH. no lee las conclusiones de la organización (debe 0): ' || count(*) from public.lista_items where lista = 'conclusion_consulta' and org_id is not null;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false) \g /dev/null
select 'el médico sí (debe 8): ' || count(*) from public.lista_items where lista = 'conclusion_consulta' and org_id is not null;
reset role;
