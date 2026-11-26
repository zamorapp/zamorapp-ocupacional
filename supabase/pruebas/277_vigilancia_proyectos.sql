\pset tuples_only on
begin;
reset role;
select 'el bucket es privado y solo admite PDF (debe 1): ' || count(*) from storage.buckets
where id = 'vigilancia-proyectos' and not public and allowed_mime_types = array['application/pdf'];
select count(*) as informes_antes from public.informes_vigilancia \gset

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true) \g /dev/null
select set_config('request.jwt.claims','{"aal":"aal2"}',true) \g /dev/null
insert into storage.objects(bucket_id, name) values
 ('vigilancia-proyectos','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/ABC-1--2026-T1.pdf'),
 ('vigilancia-proyectos','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/ABC-1--2026-T3.pdf'),
 ('vigilancia-proyectos','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000b/ABC-1--2026-T1.pdf');
select 'el administrador lee ambos contratos (debe 3): ' || count(*) from storage.objects where bucket_id = 'vigilancia-proyectos';
select 'se rechazan año y ruta inválidos (debe 0): ' || count(*) from (values
 ('10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/ABC-1--2026-T5.pdf'),
 ('10000000-0000-0000-0000-000000000099/20000000-0000-0000-0000-00000000000a/ABC-1--2026-T1.pdf'),
 ('10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000a/../ABC-1--2026-T1.pdf')
) r(ruta) where public.puede_archivar_vigilancia_proyecto(ruta);
with archivos as (delete from storage.objects where bucket_id = 'vigilancia-proyectos' returning id)
select 'el administrador no puede borrar por esta política (debe 0): ' || count(*) from archivos;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',true) \g /dev/null
select 'el médico solo ve su empresa (debe 2): ' || count(*) from storage.objects where bucket_id = 'vigilancia-proyectos';
do $$
begin
  insert into storage.objects(bucket_id, name) values
    ('vigilancia-proyectos','10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-00000000000b/ABC-1--2026-T3.pdf');
  raise exception 'FALLA: el médico subió un archivo para otra empresa';
exception when insufficient_privilege then null;
end
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a3',true) \g /dev/null
select 'RR. HH. no ve borradores ni siquiera de su empresa (debe 0): ' || count(*) from storage.objects where bucket_id = 'vigilancia-proyectos';
reset role;
select 'la vigilancia general conserva sus filas (debe 0): ' || (count(*) - :informes_antes) from public.informes_vigilancia;
rollback;
