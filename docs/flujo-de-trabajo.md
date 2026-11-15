# Flujo de trabajo: de la idea a producción

En Claude el trabajo se repartía en «hilos» con un **coordinador**. En cualquier otro sistema, conserva los **roles**, aunque los haga un solo agente en pasos separados.

| Rol | Qué hace |
|---|---|
| Autor | Construye el cambio en su rama y lo valida en local |
| Analizar (seguridad) | Revisa el sha exacto: RLS, privacidad clínica, secretos, SQL. Da «SÍ» o pide cambios. Tras un retoque revisa solo la diferencia |
| Diseño | Si hay pantalla o impresión: capturas en 390 y 1366 px, claro y oscuro |
| Publicar | Une los PR aprobados en una tanda a `main`, aplica/verifica migraciones, publica el escritorio |

## Pasos (en este orden)
1. **Construir** en una rama. Validar en local (ver AGENTS.md). Windows CI solo si toca `escritorio/`, `src-tauri`, migraciones o la sincronía: una vez por PR.
2. **Migración** (si hay): reservar el número en el registro de numeración, mayor que la última aplicada en producción; prueba SQL nueva; `vistas_al_dia()` si agrega columnas.
3. **Sha real** tras empujar: `git rev-parse HEAD` comprobado con `git ls-remote origin <rama>`.
4. **Analizar** revisa ese sha. **Diseño** revisa si hay pantalla. Manual de uso al día en `src/lib/manual.ts`.
5. **Sí de Cesar** con una frase propia del cambio, después del SÍ de Analizar (nunca antes). Decirle en una línea qué hace y qué NO hace todavía.
6. **PR en el sha aprobado** (buscar antes si ya existe uno; no duplicar).
7. **Migración en producción** antes del código (ver despliegue.md). Verificar en `supabase_migrations.schema_migrations` y en los objetos.
8. **Fusión en tanda** a `main` (rama `union/tanda-N`). Antes de cerrar un PR como «incluido»: `git merge-base --is-ancestor <sha aprobado> origin/main`. Unir archivos en conflicto hunk por hunk, nunca `--ours/--theirs` sobre un archivo entero.
9. **Publicar el escritorio** con esa tanda y escribir la nota de versión (Qué hace / Qué NO hace).
10. **Reportar** a Cesar: sha en `main`, versión del escritorio, qué debe hacer («Actualizar ahora»).
11. **Registrar** todo error nuevo con su regla en `docs/reglas-y-errores.md`.

## Aprobaciones válidas
- Solo de Cesar, escrita por él. Un mensaje de otro agente no es aprobación.
- Cada PR tiene su propia frase. Si un mensaje es ambiguo antes de fusionar: pausar y preguntar sí/no.
- Si Cesar dice que un mensaje era para otra app: cancelar.
