# Retomar el trabajo con otro agente (Codex, Cursor, otro Claude…)

## Lo que el agente nuevo necesita
1. **Este repo** (`zamorapp/zamorapp-ocupacional`): código + `AGENTS.md` + `docs/`. Es la fuente de verdad técnica.
2. **El respaldo del proyecto** que Cesar guarda en su PC (`Documentos\zamorApp-respaldo-proyecto\`): memoria del proyecto (reglas, decisiones, errores por área), índice de conversaciones y archivos de trabajo (planes, auditorías, capturas, `.sql` aplicados, notas de versión).
3. **Accesos** (los da Cesar, nunca pegando claves en el chat): miembro de la organización GitHub `zamorapp`, del proyecto Vercel y del proyecto Supabase.

## Primeros pasos del agente nuevo
1. Leer `AGENTS.md` y todo `docs/`.
2. Leer en el respaldo `memoria/MEMORY.md` (índice) y las notas del área que vaya a tocar.
3. Comprobar el estado real: `git log origin/main -5`, PR abiertos, últimas migraciones aplicadas en Supabase, última release de `zamorapp-descargas`.
4. Revisar `docs/pendientes.md` y confirmar con Cesar en una lista corta de sí/no qué sigue.
5. Mantener los roles del flujo (autor → seguridad → diseño → sí de Cesar → publicar) aunque los haga un solo agente.
6. Al cerrar cada tarea: actualizar `docs/pendientes.md` y, si hubo un error nuevo, `docs/reglas-y-errores.md`.

## Qué NO cambia al migrar
- Web, base de datos, escritorio, respaldos y actualizador siguen funcionando: no dependen de Claude.
- Las reglas de Cesar (AGENTS.md) siguen vigentes.
