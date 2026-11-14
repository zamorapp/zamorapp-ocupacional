-- Campanita: el aviso «Tu celular / Tu Chrome de la PC no confirmó…» (20261030932000) reaparecía (Cesar, 14-nov-2026).
-- Causas medidas en producción:
--  1. El último aviso a sus dos aparatos salió el 13-nov a las 01:03 UTC, ANTES de publicar el acuse (13-nov 05:36 UTC):
--     ningún aparato podía confirmarlo, así que la tarjeta era una falsa alarma permanente.
--  2. «Ignorar» se guardaba solo en ese equipo (localStorage): en el escritorio, la web y el celular volvía a salir.
-- Arreglo: «Ignorar» se guarda en la nube por aparato y vale hasta que la nube le mande otro aviso. Los avisos que
-- salieron antes de existir el acuse quedan ignorados de una vez (no se podían confirmar).
alter table public.suscripciones_push add column if not exists acuse_ignorado timestamptz;
comment on column public.suscripciones_push.acuse_ignorado is
  '«Ignorar» del aviso de aparato sin acuse: vale para el ultimo_aviso que tenía al ignorarlo (si llega otro aviso, vuelve).';

-- Avisos anteriores al acuse: no se podían confirmar
update public.suscripciones_push set acuse_ignorado = ultimo_aviso
 where ultimo_aviso is not null and ultimo_acuse is null and ultimo_aviso < timestamptz '2026-11-13 06:00:00+00';

-- Solo el dueño del aparato, y solo marca el aviso vigente (no inventa fechas ni toca otros campos)
create or replace function public.ignorar_aparato_sin_acuse(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.suscripciones_push set acuse_ignorado = ultimo_aviso
   where id = p_id and usuario_id = (select auth.uid()) and ultimo_aviso is not null;
$$;
revoke execute on function public.ignorar_aparato_sin_acuse(uuid) from public, anon;
grant execute on function public.ignorar_aparato_sin_acuse(uuid) to authenticated;

