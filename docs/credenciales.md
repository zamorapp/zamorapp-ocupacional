# Credenciales y cuentas (sin valores)

> Ningún valor secreto se escribe aquí, en el código ni en un chat. Se pegan solo en el panel que corresponde.
> La app **no usa la llave `service_role`**: todo pasa por la sesión del usuario y la RLS (el guardián lo vigila).

## Cuentas
| Servicio | Cuenta / identificador | Dueño del acceso |
|---|---|---|
| GitHub | Organización `zamorapp` (gratis). Repos: `zamorapp-ocupacional` (público, código) y `zamorapp-descargas` (público, instaladores) | Cesar (dueño de la organización) |
| Vercel | Proyecto `zamorapp-ocupacional`, plan Hobby | Cesar |
| Supabase | Proyecto `xgsoryzvyrsddgkxkzeb`, plan Free | Cesar |
| Google Drive | Carpeta `zamorApp` (respaldos de zamorApp y del SAME) en la unidad montada en la PC | Cesar |
| Gmail | Remitente de los envíos (clave de aplicación) | Cesar |

## GitHub → Settings → Secrets and variables → Actions (repo `zamorapp-ocupacional`)
| Nombre | Tipo | Uso | Vence |
|---|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secreto | Firma de actualizaciones del escritorio. **Si se pierde, los escritorios instalados no aceptan actualizaciones**: guardar copia fuera de GitHub | — |
| `DESCARGAS_TOKEN` | secreto | Publicar releases en `zamorapp-descargas` | 27-oct-2027 (renovar antes del 06-oct-2027) |
| `TRAFICO_TOKEN` | secreto | Leer visitas al repo (solo Administration: read) | ~30-oct-2027 (renovar antes del 09-oct-2027) |
| `ZAMORAPP_UPDATER_PUBKEY` | variable | Llave pública del actualizador | — |
| `ZAMORAPP_NUBE_URL`, `ZAMORAPP_NUBE_ANON` | variable | URL y llave anónima (públicas) para el escritorio | — |
| `AVISAR_A` | variable | A quién avisar desde workflows | — |

## Vercel → Project → Settings → Environment Variables
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (públicas), `VAPID_PRIVADA` (+ pública) para avisos push, `GMAIL_USUARIO`, `GMAIL_CLAVE_APP` para correo.

## PC de Cesar
- `.env.local` del repo en la PC: solo URL y llave anónima (sin `service_role`).
- `%USERPROFILE%\.zamorapp\`: aplicador de migraciones, scripts de respaldo, marcas de la última restauración.
- `%LOCALAPPDATA%\zamorApp\datos`: base local cifrada del escritorio. **No tocar.**
- Supabase CLI / Vercel CLI: iniciar sesión en la PC cuando haga falta (`npx supabase login`, `npx vercel login`).

## Para un agente nuevo
Pide a Cesar solo el **acceso** (invitación a la organización de GitHub, a Vercel y a Supabase, o un conector oficial), nunca que pegue una clave en el chat.
