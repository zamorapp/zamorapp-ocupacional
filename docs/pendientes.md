# Pendientes (corte: 18-nov-2026)

Actualiza este archivo cada vez que algo se abra o se cierre.

## Último publicado
- Web en `main` a08ce455 (tanda 19, 18-nov): #391 «(prueba)» en el título del escritorio, #392 invitar por enlace con rol (migración 966), #393 «Evaluación de condición» en medicina general (968), #394 posponer consulta + arreglo de la bandeja (969).
- Escritorio **0.1.524**: incluye la tanda 19 y el audio de la consulta (#379) que faltaba por salir.
- Migraciones en el repo hasta `20261030969000`; 966/968/969 verificadas aplicadas en producción el 18-nov.

## En curso
- **Funciones nuevas de la puerta para agentes** (pedidas por Cesar el 18-nov, en diseño): vencimientos de exámenes por empresa; anular/cambiar/posponer citas **de a una, con su aprobación cada vez**; constancias en borrador; leer el registro de accidentes; consulta e historia en borrador bajo su tutela; notas de cobro con tasa BCV del día de la factura y texto fijo de pago (confirmado); envío de correos con archivos solo aprobados uno por uno; mover trabajador de empresa solo con su aprobación; análisis de vigilancia más natural, a su estilo.
- **«Perfil normal» (definición de Cesar, 18-nov)**: persona evaluada sin condiciones patológicas, en buenas condiciones generales, examen físico y funcional sin alteraciones en todas sus esferas; en cualquier evaluación ocupacional sale con las recomendaciones normales/idóneas para un trabajador. Si hay alguna condición, Cesar dicta el diagnóstico, las medidas y los perfiles que apliquen; si un perfil no existe, él indica cómo crearlo y el agente puede analizar y recomendar.

## Esperando a Cesar (manual)
- Firmar las evaluaciones pendientes de una empresa y sacar su PDF con la fecha de impresión que pidió el cliente.
- Guardar el número de factura de una nota de cobro; calibrar la factura con «Hoja de prueba».
- Prueba real de winspiroPRO con el espirómetro.
- Decisiones viejas sin respuesta: «sí fase uno» (hoja de ruta), «sí antropometría», «sí escritorio»; borrar 2 borradores; red de consultorios (5 respuestas); ergonomía: «más preguntas en DEB» (sin definir).

## Errores por arreglar (18-nov) — YA ANALIZADOS, falta escribirlos
Frase de Cesar (18-nov): «Sé correcto arreglar los dos problemas de raíz tanto del escritorio como del celular de una vez».
1. **Confirmar depuración se cuelga**: `confirmarDepuracion` (src/app/(app)/empresas/[id]/depurar-nomina-acciones.ts) llama `aplicarParteNomina` por grupos en serie desde la acción; en el celular la acción muere antes de la primera RPC (el botón gira y no aplica nada; se resolvió a mano por SQL con `aplicar_nomina` + `cerrar_depuracion_nomina`). **Diseño acordado**: función nueva `public.aplicar_depuracion_nomina(p_id uuid)` en migración **970000** (número reservado): lee la depuración `for update`, valida `maneja_depuracion` y que no esté cerrada, agrupa por motivo (texto `Ya no está según RR. HH. (DD/MM/AAAA)` + `: motivo` si hay), llama `public.aplicar_nomina` por grupo encadenando el lote, y cierra la depuración (`aplicado_en` + `lote_id`). Los agregados con cédula siguen por el camino viejo en TS (pocos). La acción pasa a: permiso + una RPC + agregados si los hay + `cerrar_depuracion_nomina`. Prueba nueva: `supabase/pruebas/232_aplicar_depuracion.sql`. `en_nomina` = `estado in ('activo','reposo','aspirante')` (igual que en `revision_depuracion_nomina`).
2. **El aviso de Windows del escritorio no abre nada al tocarlo**: `avisoWindows` (src/lib/escritorio.ts:88) usa `plugin:notification|notify` solo con título y cuerpo, sin acción de clic. En el celular el push sí abre la revisión. **Dirección**: que el aviso lleve acción «Abrir» (o un aviso visible dentro de la app con botón «Revisar»/«Ignorar») que navegue al `enlace` del aviso (`/empresas/<id>`); hoy `avisarEnWindows` (src/components/app/notificaciones.tsx:29) ni siquiera pasa el enlace. Plugin: tauri-plugin-notification v2 (escritorio/src-tauri).
- Dato verificado (sin cambio): los inactivos se encuentran por nombre y cédula en la app (atencion/acciones.ts:122-132, activos primero) y en la puerta (`buscar_trabajadores` muestra `estado: inactivo`). La persona en «reposo» quedó inactiva con las 76 (decisión de Cesar: ya no labora).

## Limitaciones conocidas
- Enfermería no edita atenciones (solo borrar en 24 h y volver a registrar). Las indicaciones no se editan (anular y emitir otra).
- Los PDF que exigen la sesión de Cesar (`/imprimir/lote`) solo los genera él.
- La prueba `scripts/pruebas/aplicar-migraciones.test.mjs` falla en `main` por un SHA viejo en `supabase/migraciones-aprobadas.json` (quedó de la etiqueta del 05-nov): pendiente regenerar el manifiesto con `scripts/migraciones/preparar-etiqueta.mjs` y su etiqueta.

## Puerta para agentes
- Llave «kimi» encendida (consulta y crea + las 3 casillas), vence el 18-dic-2026. Su valor vive solo en `C:\Users\58412\Documents\zamorApp\puerta-agentes.txt` de la PC de Cesar (nunca en el repo ni en el chat). Probada el 18-nov con la acción «resumen».

## PR abiertos antiguos
- Cerrados el 18-nov por estar ya en `main` por otra vía: #316, #286, #260, #234, #123, #111, #93.
- Siguen vivos (8), Cesar no ha decidido si retomar alguno: #181 «Poner todo al día» · #114 resultados por lote · #100 envíos rápidos · #99 constancias por bloques · #98 «Guardando…» · #97 paraclínicos «{}» · #94 pacientes paginado · #78 confirmación de cuenta.
- Antes de cerrar o retomar uno: `git merge-base --is-ancestor <sha> origin/main`.

## Vencimientos
- `DESCARGAS_TOKEN`: renovar antes del 06-oct-2027 (vence 27-oct-2027).
- `TRAFICO_TOKEN`: renovar antes del 09-oct-2027.
