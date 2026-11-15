-- Biblioteca de recomendaciones (Cesar, 06-nov): cada hoja para el paciente (una dieta, un tema de bienestar, las
-- pausas activas) se puede leer, cambiar y guardar como versión propia de la organización, con «Volver al original».
-- La versión guarda solo los cambios sobre el texto de la app (mismo formato que ?c= de las hojas, cambios-hoja.ts):
-- lista_items de la lista «hoja_paciente», codigo = «dieta-<clave>» o «bienestar-<clave>», datos = {"cambios": {…}}.
-- Vive en lista_items para que llegue a la PC con la réplica de catálogos. Solo administrador y gerente médico la
-- cambian (política items_admin); todos los de la organización la leen (son textos para pacientes, sin datos de nadie).

insert into public.listas (codigo, nombre, descripcion) values
  ('hoja_paciente', 'Hojas para el paciente (versiones propias)', 'Cambios de la organización sobre las dietas y las recomendaciones de bienestar. Se editan en Atención médica › Hojas para el paciente.')
on conflict (codigo) do nothing;

-- Una versión por hoja y organización, de tamaño acotado
create unique index if not exists lista_items_hoja_paciente on public.lista_items (org_id, codigo) where lista = 'hoja_paciente';
alter table public.lista_items drop constraint if exists lista_items_hoja_paciente_check;
alter table public.lista_items add constraint lista_items_hoja_paciente_check
  check (lista <> 'hoja_paciente' or (org_id is not null and codigo ~ '^(dieta|bienestar)-[a-z_-]{1,30}$'
                                      and jsonb_typeof(datos -> 'cambios') = 'object' and pg_column_size(datos) <= 16384));

-- El paciente del enlace de registro ve sus hojas con la versión de la organización: solo las de los documentos que le
-- eligieron (su dieta y sus temas de bienestar) y solo mientras puede descargarlas (documentos_registro_paciente).
create or replace function public.hojas_registro_paciente(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.solicitudes_paciente; d jsonb; codigos text[];
begin
  if public.documentos_registro_paciente(p_token) is null then return null; end if;
  select * into v from public.solicitudes_paciente where token_hash = sha256(convert_to(p_token, 'UTF8'));
  d := v.documentos;
  codigos := array_remove(array_cat(
    array['dieta-' || coalesce(d -> 'dieta' ->> 'dieta', '')],
    array(select 'bienestar-' || x from jsonb_array_elements_text(case when jsonb_typeof(d -> 'bienestar' -> 'tema') = 'array' then d -> 'bienestar' -> 'tema' else '[]' end) x)
      || case when d ? 'bienestar' then array['bienestar-pausas'] else '{}'::text[] end), 'dieta-');
  return coalesce((select jsonb_object_agg(i.codigo, i.datos -> 'cambios') from public.lista_items i
                    where i.org_id = v.org_id and i.lista = 'hoja_paciente' and i.activo and i.codigo = any (codigos)), '{}'::jsonb);
end $$;
revoke execute on function public.hojas_registro_paciente(text) from public;
-- Pública a propósito: el token de 32 bytes es la llave; está en la línea base del guardián
grant execute on function public.hojas_registro_paciente(text) to anon, authenticated;
