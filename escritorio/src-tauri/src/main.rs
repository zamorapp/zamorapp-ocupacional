// Ventana de zamorApp para Windows. Arranca, sin ventanas negras, la puerta local (que a su vez
// arranca la base PostgreSQL y PostgREST) y el servidor de la app; al cerrar, los detiene en orden.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const SIN_VENTANA: u32 = 0x0800_0000;

// Puertos fijos y solo locales (el SQL Server del SAME usa el 1433; no se toca).
const PUERTO_PUERTA: u16 = 54331;
const PUERTO_APP: u16 = 54332;
const NUBE_URL: &str = match option_env!("ZAMORAPP_NUBE_URL") { Some(v) => v, None => "" };
const NUBE_ANON: &str = match option_env!("ZAMORAPP_NUBE_ANON") { Some(v) => v, None => "" };
// Llave pública con la que se verifican las actualizaciones (la privada vive solo en GitHub Actions).
const LLAVE_ACTUALIZACIONES: &str = match option_env!("ZAMORAPP_UPDATER_PUBKEY") { Some(v) => v, None => "" };

// Clave de un solo uso por sesión para que solo esta ventana pida acciones internas a la puerta.
fn clave_control() -> &'static str {
    static CLAVE: OnceLock<String> = OnceLock::new();
    CLAVE.get_or_init(|| hex::encode(rand::random::<[u8; 24]>()))
}

#[derive(Default)]
struct Procesos {
    puerta: Option<Child>,
    app: Option<Child>,
}

// Llave de la PC: cifra el estado local. Vive en el Administrador de credenciales de Windows, no en disco.
fn llave_pc() -> Result<String, String> {
    let entrada = keyring::Entry::new("zamorApp", "llave-pc").map_err(|e| e.to_string())?;
    match entrada.get_password() {
        Ok(k) if k.len() == 64 => Ok(k),
        _ => {
            let k = hex::encode(rand::random::<[u8; 32]>());
            entrada.set_password(&k).map_err(|e| e.to_string())?;
            Ok(k)
        }
    }
}

fn comando(programa: &Path) -> Command {
    let mut c = Command::new(programa);
    #[cfg(windows)]
    c.creation_flags(SIN_VENTANA);
    c
}

fn esperar_puerto(puerto: u16, maximo: Duration) -> bool {
    let inicio = Instant::now();
    while inicio.elapsed() < maximo {
        if std::net::TcpStream::connect(("127.0.0.1", puerto)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

fn carpeta_programa() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("zamorApp")
}

fn carpeta_datos() -> PathBuf {
    carpeta_programa().join("datos")
}

// Registro de arranque (%LOCALAPPDATA%\zamorApp\arranque.log): cada paso, cada error y cada pánico,
// para que un fallo al abrir nunca quede a ciegas. Se recorta al pasar de 1 MB.
fn anotar(mensaje: &str) {
    let carpeta = carpeta_programa();
    let _ = std::fs::create_dir_all(&carpeta);
    if let Ok(mut f) = abrir_registro(&carpeta.join("arranque.log")) {
        let _ = writeln!(f, "{} {mensaje}", segundos());
    }
}

fn segundos() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

// Abre un registro para añadir; al pasar de 1 MB se guarda como *.anterior.log y se empieza otro.
fn abrir_registro(archivo: &Path) -> std::io::Result<std::fs::File> {
    if std::fs::metadata(archivo).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        let _ = std::fs::rename(archivo, archivo.with_extension("anterior.log"));
    }
    std::fs::OpenOptions::new().create(true).append(true).open(archivo)
}

// Lo que un proceso hijo escriba (la app Next) queda en un archivo, línea por línea, en vez de perderse.
fn volcar_a(lector: impl std::io::Read + Send + 'static, archivo: PathBuf) {
    std::thread::spawn(move || {
        let mut registro = abrir_registro(&archivo).ok();
        for linea in BufReader::new(lector).lines().map_while(Result::ok) {
            if let Some(f) = registro.as_mut() {
                let _ = writeln!(f, "{} {linea}", segundos());
            }
        }
    });
}

// Dirección de la nube: la grabada al compilar. Solo para las pruebas automáticas se admite una "nube"
// simulada en esta misma PC (127.0.0.1); nunca una dirección externa, para que nadie desvíe el programa.
fn nube_url() -> String {
    match std::env::var("ZAMORAPP_NUBE_URL") {
        Ok(v) if v.starts_with("http://127.0.0.1:") => {
            anotar(&format!("nube de prueba (solo pruebas automáticas): {v}"));
            v
        }
        _ => NUBE_URL.to_string(),
    }
}

// Las pruebas automáticas son las únicas que apuntan el programa a una nube en esta misma PC (127.0.0.1).
fn en_pruebas() -> bool {
    std::env::var("ZAMORAPP_NUBE_URL").map(|v| v.starts_with("http://127.0.0.1:")).unwrap_or(false)
}

// Solo en las pruebas automáticas (nube de prueba) se puede apuntar el actualizador a una dirección y una llave
// de prueba y aceptar la actualización sin preguntar; en una PC real estas variables se ignoran por completo.
struct ActualizadorPrueba { url: String, llave: String, sin_preguntar: bool }
fn actualizador_prueba() -> Option<ActualizadorPrueba> {
    let url = std::env::var("ZAMORAPP_ACTUALIZACIONES_URL").ok()?;
    if !en_pruebas() || !url.starts_with("http://127.0.0.1:") {
        anotar("ZAMORAPP_ACTUALIZACIONES_URL se ignora fuera de las pruebas automáticas");
        return None;
    }
    anotar(&format!("actualizaciones de prueba (solo pruebas automáticas): {url}"));
    Some(ActualizadorPrueba {
        url,
        llave: std::env::var("ZAMORAPP_ACTUALIZACIONES_LLAVE").unwrap_or_default(),
        sin_preguntar: std::env::var("ZAMORAPP_ACTUALIZAR_SIN_PREGUNTAR").map(|v| v == "1").unwrap_or(false),
    })
}

// Puerto de depuración del navegador interno (CDP), para que la prueba de humo maneje la ventana como una
// persona. Solo se abre junto con la nube de prueba (pruebas automáticas); en una PC real se ignora.
fn puerto_depuracion() -> Option<u16> {
    let puerto = std::env::var("ZAMORAPP_PUERTO_DEPURACION").ok()?.parse::<u16>().ok()?;
    if !en_pruebas() {
        anotar("ZAMORAPP_PUERTO_DEPURACION se ignora fuera de las pruebas automáticas");
        return None;
    }
    anotar(&format!("navegador interno con puerto de depuración {puerto} (solo pruebas automáticas)"));
    Some(puerto)
}

// Windows entrega la carpeta del programa como ruta "verbatim" (\\?\C:\...). Node no sabe cargar módulos
// desde esas rutas (falla con EISDIR lstat 'C:'), así que se pasa a la forma normal C:\...
fn ruta_normal(ruta: PathBuf) -> PathBuf {
    let normal = ruta
        .to_str()
        .and_then(|t| t.strip_prefix(r"\\?\"))
        .filter(|resto| !resto.starts_with("UNC\\"))
        .map(PathBuf::from);
    normal.unwrap_or(ruta)
}

// Antes de arrancar, confirma que el programa quedó completo (si falta algo, el registro dice qué).
fn revisar_recursos(recursos: &Path) -> Result<(), String> {
    let piezas = [
        "node/node.exe",
        "puerta/puerta/index.mjs",
        "puerta/node_modules/pg/package.json",
        "pgsql/bin/pg_ctl.exe",
        "pgsql/bin/postgres.exe",
        "pgsql/bin/initdb.exe",
        "postgrest/postgrest.exe",
        "app/server.js",
        "migraciones",
        "stubs.sql",
    ];
    let faltan: Vec<&str> = piezas.iter().copied().filter(|p| !recursos.join(p).exists()).collect();
    if faltan.is_empty() {
        Ok(())
    } else {
        Err(format!("La instalación está incompleta (faltan: {}). Reinstala zamorApp.", faltan.join(", ")))
    }
}

// Perfil del navegador interno (WebView2): la primera vez que abre una compilación nueva de la app se limpia
// por completo (service workers, cachés, cookies, almacenamiento). Así instalar una versión encima nunca vuelve
// a correr archivos viejos de la app, y solo pide entrar de nuevo tras actualizar.
fn limpiar_perfil_si_cambio(ventana: &tauri::WebviewWindow, recursos: &Path) {
    let compilacion = std::fs::read_to_string(recursos.join("app").join(".next").join("BUILD_ID")).unwrap_or_default();
    let compilacion = compilacion.trim();
    if compilacion.is_empty() {
        return;
    }
    let marca = carpeta_programa().join("perfil-web.txt");
    if std::fs::read_to_string(&marca).map(|m| m.trim() == compilacion).unwrap_or(false) {
        return;
    }
    match ventana.clear_all_browsing_data() {
        Ok(()) => {
            anotar(&format!("perfil del navegador interno limpiado para la compilación {compilacion}"));
            let _ = std::fs::write(&marca, compilacion);
        }
        Err(e) => anotar(&format!("no se pudo limpiar el perfil del navegador interno: {e}")),
    }
}

fn arrancar(recursos: &Path) -> Result<Procesos, String> {
    anotar(&format!("recursos: {}", recursos.display()));
    revisar_recursos(recursos)?;
    let datos = carpeta_datos();
    std::fs::create_dir_all(&datos).map_err(|e| format!("No se pudo crear {}: {e}", datos.display()))?;
    let node = recursos.join("node").join("node.exe");
    let puerta_dir = recursos.join("puerta");

    let mut puerta = comando(&node)
        .arg(puerta_dir.join("puerta").join("index.mjs"))
        .current_dir(&puerta_dir)
        .env("ZAMORAPP_DATOS", &datos)
        .env("ZAMORAPP_LLAVE", llave_pc()?)
        .env("ZAMORAPP_NUBE_URL", nube_url())
        .env("ZAMORAPP_NUBE_ANON", NUBE_ANON)
        .env("ZAMORAPP_PG_BIN", recursos.join("pgsql").join("bin"))
        .env("ZAMORAPP_POSTGREST", recursos.join("postgrest").join("postgrest.exe"))
        .env("ZAMORAPP_MIGRACIONES", recursos.join("migraciones"))
        .env("ZAMORAPP_BASE_EXTRA", puerta_dir.join("base"))
        .env("ZAMORAPP_STUBS", recursos.join("stubs.sql"))
        .env("ZAMORAPP_ORIGEN", format!("http://127.0.0.1:{PUERTO_APP}"))
        .env("PUERTO_PUERTA", PUERTO_PUERTA.to_string())
        .env("ZAMORAPP_CONTROL", clave_control())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No arrancó la puerta local: {e}"))?;
    anotar("puerta local iniciada; esperando la base");

    // La puerta avisa por su salida cuando está lista; el resto se descarta para no llenar el búfer.
    let (aviso, lista) = mpsc::channel::<Result<(), String>>();
    let salida = puerta.stdout.take().expect("salida de la puerta");
    let aviso_ok = aviso.clone();
    std::thread::spawn(move || {
        for linea in BufReader::new(salida).lines().map_while(Result::ok) {
            if linea.starts_with("PUERTA_LISTA") {
                let _ = aviso_ok.send(Ok(()));
            }
        }
    });
    let errores = puerta.stderr.take().expect("errores de la puerta");
    std::thread::spawn(move || {
        let mut texto = Vec::new();
        for linea in BufReader::new(errores).lines().map_while(Result::ok) {
            anotar(&format!("puerta: {linea}"));
            texto.push(linea);
        }
        let _ = aviso.send(Err(texto.join(" ")));
    });

    // Lo que diga la app (errores del servidor Next incluidos) queda en %LOCALAPPDATA%\zamorApp\datos\app.log
    let mut app = comando(&node)
        .arg(recursos.join("app").join("server.js"))
        .current_dir(recursos.join("app"))
        .env("PORT", PUERTO_APP.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No arrancó la app: {e}"))?;
    if let Some(s) = app.stdout.take() { volcar_a(s, datos.join("app.log")); }
    if let Some(s) = app.stderr.take() { volcar_a(s, datos.join("app.log")); }
    anotar("app iniciada");

    let mut procesos = Procesos { puerta: Some(puerta), app: Some(app) };
    match lista.recv_timeout(Duration::from_secs(300)) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => { detener(&mut procesos); return Err(format!("La base local no arrancó. {e}")); }
        Err(_) => { detener(&mut procesos); return Err("La base local tardó demasiado en arrancar.".into()); }
    }
    anotar("base local y puerta listas");
    if !esperar_puerto(PUERTO_APP, Duration::from_secs(60)) {
        detener(&mut procesos);
        return Err("La app no respondió a tiempo.".into());
    }
    anotar("app lista");
    Ok(procesos)
}

// Cerrar la entrada de la puerta le indica que detenga la base con calma (pg_ctl stop -m fast).
fn detener(p: &mut Procesos) {
    if let Some(mut puerta) = p.puerta.take() {
        drop(puerta.stdin.take());
        let inicio = Instant::now();
        while inicio.elapsed() < Duration::from_secs(15) {
            if matches!(puerta.try_wait(), Ok(Some(_))) { break; }
            std::thread::sleep(Duration::from_millis(200));
        }
        let _ = puerta.kill();
    }
    if let Some(mut app) = p.app.take() {
        let _ = app.kill();
    }
}

fn avisar(app: &AppHandle, titulo: &str, texto: &str) {
    app.dialog().message(texto).title(titulo).buttons(MessageDialogButtons::OkCustom("Entendido".into())).blocking_show();
}

// Pide a la puerta local una acción interna (POST) y devuelve el cuerpo de la respuesta.
fn pedir_puerta(ruta: &str) -> Result<String, String> {
    llamar_puerta("POST", ruta)
}

fn llamar_puerta(metodo: &str, ruta: &str) -> Result<String, String> {
    let mut c = std::net::TcpStream::connect(("127.0.0.1", PUERTO_PUERTA)).map_err(|e| e.to_string())?;
    c.set_read_timeout(Some(Duration::from_secs(300))).ok();
    write!(c, "{metodo} {ruta} HTTP/1.1\r\nHost: 127.0.0.1:{PUERTO_PUERTA}\r\nX-Zamorapp-Control: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", clave_control())
        .map_err(|e| e.to_string())?;
    let mut respuesta = String::new();
    c.read_to_string(&mut respuesta).map_err(|e| e.to_string())?;
    let (cabecera, cuerpo) = respuesta.split_once("\r\n\r\n").unwrap_or((&respuesta, ""));
    if cabecera.starts_with("HTTP/1.1 200") { Ok(cuerpo.to_string()) } else { Err(cabecera.lines().next().unwrap_or("").to_string()) }
}

fn sincronizar_ahora(app: AppHandle) {
    std::thread::spawn(move || {
        anotar("sincronizar ahora (pedido)");
        let (titulo, texto) = match pedir_puerta("/zamorapp/sincronizar").map(|c| serde_json::from_str::<serde_json::Value>(&c)) {
            Ok(Ok(v)) if v["enLinea"] == false => ("Sin internet", "No hay conexión. Tus datos se sincronizarán solos cuando vuelva internet.".to_string()),
            Ok(Ok(v)) if v["error"].is_string() => ("No se pudo sincronizar", format!("La nube respondió: {}. Se volverá a intentar sola en unos segundos.", v["error"].as_str().unwrap_or(""))),
            Ok(Ok(_)) => ("Sincronización lista", "Esta PC tiene los datos al día con la nube.".to_string()),
            _ => ("No se pudo sincronizar", "La base local no respondió. Cierra y vuelve a abrir zamorApp.".to_string()),
        };
        avisar(&app, titulo, &texto);
    });
}

// Busca una versión nueva. Al abrir, solo avisa si la hay; desde el menú, responde siempre.
// Nunca obliga: "Más tarde" deja todo como está. Instalar no toca los datos (%LOCALAPPDATA%\zamorApp).
fn buscar_actualizacion(app: AppHandle, a_pedido: bool) {
    buscar_actualizacion_por(app, a_pedido, false);
}

// por_nube: la puerta detectó que la nube ya cambió y esta versión no la entiende (ver vigilar_nube).
fn buscar_actualizacion_por(app: AppHandle, a_pedido: bool, por_nube: bool) {
    std::thread::spawn(move || {
        let prueba = actualizador_prueba();
        let llave = prueba.as_ref().map(|p| p.llave.clone()).filter(|l| !l.is_empty()).unwrap_or_else(|| LLAVE_ACTUALIZACIONES.to_string());
        if llave.is_empty() {
            if a_pedido { avisar(&app, "Actualizaciones", "Esta versión aún no tiene activadas las actualizaciones automáticas."); }
            return;
        }
        let actual = app.package_info().version.to_string();
        let consulta = tauri::async_runtime::block_on(async {
            let mut constructor = app.updater_builder().pubkey(llave);
            if let Some(p) = &prueba {
                constructor = constructor.endpoints(vec![p.url.parse().map_err(|_| tauri_plugin_updater::Error::EmptyEndpoints)?])?;
            }
            constructor.build()?.check().await
        });
        match consulta {
            Ok(Some(nueva)) => {
                anotar(&format!("actualización disponible: {} (instalada {actual})", nueva.version));
                let aceptar = prueba.as_ref().map(|p| p.sin_preguntar).unwrap_or(false) || app.dialog()
                    .message(format!("Hay una versión nueva de zamorApp: {} (tienes la {actual}).\n\nTarda unos minutos, el programa se vuelve a abrir solo y no se borra ningún dato.", nueva.version))
                    .title("Actualización disponible")
                    .buttons(MessageDialogButtons::OkCancelCustom("Actualizar ahora".into(), "Más tarde".into()))
                    .blocking_show();
                if !aceptar { anotar("actualización pospuesta"); return; }
                match tauri::async_runtime::block_on(nueva.download(|_, _| {}, || {})) {
                    Ok(paquete) => {
                        anotar("actualización descargada y verificada; instalando");
                        // La base local se detiene con calma antes de que el instalador reemplace los archivos.
                        detener(&mut app.state::<Mutex<Procesos>>().lock().unwrap());
                        if let Err(e) = nueva.install(paquete) {
                            anotar(&format!("ERROR al instalar la actualización: {e}"));
                            avisar(&app, "No se pudo actualizar", "La actualización no se instaló. Cierra y vuelve a abrir zamorApp; tus datos están intactos.");
                        }
                    }
                    Err(e) => {
                        anotar(&format!("ERROR al descargar la actualización: {e}"));
                        avisar(&app, "No se pudo actualizar", "No se pudo descargar la actualización. Revisa internet y vuelve a intentarlo desde el menú zamorApp.");
                    }
                }
            }
            Ok(None) if por_nube => avisar(&app, "zamorApp necesita actualizarse",
                "La nube ya tiene cambios que esta versión no entiende y la versión nueva todavía se está publicando.\n\nEn unos minutos: menú zamorApp → Buscar actualizaciones. Mientras tanto trabaja en la web: zamorapp-ocupacional.vercel.app. Tus datos están intactos."),
            Ok(None) => if a_pedido { avisar(&app, "Actualizaciones", &format!("Ya tienes la versión más reciente ({actual})." )) },
            Err(e) => {
                anotar(&format!("no se pudo buscar actualizaciones: {e}"));
                if a_pedido || por_nube { avisar(&app, "Actualizaciones", "No se pudo revisar si hay una versión nueva. Revisa la conexión a internet."); }
            }
        }
    });
}

// La nube puede recibir una migración antes de que esta PC se actualice (27/10/2026: la 0.1.0 quedó con
// «Application error» cuando la nube dejó de entregar dos columnas). La puerta lo detecta y lo marca en
// /zamorapp/estado; aquí se mira cada 30 s y, la primera vez, se ofrece la actualización en vez de dejar
// la pantalla caída. Nunca obliga: si Cesar dice «Más tarde», la app sigue (lo que se pueda leer, se lee).
fn vigilar_nube(app: AppHandle) {
    std::thread::spawn(move || {
        let mut avisado = false;
        loop {
            std::thread::sleep(Duration::from_secs(30));
            let estado = match llamar_puerta("GET", "/zamorapp/estado").map(|c| serde_json::from_str::<serde_json::Value>(&c)) {
                Ok(Ok(v)) => v,
                _ => continue,
            };
            if estado["actualizar"] == true && !avisado {
                avisado = true;
                anotar(&format!("la nube va por delante de esta versión: {}", estado["incompatible"]));
                buscar_actualizacion_por(app.clone(), false, true);
            }
        }
    });
}

// Descargas de la app (Excel, PDF, respaldos): el navegador interno no trae gestor de descargas, así que el
// archivo se guarda en la carpeta Descargas de Windows con su nombre (sin pisar uno existente) y se avisa
// con "Abrir carpeta". Devuelve false para rechazar la descarga.
fn descarga(app: &AppHandle, evento: tauri::webview::DownloadEvent<'_>) -> bool {
    match evento {
        tauri::webview::DownloadEvent::Requested { url, destination } => {
            let nombre = destination.file_name().map(|n| n.to_string_lossy().to_string()).filter(|n| !n.is_empty()).unwrap_or_else(|| "descarga".into());
            let carpeta = match app.path().download_dir() {
                Ok(c) => c,
                Err(e) => { anotar(&format!("descarga rechazada: sin carpeta Descargas ({e})")); return false; }
            };
            let (base, ext) = match nombre.rsplit_once('.') { Some((b, e)) if !b.is_empty() => (b.to_string(), format!(".{e}")), _ => (nombre.clone(), String::new()) };
            let mut ruta = carpeta.join(&nombre);
            for n in 2.. { if !ruta.exists() { break; } ruta = carpeta.join(format!("{base} ({n}){ext}")); }
            anotar(&format!("descarga: {url} -> {}", ruta.display()));
            *destination = ruta;
            true
        }
        tauri::webview::DownloadEvent::Finished { path, success, .. } => {
            let ruta = path.unwrap_or_default();
            anotar(&format!("descarga {}: {}", if success { "guardada" } else { "FALLÓ" }, ruta.display()));
            if success && !en_pruebas() {
                let app = app.clone();
                std::thread::spawn(move || {
                    let abrir = app.dialog()
                        .message(format!("Se guardó en tu carpeta Descargas:\n{}", ruta.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()))
                        .title("Archivo guardado")
                        .buttons(MessageDialogButtons::OkCancelCustom("Abrir carpeta".into(), "Entendido".into()))
                        .blocking_show();
                    if abrir { let _ = Command::new("explorer").arg(format!("/select,{}", ruta.display())).spawn(); }
                });
            } else if !success && !en_pruebas() {
                avisar(app, "No se pudo guardar", "La descarga no terminó. Vuelve a intentarlo.");
            }
            true
        }
        _ => true,
    }
}

fn main() {
    anotar(&format!("--- zamorApp {} abriendo", env!("CARGO_PKG_VERSION")));
    std::panic::set_hook(Box::new(|info| anotar(&format!("PÁNICO: {info}"))));
    match tauri::webview_version() {
        Ok(v) => anotar(&format!("WebView2 {v}")),
        Err(e) => anotar(&format!("WebView2 no disponible: {e}")),
    }
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Mutex::new(Procesos::default()))
        .on_menu_event(|app, evento| match evento.id().0.as_str() {
            "sincronizar" => sincronizar_ahora(app.clone()),
            "actualizar" => buscar_actualizacion(app.clone(), true),
            _ => {}
        })
        .setup(|app| {
            let version = MenuItemBuilder::with_id("version", format!("Versión {}", app.package_info().version)).enabled(false).build(app)?;
            let menu_zamorapp = SubmenuBuilder::new(app, "zamorApp")
                .text("sincronizar", "Sincronizar ahora")
                .text("actualizar", "Buscar actualizaciones")
                .item(&PredefinedMenuItem::separator(app)?)
                .item(&version)
                .build()?;
            app.set_menu(MenuBuilder::new(app).item(&menu_zamorapp).build()?)?;
            let recursos = ruta_normal(app.path().resource_dir()?.join("recursos"));
            anotar(&format!("programa: {}", std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default()));
            // La ventana está definida en tauri.conf.json ("create": false) y se crea aquí, para poder abrirle el
            // puerto de depuración en las pruebas automáticas. Los argumentos repiten los que wry pasa por defecto.
            let config = app.config().app.windows.iter().find(|w| w.label == "principal").cloned().expect("ventana principal en tauri.conf.json");
            // La versión en el título (0.1.<número de compilación>): así nunca se duda cuál instalador está corriendo
            let version = app.package_info().version.to_string();
            anotar(&format!("versión del instalador {version}"));
            let para_descargas = app.handle().clone();
            let mut constructor = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                .title(format!("zamorApp Escritorio v{version}"))
                .on_download(move |_, evento| descarga(&para_descargas, evento));
            if let Some(puerto) = puerto_depuracion() {
                constructor = constructor.additional_browser_args(&format!("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port={puerto}"));
            }
            constructor.build()?;
            let manejador = app.handle().clone();
            std::thread::spawn(move || {
                let ventana = manejador.get_webview_window("principal").expect("ventana principal");
                limpiar_perfil_si_cambio(&ventana, &recursos);
                match arrancar(&recursos) {
                    Ok(p) => {
                        *manejador.state::<Mutex<Procesos>>().lock().unwrap() = p;
                        let destino = format!("http://127.0.0.1:{PUERTO_PUERTA}/zamorapp/inicio");
                        let _ = ventana.navigate(destino.parse().expect("dirección local"));
                        anotar("ventana abierta en la pantalla de inicio");
                        vigilar_nube(manejador.clone());
                        std::thread::sleep(Duration::from_secs(20));
                        buscar_actualizacion(manejador.clone(), false);
                    }
                    Err(e) => {
                        anotar(&format!("ERROR: {e}"));
                        let texto = format!("No se pudo abrir zamorApp: {e} Cierra y vuelve a abrir el programa. Si sigue igual, avisa al soporte y envía el archivo %LOCALAPPDATA%\\zamorApp\\arranque.log.")
                            .replace('\\', "\\\\").replace('\'', "\\'");
                        let _ = ventana.eval(&format!("document.querySelector('.c').replaceChildren(Object.assign(document.createElement('strong'), {{ textContent: '{texto}' }}))"));
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("no se pudo crear la ventana de zamorApp");

    app.run(|manejador, evento| {
        if let RunEvent::Exit = evento {
            anotar("cerrando");
            detener(&mut manejador.state::<Mutex<Procesos>>().lock().unwrap());
        }
    });
}
