# Pendientes (corte: 26-nov-2026)

Actualiza este archivo cada vez que algo se abra o se cierre.

## Último publicado
- Web y móvil (tanda 26, PR #402): **actividad de RR. HH. por empresa y avisos de evaluaciones firmadas y constancias listas**. Migración `20261126042747` aplicada y verificada en Supabase antes de la fusión. La tanda también actualiza Next.js y PostCSS, corrige el latido web, estabiliza la prueba de avisos y mejora el arranque y diagnóstico de Escritorio. La prueba de Windows sigue en curso al registrar este corte.
- Web en `main` 8329d0ca (tanda 24, 20-nov): **#400 registro de especialistas para las referencias** (migración 971, aplicada y verificada en producción antes de fusionar; frase de Cesar: «sí especialistas»). Pantalla en Configuración › Especialistas, selector en Interconsultas, carta «Especialista en …» con su consultorio.
- Tanda 23 (20-nov): #399 WhatsApp de la agenda pide el número al momento si la ficha no tiene teléfono (frase: «sí teléfono»); escritorio **0.1.529**.
- Tanda 22 (19-nov): #398 paraclínicos «{}» (frase: «sí paraclínicos»); escritorio **0.1.528**.
- Migraciones en el repo hasta `20261030970000`; 966/968/969 verificadas el 18-nov y 970000 aplicada y verificada en producción el 19-nov (registro en `schema_migrations`, función con 2 argumentos, anon sin permiso y authenticated con permiso).

## En curso

- **Nómina desde RR. HH.**. Pendiente habilitar que RR. HH. inicie una actualización de la nómina o genere el enlace desde su propia sesión, con permiso por empresa.
- **Funciones nuevas de la puerta para agentes** (pedidas por Cesar el 18-nov; modelo confirmado el 19-nov): **semi-automatización** — el agente crea/prepara, Cesar aprueba (visualiza) y solo se ejecuta con su sí; si dice «hágalo todo completo», el agente lo deja listo completo solo para que él lo visualice. En diseño: anular/cambiar/posponer citas **de a una, con su aprobación cada vez**; constancias en borrador; leer el registro de accidentes; consulta e historia en borrador bajo su tutela; notas de cobro con tasa BCV del día de la factura y texto fijo de pago (confirmado); envío de correos con archivos solo aprobados uno por uno; mover trabajador de empresa solo con su aprobación; análisis de vigilancia más natural, a su estilo. Primera tanda en construcción: constancias en borrador + notas de cobro.
- **«Perfil normal» (definición de Cesar, 18-nov)**: persona evaluada sin condiciones patológicas, en buenas condiciones generales, examen físico y funcional sin alteraciones en todas sus esferas; en cualquier evaluación ocupacional sale con las recomendaciones normales/idóneas para un trabajador. Si hay alguna condición, Cesar dicta el diagnóstico, las medidas y los perfiles que apliquen; si un perfil no existe, él indica cómo crearlo y el agente puede analizar y recomendar.
- **Botones de WhatsApp sin teléfono en la ficha (19-nov)**: RESUELTO (tanda 23, PR #399): si no hay teléfono, el botón pide el número al momento y ofrece guardarlo en la ficha. Queda pendiente completar la nómina de teléfonos poco a poco (400 activos sin teléfono según la auditoría del 19-nov; con el botón se hace solo al usarlo).
- **Registro de médicos especialistas para referencias (pedido el 19-nov)**: PUBLICADO (tanda 24, PR #400, migración 971 en producción). Stock con nombre y apellido, especialidad, dirección (si la tiene) y contacto; la referencia sale «Especialista en …» a su nombre con su consultorio.

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

## Auditoría del 19-nov (tarde)
- **Producción sin errores reales en 7 días** (Vercel): solo un aviso de obsolescencia de Node (`url.parse`) en `/api/avisos/campana`, 6 veces desde el 30-oct; migrar a WHATWG URL cuando se toque ese archivo.
- **Datos**: 3.854 trabajadores activos; **400 sin teléfono** (10 %: por eso a veces el botón de WhatsApp no enlaza; con el PR del botón queda cubierto el flujo, y se puede completar la nómina de teléfonos poco a poco). Paraclínicos «{}»: **0** en la base (el arreglo del PR #398 es preventivo). Sin citas huérfanas ni cédulas duplicadas. Solicitudes de registro por revisar: 0. Cobros emitidos sin pagar: 1.
- **Código**: `tsc` y `build` en verde; eslint: 0 errores, 89 avisos viejos (variables sin usar y similares; limpiar de a poco al tocar cada archivo). Pruebas de scripts: 197 pasan, 0 fallan, 10 omitidas (la falla vieja del manifiesto SHA ya no aparece).
- **Administrativo**: cuentas por cobrar YA existe (Facturación: notas emitidas sin pagar por empresa y antigüedad, con abonos parciales y su referencia). **Cuentas por pagar NO existe**: propuesta de módulo nuevo (acreedor, concepto, monto, vencimiento, pagos con número de operación), espejo de cobros. Esperando el sí de Cesar.

## Puerta para agentes
- Llave «kimi» encendida (consulta y crea + las 3 casillas), vence el 18-dic-2026. Su valor vive solo en `C:\Users\58412\Documents\zamorApp\puerta-agentes.txt` de la PC de Cesar (nunca en el repo ni en el chat). Probada el 18-nov con la acción «resumen».

## PR abiertos antiguos
- Cerrados el 18-nov por estar ya en `main` por otra vía: #316, #286, #260, #234, #123, #111, #93.
- Siguen vivos (8), Cesar no ha decidido si retomar alguno: #181 «Poner todo al día» · #114 resultados por lote · #100 envíos rápidos · #99 constancias por bloques · #98 «Guardando…» · #97 paraclínicos «{}» · #94 pacientes paginado · #78 confirmación de cuenta.
- Antes de cerrar o retomar uno: `git merge-base --is-ancestor <sha> origin/main`.

## Vencimientos
- `DESCARGAS_TOKEN`: renovar antes del 06-oct-2027 (vence 27-oct-2027).
- `TRAFICO_TOKEN`: renovar antes del 09-oct-2027.
