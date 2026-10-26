// Ventana de zamorApp para Windows. Arranca, sin ventanas negras, la puerta local (que a su vez
// arranca la base PostgreSQL y PostgREST) y el servidor de la app; al cerrar, los detiene en orden.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const SIN_VENTANA: u32 = 0x0800_0000;

// Puertos fijos y solo locales (el SQL Server del SAME usa el 1433; no se toca).
const PUERTO_PUERTA: u16 = 54331;
const PUERTO_APP: u16 = 54332;
const NUBE_URL: &str = match option_env!("ZAMORAPP_NUBE_URL") { Some(v) => v, None => "" };
const NUBE_ANON: &str = match option_env!("ZAMORAPP_NUBE_ANON") { Some(v) => v, None => "" };

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

fn carpeta_datos() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("zamorApp").join("datos")
}

fn arrancar(recursos: &Path) -> Result<Procesos, String> {
    let datos = carpeta_datos();
    std::fs::create_dir_all(&datos).map_err(|e| e.to_string())?;
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
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No arrancó la puerta local: {e}"))?;

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
        let texto: Vec<String> = BufReader::new(errores).lines().map_while(Result::ok).collect();
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

    let mut procesos = Procesos { puerta: Some(puerta), app: Some(app) };
    match lista.recv_timeout(Duration::from_secs(180)) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => { detener(&mut procesos); return Err(format!("La base local no arrancó. {e}")); }
        Err(_) => { detener(&mut procesos); return Err("La base local tardó demasiado en arrancar.".into()); }
    }
    if !esperar_puerto(PUERTO_APP, Duration::from_secs(60)) {
        detener(&mut procesos);
        return Err("La app no respondió a tiempo.".into());
    }
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

fn main() {
    let app = tauri::Builder::default()
        .manage(Mutex::new(Procesos::default()))
        .setup(|app| {
            let recursos = app.path().resource_dir()?.join("recursos");
            let manejador = app.handle().clone();
            std::thread::spawn(move || {
                let ventana = manejador.get_webview_window("principal").expect("ventana principal");
                match arrancar(&recursos) {
                    Ok(p) => {
                        *manejador.state::<Mutex<Procesos>>().lock().unwrap() = p;
                        let destino = format!("http://127.0.0.1:{PUERTO_PUERTA}/zamorapp/inicio");
                        let _ = ventana.navigate(destino.parse().expect("dirección local"));
                    }
                    Err(e) => {
                        let texto = format!("No se pudo abrir zamorApp: {e} Cierra y vuelve a abrir el programa. Si sigue igual, avisa al soporte.")
                            .replace('\\', "\\\\").replace('\'', "\\'");
                        let _ = ventana.eval(&format!("document.querySelector('.c').innerHTML = '<strong>{texto}</strong>'"));
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("no se pudo crear la ventana de zamorApp");

    app.run(|manejador, evento| {
        if let RunEvent::Exit = evento {
            detener(&mut manejador.state::<Mutex<Procesos>>().lock().unwrap());
        }
    });
}
