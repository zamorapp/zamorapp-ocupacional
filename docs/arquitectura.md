# Arquitectura

## Piezas
```
                 ┌────────────── Supabase (nube) ──────────────┐
 Celular / web ──┤ PostgreSQL (esquemas public y clinico) + RLS │
 (Vercel, PWA)   │ Auth · Storage · pg_cron · Edge Function     │
                 └───────────────▲─────────────────────────────┘
                                 │ sincronía (bandeja de salida + réplica)
 PC de Cesar ── zamorApp Escritorio (Tauri 2)
                 ├─ Next.js standalone (la misma app web) con Node portátil
                 ├─ «puerta» local compatible con Supabase (escritorio/puerta)
                 ├─ PostgREST portátil
                 └─ PostgreSQL 16 portátil (mismas migraciones)
```
- **Web**: Next.js 15 (App Router, TypeScript), Tailwind 4 + shadcn/ui, `@supabase/ssr`. Región Vercel `pdx1`.
- **Escritorio**: local primero. Lee y guarda en la PC al instante; la nube es respaldo y sincronía. Si no hay internet, sigue trabajando; los cambios esperan en la bandeja.
  - Puertos fijos: PostgreSQL `127.0.0.1:54329`, PostgREST `54330`, puerta `54331` (**no cambiar 54331**). Nunca 1433 (SQL Server del SAME) ni 5432.
  - Datos: `%LOCALAPPDATA%\zamorApp\datos`. Registro de arranque: `%LOCALAPPDATA%\zamorApp\arranque.log`.
  - Archivos de tareas de Windows (respaldos, aplicador de migraciones): `%USERPROFILE%\.zamorapp\`.
  - Identificador Tauri `com.tipuroservimedic.zamorapp`: **no cambiarlo** (datos y actualizador dependen de él).
  - Versión `0.1.<número de corrida del CI>`; se ve en el título de la ventana.
  - Se instala como «zamorApp Escritorio» y nunca pisa el acceso «zamorApp Ocupacional» de la web.
- **Celular**: es la web (PWA). Avisos push con `web-push` (VAPID); cada aparato confirma el aviso (`/api/avisos/acuse`) y la campana avisa si deja de confirmar. El escritorio repite cada aviso nuevo de la campana como aviso de Windows (`tauri-plugin-notification`, solo `notify`). Los enlaces públicos avisan con `public.avisar_enlace()`.

## Carpetas del repo
| Ruta | Contenido |
|---|---|
| `src/app/(app)/…` | Pantallas: panel, pacientes, atención, empresas, evaluaciones, ergonomía, psicosocial, enfermería, documentos, reportes, facturación, configuración, ayuda… |
| `src/app/imprimir/…` | Hojas para imprimir/PDF (siempre tema claro; `@page` general con márgenes vacíos) |
| `src/app/api/…` | Rutas de servidor (tasa BCV, avisos, constancias, salud, etc.) |
| `src/app/t`, `c`, `e`, `registro`, `invitacion`, `movil` | Enlaces públicos: trabajador/paciente, RR. HH., registro |
| `src/lib/` | Lógica: consultas, documentos, envíos, ergonomía, escritorio, manual de uso (`manual.ts`) |
| `supabase/migrations/` | Esquema completo, en orden numérico (fuente de verdad de la base) |
| `supabase/pruebas/` | Pruebas SQL de reglas de acceso; `correr.sh` las ejecuta todas |
| `supabase/functions/respaldo-archivos` | Edge Function para respaldar Storage con enlaces firmados |
| `supabase/migraciones-aprobadas.json` | Manifiesto (SHA-256) que usa el aplicador de migraciones de la PC |
| `escritorio/src-tauri` | Programa Tauri (Rust), instalador NSIS, actualizador |
| `escritorio/puerta` | Servidor local: sesión, réplica, bandeja, adjuntos, respaldo, Windows Hello |
| `escritorio/base` | SQL solo local (ajustes, bandeja, cola de adjuntos, bloques, candado) |
| `escritorio/pruebas` | Pruebas de la puerta (correr con `--test-concurrency=1`) |
| `scripts/` | Respaldo diario y restauración, aplicador de migraciones, guardián de seguridad, importación del SAME, publicación manual a Vercel |
| `.github/workflows/` | CI y tareas programadas (ver despliegue.md) |

## Base de datos
- **Multiempresa**: `organizaciones` (el proveedor) → `empresas` clientes → `sedes`, `dependencias`, `puestos`. Usuarios en `miembros` con rol y, opcionalmente, empresas permitidas.
- **Roles**: administrador, gerente médico, médico, enfermería, recepción, coordinador SST, gerente de empresa (RR. HH.), supervisor, delegado de prevención, trabajador, auditor. Permisos de RR. HH. configurables por persona.
- **Confidencialidad**: el esquema `clinico` (consultas, diagnósticos, aptitudes, reposos…) solo lo abren médico, enfermería y gerente médico. La empresa ve aptitud por vistas sin diagnóstico. Firma y sello solo de Cesar, nunca por acceso anónimo directo (se entregan vía RPC).
- **Bitácora**: cada cambio queda en `bitacora` (sin datos de salud). Consulta firmada no se modifica (se reabre con registro).
- **Listas configurables** (`listas`, `lista_items`) y catálogos editables (riesgos, paraclínicos, plantillas).
- **Columna nueva en tabla con vista pública** → terminar la migración con `select public.vistas_al_dia();` (prueba 163).
- **Migraciones de datos**: protegidas con `es_base_local()` e insertando solo lo nuevo (modelo `…870000`); nunca `copiar_listas_base`.
- **Tareas programadas**: `pg_cron` en Supabase (avisos cada 5 min, constancias cada 15, tasa BCV cada 30); GitHub Actions y un cron de Vercel quedan de respaldo.

## Integraciones
- **SAME** (SQL Server 2014, base «Integral»): solo lectura; ya migrado el 26-oct-2026. No repetir la migración.
- **winspiroPRO**: intercambio por archivos GDT (`WPROZAMO.GDT` / `ZAMOWPRO.GDT`); `src/lib/gdt.ts`.
- **Correo**: Gmail con clave de aplicación (`nodemailer`).
- **Tasa BCV**: automática (ruta `/api/tasa-bcv`), se usa la del día del pago.
- **Respaldos**: `scripts/respaldo.mjs` diario desde la PC a Documentos/Google Drive (guarda 30 diarios + 12 mensuales); `scripts/restaurar.mjs`; prueba de restauración semanal (`probar-restauracion.mjs`).
