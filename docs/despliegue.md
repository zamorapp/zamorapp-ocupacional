# Despliegue y canales

## Web (Vercel)
- Proyecto `zamorapp-ocupacional` (plan Hobby). Solo `main` despliega (`vercel.json`: ramas sin vista previa). Límite: 100 despliegues/día → agrupar fusiones.
- Cada fusión a `main` despliega solo. Verificar que el despliegue quedó **verde** antes de decir «publicado».
- Manual alternativo desde la PC: `scripts/publicar-vercel.ps1` (requiere `npx vercel login`).
- Cron de Vercel: `/api/tasa-bcv` diario.
- Variables de entorno: en el panel de Vercel (ver credenciales.md).

## Base (Supabase)
- Proyecto `xgsoryzvyrsddgkxkzeb`. Las migraciones de `supabase/migrations/` son la fuente de verdad.
- **Aplicar con PC**: PR «solo migración» → `main` → etiqueta `migraciones-AAAAMMDD-N` sobre ese commit (con `scripts/migraciones/preparar-etiqueta.mjs`, que llena `supabase/migraciones-aprobadas.json` con SHA-256) → Cesar da doble clic en `%USERPROFILE%\.zamorapp\aplicar-migraciones.cmd`. El aplicador aborta si una pendiente es más vieja que la última aplicada.
- **Aplicar sin PC**: armar un `.sql` con `begin;` + migraciones exactas + `insert into supabase_migrations.schema_migrations (version, name) values (...) on conflict do nothing;` + `commit;` + `select 'LISTO';`. Cesar lo pega en el SQL Editor de Supabase y toca Run. Quitar `chr(13)` en parches por texto (el pegado llega con CRLF).
- Verificar después en solo lectura (lista de migraciones y objetos).
- Edge Function `respaldo-archivos`: se despliega una vez con la CLI de Supabase (`functions deploy --no-verify-jwt`).

## GitHub Actions (`.github/workflows/`)
| Workflow | Cuándo | Qué |
|---|---|---|
| `guardian.yml` | cada PR | Guardián de seguridad: `cambios` (numeración no menor que main), `cruces` (choques con otros PR), `catalogo` (base con todas las migraciones). No dar un `.sql` a Cesar hasta que «catalogo» esté verde |
| `impresion.yml` | cada PR | Pruebas de impresión (Chromium; las hojas salen más altas en CI que en local) |
| `escritorio-linux.yml` | cada push/PR | Pruebas baratas de base, puerta y compilación |
| `escritorio.yml` | a mano, al pedir revisión/«listo», y push a `main` con escritorio/migraciones | Prueba de humo Windows (~35 min): instala, abre, actualiza. Con `publicar=true` desde `main` publica la versión |
| `avisos-celular.yml` | cada hora | Respaldo de los latidos de pg_cron |
| `calentar.yml` | cada 5 min en horario laboral | Mantiene la web caliente |
| `mantenimiento.yml` | domingos | Borra ramas/artefactos/corridas viejas (opción «simular») |
| `vigilar-visitas.yml` | diario | Avisa quién visita el código público |

Lanzar Windows a mano: `gh workflow run escritorio.yml --ref <rama>`. Un push nuevo a un PR **no** lo relanza.

## Escritorio (Tauri)
1. Fusionar la tanda en `main`; esperar Windows verde si tocó escritorio/migraciones.
2. `gh workflow run escritorio.yml --ref main -f publicar=true`. La publicación tiene su propio grupo y no la cancelan los pushes.
3. El CI firma el instalador y sube la versión al repo público **`zamorapp/zamorapp-descargas`** (release + `latest.json`; actualización liviana si no cambian los componentes, `latest-completo.json` para autorreparar).
4. Verificar la release y `latest.json`. Escribir la nota de versión.
5. Cesar pulsa «Actualizar ahora» en el escritorio y confirma la versión en el título.

## Respaldos
- Diario desde la PC (`scripts/respaldo.ps1` → `respaldo.mjs`, tarea programada con `programar-respaldo.cmd`) a Documentos y Google Drive; resultado en la tabla `public.respaldos` (franja verde/amarilla/roja en Inicio).
- Restauración: `scripts/restaurar.mjs`; prueba semanal automática en un PostgreSQL temporal.
- Un arreglo a un script de la PC no está hecho hasta que la PC corre esa versión.
