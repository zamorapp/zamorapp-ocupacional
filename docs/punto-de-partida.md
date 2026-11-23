# Punto de partida (estado verificado: 21-nov-2026)

> **Para qué es esto**: la lectura rápida para empezar a trabajar sin releer todo el portal, el chat y el código.
> Aquí está el estado actual verificado y las recetas de cada procedimiento. **Se actualiza con cada tanda publicada** (misma disciplina que `pendientes.md`). Si algo aquí no cuadra con la realidad, la realidad manda: verificar con los comandos de abajo y corregir este archivo.
> Profundidad por tema: `AGENTS.md` y el resto de `docs/`.

## Estado actual verificado (cómo comprobarlo en 1 minuto)

- **La app opera con normalidad completa**: web y celular en producción, escritorio actualizado, base al día.
- `main`: `b8c1d608` (comprobar: `git ls-remote origin main`).
- Escritorio publicado: **0.1.531** (comprobar: `gh release list --repo zamorapp/zamorapp-descargas --limit 1`).
- Migraciones en el repo y aplicadas en producción hasta **20261030971000** (especialistas; verificada en `supabase_migrations.schema_migrations` el 20-nov).
- CI de `main` en verde (comprobar: `gh run list --branch main --limit 4`).
- Suite RLS local: 269 pruebas OK (técnica abajo, «Verificar la base»).
- Auditoría del 19-nov: producción sin errores reales en 7 días; 3.854 trabajadores activos, 400 sin teléfono; datos sanos (sin duplicados ni huérfanos).

## Lo último que se hizo (21-nov)

- **Registro de especialistas** (tanda 24, PR #400): Configuración › Especialistas; la interconsulta elige especialista y la carta sale «Especialista en …» con su consultorio. Migración 971 en producción.
- **WhatsApp de la agenda pide el número si no hay teléfono** (tanda 23, PR #399).
- **Paraclínicos «{}»** ya no tumban el panel (tanda 22, PR #398).
- **Casillero del CI de Windows** arreglado de raíz (tanda 21, PR #397).
- **Depuración de nómina en una llamada** y **tarjeta de avisos** en el escritorio (tanda 20).

## Qué hay en construcción (frentes abiertos)

1. **Puerta para agentes — funciones nuevas** (modelo semi-automático de Cesar: el agente crea → él visualiza y aprueba → se ejecuta; «hágalo todo completo» = dejar listo solo para visualizar). Ya existe en la puerta: récipes/órdenes en borrador, notas de cobro en borrador con BCV, vigilancia en borrador, reportes (vencimientos, atendidos…), crear empresa/trabajador/cita/presupuesto. **Falta**: constancias en borrador, anular/posponer citas de a una con aprobación, leer accidentes, correos aprobados uno a uno, consulta/historia en borrador (perfil normal bajo tutela).
2. **Cuentas por pagar** (propuesta presentada; cuentas por cobrar YA existe en Facturación).
3. Completar teléfonos de la nómina (400 sin teléfono; el botón nuevo los pide al momento).

## Recetas (procedimientos sin redescubrirlos)

### Publicar un cambio (la tanda de siempre)
1. Rama por cambio → PR. Chequeos verdes (`gh pr checks N`).
2. Pedir la frase a Cesar (revisión de seguridad antes; de diseño si hay pantalla).
3. Si hay migración: **aplicarla en producción ANTES de fusionar** y verificarla (ver «Aplicar SQL»).
4. Fusionar: `git checkout -b union/tanda-N && git merge --no-ff <rama> -m "Tanda N: … Frase de Cesar (fecha): «…»." && git push origin union/tanda-N:main`.
5. Si toca la app (no es solo prueba): publicar escritorio con `gh workflow run escritorio.yml -f publicar=true` (~35 min), poner la nota del release («Qué trae / Qué NO hace») con `gh release edit v0.1.NNN --repo zamorapp/zamorapp-descargas --notes "…"`.
6. Actualizar `pendientes.md` y este archivo; commit de docs directo a `main`.

### Aplicar SQL a producción (sin que Cesar copie nada)
1. Envoltura: `begin;` + el `.sql` + `insert into supabase_migrations.schema_migrations (version, name) values ('NNN','NNN_nombre') on conflict do nothing;` + `commit;` + selects de verificación. Se guarda en `C:\Users\58412\Documents\zamorApp\migraciones-sin-pc\`.
2. Aplicar con psql del escritorio y la clave cifrada del respaldo (nunca se imprime): un `.ps1` que hace `$segura = Get-Content "$env:USERPROFILE\.zamorapp\respaldo.cred" | ConvertTo-SecureString`, la pasa a `$env:DATABASE_URL` y corre `psql -v ON_ERROR_STOP=1 -1 -f archivo.sql $env:DATABASE_URL` (opciones ANTES de la URL; el aviso «no transaction in progress» es cosmético).
3. Verificar con un select aparte (un «listo» no prueba nada).

### Verificar la base (suite RLS local)
Binarios: `C:\Users\58412\AppData\Local\zamorApp Escritorio\recursos\pgsql\bin\`. `initdb -D /tmp/pgsql-X -U postgres -A trust -E UTF8`, arrancar con `pg_ctl -o "-p 55433" -w start` **en un comando corto en primer plano** (si el shell se mata, postgres muere con 0xC0000142 — ese fue el problema del 20-nov). Luego `PGHOST=127.0.0.1 PGPORT=55433 PGUSER=postgres bash supabase/pruebas/correr.sh` (~100 s; los errores `/dev/null` son cosméticos en Windows). Al terminar: `pg_ctl stop -m fast` y borrar la carpeta.

### WhatsApp Web con control de ventanas (kimi-cu)
Ventana de Chrome con web.whatsapp.com abierta y sesión vinculada (si está en blanco: F5 y esperar). Buscar el chat en la caja de búsqueda, abrirlo, verificar por captura que es el contacto, `type_text` y Enter. Adjuntar: clip → Documento → diálogo «Abrir» → escribir la ruta en «Nombre:» → el pie de foto va en la caja del visor. Regla de Cesar: **ningún envío sin su aprobación, uno por uno**; textos suyos, verbatim.

### Mensajes programados
Con la herramienta de tareas programadas (cron de esta plataforma): un prompt autocontenido con contacto, texto exacto aprobado y verificación por captura. Ejemplos hechos: envíos del 19-nov a las 7:02 y 8:03 (4 envíos, todos verificados).

### Diseños en Photoshop (flyers PSD)
Skill propia: `C:\Users\58412\.claude\skills\diseno-photoshop` (flujo, trucos JSX, errores ya cometidos, caso completo del flyer de Oriannys). Photoshop 2026 ejecuta `Photoshop.exe script.jsx`; se trabaja sobre COPIA del PSD, capas se ocultan (no se borran), vista previa PNG antes del final, final a la carpeta `FINALES`.

### La puerta para agentes
- Endpoint: `POST https://zamorapp-ocupacional.vercel.app/api/agentes` con `Authorization: Bearer <llave>`; el catálogo de acciones está en `src/lib/agentes/acciones.ts` y sus reglas en los INSTRUCCIONES del mismo archivo.
- La llave «kimi» vive solo en `C:\Users\58412\Documents\zamorApp\puerta-agentes.txt` (leerla con `tr -d ' \r\n'`; vence 18-dic-2026). Nunca en el chat ni en el repo.

### Datos puntuales de producción (consultas de lectura)
El mismo método psql de «Aplicar SQL» pero con `psql -c "select …" $env:DATABASE_URL` (opciones antes de la URL). Escribir datos reales: solo si Cesar lo pidió expresamente (19-nov: se guardó un teléfono en una ficha con `update … returning`).

## Si algo falla
- CI Windows falla de la nada: recordar el casillero del 19-nov (ver `docs/reglas-y-errores.md`): primero diagnosticar con datos (`git diff` del CI verde previo, corridas en Linux), no relanzar a ciegas.
- Postgres local no arranca (0xC0000142): ver «Verificar la base» (arranque corto en primer plano).
- `gh run watch` se cae por red: reintentar; el resultado se consulta con `gh run view ID --json status,conclusion`.
