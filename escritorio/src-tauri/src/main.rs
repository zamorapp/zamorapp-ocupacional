// Ventana de zamorApp para Windows. Arranca, sin ventanas negras, la puerta local (que a su vez
// arranca la base PostgreSQL y PostgREST) y el servidor de la app; al cerrar, los detiene en orden.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::window::{ProgressBarState, ProgressBarStatus};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogBuilder, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

mod documentos;

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

// Las actualizaciones automáticas traen un instalador liviano, sin PostgreSQL, PostgREST ni Node: usan las
// piezas que dejó la instalación completa. Si esta versión necesita otras (cambió alguna) y la PC se saltó la
// versión completa que las trajo, se dice claro qué hacer en vez de arrancar con piezas que no corresponden.
// componentes-esperados.txt viene en todos los instaladores; pgsql/componentes.txt solo en el completo.
fn revisar_componentes(recursos: &Path) -> Result<(), String> {
    let leer = |p: PathBuf| std::fs::read_to_string(p).unwrap_or_default().trim().to_string();
    let esperado = leer(recursos.join("componentes-esperados.txt"));
    let instalado = leer(recursos.join("pgsql").join("componentes.txt"));
    anotar(&format!("componentes: esperados {} · instalados {}", if esperado.is_empty() { "-" } else { &esperado }, if instalado.is_empty() { "-" } else { &instalado }));
    // Sin huella esperada (instalador anterior a esto) no hay nada que comparar; con ella, la instalada debe coincidir
    // (si falta, las piezas no vienen de un instalador completo que la conozca: se pide el completo)
    if esperado.is_empty() || esperado == instalado {
        Ok(())
    } else {
        FALTAN_COMPONENTES.store(true, Ordering::SeqCst);
        Err("Esta versión de zamorApp necesita piezas nuevas (base de datos local). En unos segundos te ofrecerá descargarlas: pulsa «Actualizar ahora». Si no aparece, instala el completo desde https://github.com/zamorapp/zamorapp-descargas/releases/latest. Tus datos no se pierden.".into())
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
    revisar_componentes(recursos)?;
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

// Todo cuadro de diálogo va pegado a la ventana de zamorApp y la trae al frente: sin dueño, Windows lo abría
// detrás de la ventana y Cesar no lo veía (28/10/2026, «se queda como oculto»).
fn dialogo(app: &AppHandle, texto: impl Into<String>) -> MessageDialogBuilder<tauri::Wry> {
    let constructor = app.dialog().message(texto);
    match app.get_webview_window("principal") {
        Some(v) => {
            let _ = v.unminimize();
            let _ = v.show();
            let _ = v.set_focus();
            constructor.parent(&v)
        }
        None => constructor,
    }
}

fn avisar(app: &AppHandle, titulo: &str, texto: &str) {
    dialogo(&app, texto).title(titulo).buttons(MessageDialogButtons::OkCustom("Entendido".into())).blocking_show();
}

// Pide a la puerta local una acción interna (POST) y devuelve el cuerpo de la respuesta.
fn pedir_puerta(ruta: &str) -> Result<String, String> {
    llamar_puerta("POST", ruta)
}

fn llamar_puerta(metodo: &str, ruta: &str) -> Result<String, String> {
    let mut c = std::net::TcpStream::connect(("127.0.0.1", PUERTO_PUERTA)).map_err(|e| e.to_string())?;
    // Las consultas (GET) responden al instante; las acciones (sincronizar) pueden tardar minutos
    c.set_read_timeout(Some(Duration::from_secs(if metodo == "GET" { 20 } else { 300 }))).ok();
    write!(c, "{metodo} {ruta} HTTP/1.1\r\nHost: 127.0.0.1:{PUERTO_PUERTA}\r\nX-Zamorapp-Control: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", clave_control())
        .map_err(|e| e.to_string())?;
    // Se lee hasta que la puerta cierra (Connection: close) o hasta tener el cuerpo completo (Content-Length):
    // así una conexión que quede abierta no deja al programa esperando el tiempo límite.
    let mut bytes = Vec::new();
    let mut trozo = [0u8; 8192];
    loop {
        match c.read(&mut trozo) {
            Ok(0) => break,
            Ok(n) => {
                bytes.extend_from_slice(&trozo[..n]);
                let texto = String::from_utf8_lossy(&bytes);
                if let Some((cab, cuerpo)) = texto.split_once("\r\n\r\n") {
                    let esperado = cab.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(usize::MAX)));
                    if esperado.map(|e| cuerpo.len() >= e).unwrap_or(false) { break; }
                }
            }
            Err(e) => { if bytes.is_empty() { return Err(e.to_string()); } break; }
        }
    }
    let respuesta = String::from_utf8_lossy(&bytes).to_string();
    let (cabecera, cuerpo) = respuesta.split_once("\r\n\r\n").unwrap_or((&respuesta, ""));
    if !cabecera.starts_with("HTTP/1.1 200") { return Err(cabecera.lines().next().unwrap_or("").to_string()); }
    let chunked = cabecera.lines().any(|l| l.to_ascii_lowercase().replace(' ', "") == "transfer-encoding:chunked");
    Ok(if chunked { sin_trozos(cuerpo) } else { cuerpo.to_string() })
}

// Cuerpo HTTP «chunked» (tamaño en hexadecimal, datos, …, 0) → texto plano
fn sin_trozos(cuerpo: &str) -> String {
    let mut salida = String::new();
    let mut resto = cuerpo;
    while let Some((largo, despues)) = resto.split_once("\r\n") {
        let n = usize::from_str_radix(largo.trim().split(';').next().unwrap_or("0"), 16).unwrap_or(0);
        let (datos, siguiente) = match (n > 0).then(|| despues.get(..n).zip(despues.get(n..))).flatten() { Some(p) => p, None => break };
        salida.push_str(datos);
        resto = siguiente.strip_prefix("\r\n").unwrap_or("");
    }
    salida
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

// Evita dos descargas a la vez (menú, aviso de la nube y búsqueda al abrir).
static ACTUALIZANDO: AtomicBool = AtomicBool::new(false);
// Faltan las piezas pesadas que esta versión necesita (ver revisar_componentes): se pide el instalador completo
// de la última versión, aunque sea la misma que ya corre.
static FALTAN_COMPONENTES: AtomicBool = AtomicBool::new(false);
const ACTUALIZACION_COMPLETA: &str = "https://github.com/zamorapp/zamorapp-descargas/releases/latest/download/latest-completo.json";
// Actualización descargada que el usuario pidió instalar al cerrar: (versión, instalador, versión actual).
static PENDIENTE: Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>, String)>> = Mutex::new(None);

// Al cerrar zamorApp, instala la actualización que quedó lista (el instalador vuelve a abrir el programa).
fn instalar_pendiente() {
    let Some((nueva, paquete, actual)) = PENDIENTE.lock().unwrap().take() else { return };
    anotar("instalando la actualización pendiente al cerrar");
    let _ = std::fs::write(carpeta_programa().join("actualizando.txt"), format!("{actual}\n{}\n", nueva.version));
    if let Err(e) = nueva.install(paquete) {
        let _ = std::fs::remove_file(carpeta_programa().join("actualizando.txt"));
        anotar(&format!("ERROR al instalar la actualización pendiente: {e}"));
    }
}

fn estado_pct(texto: &str) -> Option<u64> {
    texto.split_whitespace().rev().nth(1).and_then(|n| n.parse().ok()).filter(|_| texto.ends_with('%'))
}

// Franja fija abajo de la ventana con el avance (el título solo se ve poco). Texto vacío la quita.
fn franja_actualizacion(texto: &str, pct: Option<u64>) -> String {
    let texto = serde_json::to_string(texto).unwrap_or_else(|_| "\"\"".into());
    let ancho = pct.map(|p| format!("{p}%")).unwrap_or_else(|| "100%".into());
    format!(r#"(() => {{
  let f = document.getElementById("zamorapp-actualizacion");
  const texto = {texto};
  if (!texto) {{ f?.remove(); return; }}
  if (!f) {{
    f = document.createElement("div");
    f.id = "zamorapp-actualizacion";
    f.setAttribute("role", "status");
    f.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0f3d3e;color:#fff;font:600 14px system-ui,sans-serif;padding:8px 16px;box-shadow:0 -2px 8px rgba(0,0,0,.2)";
    f.innerHTML = '<span></span><div style="height:4px;margin-top:6px;background:rgba(255,255,255,.25);border-radius:2px"><div style="height:100%;background:#7fd6c2;border-radius:2px;transition:width .3s"></div></div>';
    document.body.appendChild(f);
  }}
  f.firstChild.textContent = texto;
  f.lastChild.firstChild.style.width = "{ancho}";
}})()"#)
}

// Si la última vez se instaló una actualización, anota cómo terminó y se lo dice al usuario.
fn revisar_actualizacion_anterior(app: &AppHandle) {
    let marca = carpeta_programa().join("actualizando.txt");
    let Ok(texto) = std::fs::read_to_string(&marca) else { return };
    let _ = std::fs::remove_file(&marca);
    let mut lineas = texto.lines();
    let (antes, pedida) = (lineas.next().unwrap_or("?").to_string(), lineas.next().unwrap_or("?").to_string());
    let actual = app.package_info().version.to_string();
    anotar(&format!("actualización instalada: de {antes} a {pedida}; ahora corre la {actual}"));
    if en_pruebas() { return; }
    let (titulo, mensaje) = if actual == pedida {
        ("zamorApp actualizado", format!("Listo: zamorApp se actualizó a la versión {actual}. Tus datos siguen intactos."))
    } else {
        ("La actualización no terminó", format!("Se pidió la versión {pedida} pero sigue la {actual}. Vuelve a intentarlo desde el menú zamorApp › Buscar actualizaciones."))
    };
    dialogo(&app, mensaje).title(titulo).buttons(MessageDialogButtons::OkCustom("Entendido".into())).show(|_| {});
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
            if FALTAN_COMPONENTES.load(Ordering::SeqCst) && prueba.is_none() {
                constructor = constructor
                    .endpoints(vec![ACTUALIZACION_COMPLETA.parse().map_err(|_| tauri_plugin_updater::Error::EmptyEndpoints)?])?
                    .version_comparator(|actual, remota| remota.version >= actual);
            }
            if let Some(p) = &prueba {
                constructor = constructor.endpoints(vec![p.url.parse().map_err(|_| tauri_plugin_updater::Error::EmptyEndpoints)?])?;
            }
            constructor.build()?.check().await
        });
        match consulta {
            Ok(Some(nueva)) => {
                anotar(&format!("actualización disponible: {} (instalada {actual})", nueva.version));
                let aceptar = prueba.as_ref().map(|p| p.sin_preguntar).unwrap_or(false) || dialogo(&app, if FALTAN_COMPONENTES.load(Ordering::SeqCst) {
                        format!("A zamorApp {} le faltan piezas de la base de datos local: hay que descargar el instalador completo.\n\nTarda unos minutos, el programa se vuelve a abrir solo y no se borra ningún dato.", nueva.version)
                    } else {
                        format!("Hay una versión nueva de zamorApp: {} (tienes la {actual}).\n\nSe descarga mientras trabajas y al final te pregunta cuándo instalar. No se borra ningún dato.", nueva.version)
                    })
                    .title("Actualización disponible")
                    .buttons(MessageDialogButtons::OkCancelCustom("Actualizar ahora".into(), "Más tarde".into()))
                    .blocking_show();
                if !aceptar { anotar("actualización pospuesta"); return; }
                if ACTUALIZANDO.swap(true, Ordering::SeqCst) { anotar("ya hay una actualización en curso"); return; }
                // Sin avance a la vista, una descarga de 140 MB parecía «no hacer nada»: el título de la ventana y la
                // barra de la tarea muestran el porcentaje, y el programa avisa al empezar y al volver a abrirse.
                let ventana = app.get_webview_window("principal");
                let titulo = format!("zamorApp Escritorio v{actual}");
                let mostrar = |texto: &str, estado: ProgressBarState| if let Some(v) = &ventana {
                    let _ = v.set_title(&if texto.is_empty() { titulo.clone() } else { format!("{titulo} — {texto}") });
                    let _ = v.set_progress_bar(estado);
                    let _ = v.eval(&franja_actualizacion(texto, estado_pct(texto)));
                };
                anotar(&format!("descargando la actualización {}", nueva.version));
                mostrar("Descargando actualización…", ProgressBarState { status: Some(ProgressBarStatus::Indeterminate), progress: None });
                if prueba.is_none() {
                    dialogo(&app, "Se está descargando la actualización. Puedes seguir trabajando: el avance se ve en la franja de abajo de la ventana y en el título.\n\nAl terminar, zamorApp se cierra unos segundos, se instala y se vuelve a abrir solo.")
                        .title("Descargando actualización")
                        .buttons(MessageDialogButtons::OkCustom("Entendido".into()))
                        .show(|_| {});
                }
                let (mut recibido, mut ultimo) = (0u64, u64::MAX);
                let descarga = tauri::async_runtime::block_on(nueva.download(
                    |trozo, total| {
                        recibido += trozo as u64;
                        let Some(total) = total.filter(|t| *t > 0) else {
                            // Sin tamaño anunciado: se muestran los MB recibidos
                            let mb = recibido / 1_048_576;
                            if mb != ultimo { ultimo = mb; mostrar(&format!("Descargando actualización {mb} MB"), ProgressBarState { status: Some(ProgressBarStatus::Indeterminate), progress: None }); }
                            return;
                        };
                        let pct = (recibido * 100 / total).min(100);
                        if pct == ultimo { return; }
                        if pct / 25 != ultimo.min(100) / 25 || ultimo == u64::MAX { anotar(&format!("descargando la actualización: {pct} % de {} MB", total / 1_048_576)); }
                        ultimo = pct;
                        mostrar(&format!("Descargando actualización {pct} %"), ProgressBarState { status: Some(ProgressBarStatus::Normal), progress: Some(pct) });
                    },
                    || {},
                ));
                match descarga {
                    Ok(paquete) => {
                        anotar("actualización descargada y verificada");
                        // Instalar cierra el programa: se pregunta antes, para no perder una consulta a medio escribir.
                        let ahora = prueba.as_ref().map(|p| p.sin_preguntar).unwrap_or(false) || dialogo(&app, "La actualización está lista. Guarda lo que estés escribiendo.\n\nAl instalar, zamorApp se cierra unos segundos y se vuelve a abrir solo.")
                            .title("Actualización lista")
                            .buttons(MessageDialogButtons::OkCancelCustom("Instalar ahora".into(), "Al cerrar zamorApp".into()))
                            .blocking_show();
                        if !ahora {
                            anotar("actualización lista; se instalará al cerrar zamorApp");
                            mostrar("Actualización lista: se instala al cerrar", ProgressBarState { status: Some(ProgressBarStatus::None), progress: None });
                            *PENDIENTE.lock().unwrap() = Some((nueva, paquete, actual));
                            return;
                        }
                        anotar("instalando la actualización");
                        mostrar("Instalando actualización…", ProgressBarState { status: Some(ProgressBarStatus::Indeterminate), progress: None });
                        // Al volver a abrir, el programa ve esta marca, anota el resultado y avisa que ya está al día.
                        let _ = std::fs::write(carpeta_programa().join("actualizando.txt"), format!("{actual}\n{}\n", nueva.version));
                        // La base local se detiene con calma antes de que el instalador reemplace los archivos.
                        detener(&mut app.state::<Mutex<Procesos>>().lock().unwrap());
                        if let Err(e) = nueva.install(paquete) {
                            let _ = std::fs::remove_file(carpeta_programa().join("actualizando.txt"));
                            anotar(&format!("ERROR al instalar la actualización: {e}"));
                            mostrar("", ProgressBarState { status: Some(ProgressBarStatus::None), progress: None });
                            ACTUALIZANDO.store(false, Ordering::SeqCst);
                            avisar(&app, "No se pudo actualizar", "La actualización no se instaló. Cierra y vuelve a abrir zamorApp; tus datos están intactos.");
                        }
                    }
                    Err(e) => {
                        anotar(&format!("ERROR al descargar la actualización: {e}"));
                        mostrar("", ProgressBarState { status: Some(ProgressBarStatus::None), progress: None });
                        ACTUALIZANDO.store(false, Ordering::SeqCst);
                        avisar(&app, "No se pudo actualizar", "No se pudo descargar la actualización. Revisa internet y vuelve a intentarlo desde el menú zamorApp › Buscar actualizaciones.");
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
// /zamorapp/estado; aquí se mira cada 10 s y, la primera vez, se ofrece la actualización en vez de dejar
// la pantalla caída. Nunca obliga: si Cesar dice «Más tarde», la app sigue (lo que se pueda leer, se lee).
fn vigilar_nube(app: AppHandle) {
    std::thread::spawn(move || {
        let mut avisado = false;
        let mut fallos = 0;
        anotar("vigilando la nube (cada 10 s)");
        loop {
            std::thread::sleep(Duration::from_secs(10));
            let estado = match llamar_puerta("GET", "/zamorapp/estado").map(|c| serde_json::from_str::<serde_json::Value>(&c)) {
                Ok(Ok(v)) => v,
                Ok(Err(e)) => { if fallos == 0 { anotar(&format!("vigilar la nube: respuesta ilegible: {e}")); } fallos += 1; continue; }
                Err(e) => { if fallos == 0 { anotar(&format!("vigilar la nube: la puerta no respondió: {e}")); } fallos += 1; continue; }
            };
            if estado["buscarActualizacion"] == true {
                // Botón «Buscar actualización» de la pantalla: responde siempre, como desde el menú
                anotar("actualización pedida desde la pantalla");
                if !en_pruebas() { buscar_actualizacion_por(app.clone(), true, true); }
            }
            if estado["actualizar"] == true && !avisado {
                avisado = true;
                anotar(&format!("la nube va por delante de esta versión: {}", estado["incompatible"]));
                // En la prueba de humo solo se anota: el actualizador de prueba ya tiene su propio paso.
                if !en_pruebas() { buscar_actualizacion_por(app.clone(), false, true); }
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
                    let abrir = dialogo(&app, format!("Se guardó en tu carpeta Descargas:\n{}", ruta.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()))
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
        .manage(documentos::Guardados::default())
        .invoke_handler(tauri::generate_handler![documentos::imprimir, documentos::guardar_pdf, documentos::mostrar_pdf])
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
            // Documentos (target="_blank", window.open) en su propia ventana; sin esto el navegador interno los descarta.
            // Descargas (Excel, archivos): a la carpeta Descargas con aviso.
            let manejador_docs = app.handle().clone();
            let para_descargas = app.handle().clone();
            let mut constructor = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                .title(format!("zamorApp Escritorio v{version}"))
                .on_new_window(move |url, features| documentos::ventana_nueva(&manejador_docs, url, features))
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
                        revisar_actualizacion_anterior(&manejador);
                        vigilar_nube(manejador.clone());
                        std::thread::sleep(Duration::from_secs(20));
                        buscar_actualizacion(manejador.clone(), false);
                    }
                    Err(e) => {
                        anotar(&format!("ERROR: {e}"));
                        let texto = format!("No se pudo abrir zamorApp: {e} Cierra y vuelve a abrir el programa. Si sigue igual, avisa al soporte y envía el archivo %LOCALAPPDATA%\\zamorApp\\arranque.log.")
                            .replace('\\', "\\\\").replace('\'', "\\'");
                        let _ = ventana.eval(&format!("document.querySelector('.c').replaceChildren(Object.assign(document.createElement('strong'), {{ textContent: '{texto}' }}))"));
                        // Aunque no arranque, se busca una versión nueva: así un arreglo publicado llega igual a esta PC
                        buscar_actualizacion(manejador.clone(), false);
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("no se pudo crear la ventana de zamorApp");

    app.run(|manejador, evento| match evento {
        // Cerrar la ventana principal cierra el programa entero, aunque queden documentos abiertos en otras ventanas
        RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } if label == "principal" => manejador.exit(0),
        RunEvent::Exit => {
            anotar("cerrando");
            detener(&mut manejador.state::<Mutex<Procesos>>().lock().unwrap());
            instalar_pendiente();
        }
        _ => {}
    });
}
