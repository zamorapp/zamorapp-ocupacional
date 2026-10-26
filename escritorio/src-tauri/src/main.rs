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
    let archivo = carpeta.join("arranque.log");
    if std::fs::metadata(&archivo).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        let _ = std::fs::rename(&archivo, carpeta.join("arranque.anterior.log"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&archivo) {
        let segundos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let _ = writeln!(f, "{segundos} {mensaje}");
    }
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
        .env("ZAMORAPP_NUBE_URL", NUBE_URL)
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

    let app = comando(&node)
        .arg(recursos.join("app").join("server.js"))
        .current_dir(recursos.join("app"))
        .env("PORT", PUERTO_APP.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("No arrancó la app: {e}"))?;
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
    let mut c = std::net::TcpStream::connect(("127.0.0.1", PUERTO_PUERTA)).map_err(|e| e.to_string())?;
    c.set_read_timeout(Some(Duration::from_secs(300))).ok();
    write!(c, "POST {ruta} HTTP/1.1\r\nHost: 127.0.0.1:{PUERTO_PUERTA}\r\nX-Zamorapp-Control: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", clave_control())
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
    std::thread::spawn(move || {
        if LLAVE_ACTUALIZACIONES.is_empty() {
            if a_pedido { avisar(&app, "Actualizaciones", "Esta versión aún no tiene activadas las actualizaciones automáticas."); }
            return;
        }
        let actual = app.package_info().version.to_string();
        let consulta = tauri::async_runtime::block_on(async {
            let actualizador = app.updater_builder().pubkey(LLAVE_ACTUALIZACIONES).build()?;
            actualizador.check().await
        });
        match consulta {
            Ok(Some(nueva)) => {
                anotar(&format!("actualización disponible: {} (instalada {actual})", nueva.version));
                let aceptar = app.dialog()
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
            Ok(None) => if a_pedido { avisar(&app, "Actualizaciones", &format!("Ya tienes la versión más reciente ({actual})." )) },
            Err(e) => {
                anotar(&format!("no se pudo buscar actualizaciones: {e}"));
                if a_pedido { avisar(&app, "Actualizaciones", "No se pudo revisar si hay una versión nueva. Revisa la conexión a internet."); }
            }
        }
    });
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
            let manejador = app.handle().clone();
            std::thread::spawn(move || {
                let ventana = manejador.get_webview_window("principal").expect("ventana principal");
                match arrancar(&recursos) {
                    Ok(p) => {
                        *manejador.state::<Mutex<Procesos>>().lock().unwrap() = p;
                        let destino = format!("http://127.0.0.1:{PUERTO_PUERTA}/zamorapp/inicio");
                        let _ = ventana.navigate(destino.parse().expect("dirección local"));
                        anotar("ventana abierta en la pantalla de inicio");
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
