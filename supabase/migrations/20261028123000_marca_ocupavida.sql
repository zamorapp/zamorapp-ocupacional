-- zamorApp Ocupacional · Proveedor del servicio
-- El proveedor es el Dr. Cesar Enrique Zamora (libre ejercicio) con la marca «OcupaVida Salud Ocupacional».
-- «TIPURO SERVI MEDIC» fue un dato supuesto en la carga inicial: se corrige donde siga y en instalaciones nuevas.
-- El nombre sigue siendo editable en Configuración › Organización; esto solo reemplaza el valor erróneo.

update public.organizaciones
set nombre = 'OcupaVida Salud Ocupacional'
where nombre ilike 'tipuro%';

-- Datos fiscales que dio Cesar (2026-10-28) para el encabezado de los documentos.
update public.organizaciones
set rif = 'V-13475931-0',
    direccion = 'Avenida Aliro Ugarte Pelayo, Maturín, Estado Monagas'
where nombre = 'OcupaVida Salud Ocupacional';
