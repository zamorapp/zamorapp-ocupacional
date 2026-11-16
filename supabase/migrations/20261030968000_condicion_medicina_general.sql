-- zamorApp Ocupacional · Evaluación de condición en las consultas de medicina general (pedido de Cesar, 16-nov-2026)
-- «Cuando las consultas sean de medicina general, las condiciones de elegible o no elegible no deberían estar porque no
-- se tratan de evaluaciones ocupacionales. No hay elegibilidad de cargo sino de condición: puede seguir en el trabajo o
-- no; puede acudir a sus funciones generales en el puesto o no.»
-- 1) clinico.consultas.condicion: lo elegido al cerrar ({trabajo: texto, funciones: texto, nota: texto}). Se guarda el
--    TEXTO: editar la lista después no cambia lo ya emitido. null = consulta anterior a esto o preventiva.
-- 2) guardar_consulta la guarda solo si llega la clave (un guardado viejo de la bandeja o del celular no la borra).
--    Parche por texto (parche_unico: quita \r y exige que el ancla aparezca una sola vez); no se recrea la función.
-- 3) Lista «condicion_trabajador» (Configuración › Listas › Evaluación de condición): grupo = la pregunta (trabajo,
--    funciones); cada organización agrega, cambia o desactiva opciones. Base en la nube; la PC la recibe por la réplica.
-- No toca la aptitud (clinico.aptitudes) ni los reportes: las evaluaciones preventivas siguen igual.

alter table clinico.consultas add column if not exists condicion jsonb;
alter table clinico.consultas drop constraint if exists consultas_condicion_check;
alter table clinico.consultas add constraint consultas_condicion_check
  check (condicion is null or (jsonb_typeof(condicion) = 'object' and pg_column_size(condicion) < 4096));

select public.vistas_al_dia();

create or replace function public.parche_unico(p_def text, p_viejo text, p_nuevo text, p_donde text)
returns text language plpgsql immutable set search_path = public as $$
declare v_def text := replace(p_def, chr(13), ''); v_viejo text := replace(p_viejo, chr(13), '');
begin
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception '% cambió: revisar 20261030968000 antes de aplicarla (%)', p_donde, left(v_viejo, 60);
  end if;
  return replace(v_def, v_viejo, replace(p_nuevo, chr(13), ''));
end $$;
revoke execute on function public.parche_unico(text, text, text, text) from public, anon, authenticated;

do $$
declare v_def text := pg_get_functiondef('public.guardar_consulta(uuid,jsonb,jsonb,jsonb,jsonb,boolean)'::regprocedure);
begin
  -- Ya aplicada (se pegó dos veces): no se vuelve a parchear
  if position('condicion = case' in v_def) > 0 then return; end if;
  execute public.parche_unico(v_def,
    '    especialidad = nullif(trim(p_consulta ->> ''especialidad''), ''''),',
    '    -- Evaluación de condición (medicina general): sin la clave se conserva; solo textos, una por pregunta
    condicion = case
      when not (p_consulta ? ''condicion'') then condicion
      when jsonb_typeof(p_consulta -> ''condicion'') <> ''object'' then null
      else nullif(coalesce((
        select jsonb_object_agg(g.key, left(trim(g.value #>> ''{}''), 600))
          from jsonb_each(p_consulta -> ''condicion'') g
         where jsonb_typeof(g.value) = ''string'' and trim(g.value #>> ''{}'') <> '''' and length(g.key) <= 40), ''{}''::jsonb), ''{}''::jsonb) end,
    especialidad = nullif(trim(p_consulta ->> ''especialidad''), ''''),',
    '968 guardar_consulta');
end $$;

drop function public.parche_unico(text, text, text, text);

-- Lista de opciones: solo en la nube (en la PC llega por la réplica con los ids de la nube)
do $$
begin
  if public.es_base_local() then return; end if;

  insert into public.listas (codigo, nombre, descripcion) values
    ('condicion_trabajador', 'Evaluación de condición',
     'Cierre de las consultas de medicina general (no preventivas). Grupo = la pregunta: «trabajo» (¿puede seguir en su trabajo?) o «funciones» (¿puede cumplir sus funciones en el puesto?); se elige una opción por pregunta')
  on conflict (codigo) do nothing;

  insert into public.lista_items (lista, codigo, nombre, grupo, orden)
  select v.lista, v.codigo, v.nombre, v.grupo, v.orden
  from (values
    ('condicion_trabajador', 'trabajo_si', 'Puede continuar en su trabajo', 'trabajo', 1),
    ('condicion_trabajador', 'trabajo_no', 'No puede continuar en su trabajo', 'trabajo', 2),
    ('condicion_trabajador', 'funciones_si', 'Puede cumplir sus funciones generales en el puesto de trabajo', 'funciones', 3),
    ('condicion_trabajador', 'funciones_limitadas', 'Puede cumplir sus funciones con limitaciones temporales', 'funciones', 4),
    ('condicion_trabajador', 'funciones_no', 'No puede cumplir sus funciones generales en el puesto de trabajo', 'funciones', 5)
  ) as v(lista, codigo, nombre, grupo, orden)
  where not exists (select 1 from public.lista_items i where i.org_id is null and i.lista = v.lista and i.codigo = v.codigo);

  perform public.copiar_listas_base(id) from public.organizaciones;
end $$;
