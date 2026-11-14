-- Pagos y abonos de cada nota de cobro (Cesar, 14-nov-2026: «9 si»): el recibo dice cómo se pagó (método y
-- referencia) y una nota puede pagarse en partes. La nota queda «pagada» cuando los abonos cubren el total; eso lo
-- decide la aplicación al registrar o borrar un abono (un disparador aquí también correría al sincronizar el
-- escritorio y cambiaría la nota dos veces).
create table if not exists public.cobro_pagos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizaciones (id) on delete cascade,
  cobro_id uuid not null references public.cobros (id) on delete cascade,
  fecha date not null default public.hoy_caracas(),
  metodo text not null check (metodo in ('transferencia', 'pago_movil', 'zelle', 'binance', 'efectivo_usd', 'efectivo_bs', 'otro')),
  referencia text check (referencia is null or length(referencia) <= 80),
  monto_usd numeric(12, 2) not null check (monto_usd > 0),
  tasa_bcv numeric(14, 4) check (tasa_bcv is null or tasa_bcv > 0),   -- la del día del pago, si fue en bolívares
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default public.ahora()
);
create index if not exists cobro_pagos_cobro on public.cobro_pagos (cobro_id, fecha);

alter table public.cobro_pagos enable row level security;
-- Quien factura (administrador, gerente médico, recepción) y ve la nota; solo en notas emitidas o pagadas
drop policy if exists cobro_pagos_todo on public.cobro_pagos;
create policy cobro_pagos_todo on public.cobro_pagos for all
  using (public.puede_facturar(org_id)
         and exists (select 1 from public.cobros c where c.id = cobro_id and c.org_id = cobro_pagos.org_id))
  with check (public.puede_facturar(org_id)
         and exists (select 1 from public.cobros c where c.id = cobro_id and c.org_id = cobro_pagos.org_id
                     and c.tipo = 'cobro' and c.estado in ('emitida', 'pagada')));
grant select, insert, update, delete on public.cobro_pagos to authenticated;

-- Réplica en el escritorio, igual que cobros y cobro_items
insert into sync.tablas (nombre, clinica, subible) values ('public.cobro_pagos', false, true)
  on conflict (nombre) do nothing;
alter table public.cobro_pagos add column if not exists version bigint not null default 1;
drop trigger if exists sync_version on public.cobro_pagos;
create trigger sync_version before insert or update on public.cobro_pagos for each row execute function sync.versionar();
drop trigger if exists sync_anotar on public.cobro_pagos;
create trigger sync_anotar after insert or update or delete on public.cobro_pagos for each row execute function sync.anotar();

-- Cada abono registrado, cambiado o borrado queda en la bitácora (quién y cuándo), como las notas de cobro
drop trigger if exists bit_cobro_pagos on public.cobro_pagos;
create trigger bit_cobro_pagos after insert or update or delete on public.cobro_pagos for each row execute function public.registrar_bitacora();
