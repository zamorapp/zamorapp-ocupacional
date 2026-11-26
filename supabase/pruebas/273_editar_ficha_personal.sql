-- Datos ficticios. Se conserva la historia, se protege la edición concurrente y se respeta el ámbito de empresa.
\pset tuples_only on
begin;
reset role;
insert into public.trabajadores (id,org_id,empresa_id,cedula,nombres,apellidos)
values
 ('32730000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-00000000000a','V-99027301','Persona','Ficticia'),
 ('32730000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-00000000000b','V-99027302','Otra','Persona');
insert into clinico.consultas (id,org_id,empresa_id,trabajador_id,estado)
values ('42730000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
 '20000000-0000-0000-0000-00000000000a','32730000-0000-0000-0000-000000000001','borrador');

set role authenticated;
set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select version numero, numero_historia historia from public.trabajadores where id='32730000-0000-0000-0000-000000000001' \gset v273_
do $$ begin
  update public.trabajadores set cedula='V-99027302' where id='32730000-0000-0000-0000-000000000001';
  raise exception 'FALLA: se permitió una cédula duplicada';
exception when unique_violation then raise notice 'rechaza cédula duplicada (debe 1): 1'; end $$;
update public.trabajadores
set nombres='Persona corregida', cedula='V-99027303', telefono='04125550101', direccion='Domicilio ficticio'
where id='32730000-0000-0000-0000-000000000001' and org_id='10000000-0000-0000-0000-000000000001' and version=:'v273_numero';
select 'la edición conserva historia y empresa (debe 1): ' || count(*) from public.trabajadores
where id='32730000-0000-0000-0000-000000000001' and numero_historia=:'v273_historia'
  and empresa_id='20000000-0000-0000-0000-00000000000a' and cedula='V-99027303' and telefono='04125550101';
select 'la consulta sigue enlazada al mismo trabajador (debe 1): ' || count(*) from public.consultas
where id='42730000-0000-0000-0000-000000000001' and trabajador_id='32730000-0000-0000-0000-000000000001';
with cambios as (update public.trabajadores set telefono='otro' where id='32730000-0000-0000-0000-000000000001'
  and version=:'v273_numero' returning id)
select 'la versión anterior no sobreescribe la edición (debe 0): ' || count(*) from cambios;
set local request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a2';
with cambios as (update public.trabajadores set telefono='otro' where id='32730000-0000-0000-0000-000000000002' returning id)
select 'un médico limitado no puede editar en otra empresa (debe 0): ' || count(*) from cambios;
rollback;
