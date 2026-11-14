-- Catálogo sin el «\r» de Windows (14-nov). Los textos traídos del SAME y los que llegan por formularios (el navegador
-- envía los saltos de línea como \r\n) guardaban un retorno de carro invisible al final de cada renglón: las pantallas lo
-- ocultaban, pero la puerta para agentes y cualquier lectura que parta por \n mostraban «Pcr\r». Solución definitiva:
-- 1) un disparador que quita el \r al guardar (para siempre, venga de donde venga) y 2) limpieza única de lo existente.
-- Solo cambia saltos de línea: ningún nombre de examen ni texto visible se modifica.

create or replace function public.sin_retorno_de_carro()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.texto is not null and position(chr(13) in new.texto) > 0 then
    new.texto := replace(replace(new.texto, chr(13) || chr(10), chr(10)), chr(13), chr(10));
  end if;
  if new.nombre is not null and position(chr(13) in new.nombre) > 0 then
    new.nombre := btrim(replace(new.nombre, chr(13), ''));
  end if;
  return new;
end;
$$;

revoke all on function public.sin_retorno_de_carro() from public, anon, authenticated;

drop trigger if exists sin_retorno_de_carro on public.lista_items;
create trigger sin_retorno_de_carro before insert or update of texto, nombre on public.lista_items
  for each row execute function public.sin_retorno_de_carro();

-- Limpieza única (el disparador hace el reemplazo; 54 renglones en producción al 14-nov)
update public.lista_items set texto = texto
 where position(chr(13) in coalesce(texto, '')) > 0 or position(chr(13) in coalesce(nombre, '')) > 0;
