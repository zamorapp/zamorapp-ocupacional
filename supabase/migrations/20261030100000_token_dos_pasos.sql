-- Marca «dos_pasos» en el token de sesión (Custom Access Token Hook de Supabase, gratis).
-- El middleware la lee sin consultar la base: a quien no necesita el código (médicos, enfermería, RR. HH.) ya no
-- se le hace una consulta extra en cada pantalla ni en cada prefetch del menú. Es solo para la navegación: la base
-- sigue frenando a un administrador sin código (verificar_dos_pasos), diga lo que diga el token.
-- Se activa en Supabase → Authentication → Hooks → Customize Access Token → public.marcar_dos_pasos_en_token.
-- Sin activarlo todo sigue igual que antes (el middleware consulta).
create or replace function public.marcar_dos_pasos_en_token(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_usuario uuid := nullif(event ->> 'user_id', '')::uuid;
begin
  v_claims := jsonb_set(v_claims, '{dos_pasos}', to_jsonb(exists (
    select 1 from public.miembros
    where usuario_id = v_usuario and activo and rol in ('administrador', 'gerente_medico')
  )));
  return jsonb_set(event, '{claims}', v_claims);
end $$;
revoke execute on function public.marcar_dos_pasos_en_token(jsonb) from public;
do $$ begin
  revoke execute on function public.marcar_dos_pasos_en_token(jsonb) from anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.marcar_dos_pasos_en_token(jsonb) to supabase_auth_admin';
  end if;
end $$;
