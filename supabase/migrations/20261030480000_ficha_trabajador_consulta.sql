-- zamorApp Ocupacional · Datos del trabajador desde la consulta (30/10/2026)
-- El registro rápido solo pide cédula, nombre y empresa; el resto de la ficha (como en la historia del SAME) se
-- completa en «Generales» de la consulta. Faltaban el estado civil, la fecha de ingreso al cargo (la antigüedad en el
-- cargo, como en el SAME) y el historial de cargos.

alter table public.trabajadores add column if not exists estado_civil text;
alter table public.trabajadores add column if not exists fecha_ingreso_cargo date;
-- trabajadores tiene permisos por columna (20261027210000): toda columna nueva necesita su grant de lectura
grant select (estado_civil, fecha_ingreso_cargo) on public.trabajadores to authenticated;

-- ─── Historial de cargos: al cambiar el cargo queda el anterior con sus fechas ───
create table if not exists public.cargos_historial (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  empresa_id uuid references public.empresas (id) on delete set null,
  trabajador_id uuid not null references public.trabajadores (id) on delete cascade,
  puesto_id uuid references public.puestos (id) on delete set null,
  cargo text not null,
  desde date,
  hasta date not null,
  registrado_por uuid default auth.uid(),
  creado_en timestamptz not null default public.ahora()
);
create index if not exists cargos_historial_trabajador on public.cargos_historial (trabajador_id, hasta desc);
alter table public.cargos_historial enable row level security;
-- Es dato laboral (no clínico): lo ve quien ve al trabajador; solo lo escribe el disparador
drop policy if exists cargos_historial_leer on public.cargos_historial;
create policy cargos_historial_leer on public.cargos_historial for select
  using ((org_id = any ((select public.orgs_con(p_sin_limite => true))::uuid[])
          or (org_id::text || empresa_id::text) = any ((select public.pares_limitados())::text[]))
         and (not org_id = any ((select public.orgs_con('{trabajador}'))::uuid[]) or public.es_mi_ficha(trabajador_id)));
revoke all on public.cargos_historial from anon, authenticated;
grant select on public.cargos_historial to authenticated;

create or replace function public.historial_cargos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.puesto_id is not null and new.puesto_id is distinct from old.puesto_id then
    insert into public.cargos_historial (org_id, empresa_id, trabajador_id, puesto_id, cargo, desde, hasta)
    select old.org_id, old.empresa_id, old.id, old.puesto_id, p.nombre, old.fecha_ingreso_cargo,
           public.hoy_caracas()
      from public.puestos p where p.id = old.puesto_id;
    -- Cargo nuevo sin fecha propia: empieza hoy (día de Caracas)
    if new.fecha_ingreso_cargo is not distinct from old.fecha_ingreso_cargo then
      new.fecha_ingreso_cargo := public.hoy_caracas();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists historial_cargos on public.trabajadores;
create trigger historial_cargos before update of puesto_id on public.trabajadores
  for each row execute function public.historial_cargos();

-- Listas: solo en la nube. En la base local de la PC (es_base_local) llegan por la réplica con los ids de la nube;
-- crearlas aquí duplicaría el desplegable y la bandeja las subiría sin autor.
do $$
begin
  if public.es_base_local() then return; end if;

  insert into public.listas (codigo, nombre, descripcion) values
    ('estado_civil', 'Estados civiles', 'Ficha del trabajador'),
    ('nivel_educativo', 'Niveles educativos', 'Ficha del trabajador')
  on conflict (codigo) do nothing;

  insert into public.lista_items (lista, codigo, nombre, orden)
  select v.lista, v.codigo, v.nombre, v.orden
  from (values
    ('estado_civil', 'S', 'Soltero(a)', 1), ('estado_civil', 'C', 'Casado(a)', 2), ('estado_civil', 'U', 'Unión estable / concubinato', 3),
    ('estado_civil', 'D', 'Divorciado(a)', 4), ('estado_civil', 'V', 'Viudo(a)', 5),
    ('nivel_educativo', 'SIN', 'Sin instrucción', 1), ('nivel_educativo', 'PRI', 'Primaria', 2), ('nivel_educativo', 'BAC', 'Bachiller', 3),
    ('nivel_educativo', 'TSU', 'Técnico superior (TSU)', 4), ('nivel_educativo', 'UNI', 'Universitario', 5), ('nivel_educativo', 'POS', 'Postgrado', 6)
  ) v (lista, codigo, nombre, orden)
  where not exists (select 1 from public.lista_items b where b.org_id is null and b.lista = v.lista and b.codigo = v.codigo);

  -- Cada organización recibe su copia editable (Configuración › Listas)
  perform public.copiar_listas_base(id) from public.organizaciones;
end $$;
