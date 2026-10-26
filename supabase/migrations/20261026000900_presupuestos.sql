-- zamorApp Ocupacional · Presupuestos (cotizaciones a empresas) usando la misma estructura de las notas de cobro
-- tipo: 'cobro' (nota de cobro) o 'presupuesto'. Un presupuesto aprobado se convierte en nota de cobro (presupuesto_id).
alter table public.cobros
  add column if not exists tipo text not null default 'cobro',
  add column if not exists vence date,
  add column if not exists presupuesto_id uuid references public.cobros (id) on delete set null;

alter table public.cobros drop constraint if exists cobros_tipo_check;
alter table public.cobros add constraint cobros_tipo_check check (tipo in ('cobro', 'presupuesto'));
alter table public.cobros drop constraint if exists cobros_estado_check;
alter table public.cobros add constraint cobros_estado_check
  check (estado in ('borrador', 'emitida', 'pagada', 'anulada', 'aprobado', 'rechazado', 'convertido'));
create index if not exists cobros_empresa_estado on public.cobros (empresa_id, tipo, estado);
