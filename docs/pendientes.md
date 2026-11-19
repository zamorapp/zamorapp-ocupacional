# Pendientes (corte: 19-nov-2026, tarde)

Actualiza este archivo cada vez que algo se abra o se cierre.

## Último publicado
- Web en `main` bf01dbbb (tanda 22, 19-nov) + escritorio **0.1.528**: #398 paraclínicos «{}» o null ya no tumban el panel ni la consulta (rehecho de la vieja #97; frase de Cesar: «sí paraclínicos»).
- Tanda 21 (19-nov, solo prueba, sin versión del escritorio): #397 el casillero del CI de Windows arreglado de raíz (CI verde).
- Tanda 20 (19-nov): web en `main` 52a77981 + escritorio **0.1.526**: #395 depuración en una sola llamada (migración 970) y #396 tarjeta de aviso con «Revisar»/«Ignorar»; arreglo del CI Linux (onnxruntime CUDA 404).
- Migraciones en el repo hasta `20261030970000`; 966/968/969 verificadas el 18-nov y 970000 aplicada y verificada en producción el 19-nov (registro en `schema_migrations`, función con 2 argumentos, anon sin permiso y authenticated con permiso).

## En curso
- **Funciones nuevas de la puerta para agentes** (pedidas por Cesar el 18-nov; modelo confirmado el 19-nov): **semi-automatización** — el agente crea/prepara, Cesar aprueba (visualiza) y solo se ejecuta con su sí; si dice «hágalo todo completo», el agente lo deja listo completo solo para que él lo visualice. En diseño: anular/cambiar/posponer citas **de a una, con su aprobación cada vez**; constancias en borrador; leer el registro de accidentes; consulta e historia en borrador bajo su tutela; notas de cobro con tasa BCV del día de la factura y texto fijo de pago (confirmado); envío de correos con archivos solo aprobados uno por uno; mover trabajador de empresa solo con su aprobación; análisis de vigilancia más natural, a su estilo. Primera tanda en construcción: constancias en borrador + notas de cobro.
- **«Perfil normal» (definición de Cesar, 18-nov)**: persona evaluada sin condiciones patológicas, en buenas condiciones generales, examen físico y funcional sin alteraciones en todas sus esferas; en cualquier evaluación ocupacional sale con las recomendaciones normales/idóneas para un trabajador. Si hay alguna condición, Cesar dicta el diagnóstico, las medidas y los perfiles que apliquen; si un perfil no existe, él indica cómo crearlo y el agente puede analizar y recomendar.
- **Botones de WhatsApp sin teléfono en la ficha (19-nov)**: hoy, si el trabajador no tiene teléfono, el botón abre el selector de contactos vacío y confunde (caso real: un paciente en espera sin número en la ficha; se le guardó por SQL y ya enlaza). Propuesta aprobada por Cesar («que se aplique también para otras personas enlazadas»): que el botón pida el número al momento y ofrezca guardarlo en la ficha. Falta hacer el PR.
- **Registro de médicos especialistas para referencias (pedido el 19-nov)**: stock de especialistas con nombre y apellido, especialidad, dirección (si la tiene) y contacto; al hacer una referencia salen el nombre, la especialidad y la dirección del especialista, más todo el desarrollo de la referencia. En diseño (migración nueva + pantalla de registro + integración con la referencia).

## Esperando a Cesar (manual)
- Firmar las evaluaciones pendientes de una empresa y sacar su PDF con la fecha de impresión que pidió el cliente.
- Guardar el número de factura de una nota de cobro; calibrar la factura con «Hoja de prueba».
- Prueba real de winspiroPRO con el espirómetro.
- Decisiones viejas sin respuesta: «sí fase uno» (hoja de ruta), «sí antropometría», «sí escritorio»; borrar 2 borradores; red de consultorios (5 respuestas); ergonomía: «más preguntas en DEB» (sin definir).

## Resuelto el 19-nov (tanda 20)
- **Confirmar depuración se colgaba en el celular** (botón «dando vueltas» con 76 personas): arreglado de raíz con `public.aplicar_depuracion_nomina(p_id uuid, p_excluir uuid[])` (migración 970000, PR #395): una sola llamada agrupa por motivo, encadena el lote y cierra la depuración. Frase de Cesar (18-nov): «Sé correcto arreglar los dos problemas de raíz tanto del escritorio como del celular de una vez».
- **El aviso de Windows del escritorio no abría nada al tocarlo**: el globo de Windows no es clicable de forma confiable; ahora cada aviso aparece además como tarjeta fija dentro de la app con «Revisar» (va al enlace) e «Ignorar» (PR #396). Lo que NO hace todavía: el globo del centro de actividades de Windows sigue sin ser clicable, por eso existe la tarjeta.
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
