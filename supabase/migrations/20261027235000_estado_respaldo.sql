-- zamorApp Ocupacional · Estado del respaldo diario visible en la app.
-- El respaldo de la PC (scripts/respaldo.mjs, con la clave de la base) anota cada intento aquí;
-- el administrador y el gerente médico lo ven en el inicio con aviso si pasa más de un día sin respaldo correcto.

create table if not exists public.respaldos (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  estado text not null check (estado in ('ok', 'aviso', 'fallo')),
  archivo text,
  tamano_kb integer,
  tablas integer,
  filas integer,
  destinos integer,
  detalle text check (length(detalle) <= 2000),
  equipo text
);
create index if not exists respaldos_fecha on public.respaldos (fecha desc);
-- Sin políticas: nadie de la app lee ni escribe la tabla; solo la función de abajo y el respaldo (dueño de la base)
alter table public.respaldos enable row level security;
revoke all on public.respaldos from anon, authenticated;
revoke all on sequence public.respaldos_id_seq from anon, authenticated;

-- Último intento y último respaldo correcto (ok o con aviso: el archivo quedó guardado al menos en la PC)
create or replace function public.estado_respaldo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.miembros where usuario_id = auth.uid() and activo
                 and rol in ('administrador', 'gerente_medico')) then
    return null;
  end if;
  return jsonb_build_object(
    'ultimo', (select to_jsonb(r) - 'id' from public.respaldos r order by fecha desc limit 1),
    'ultimo_ok', (select to_jsonb(r) - 'id' from public.respaldos r where estado in ('ok', 'aviso') order by fecha desc limit 1));
end $$;
revoke execute on function public.estado_respaldo() from public, anon;
grant execute on function public.estado_respaldo() to authenticated;

-- El mantenimiento también recorta el historial de respaldos a un año
create or replace function public.mantenimiento_purgar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pdf integer; v_registros integer;
begin
  delete from public.envio_archivos a using public.envio_enlaces l
   where l.id = a.enlace_id and (l.vence < now() or l.revocado_en is not null);
  get diagnostics v_pdf = row_count;
  delete from public.respaldos where fecha < now() - interval '1 year';
  get diagnostics v_registros = row_count;
  return jsonb_build_object('pdf_enlaces_vencidos', v_pdf, 'registros_respaldo_viejos', v_registros);
end $$;
revoke execute on function public.mantenimiento_purgar() from public, anon, authenticated;
