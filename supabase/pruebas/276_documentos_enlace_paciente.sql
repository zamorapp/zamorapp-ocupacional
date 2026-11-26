-- Simula un envío de documentos a un paciente. La transacción se revierte.
begin;
set local "request.jwt.claims" = '{"aal":"aal2"}';
set local "request.jwt.claim.sub" = '';
insert into auth.users (id, email) values ('27600000-0000-0000-0000-000000000001', 'medico-docs@prueba.invalid'),
 ('27600000-0000-0000-0000-000000000002', 'rrhh-docs@prueba.invalid');
insert into public.organizaciones (id, nombre) values ('27600000-0000-0000-0000-000000000100','Servicio ficticio');
insert into public.empresas (id, org_id, razon_social, rif) values
 ('27600000-0000-0000-0000-00000000010a','27600000-0000-0000-0000-000000000100','Empresa ficticia A','J-27601');
insert into public.miembros (org_id, usuario_id, rol, empresas_permitidas) values
 ('27600000-0000-0000-0000-000000000100','27600000-0000-0000-0000-000000000001','medico','{27600000-0000-0000-0000-00000000010a}'),
 ('27600000-0000-0000-0000-000000000100','27600000-0000-0000-0000-000000000002','gerente_empresa','{27600000-0000-0000-0000-00000000010a}');
insert into public.trabajadores (id, org_id, empresa_id, cedula, nombres, apellidos) values
 ('27600000-0000-0000-0000-000000000200','27600000-0000-0000-0000-000000000100','27600000-0000-0000-0000-00000000010a','V-2767410','Persona','Inventada');
insert into clinico.consultas (id, org_id, empresa_id, trabajador_id, medico_id, estado, fecha) values
 ('27600000-0000-0000-0000-000000000301','27600000-0000-0000-0000-000000000100','27600000-0000-0000-0000-00000000010a','27600000-0000-0000-0000-000000000200','27600000-0000-0000-0000-000000000001','firmada',public.hoy_caracas()),
 ('27600000-0000-0000-0000-000000000302','27600000-0000-0000-0000-000000000100','27600000-0000-0000-0000-00000000010a','27600000-0000-0000-0000-000000000200','27600000-0000-0000-0000-000000000001','borrador',public.hoy_caracas());

set local role authenticated;
set local "request.jwt.claim.sub" = '27600000-0000-0000-0000-000000000001';
do $$
begin
  begin
    insert into public.enlaces_trabajador (org_id, trabajador_id, consulta_id, documento, ruta, telefono, token_hash, enviado_por)
    values ('27600000-0000-0000-0000-000000000100','27600000-0000-0000-0000-000000000200','27600000-0000-0000-0000-000000000302',
      'recomendaciones-laborales','/imprimir/recomendaciones-laborales/27600000-0000-0000-0000-000000000302',
      '584140000000', sha256('borrador'::bytea), auth.uid());
    raise exception 'FALLA: se guardó el enlace de un documento de consulta sin firmar';
  exception when raise_exception then
    if sqlerrm not like 'Firma la consulta%' then raise; end if;
  end;
end $$;
insert into public.enlaces_trabajador (org_id, trabajador_id, consulta_id, documento, ruta, telefono, token_hash, enviado_por, paquete)
select '27600000-0000-0000-0000-000000000100','27600000-0000-0000-0000-000000000200','27600000-0000-0000-0000-000000000301',
    tipo, '/imprimir/' || tipo || '/27600000-0000-0000-0000-000000000301',
    '584140000000', sha256(convert_to(repeat('prueba276',5) || ':' || tipo,'UTF8')), auth.uid(),
    '27600000-0000-0000-0000-000000000400'
from unnest(array['libre','recomendaciones-laborales','reubicacion','referencia','informe-trabajador']) as tipo;
insert into public.enlaces_trabajador_archivos (enlace_id, nombre, contenido)
select id, documento || '.pdf', '%PDF-ficticio'::bytea from public.enlaces_trabajador
 where paquete='27600000-0000-0000-0000-000000000400';

set local "request.jwt.claim.sub" = '27600000-0000-0000-0000-000000000002';
select 'RR. HH. no obtiene los enlaces de consulta (debe 0): ' || count(*) from public.enlaces_trabajador
 where paquete='27600000-0000-0000-0000-000000000400';
reset role;
set local role anon;
set local "request.jwt.claim.sub" = '';
select 'el enlace lista solo los cinco seleccionados (debe 5): ' || count(*) from public.listar_enlace_trabajador(repeat('prueba276',5));
select 'todos piden comprobar la cédula (debe 5): ' || count(*) from public.listar_enlace_trabajador(repeat('prueba276',5)) where pide_cedula;
select 'sin cédula no se devuelve el PDF (debe 0): ' || count(*) from public.abrir_enlace_trabajador(repeat('prueba276',5),'recomendaciones-laborales') where contenido_base64 is not null;
select 'cédula equivocada no devuelve el PDF (debe 0): ' || count(*) from public.abrir_enlace_trabajador(repeat('prueba276',5),'reubicacion','1234') where contenido_base64 is not null;
select 'cédula correcta abre el PDF autorizado (debe 1): ' || count(*) from public.abrir_enlace_trabajador(repeat('prueba276',5),'recomendaciones-laborales','7410') where contenido_base64 is not null;
select 'la constancia no se incluyó en el enlace (debe 0): ' || count(*) from public.abrir_enlace_trabajador(repeat('prueba276',5),'constancia','7410') where contenido_base64 is not null;
do $$ begin
  for i in 1..4 loop
    perform public.abrir_enlace_trabajador(repeat('prueba276',5),'libre','1234');
  end loop;
end $$;
select 'cinco fallos bloquean los cinco documentos (debe 5): ' || count(*) from public.listar_enlace_trabajador(repeat('prueba276',5)) where bloqueado;
select 'el paquete bloqueado no entrega el PDF correcto (debe 0): ' || count(*) from public.abrir_enlace_trabajador(repeat('prueba276',5),'referencia','7410') where contenido_base64 is not null;
rollback;
