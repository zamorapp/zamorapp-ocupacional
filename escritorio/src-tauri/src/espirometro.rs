// Espirometría con winspiroPRO (ErgoSpir de MIR) por su interfaz oficial GDT 2.1, sin cambiar nada del programa.
// Regla de Cesar (06-nov-2026): winspiroPRO es de SOLO LECTURA, como el SAME. Aquí no se instala, mueve, configura ni
// borra nada suyo; solo se usan los dos archivos de intercambio que su manual define para otro programa:
//   WPROZAMO.GDT  lo escribe zamorApp en la carpeta de winspiroPRO (datos del paciente, armados en src/lib/gdt.ts)
//   ZAMOWPRO.GDT  lo escribe winspiroPRO al cerrarse (resultado de la prueba)
// Ambos llevan «ZAMO» en el nombre: son de zamorApp y se quitan al terminar. winspiroPRO se abre con /GDT, la persona
// hace la prueba y lo cierra; entonces se lee el resultado y se devuelve a la página tal cual (bytes CP437).
#[cfg(windows)]
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::anotar;

const ENTRADA: &str = "WPROZAMO.GDT";
const SALIDA: &str = "ZAMOWPRO.GDT";
const PROGRAMA: &str = "winspiroPRO.exe";

static EN_CURSO: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn espirometria_winspiro(pedido: Vec<u8>) -> Result<Option<Vec<u8>>, String> {
    if pedido.len() < 20 || pedido.len() > 4096 || !pedido.starts_with(b"01380006301") {
        return Err("Datos del paciente inválidos para winspiroPRO.".into());
    }
    if EN_CURSO.swap(true, Ordering::SeqCst) {
        return Err("winspiroPRO ya está abierto desde zamorApp. Termina la prueba y ciérralo.".into());
    }
    let r = tauri::async_runtime::spawn_blocking(move || hacer(pedido)).await.map_err(|e| e.to_string()).and_then(|x| x);
    EN_CURSO.store(false, Ordering::SeqCst);
    if let Err(e) = &r {
        anotar(&format!("espirometría: {e}"));
    }
    r
}

#[cfg(windows)]
fn hacer(pedido: Vec<u8>) -> Result<Option<Vec<u8>>, String> {
    let carpeta = carpeta_winspiro().ok_or(
        "No encontré winspiroPRO en esta computadora (se buscó en el registro de Windows, C:\\ERGOSPIR\\winspiroPRO y C:\\MIR\\winspiroPRO).",
    )?;
    if abierto() {
        return Err("winspiroPRO ya está abierto. Ciérralo y vuelve a tocar «Hacer en winspiroPRO»: así se abre con los datos del paciente.".into());
    }
    let entrada = carpeta.join(ENTRADA);
    let salida = carpeta.join(SALIDA);
    // Un resultado viejo de zamorApp (de una prueba anterior sin terminar) no debe leerse como el de ahora
    let _ = std::fs::remove_file(&salida);
    std::fs::write(&entrada, &pedido).map_err(|e| format!("No se pudo dejar los datos del paciente para winspiroPRO ({e})."))?;
    anotar(&format!("espirometría: se abre winspiroPRO /GDT en {}", carpeta.display()));
    // winspiroPRO no va al «trabajo» de procesos de zamorApp: si zamorApp se cierra, la prueba no se corta
    let estado = std::process::Command::new(carpeta.join(PROGRAMA))
        .arg("/GDT")
        .current_dir(&carpeta)
        .spawn()
        .and_then(|mut hijo| hijo.wait());
    let _ = std::fs::remove_file(&entrada);
    if let Err(e) = estado {
        return Err(format!("No se pudo abrir winspiroPRO ({e})."));
    }
    // Un resultado real mide unos pocos KB; algo de más de 1 MB no es de winspiroPRO y no se carga
    if std::fs::metadata(&salida).map(|m| m.len() > 1024 * 1024).unwrap_or(false) {
        let _ = std::fs::remove_file(&salida);
        return Err("El archivo de resultado de winspiroPRO es demasiado grande; no se usó.".into());
    }
    match std::fs::read(&salida) {
        Ok(bytes) => {
            let _ = std::fs::remove_file(&salida);
            anotar(&format!("espirometría: resultado recibido ({} bytes)", bytes.len()));
            Ok(Some(bytes))
        }
        Err(_) => {
            anotar("espirometría: winspiroPRO se cerró sin dejar resultado");
            Ok(None)
        }
    }
}

#[cfg(not(windows))]
fn hacer(_pedido: Vec<u8>) -> Result<Option<Vec<u8>>, String> {
    Err("winspiroPRO solo existe en Windows.".into())
}

// Carpeta de winspiroPRO: la que anota su instalador en el registro (manual GDT: HKLM\SOFTWARE\WSP\VERS\Path), o las
// carpetas de siempre. Solo se lee el registro; nunca se escribe.
#[cfg(windows)]
fn carpeta_winspiro() -> Option<PathBuf> {
    let mut candidatas: Vec<PathBuf> = Vec::new();
    for clave in ["HKLM\\SOFTWARE\\WSP\\VERS", "HKLM\\SOFTWARE\\WOW6432Node\\WSP\\VERS"] {
        if let Ok(s) = crate::comando(std::path::Path::new("reg")).args(["query", clave, "/v", "Path"]).output() {
            let texto = String::from_utf8_lossy(&s.stdout).to_string();
            if let Some(ruta) = texto.lines().find_map(|l| l.split_once("REG_SZ").map(|(_, r)| r.trim().to_string())) {
                if !ruta.is_empty() {
                    candidatas.push(PathBuf::from(ruta));
                }
            }
        }
    }
    candidatas.push(PathBuf::from("C:\\ERGOSPIR\\winspiroPRO"));
    candidatas.push(PathBuf::from("C:\\MIR\\winspiroPRO"));
    candidatas.into_iter().find(|c| c.join(PROGRAMA).is_file())
}

#[cfg(windows)]
fn abierto() -> bool {
    crate::comando(std::path::Path::new("tasklist"))
        .args(["/FI", &format!("IMAGENAME eq {PROGRAMA}"), "/NH"])
        .output()
        .map(|s| String::from_utf8_lossy(&s.stdout).to_lowercase().contains(&PROGRAMA.to_lowercase()))
        .unwrap_or(false)
}
