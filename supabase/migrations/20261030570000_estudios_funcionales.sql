-- Estudios funcionales (Cesar, 30-oct): espirometría, audiometría y electrocardiograma en el catálogo de paraclínicos
-- de cada organización, como estudios de informe (Normal / Alterado), con su clase para que el perfil sugerido no los
-- confunda con laboratorio y el expediente los agrupe. La clase de los demás exámenes se deduce del nombre en la app
-- (src/lib/estudios.ts); aquí solo se fija la de estos tres.
-- No usa copiar_listas_base: esa copia TODO lo global que falte, también lo que la organización borró a propósito.

create or replace function public.sembrar_estudios_funcionales(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; b record; m int;
begin
  for b in select * from public.lista_items where org_id is null and lista = 'paraclinico' and codigo in ('espirometria', 'audiometria', 'ecg') loop
    insert into public.lista_items (lista, org_id, codigo, nombre, grupo, texto, orden, activo, datos, base_id)
    select b.lista, p_org, b.codigo, b.nombre, b.grupo, b.texto, b.orden, b.activo, b.datos, b.id
    where not exists (
      select 1 from public.lista_items o
      where o.org_id = p_org and o.lista = 'paraclinico'
        and (o.base_id = b.id or lower(translate(btrim(o.nombre), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = lower(translate(b.nombre, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))));
    get diagnostics m = row_count;
    n := n + m;
  end loop;
  return n;
end $$;
revoke all on function public.sembrar_estudios_funcionales(uuid) from public, anon, authenticated;

-- Los globales: clase, tipo informe (si no tenían) y otros nombres del ECG; las organizaciones nuevas los copian así
update public.lista_items set datos = datos
  || jsonb_build_object('clase', case codigo when 'ecg' then 'electrocardiograma' else codigo end)
  || case when datos ? 'tipo' then '{}'::jsonb else '{"tipo":"informe"}'::jsonb end
  || case when codigo = 'ecg' and not datos ? 'sinonimos' then '{"sinonimos":["ECG","EKG"]}'::jsonb else '{}'::jsonb end
where org_id is null and lista = 'paraclinico' and codigo in ('espirometria', 'audiometria', 'ecg');

select public.sembrar_estudios_funcionales(id) from public.organizaciones;
