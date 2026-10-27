-- zamorApp Ocupacional · Informe de evaluación del puesto de trabajo
-- El puesto ya tenía tareas, herramientas y la matriz 5×5 (puestos.evaluacion {"grupo|agente": {p, s, control}}).
-- Se agregan el EPP requerido, las recomendaciones y quién y cuándo hizo la última evaluación, para imprimir el informe.

alter table public.puestos
  add column if not exists epp text,
  add column if not exists recomendaciones text,
  add column if not exists evaluado_por uuid references auth.users (id) on delete set null,
  add column if not exists evaluado_en date;

-- Solo firma la evaluación quien la hace: evaluado_por debe ser el propio usuario y nunca un usuario de empresa
-- (el portal puede crear puestos). Sin sesión (importación, sincronía) no se valida. Igual que proteger_autoria.
create or replace function public.proteger_evaluador_puesto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.evaluado_por is not distinct from old.evaluado_por
     and new.evaluado_en is not distinct from old.evaluado_en then return new; end if;
  if new.evaluado_por is not null and (new.evaluado_por <> auth.uid() or public.es_empresa(new.org_id)) then
    raise exception 'La evaluación del puesto solo la firma quien la hace.';
  end if;
  return new;
end $$;
revoke execute on function public.proteger_evaluador_puesto() from authenticated, anon, public;
drop trigger if exists proteger_evaluador_puesto on public.puestos;
create trigger proteger_evaluador_puesto before insert or update of evaluado_por, evaluado_en on public.puestos
  for each row execute function public.proteger_evaluador_puesto();
