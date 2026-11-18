# Pendientes (corte: 18-nov-2026)

Actualiza este archivo cada vez que algo se abra o se cierre.

## Último publicado
- Web en `main` 5a92f15c (#379, 16-nov). Escritorio **0.1.516** (incluye hasta #390).
- **La tanda de #379 (grabar la conversación de la consulta con audio en la PC) aún no sale en el escritorio**: es la única fusión pendiente de publicar como versión nueva.
- Migraciones en el repo hasta `20261030965000`. Las de los PR fusionados (948 a 965) deberían estar aplicadas (el flujo exige aplicar antes de fusionar); si hay duda, verificar en Supabase (`supabase_migrations.schema_migrations`).

## En curso (revisión completa iniciada 18-nov)
4 PR abiertos del 16-nov, todos con CI verde (linux, cambios, cruces, catalogo; Windows probado en cada rama). Esperan SÍ de Analizar, revisión de Diseño si toca pantalla y la frase de Cesar:
- **#391** Escritorio: «(prueba)» siempre en el título y aviso de la oficial que no instala con Enter.
- **#392** Invitar por enlace con su rol (enfermería, médico, RR. HH.…) · migración 966.
- **#393** Medicina general: «Evaluación de condición» en vez de elegibilidad.
- **#394** Posponer consulta (migración 969) y arreglo de la bandeja: la cita sube después de su consulta.

## Esperando a Cesar (manual)
- Firmar las evaluaciones pendientes de una empresa y sacar su PDF con la fecha de impresión que pidió el cliente.
- Guardar el número de factura de una nota de cobro; calibrar la factura con «Hoja de prueba».
- Prueba real de winspiroPRO con el espirómetro.
- Decisiones viejas sin respuesta: «sí fase uno» (hoja de ruta), «sí antropometría», «sí escritorio»; borrar 2 borradores; red de consultorios (5 respuestas); ergonomía: «más preguntas en DEB» (sin definir).

## Limitaciones conocidas
- Enfermería no edita atenciones (solo borrar en 24 h y volver a registrar). Las indicaciones no se editan (anular y emitir otra).
- Los PDF que exigen la sesión de Cesar (`/imprimir/lote`) solo los genera él.

## PR abiertos antiguos (revisar si siguen vigentes antes de retomarlos)
#316 lecturas locales del escritorio · #286 biblioteca de recomendaciones · #260 frases rotativas en WhatsApp · #234 OCRA/KIM-PP · #181 «Poner todo al día» · #123 adjuntos fase B · #114 resultados por lote · #111 guardián (ya hay `guardian.yml` en main) · #100 envíos rápidos · #99 constancias por bloques · #98 «Guardando…» · #97 paraclínicos «{}» · #94 pacientes paginado · #93 manual laboratorio · #78 confirmación de cuenta.
Muchos pueden estar ya incluidos en `main` por otra vía: comprobar con `git merge-base --is-ancestor <sha> origin/main` antes de cerrar o retomar. (#72 confirmación de cuenta ya se fusionó el 16-nov.)

## Vencimientos
- `DESCARGAS_TOKEN`: renovar antes del 06-oct-2027 (vence 27-oct-2027).
- `TRAFICO_TOKEN`: renovar antes del 09-oct-2027.
