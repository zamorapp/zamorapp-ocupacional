-- Catálogo sin el «\r» de Windows: al guardar se quita (insert y update), venga del SAME o de un formulario.
\pset tuples_only on
reset role;
insert into public.lista_items (org_id,lista,codigo,nombre,texto) values
 ('10000000-0000-0000-0000-000000000001','plantilla_examen','CR1','Perfil con saltos de Windows' || chr(13), 'Pcr' || chr(13) || chr(10) || 'Urea' || chr(13) || chr(10) || 'Vsg');
select 'insert sin \r en texto (debe 0): ' || count(*) from public.lista_items where codigo = 'CR1' and position(chr(13) in texto) > 0;
select 'insert sin \r en nombre (debe 0): ' || count(*) from public.lista_items where codigo = 'CR1' and position(chr(13) in nombre) > 0;
select 'los renglones siguen iguales (debe Pcr|Urea|Vsg): ' || array_to_string(string_to_array(texto, chr(10)), '|') from public.lista_items where codigo = 'CR1';
update public.lista_items set texto = 'Glicemia' || chr(13) || chr(10) || 'Orina' where codigo = 'CR1';
select 'update sin \r (debe Glicemia|Orina): ' || array_to_string(string_to_array(texto, chr(10)), '|') from public.lista_items where codigo = 'CR1';
select 'nadie de la app llama la función (debe f): ' || has_function_privilege('authenticated', 'public.sin_retorno_de_carro()', 'execute');
delete from public.lista_items where codigo = 'CR1';
