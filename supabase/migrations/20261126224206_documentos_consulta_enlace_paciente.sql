-- El enlace clínico del paciente ya protege los PDF con cédula y vencimiento.
alter table public.enlaces_trabajador drop constraint enlaces_trabajador_documento_check;
alter table public.enlaces_trabajador add constraint enlaces_trabajador_documento_check
  check (documento in ('recipe', 'orden', 'referencia', 'informe-trabajador', 'atencion', 'constancia', 'reposo',
                       'control-ta', 'dieta', 'bienestar', 'libre', 'recomendaciones-laborales', 'reubicacion'));

do $migracion$
declare
  par text[];
  definicion text;
begin
  foreach par slice 1 in array array[
    array['public.listar_enlace_trabajador(text)',
      $antes$'control-ta', 'dieta', 'bienestar']) d$antes$,
      $despues$'control-ta', 'dieta', 'bienestar', 'libre', 'recomendaciones-laborales', 'reubicacion']) d$despues$],
    array['public.abrir_enlace_trabajador(text,text,text,text)',
      '  if v_enlace.pide_cedula then',
      $despues$  if v_enlace.pide_cedula then
    -- Una sola comprobación a la vez por paquete, incluso al pedir documentos distintos.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'enlace-paciente:' || coalesce(v_enlace.paquete, v_enlace.id)::text, 0));
    select * into v_enlace from public.enlaces_trabajador where id = v_enlace.id for share;
    if v_enlace.id is null or v_enlace.revocado_en is not null or v_enlace.vence < public.ahora() then
      return query select null::text, null::text, 'no_disponible'::text; return;
    end if;$despues$],
    array['public.abrir_enlace_trabajador(text,text,text,text)',
      'if length(v_cedula) < 4 or v_dada <> v_cedula then',
      'if coalesce(length(v_cedula), 0) <> 4 or v_dada is distinct from v_cedula then']
  ] loop
    definicion := replace(pg_get_functiondef(par[1]::regprocedure), chr(13), '');
    if length(definicion) - length(replace(definicion, par[2], '')) <> length(par[2]) then
      raise exception 'Cambió la definición de %; revisar el enlace de consulta', par[1];
    end if;
    execute replace(definicion, par[2], par[3]);
  end loop;
end $migracion$;
