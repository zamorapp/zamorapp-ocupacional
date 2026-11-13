# Reglas fijas y errores que ya pasaron

## Reglas fijas de Cesar
- **SAME** solo lectura absoluta (programa, accesos, registro, base «Integral», SQL Server, fecha de Windows). Consultas pequeñas, una a la vez, con ≥ 1 GB de RAM libre. Si algo del SAME falla: diagnosticar solo leyendo y pedir su sí.
- **winspiroPRO**: no instalar, mover ni modificar; no usar el CD. Solo archivos GDT.
- **PC de Cesar**: nunca editar en vivo; probar aparte y publicar completo.
- Solo planes gratuitos hasta que Cesar decida cobrar/pagar. Si se agotan los minutos de Actions, trasladar el repo a la otra cuenta (avisar antes).
- RR. HH. no ve diagnósticos, grupo sanguíneo ni discapacidad. Documentos para empresa se revisan por diagnóstico. Bitácora sin datos de salud. Firma y sello solo de Cesar.
- Enfermería solo lee las consultas del médico; sus signos van en su propia atención; ve solo su empresa.
- Todo aviso tiene «Ignorar». Toda espera tiene salida. Ningún paso bloquea por datos faltantes.
- Funciones siempre con botón visible (lo escondido no existe para Cesar). Listas con filtro Desde/Hasta, no límite de días.
- Todo lo que se acumula se autolimpia; listas con «Quitar» (≠ borrar del sistema).
- Cambios visuales grandes: vista previa antes del sí.
- Hojas de imprimir: tema claro; `@page` general con casillas de margen vacías (si no, Chrome mete la fecha en el PDF). Fecha de impresión: hoy por defecto, editable; en el PDF no sale ninguna otra fecha.
- Datos de la organización (RIF, dirección, teléfono, cuentas) en Configuración › Organización, nunca en el código.
- Cobros: tasa BCV del día del pago.
- Médicos del SAME solo como «Nombre (histórico)». Órdenes de laboratorio e imagen separadas.
- Cesar habla por voz: interpretar («casa blanca» = tasa BCV; «Sub Base» = Supabase; «NIH» = NIOSH; «sanción» = sesión; «imposible» = «¿es posible?»). Preguntas sin «?» = pregunta de estado.

## Errores → regla
| Error | Regla |
|---|---|
| Se adivinó la causa («fue el internet» y era caché) | Decir «lo reviso» y confirmar con datos |
| Explicar botones de memoria («Gestión» era un título, no botón) | Verificar en el código o la web real, con la ruta exacta |
| Código publicado antes de su migración (#310) | Migración aplicada y verificada ANTES de fusionar |
| Migración entregada fuera de orden (922 antes de 919–921) | Confirmar el orden frente a las pendientes |
| `.sql` sin insert en `schema_migrations` (922/927) | Todo `.sql` para pegar: `begin`/`commit`, insert `on conflict do nothing`, `select 'LISTO'`; verificar también `schema_migrations` |
| Parche por texto no encontró la función (CRLF) | Quitar `chr(13)` de ambos lados y probar el `.sql` en CRLF |
| «Publicado» antes de Vercel verde | Esperar el despliegue verde |
| Pedir la frase antes del SÍ de Analizar (#323) | Primero Analizar, luego la frase |
| Frase de Cesar no llegó al que fusiona | Adjuntar siempre la frase original al paso de fusión |
| Shas mal reportados | Solo `git rev-parse HEAD` comprobado con `git ls-remote` |
| update/delete «guardó» pero RLS lo bloqueó | `.update()`/`.delete()` con `.select("id")` y error visible si vuelve vacío |
| `DELETE requires a WHERE clause` (pg_safeupdate) | Nunca DELETE/UPDATE sin WHERE en funciones |
| Choques de numeración entre PR | Reservar número antes de crear archivos; el guardián `cambios` rechaza números menores que el máximo de main |
| Vista pública congelada tras columna nueva | `select public.vistas_al_dia();` + prueba 163 |
| Unión con `--ours` borró pruebas | Unir hunk por hunk y comparar con la rama del autor |
| `current_user` en SECURITY DEFINER | Usar `auth.uid()` / `auth.role()` / `session_user` |
| Dato editado en la nube que la PC no refresca | Todo dato que lea el escritorio necesita refresco |
| `git stash` entre `add` y `commit` perdió cambios (#335) | No usar stash ahí; `git status` vacío y `git show --stat HEAD` antes de empujar |
| Impresión distinta en CI (Chromium 141) y local (153) | Dejar ≥ 20 % de hoja libre en local; nunca `page: nombre` |
| `Date.now()` / fechas UTC | Fechas de negocio en America/Caracas |
| RPC de lectura `volatile` tumbó el escritorio sin internet | Lecturas `stable`/`immutable`; una carga nunca lanza por un dato de apoyo |
| Descarga larga sin avance visible | Toda acción larga muestra avance y anota resultado en `arranque.log` |
| Pruebas de la puerta en paralelo se pisaron | `node --test --test-concurrency=1` |
| Diálogo nuevo al cerrar rompió la prueba de humo | Actualizar `PulsarSalida` (UI Automation) en la prueba de humo |
| Un clic afuera cerraba la ventana y se perdía lo escrito; tras otra ventana (WhatsApp, vista previa) la app quedaba sin clics | Base `components/ui/dialog.tsx`: ninguna ventana se cierra al tocar afuera; X, «Cancelar» y Escape preguntan «¿Desea cerrar?» si queda algo escrito; guardián que devuelve los clics a la página. «Cancelar» siempre con `<DialogClose asChild>` (nunca `setAbierto(false)` directo) |
