-- «Firmar y sellar PDF» deja rastro en la bitácora; solo el médico firmante puede.
\pset tuples_only on
reset role;
delete from public.bitacora where accion = 'FIRMA_PDF';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
select public.registrar_firma_pdf('10000000-0000-0000-0000-000000000001', 'informe-prueba.pdf', '{3}', 3);
-- Enfermería, RR. HH. y otra organización no pueden
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false) \g /dev/null
do $$ begin
  perform public.registrar_firma_pdf('10000000-0000-0000-0000-000000000001', 'x.pdf', '{1}', 1);
  raise notice 'FALLA: enfermería registró una firma';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',false) \g /dev/null
do $$ begin
  perform public.registrar_firma_pdf('10000000-0000-0000-0000-000000000001', 'x.pdf', '{1}', 1);
  raise notice 'FALLA: RR. HH. registró una firma';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false) \g /dev/null
do $$ begin
  perform public.registrar_firma_pdf('10000000-0000-0000-0000-000000000099', 'x.pdf', '{1}', 1);
  raise notice 'FALLA: el médico registró en otra organización';
exception when insufficient_privilege then null; end $$;
reset role;
select 'queda un solo rastro, del médico, con archivo y páginas (debe 1): ' || count(*) from public.bitacora
 where accion = 'FIRMA_PDF' and usuario_id = '00000000-0000-0000-0000-0000000000a4'
   and despues ->> 'archivo' = 'informe-prueba.pdf' and despues -> 'paginas' = '[3]'::jsonb and (despues ->> 'total')::int = 3;
select 'nadie más dejó rastro (debe 1): ' || count(*) from public.bitacora where accion = 'FIRMA_PDF';
delete from public.bitacora where accion = 'FIRMA_PDF';
