-- zamorApp Ocupacional · Proveedor del servicio
-- El proveedor es el Dr. Cesar Enrique Zamora (libre ejercicio) con la marca «OcupaVida Salud Ocupacional».
-- «TIPURO SERVI MEDIC» fue un dato supuesto en la carga inicial: se corrige donde siga y en instalaciones nuevas.
-- El nombre sigue siendo editable en Configuración › Organización; esto solo reemplaza el valor erróneo.

update public.organizaciones
set nombre = 'OcupaVida Salud Ocupacional'
where nombre ilike 'tipuro%';
