\pset tuples_only on
do $$
declare
  t public.trabajadores;
begin
  t.cedula := 'V00000042';
  if length(public.depuracion_huella('ficticia')) <> 32
    or not (public.depuracion_motivos() @> array['Otro'])
    or public.depuracion_telefono('+58 412-0000012') <> '4120000012'
    or not (public.faltan_ficha_registro(t) @> array['telefono'])
    or not public.lista_clinica('paraclinico')
    or not (public.nomina_campos() @> array['telefono'])
    or public.normalizar_usuario(' USUARIO ') <> 'usuario'
    or public.ultimos_cedula(t) <> '0042'
    or not sync.vacio('{}'::jsonb) then
    raise exception 'Cambió el comportamiento de una función con ruta fija';
  end if;
end $$;
select 'funciones de datos generales y réplica con ruta fija (debe 1): 1';
