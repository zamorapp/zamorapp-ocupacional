# AGENTS.md — puerta de entrada para cualquier agente (Claude, Codex, Cursor, Copilot…)

Lee este archivo completo antes de tocar nada. Después lee, en este orden, lo que necesites de `docs/`.

## Qué es esto
**zamorApp Ocupacional**: software de salud ocupacional multiempresa de **OcupaVida Salud Ocupacional** (Dr. Cesar Enrique Zamora, médico ocupacional en libre ejercicio, Maturín, Venezuela). Reemplaza al programa anterior «SAME» (Sistema Médico Integral, SQL Server). Cumple LOPCYMAT / INPSASEL.

- **Web** (Next.js 15 + Supabase) en Vercel: https://zamorapp-ocupacional.vercel.app — también es la app del **celular** (PWA).
- **Escritorio** «zamorApp Escritorio» (Tauri 2 + PostgreSQL portátil) para Windows: **local primero**, la nube respalda y sincroniza. Para Cesar, «la aplicación» = la de escritorio.
- **Base en la nube**: Supabase, proyecto `xgsoryzvyrsddgkxkzeb`.

## Mapa de documentos
| Archivo | Para qué |
|---|---|
| [docs/arquitectura.md](docs/arquitectura.md) | Piezas, carpetas, base de datos, roles, escritorio local primero |
| [docs/flujo-de-trabajo.md](docs/flujo-de-trabajo.md) | Cómo se lleva un cambio de la idea a producción (revisiones, frase de aprobación, tandas) |
| [docs/despliegue.md](docs/despliegue.md) | Canales: Vercel (web), Supabase (migraciones), GitHub Actions (CI), publicación del escritorio |
| [docs/credenciales.md](docs/credenciales.md) | Dónde vive cada clave (sin valores), vencimientos, cuentas |
| [docs/reglas-y-errores.md](docs/reglas-y-errores.md) | Reglas fijas del dueño y errores que ya pasaron con su regla |
| [docs/pendientes.md](docs/pendientes.md) | Lo abierto a la fecha del último corte |
| [docs/migrar-de-agente.md](docs/migrar-de-agente.md) | Cómo retoma el trabajo un agente nuevo en otro sistema |

## Reglas que no se negocian (resumen; detalle en docs/reglas-y-errores.md)
1. **SAME: solo lectura absoluta.** Nunca modificar, mover, borrar ni reconfigurar el programa `C:\Program Files (x86)\MediSoftware\Integral`, su base «Integral», SQL Server, sus accesos directos ni la fecha de Windows. Ningún script de este repo lo toca.
2. **winspiroPRO** (espirómetro, `C:\ERGOSPIR\winspiroPRO`): no instalar, mover ni modificar. Solo se intercambian archivos GDT.
3. **Nada se publica sin el «sí» de Cesar**, dado con una **frase propia de ese cambio** (p. ej. «sí firma»); un «sí» suelto no aprueba. Antes de pedirlo: revisión de seguridad y, si hay pantalla, revisión de diseño.
4. **Migración en producción ANTES de fusionar el código que la usa.** Verificarla en Supabase (incluida `supabase_migrations.schema_migrations`); un «listo» no prueba nada.
5. **Cada tanda que llega a `main` sale también en una versión nueva del escritorio.**
6. **Privacidad clínica**: RR. HH. nunca ve diagnósticos, grupo sanguíneo ni discapacidad. Cada rol ve solo lo suyo (RLS).
7. **Secretos nunca** en el código, el chat ni los documentos. El repo es **público**.
8. **Solo planes gratuitos** (Vercel Hobby, Supabase Free, GitHub org gratis). Windows CI una vez por PR; agrupar fusiones (Vercel: 100 despliegues/día).
9. **Fechas**: zona `America/Caracas`; nunca `Date.now()` / `current_date` para fechas de negocio (usar `hoy_caracas()` / `ahora()`).
10. **Con Cesar**: español, frases cortas, sin jerga técnica, preguntas sí/no, pasos numerados (doble clic, frase exacta). Avisar ANTES lo que una versión todavía NO hace. Todo aviso tiene «Ignorar»; ninguna espera bloquea.

## Comprobaciones antes de empujar
```bash
npm ci && npx tsc --noEmit && npx eslint && npm run build          # web
PGHOST=... PGPORT=... PGUSER=postgres bash supabase/pruebas/correr.sh  # reglas de acceso (RLS) en un PostgreSQL local
node --test scripts/pruebas/*.test.mjs                               # pruebas de scripts
(cd escritorio && node --test --test-concurrency=1 pruebas/*.test.mjs) # puerta del escritorio (ver escritorio-linux.yml)
```
No ocultes el código de salida con `| tail`. Antes de empujar: `git status` vacío y `git show --stat HEAD`.

## Ramas y PR
- Una rama por cambio; PR contra `main`. `main` despliega solo la web (Vercel) y dispara el CI de Windows si toca `escritorio/` o migraciones.
- Las fusiones a `main` van en **tandas** (`union/tanda-N`) para gastar un solo despliegue.
- Migraciones: `supabase/migrations/AAAAMMDDNNNNNN_nombre.sql`, número mayor que la última aplicada en producción; cada una con su prueba en `supabase/pruebas/NNN_*.sql`.
