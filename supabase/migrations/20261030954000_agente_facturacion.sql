-- Facturar con el agente (Cesar, 14-nov-2026): «si yo le digo que me elabore una prefactura o una factura o una nota de
-- cobro, también puede hacerlo… modificar los precios… descuentos en caso de que yo se lo diga… múltiples facturas
-- para múltiples empresas». Frase: «sí facturar con el agente».
-- Entrada aparte de public.agente (938) para no pisar a la vigilancia (953): public.puerta_facturacion. Mismas reglas
-- de la llave (huella, vencida/apagada, creador administrador, freno 120/min, registro) y además el alcance «cobros»,
-- que el administrador enciende llave por llave (apagado por defecto).
-- Lo que hace:
--   listar_cobros        notas de cobro con total, estado, Nº de factura y enlace.
--   atendidos_por_cobrar atendidos de un período aún sin nota, AGRUPADOS por servicio (sin nombres ni nada clínico).
--   crear_notas_cobro    de 1 a 20 notas EN BORRADOR, cada una para su empresa: atendidos del período, renglones del
--                        catálogo o libres, un presupuesto, y un descuento (% o monto) que sale como renglón aparte.
--                        La nota queda marcada «del agente» (cobros.por_agente). La factura es esa misma nota: el Nº
--                        del talonario se pone cuando el doctor pulsa «Imprimir factura».
--   proponer_precio      propuesta en public.agentes_propuestas (953): precio general del servicio o el de una
--                        empresa. Solo cambia cuando el doctor pulsa «Aprobar» (aplicar_propuesta, con SU sesión).
-- Seguridad: como public.agente, es security definer y NO pasa por la RLS; cada ayudante filtra por la organización
-- de la llave a mano. Ninguna nota puede emitirse con total negativo (disparador cobro_total_no_negativo).
-- Lo que NO hace: poner el Nº de factura, emitir, imprimir, enviar, registrar pagos o abonos, elegir la tasa BCV,
-- tocar notas que ya existen, cambiar un precio, borrar, ni leer nada clínico (los atendidos salen de la vista
-- public.atenciones, la misma de Facturación, sin aptitud ni diagnósticos).

-- ===== 1. Marca «del agente» en la nota y alcance de la llave =====
alter table public.cobros add column if not exists por_agente text;
comment on column public.cobros.por_agente is
  'Nombre de la llave del agente que armó esta nota en borrador (20261030954000). Null = la hizo una persona.';
-- Casilla de la llave «Cobros y precios», APAGADA por defecto (igual que «documentos» de 950 y «vigilancia» de 953)
alter table public.agentes_llaves add column if not exists cobros boolean not null default false;

create or replace function public.agentes_llave_cobros(p_org uuid, p_llave uuid, p_si boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k public.agentes_llaves;
begin
  if public.es_base_local() then
    raise exception 'La puerta para agentes se cambia con internet.' using errcode = 'P0001';
  end if;
  if not public.agentes_soy_admin(p_org) then
    raise exception 'Solo el administrador cambia las llaves para agentes.' using errcode = '42501';
  end if;
  update public.agentes_llaves set cobros = coalesce(p_si, false)
   where id = p_llave and org_id = p_org and revocada_en is null and vence_en > public.ahora()
  returning * into k;
  if not found then raise exception 'Esa llave ya no sirve (apagada o vencida).' using errcode = 'P0001'; end if;
  insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ensayo, ok, resumen)
  values (p_org, k.id, k.nombre, 'casilla_cobros', false, true,
          case when k.cobros then 'Casilla «Cobros y precios» encendida' else 'Casilla «Cobros y precios» apagada' end);
  return jsonb_build_object('id', k.id, 'cobros', k.cobros);
end $$;
revoke execute on function public.agentes_llave_cobros(uuid, uuid, boolean) from public, anon;
grant execute on function public.agentes_llave_cobros(uuid, uuid, boolean) to authenticated;

-- agentes_estado devuelve la casilla de cada llave (mismo ancla que 950 y 953: sirve en cualquier orden)
do $$
declare
  v_def text := replace(pg_get_functiondef('public.agentes_estado(uuid, date, date)'::regprocedure), chr(13), '');
  v_viejo text := '''permiso'', l.permiso,';
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'agentes_estado cambió: revisar 20261030954000 antes de aplicarla';
  end if;
  execute replace(v_def, v_viejo, v_viejo || ' ''cobros'', l.cobros,');
end $$;

-- ===== 2. Ayudantes (revocados: solo los llama puerta_facturacion) =====
-- Precio de un servicio para una empresa: el convenido; si no hay, el del catálogo
create or replace function public.agente_fac_precio(p_empresa uuid, s public.servicios)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select p.precio_usd from public.precios_empresa p where p.empresa_id = p_empresa and p.servicio_id = s.id), s.precio_usd)
$$;

create or replace function public.agente_fac_listar(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_emp uuid := public.agente_uuid(d, 'empresa_id');
  v_estado text := public.agente_txt(d, 'estado', 20);
  v_desde date := coalesce(public.agente_fecha(d, 'desde'), public.hoy_caracas() - 92);
  v_hasta date := coalesce(public.agente_fecha(d, 'hasta'), public.hoy_caracas());
begin
  if v_estado is not null and v_estado not in ('borrador', 'emitida', 'pagada', 'anulada') then
    perform public.agente_no('«estado» debe ser borrador, emitida, pagada o anulada.');
  end if;
  return jsonb_build_object('notas', (
    select coalesce(jsonb_agg(x order by x ->> 'fecha' desc, (x ->> 'numero')::int desc), '[]'::jsonb) from (
      select jsonb_build_object('nota_id', c.id, 'numero', c.numero, 'fecha', c.fecha, 'empresa', e.razon_social, 'empresa_id', c.empresa_id,
               'estado', c.estado, 'desde', c.desde, 'hasta', c.hasta, 'numero_factura', c.numero_factura_fiscal, 'del_agente', c.por_agente is not null,
               'total_usd', (select coalesce(sum(round(i.cantidad * i.precio_usd, 2)), 0) from public.cobro_items i where i.cobro_id = c.id),
               'ruta', '/facturacion/' || c.id, 'imprimir_factura', jsonb_build_object('ruta', '/imprimir/factura/' || c.id)) x
        from public.cobros c join public.empresas e on e.id = c.empresa_id
       where c.org_id = o and c.tipo = 'cobro' and c.fecha between v_desde and v_hasta
         and (v_emp is null or c.empresa_id = v_emp) and (v_estado is null or c.estado = v_estado)
       order by c.fecha desc, c.numero desc limit 100) q));
end $$;

-- Atenciones del período sin nota, con el servicio de su motivo (igual que Facturación > Nueva nota)
create or replace function public.agente_fac_atenciones(o uuid, p_empresa uuid, p_desde date, p_hasta date)
returns table (consulta_id uuid, fecha date, paciente text, cedula text, servicio_id uuid, servicio text, precio_usd numeric)
language sql stable set search_path = public as $$
  select a.id, a.fecha, a.paciente, a.cedula, s.id, s.nombre, case when s.id is null then null else public.agente_fac_precio(p_empresa, s) end
    from public.atenciones a
    left join lateral (select s0.* from public.servicios s0
                        where s0.org_id = o and s0.activo and a.motivo_codigo is not null
                          and upper(a.motivo_codigo) = any (select upper(btrim(m)) from unnest(string_to_array(coalesce(s0.motivos, ''), ',')) m)
                        order by s0.orden, s0.nombre limit 1) s on true
   where a.org_id = o and a.empresa_id = p_empresa and a.fecha between p_desde and p_hasta
     and a.estado <> 'borrador' and a.cobro_id is null
$$;

create or replace function public.agente_fac_periodo(d jsonb)
returns daterange language plpgsql stable set search_path = public as $$
declare
  v_desde date := public.agente_fecha(d, 'desde');
  v_hasta date := public.agente_fecha(d, 'hasta');
begin
  if v_desde is null or v_hasta is null then perform public.agente_no('Faltan «desde» y «hasta» del período.'); end if;
  if v_hasta < v_desde or v_hasta - v_desde > 366 then perform public.agente_no('El período va de «desde» a «hasta», un año como máximo.'); end if;
  return daterange(v_desde, v_hasta, '[]');
end $$;

create or replace function public.agente_fac_atendidos(o uuid, d jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  p daterange := public.agente_fac_periodo(d);
  v_emp uuid := public.agente_uuid(d, 'empresa_id');
begin
  return jsonb_build_object('desde', lower(p), 'hasta', upper(p) - 1, 'empresas', (
    select coalesce(jsonb_agg(x order by x ->> 'empresa'), '[]'::jsonb) from (
      select jsonb_build_object('empresa_id', e.id, 'empresa', e.razon_social, 'atendidos', count(*),
               'sin_servicio', count(*) filter (where a.servicio_id is null),
               'total_usd', coalesce(sum(a.precio_usd), 0),
               'grupos', (select jsonb_agg(jsonb_build_object('servicio', g.servicio, 'cantidad', g.n, 'precio_usd', g.precio_usd, 'total_usd', g.n * g.precio_usd) order by g.servicio)
                            from (select a2.servicio, a2.precio_usd, count(*) n from public.agente_fac_atenciones(o, e.id, lower(p), upper(p) - 1) a2
                                   where a2.servicio_id is not null group by 1, 2) g)) x
        from public.empresas e
        cross join lateral public.agente_fac_atenciones(o, e.id, lower(p), upper(p) - 1) a
       where e.org_id = o and (v_emp is null or e.id = v_emp)
       group by e.id, e.razon_social) q));
end $$;

-- Una nota. Devuelve la nota (o lo que haría, en ensayo)
create or replace function public.agente_fac_una_nota(o uuid, k public.agentes_llaves, d jsonb, p_n integer, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  e public.empresas := public.agente_empresa(o, d);
  v_pre uuid := public.agente_uuid(d, 'presupuesto_id');
  v_obs text := public.agente_txt(d, 'observacion', 1000);
  v_atend boolean := coalesce((d ->> 'atendidos')::boolean, false);
  v_desde date; v_hasta date; p daterange;
  v_reng jsonb := '[]'::jsonb;
  v_sub numeric := 0; v_desc numeric := 0; v_pct numeric; v_monto numeric; v_motivo text;
  v_sin integer := 0; v_natend integer := 0; v_orden integer := 0;
  r jsonb; s public.servicios; pr public.cobros;
  v_d text; v_det text; v_cant numeric; v_precio numeric; v_serv uuid;
  c public.cobros;
  a record;
  q text := 'Nota ' || p_n || ': ';
begin
  if (d ? 'desde') or (d ? 'hasta') or v_atend then
    p := public.agente_fac_periodo(d); v_desde := lower(p); v_hasta := upper(p) - 1;
  end if;
  -- Misma orden repetida el mismo día con atendidos: la nota del agente en borrador de esa empresa y ese período
  -- (sus atendidos ya están en ella, así que no se puede comparar por renglones)
  if v_atend then
    select c0.* into c from public.cobros c0
     where c0.org_id = o and c0.empresa_id = e.id and c0.tipo = 'cobro' and c0.estado = 'borrador' and c0.por_agente is not null
       and c0.fecha = public.hoy_caracas() and c0.desde = v_desde and c0.hasta = v_hasta
       and exists (select 1 from public.cobro_items i where i.cobro_id = c0.id and i.consulta_id is not null)
     order by c0.creado_en desc limit 1;
  end if;
  if c.id is not null then
    return jsonb_build_object('nota_id', c.id, 'numero', c.numero, 'empresa', e.razon_social, 'ya_existia', true,
      'total_usd', (select coalesce(sum(round(i.cantidad * i.precio_usd, 2)), 0) from public.cobro_items i where i.cobro_id = c.id),
      'ruta', '/facturacion/' || c.id, 'imprimir_factura', jsonb_build_object('ruta', '/imprimir/factura/' || c.id), '_empresa', e.id);
  end if;

  -- 1) Atendidos del período (uno por renglón, como en Facturación; el agente solo recibe el resumen)
  if v_atend then
    for a in select * from public.agente_fac_atenciones(o, e.id, v_desde, v_hasta) order by fecha, paciente loop
      if a.servicio_id is null then v_sin := v_sin + 1; continue; end if;
      v_natend := v_natend + 1; v_orden := v_orden + 1;
      v_reng := v_reng || jsonb_build_object('servicio_id', a.servicio_id, 'consulta_id', a.consulta_id, 'descripcion', a.servicio,
        'detalle', a.paciente || ' · ' || a.cedula || ' · ' || to_char(a.fecha, 'DD/MM/YYYY'), 'cantidad', 1, 'precio_usd', a.precio_usd, 'orden', v_orden);
      v_sub := v_sub + a.precio_usd;
    end loop;
  end if;
  -- 2) Renglones de un presupuesto de esa empresa
  if v_pre is not null then
    select * into pr from public.cobros where id = v_pre and org_id = o and tipo = 'presupuesto';
    if not found then perform public.agente_no(q || 'no encuentro ese presupuesto.'); end if;
    if pr.empresa_id <> e.id then perform public.agente_no(q || 'el presupuesto es de otra empresa.'); end if;
    for r in select jsonb_build_object('servicio_id', i.servicio_id, 'descripcion', i.descripcion, 'detalle', i.detalle, 'cantidad', i.cantidad, 'precio_usd', i.precio_usd)
               from public.cobro_items i where i.cobro_id = pr.id order by i.orden loop
      v_orden := v_orden + 1;
      v_reng := v_reng || (r || jsonb_build_object('orden', v_orden));
      v_sub := v_sub + round((r ->> 'cantidad')::numeric * (r ->> 'precio_usd')::numeric, 2);
    end loop;
  end if;
  -- 3) Renglones sueltos (como en crear_presupuesto)
  if d ? 'renglones' then
    if jsonb_typeof(d -> 'renglones') <> 'array' or jsonb_array_length(d -> 'renglones') > 30 then
      perform public.agente_no(q || '«renglones» es una lista de hasta 30.');
    end if;
    for r in select * from jsonb_array_elements(d -> 'renglones') loop
      if jsonb_typeof(r) <> 'object' then perform public.agente_no(q || 'cada renglón es un objeto con servicio_id o descripcion, cantidad y precio_usd.'); end if;
      v_orden := v_orden + 1;
      v_serv := public.agente_uuid(r, 'servicio_id');
      v_d := public.agente_txt(r, 'descripcion', 200);
      v_det := public.agente_txt(r, 'detalle', 500);
      v_cant := coalesce(public.agente_num(r, 'cantidad', 0.01, 10000), 1);
      v_precio := public.agente_num(r, 'precio_usd', 0, 100000);
      if v_serv is not null then
        select * into s from public.servicios where id = v_serv and org_id = o;
        if not found then perform public.agente_no(q || 'no encuentro el servicio del renglón ' || v_orden || '.'); end if;
        v_d := coalesce(v_d, s.nombre);
        v_precio := coalesce(v_precio, public.agente_fac_precio(e.id, s));
      end if;
      if v_d is null then perform public.agente_no(q || 'al renglón ' || v_orden || ' le falta «descripcion» o «servicio_id».'); end if;
      if v_precio is null then perform public.agente_no(q || 'al renglón ' || v_orden || ' le falta «precio_usd».'); end if;
      v_reng := v_reng || jsonb_build_object('servicio_id', v_serv, 'descripcion', v_d, 'detalle', v_det, 'cantidad', v_cant, 'precio_usd', v_precio, 'orden', v_orden);
      v_sub := v_sub + round(v_cant * v_precio, 2);
    end loop;
  end if;
  if jsonb_array_length(v_reng) = 0 then
    perform public.agente_no(q || case when v_atend then 'no hay atendidos por cobrar de ' || e.razon_social || ' en ese período'
                                      || case when v_sin > 0 then ' con servicio en el catálogo (' || v_sin || ' sin servicio)' else '' end || '.'
                                   else 'no tiene renglones.' end);
  end if;
  -- 4) Descuento: solo si el doctor lo pidió; sale como renglón aparte, en negativo
  if d ? 'descuento' then
    if jsonb_typeof(d -> 'descuento') <> 'object' then perform public.agente_no(q || '«descuento» lleva porcentaje o monto_usd, y motivo.'); end if;
    v_pct := public.agente_num(d -> 'descuento', 'porcentaje', 0.01, 100);
    v_monto := public.agente_num(d -> 'descuento', 'monto_usd', 0.01, 1000000);
    v_motivo := public.agente_txt(d -> 'descuento', 'motivo', 200);
    if (v_pct is null) = (v_monto is null) then perform public.agente_no(q || 'el descuento lleva porcentaje O monto_usd (uno de los dos).'); end if;
    v_desc := coalesce(v_monto, round(v_sub * v_pct / 100, 2));
    if v_desc > v_sub then perform public.agente_no(q || 'el descuento (' || v_desc || ' USD) es mayor que la nota (' || v_sub || ' USD).'); end if;
    v_orden := v_orden + 1;
    v_reng := v_reng || jsonb_build_object('servicio_id', null, 'descripcion',
      'Descuento' || case when v_pct is not null then ' ' || trim(to_char(v_pct, 'FM990.##')) || ' %' else '' end,
      'detalle', v_motivo, 'cantidad', 1, 'precio_usd', -v_desc, 'orden', v_orden);
  end if;

  -- Sin atendidos: misma orden = nota del agente de hoy, de esa empresa, con los mismos renglones
  if not v_atend then
    select c0.* into c from public.cobros c0
     where c0.org_id = o and c0.empresa_id = e.id and c0.tipo = 'cobro' and c0.estado = 'borrador' and c0.por_agente is not null
       and c0.fecha = public.hoy_caracas() and c0.desde is not distinct from v_desde and c0.hasta is not distinct from v_hasta
       and (select coalesce(string_agg(lower(i.descripcion) || '|' || i.cantidad::numeric(10,2) || '|' || i.precio_usd::numeric(12,2), E'\n' order by i.orden), '')
              from public.cobro_items i where i.cobro_id = c0.id)
         = (select coalesce(string_agg(lower(x ->> 'descripcion') || '|' || (x ->> 'cantidad')::numeric(10,2) || '|' || (x ->> 'precio_usd')::numeric(12,2), E'\n' order by (x ->> 'orden')::int), '')
              from jsonb_array_elements(v_reng) x)
     order by c0.creado_en desc limit 1;
    if c.id is not null then
      return jsonb_build_object('nota_id', c.id, 'numero', c.numero, 'empresa', e.razon_social, 'ya_existia', true, 'total_usd', v_sub - v_desc,
        'ruta', '/facturacion/' || c.id, 'imprimir_factura', jsonb_build_object('ruta', '/imprimir/factura/' || c.id), '_empresa', e.id);
    end if;
  end if;
  if p_ensayo then
    return jsonb_build_object('nota', 'Se crearía en borrador para ' || e.razon_social, 'empresa', e.razon_social, 'ya_existia', false,
      'atendidos', v_natend, 'atendidos_sin_servicio', v_sin, 'subtotal_usd', v_sub, 'descuento_usd', v_desc, 'total_usd', v_sub - v_desc,
      'renglones', (select coalesce(jsonb_agg(x - 'consulta_id' - 'detalle' - 'orden'), '[]'::jsonb) from jsonb_array_elements(v_reng) x where x ->> 'consulta_id' is null),
      '_empresa', e.id);
  end if;
  insert into public.cobros (org_id, empresa_id, tipo, desde, hasta, observacion, presupuesto_id, por_agente)
  values (o, e.id, 'cobro', v_desde, v_hasta, v_obs, v_pre, k.nombre) returning * into c;
  insert into public.cobro_items (cobro_id, org_id, servicio_id, consulta_id, descripcion, detalle, cantidad, precio_usd, orden)
  select c.id, o, nullif(x ->> 'servicio_id', '')::uuid, nullif(x ->> 'consulta_id', '')::uuid, x ->> 'descripcion', x ->> 'detalle',
         (x ->> 'cantidad')::numeric, (x ->> 'precio_usd')::numeric, (x ->> 'orden')::integer
    from jsonb_array_elements(v_reng) x;
  return jsonb_build_object('nota_id', c.id, 'numero', c.numero, 'empresa', e.razon_social, 'ya_existia', false,
    'atendidos', v_natend, 'atendidos_sin_servicio', v_sin, 'subtotal_usd', v_sub, 'descuento_usd', v_desc, 'total_usd', v_sub - v_desc,
    'ruta', '/facturacion/' || c.id, 'imprimir_factura', jsonb_build_object('ruta', '/imprimir/factura/' || c.id), '_empresa', e.id);
end $$;

create or replace function public.agente_fac_notas(o uuid, k public.agentes_llaves, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_notas jsonb := '[]'::jsonb;
  r jsonb; n integer := 0; v jsonb; v_total numeric := 0; v_nuevas integer := 0;
begin
  if jsonb_typeof(d -> 'notas') is distinct from 'array' or jsonb_array_length(d -> 'notas') not between 1 and 20 then
    perform public.agente_no('«notas» debe traer de 1 a 20 notas (una por empresa).');
  end if;
  for r in select * from jsonb_array_elements(d -> 'notas') loop
    n := n + 1;
    if jsonb_typeof(r) <> 'object' then perform public.agente_no('Nota ' || n || ': debe ser un objeto con empresa_id.'); end if;
    v := public.agente_fac_una_nota(o, k, r, n, p_ensayo);
    v_notas := v_notas || (v - '_empresa');
    v_total := v_total + coalesce((v ->> 'total_usd')::numeric, 0);
    if not coalesce((v ->> 'ya_existia')::boolean, false) then v_nuevas := v_nuevas + 1; end if;
  end loop;
  return jsonb_build_object('notas', v_notas, 'total_usd', v_total,
    'aviso', 'Quedan en BORRADOR. El doctor las revisa, las emite e imprime la factura (ahí se pone el Nº del talonario y, al pagar, la tasa BCV del día del pago).',
    '_empresa', case when n = 1 then v ->> '_empresa' end,
    '_resumen', case when p_ensayo then 'Crearía ' || v_nuevas || ' nota(s) en borrador'
                     else v_nuevas || ' nota(s) en borrador' end || ' · ' || v_total || ' USD');
end $$;

create or replace function public.agente_fac_proponer_precio(o uuid, k public.agentes_llaves, d jsonb, p_ensayo boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_serv uuid := public.agente_uuid(d, 'servicio_id');
  v_precio numeric := public.agente_num(d, 'precio_usd', 0, 100000);
  v_motivo text := public.agente_txt(d, 'motivo', 300);
  e public.empresas;
  s public.servicios;
  v_antes numeric; v_tipo text; v_titulo text;
  pp public.agentes_propuestas;
begin
  if v_serv is null then perform public.agente_no('Falta «servicio_id» (catalogo, tipo servicios).'); end if;
  if v_precio is null then perform public.agente_no('Falta «precio_usd», el precio nuevo.'); end if;
  select * into s from public.servicios where id = v_serv and org_id = o;
  if not found then perform public.agente_no('No encuentro ese servicio.'); end if;
  if d ? 'empresa_id' then
    e := public.agente_empresa(o, d);
    v_tipo := 'precio_empresa';
    v_antes := public.agente_fac_precio(e.id, s);
    v_titulo := 'Precio de «' || s.nombre || '» para ' || e.razon_social;
  else
    v_tipo := 'precio_servicio';
    v_antes := s.precio_usd;
    v_titulo := 'Precio de «' || s.nombre || '» (catálogo general)';
  end if;
  if v_antes = v_precio then
    return jsonb_build_object('propuesta', 'Ese ya es el precio: ' || v_precio || ' USD. No hace falta proponer nada.', 'ya_existia', true,
      '_empresa', e.id, '_resumen', 'Precio sin cambio');
  end if;
  select * into pp from public.agentes_propuestas x
   where x.org_id = o and x.tipo = v_tipo and x.objeto_id = s.id and x.empresa_id is not distinct from e.id
     and x.estado = 'pendiente' and (x.propuesto ->> 'precio_usd')::numeric = v_precio
   limit 1;
  if found then
    return jsonb_build_object('propuesta_id', pp.id, 'propuesta', pp.titulo || ': ' || v_antes || ' → ' || v_precio || ' USD (ya estaba propuesta)',
      'ya_existia', true, '_empresa', e.id, '_resumen', 'Propuesta de precio ya existía');
  end if;
  if p_ensayo then
    return jsonb_build_object('propuesta', 'Se propondría: ' || v_titulo || ': ' || v_antes || ' → ' || v_precio || ' USD. Cambia solo cuando el doctor la apruebe.',
      'ya_existia', false, '_empresa', e.id, '_resumen', 'Propondría ' || v_antes || ' → ' || v_precio || ' USD');
  end if;
  insert into public.agentes_propuestas (org_id, empresa_id, llave_id, llave_nombre, tipo, objeto_id, titulo, antes, propuesto, motivo)
  values (o, e.id, k.id, k.nombre, v_tipo, s.id, v_titulo,
          jsonb_build_object('precio_usd', v_antes), jsonb_build_object('precio_usd', v_precio), v_motivo)
  returning * into pp;
  return jsonb_build_object('propuesta_id', pp.id, 'propuesta', v_titulo || ': ' || v_antes || ' → ' || v_precio || ' USD',
    'ya_existia', false, 'aviso', 'El precio NO cambió todavía: el doctor lo aprueba en Configuración > Puerta para agentes > Propuestas.',
    'ruta', '/configuracion/agentes', '_empresa', e.id, '_resumen', 'Propuso ' || v_titulo || ': ' || v_antes || ' → ' || v_precio || ' USD');
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'agente\_fac\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- ===== 3. La entrada: lo único que llama el agente para cobros =====
create or replace function public.puerta_facturacion(p_llave text, p_accion text, p_datos jsonb default '{}'::jsonb, p_ensayo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k public.agentes_llaves;
  d jsonb := case when jsonb_typeof(p_datos) = 'object' then p_datos else '{}'::jsonb end;
  v_acc text := lower(btrim(coalesce(p_accion, '')));
  v_ensayo boolean := coalesce(p_ensayo, false);
  v_escribe boolean;
  v_res jsonb;
  v_err text;
  v_det text;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_rol text := current_setting('request.jwt.claim.role', true);
begin
  if p_llave is null or length(p_llave) not between 20 and 200 then
    return jsonb_build_object('ok', false, 'error', 'Falta la llave.');
  end if;
  select * into k from public.agentes_llaves where huella = encode(sha256(convert_to(p_llave, 'UTF8')), 'hex');
  if not found or k.revocada_en is not null or k.vence_en <= public.ahora() then
    return jsonb_build_object('ok', false, 'error', 'Llave no válida, vencida o apagada. El doctor crea otra en Configuración > Puerta para agentes.');
  end if;
  if not exists (select 1 from public.miembros m
                  where m.org_id = k.org_id and m.usuario_id = k.creada_por and m.activo
                    and m.rol = 'administrador' and m.empresas_permitidas is null) then
    return jsonb_build_object('ok', false, 'error', 'Quien creó esta llave ya no administra la organización.');
  end if;
  if length(d::text) > 60000 then
    return jsonb_build_object('ok', false, 'error', 'Los datos son demasiado grandes.');
  end if;
  if (select count(*) from public.agentes_registro r where r.llave_id = k.id and r.en > public.ahora() - interval '1 minute') >= 120 then
    return jsonb_build_object('ok', false, 'error', 'Demasiadas llamadas seguidas. Espera un minuto.');
  end if;

  v_escribe := case
    when v_acc in ('listar_cobros', 'atendidos_por_cobrar') then false
    when v_acc in ('crear_notas_cobro', 'proponer_precio') then true
  end;
  if v_escribe is null then
    v_err := 'Acción desconocida. Las de cobros: listar_cobros, atendidos_por_cobrar, crear_notas_cobro, proponer_precio.';
  elsif not k.cobros then
    v_err := 'Esta llave no tiene encendido «Cobros y precios». El doctor lo enciende en Configuración > Puerta para agentes.';
  elsif v_escribe and k.permiso <> 'crear' then
    v_err := 'Esta llave solo consulta. Para crear, el doctor genera una llave con permiso de crear.';
  else
    -- OJO: esto NO activa la RLS (la función es security definer y la salta). Sirve para que auth.uid() sea el
    -- administrador que creó la llave en la bitácora, los disparadores y el filtro de la vista public.atenciones.
    -- La frontera real es el filtro «org_id = k.org_id» que cada ayudante agente_fac_* pone a mano.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', k.creada_por, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', k.creada_por::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      v_res := case v_acc
        when 'listar_cobros' then public.agente_fac_listar(k.org_id, d)
        when 'atendidos_por_cobrar' then public.agente_fac_atendidos(k.org_id, d)
        when 'crear_notas_cobro' then public.agente_fac_notas(k.org_id, k, d, v_ensayo)
        when 'proponer_precio' then public.agente_fac_proponer_precio(k.org_id, k, d, v_ensayo)
      end;
    exception
      when sqlstate 'ZA400' then v_err := sqlerrm;
      when others then
        get stacked diagnostics v_det = message_text;
        v_err := 'No se pudo completar (' || sqlstate || '). No se guardó nada de esta acción.';
    end;
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(v_rol, ''), true);
  end if;

  update public.agentes_llaves set ultimo_uso_en = public.ahora(), usos = usos + 1 where id = k.id;
  insert into public.agentes_registro (org_id, llave_id, llave_nombre, accion, ensayo, ok, empresa_id, resumen, error)
  values (k.org_id, k.id, k.nombre, left(v_acc, 40), v_ensayo and coalesce(v_escribe, false), v_err is null,
          case when v_res ->> '_empresa' is not null
                and exists (select 1 from public.empresas e where e.id = (v_res ->> '_empresa')::uuid and e.org_id = k.org_id)
               then (v_res ->> '_empresa')::uuid end,
          left(coalesce(v_res ->> '_resumen', case when v_err is null then 'Consulta de cobros' end), 300),
          left(coalesce(v_det, v_err), 500));
  if v_err is not null then
    return jsonb_build_object('ok', false, 'accion', v_acc, 'error', v_err);
  end if;
  return jsonb_build_object('ok', true, 'accion', v_acc, 'ensayo', v_ensayo and v_escribe, 'resultado', v_res - '_empresa' - '_resumen');
end $$;
comment on function public.puerta_facturacion(text, text, jsonb, boolean) is
  'Puerta para agentes, cobros y precios: notas en borrador y propuestas de precio, con llave y alcance «cobros». La ejecuta un anónimo A PROPÓSITO (la llave es la credencial) (20261030954000).';
revoke execute on function public.puerta_facturacion(text, text, jsonb, boolean) from public;
grant execute on function public.puerta_facturacion(text, text, jsonb, boolean) to anon, authenticated;

-- ===== 4. «Aprobar» un precio propuesto: con la sesión del doctor (security INVOKER: manda la RLS de servicios y
--          precios_empresa, que exige poder facturar). p_datos.precio_usd permite corregir el precio al aprobar. =====
create or replace function public.aplicar_propuesta_precio(p_id uuid, p_datos jsonb default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  pp public.agentes_propuestas;
  v numeric;
begin
  select * into pp from public.agentes_propuestas where id = p_id;
  if not found then raise exception 'No encuentro esa propuesta.' using errcode = 'P0001'; end if;
  if pp.tipo not in ('precio_servicio', 'precio_empresa') then raise exception 'No es una propuesta de precio.' using errcode = 'P0001'; end if;
  if pp.estado <> 'pendiente' then raise exception 'Esa propuesta ya se resolvió.' using errcode = 'P0001'; end if;
  if not public.puede_facturar(pp.org_id) then raise exception 'Solo quien factura aprueba precios.' using errcode = '42501'; end if;
  begin
    v := coalesce(nullif(p_datos ->> 'precio_usd', '')::numeric, (pp.propuesto ->> 'precio_usd')::numeric);
  exception when others then raise exception 'El precio no es un número.' using errcode = 'P0001';
  end;
  if v is null or v < 0 or v > 100000 then raise exception 'El precio debe estar entre 0 y 100000 USD.' using errcode = 'P0001'; end if;
  if pp.tipo = 'precio_servicio' then
    update public.servicios set precio_usd = v where id = pp.objeto_id and org_id = pp.org_id;
    if not found then raise exception 'Ese servicio ya no existe.' using errcode = 'P0001'; end if;
  else
    if pp.empresa_id is null or not exists (select 1 from public.servicios s where s.id = pp.objeto_id and s.org_id = pp.org_id) then
      raise exception 'Ese servicio o esa empresa ya no existen.' using errcode = 'P0001';
    end if;
    insert into public.precios_empresa (empresa_id, servicio_id, org_id, precio_usd) values (pp.empresa_id, pp.objeto_id, pp.org_id, v)
    on conflict (empresa_id, servicio_id) do update set precio_usd = excluded.precio_usd;
  end if;
  update public.agentes_propuestas set estado = 'aprobada', resuelto_por = auth.uid(), resuelto_en = public.ahora() where id = pp.id;
  return jsonb_build_object('ok', true, 'precio_usd', v);
end $$;
revoke execute on function public.aplicar_propuesta_precio(uuid, jsonb) from public, anon;
grant execute on function public.aplicar_propuesta_precio(uuid, jsonb) to authenticated;

-- ===== 5. Ninguna nota de cobro sale (emitida o pagada) con total negativo: un descuento mayor que la nota se frena
--          aquí aunque el renglón negativo lo haya escrito una persona (el editor ya avisa antes). =====
create or replace function public.cobro_total_no_negativo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo = 'cobro' and new.estado in ('emitida', 'pagada') and old.estado = 'borrador'
     and (select coalesce(sum(round(i.cantidad * i.precio_usd, 2)), 0) from public.cobro_items i where i.cobro_id = new.id) < 0 then
    raise exception 'El total de la nota queda en negativo. Revisa el descuento antes de emitirla.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists cobro_total_no_negativo on public.cobros;
create trigger cobro_total_no_negativo before update of estado on public.cobros
  for each row execute function public.cobro_total_no_negativo();
revoke execute on function public.cobro_total_no_negativo() from public, anon;
