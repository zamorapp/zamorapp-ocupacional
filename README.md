# zamorApp Ocupacional

Plataforma de salud ocupacional multiempresa para TIPURO SERVI MEDIC: pacientes, consulta médica, aptitud, reposos y cumplimiento de la LOPCYMAT ante el INPSASEL.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 + shadcn/ui · Supabase (PostgreSQL, Auth, RLS) · PWA instalable.

## Arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:3000. Sin Supabase configurado entra en **modo demo** con datos de ejemplo.

## Conectar Supabase

1. Crea un proyecto en supabase.com.
2. Ejecuta, en orden, los archivos de `supabase/migrations/` en el SQL Editor (o `supabase db push` con la CLI).
3. En *Settings › API › Exposed schemas* añade `clinico`.
4. Copia `.env.example` a `.env.local` y pega la URL y la clave anónima.
5. Crea tu usuario en *Authentication* y añádelo a `organizaciones` y `miembros` con el rol `administrador`.

## Estructura

```
src/app/login            Pantalla de ingreso
src/app/(app)/panel      Inicio: indicadores, agenda y alertas legales
src/app/(app)/…          Pacientes, Atención médica, Empresas, Reportes, Documentos, Configuración
src/components/app       Barra lateral, encabezado, semáforo
src/components/ui        Componentes shadcn
src/lib/supabase         Clientes de Supabase (navegador y servidor)
supabase/migrations      Esquema de base de datos y listas base
```

## Base de datos

- **Multiempresa:** `organizaciones` (el proveedor) → `empresas` clientes → `sedes`, `dependencias`, `puestos`. Cada usuario pertenece a una organización por `miembros`, con su rol y, si se quiere, limitado a ciertas empresas.
- **Roles:** administrador, gerente médico, médico, enfermería, recepción, coordinador SST, gerente de empresa, supervisor, delegado de prevención, trabajador y auditor.
- **Confidencialidad:** la historia clínica (`clinico.consultas`, `diagnosticos`, `aptitudes`, `reposos`) solo la abren médico, enfermería y gerente médico. La empresa cliente ve la aptitud por la vista `aptitud_trabajadores`, nunca el diagnóstico.
- **Listas configurables:** `listas` + `lista_items` para motivos de consulta, tipos de paciente, aptitud, entes emisores, limitaciones y recomendaciones.
- **Bitácora:** cada cambio en empresas, trabajadores, miembros y datos clínicos queda en `bitacora` con antes y después. Una consulta firmada no se puede modificar.
