-- zamorApp Ocupacional · Prueba de restauración semanal: el respaldo de la PC restaura el último archivo en una base
-- temporal y anota el resultado aquí (tipo «restauracion»). El Inicio muestra cuándo se probó por última vez.

alter table public.respaldos add column if not exists tipo text not null default 'respaldo';
alter table public.respaldos drop constraint if exists respaldos_tipo_check;
alter table public.respaldos add constraint respaldos_tipo_check check (tipo in ('respaldo', 'restauracion'));

create or replace function public.estado_respaldo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.miembros where usuario_id = auth.uid() and activo
                 and rol in ('administrador', 'gerente_medico')) then
    return null;
  end if;
  return jsonb_build_object(
    'ultimo', (select to_jsonb(r) - 'id' from public.respaldos r where tipo = 'respaldo' order by fecha desc limit 1),
    'ultimo_ok', (select to_jsonb(r) - 'id' from public.respaldos r where tipo = 'respaldo' and estado in ('ok', 'aviso') order by fecha desc limit 1),
    'ultima_restauracion', (select to_jsonb(r) - 'id' from public.respaldos r where tipo = 'restauracion' order by fecha desc limit 1));
end $$;
revoke execute on function public.estado_respaldo() from public, anon;
grant execute on function public.estado_respaldo() to authenticated;
