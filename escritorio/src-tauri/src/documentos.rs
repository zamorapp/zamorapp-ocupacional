// Documentos impresos en la ventana de escritorio. El WebView2 de Tauri no hace nada con window.open ni con
// los enlaces target="_blank" si nadie los atiende (wry los descarta en silencio), y la página no tiene cómo
// abrir el diálogo de impresoras de Windows ni elegir dónde guardar un PDF. Aquí se resuelve todo eso:
// cada documento abre en su propia ventana, «Imprimir» muestra el diálogo de impresoras de Windows y
// «Guardar PDF» pregunta dónde guardarlo (por omisión Documentos\zamorApp\Informes).
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::{anotar, en_pruebas, PUERTO_APP, PUERTO_PUERTA};

static VENTANAS: AtomicU32 = AtomicU32::new(1);

// PDF guardados en esta sesión: solo esos se pueden abrir o mostrar en la carpeta desde la página
#[derive(Default)]
pub struct Guardados(Mutex<Vec<PathBuf>>);

fn es_de_la_app(url: &Url) -> bool {
    url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"))
        && matches!(url.port(), Some(p) if p == PUERTO_APP || p == PUERTO_PUERTA)
}

// window.open / target="_blank": lo de la app abre en una ventana propia de zamorApp (misma sesión, mismo
// navegador interno, con Imprimir y Guardar PDF); WhatsApp, correo y demás enlaces externos, en el navegador
// de Windows. Nada se descarta en silencio.
pub fn ventana_nueva<R: Runtime>(app: &AppHandle<R>, url: Url, features: NewWindowFeatures) -> NewWindowResponse<R> {
    if url.as_str() == "about:blank" || es_de_la_app(&url) {
        let etiqueta = format!("documento-{}", VENTANAS.fetch_add(1, Ordering::Relaxed));
        let otra = app.clone();
        let ventana = WebviewWindowBuilder::new(app, &etiqueta, WebviewUrl::External("about:blank".parse().expect("about:blank")))
            .window_features(features)
            .title("zamorApp · documento")
            .inner_size(1100.0, 900.0)
            .min_inner_size(640.0, 480.0)
            .on_document_title_changed(|v, titulo| {
                if !titulo.is_empty() && titulo != "about:blank" {
                    let _ = v.set_title(&format!("{titulo} · zamorApp"));
                }
            })
            .on_new_window(move |u, f| ventana_nueva(&otra, u, f))
            .build();
        return match ventana {
            Ok(window) => {
                anotar(&format!("documento abierto en la ventana {etiqueta}: {url}"));
                window.set_focus().ok();
                NewWindowResponse::Create { window }
            }
            Err(e) => {
                anotar(&format!("ERROR al abrir la ventana del documento {url}: {e}"));
                NewWindowResponse::Deny
            }
        };
    }
    if matches!(url.scheme(), "https" | "http" | "mailto" | "tel" | "whatsapp") {
        anotar(&format!("enlace externo al navegador de Windows: {}", url.scheme()));
        abrir_con_windows(url.as_str());
    } else {
        anotar(&format!("ventana nueva rechazada: {url}"));
    }
    NewWindowResponse::Deny
}

// Abre una dirección o un archivo con el programa que Windows tenga asignado (navegador, lector de PDF)
fn abrir_con_windows(destino: &str) {
    #[cfg(windows)]
    {
        let _ = crate::comando(Path::new("rundll32.exe")).args(["url.dll,FileProtocolHandler", destino]).spawn();
    }
    #[cfg(not(windows))]
    let _ = destino;
}

// Nombre de archivo válido en Windows a partir del título del documento
fn nombre_archivo(nombre: &str) -> String {
    let limpio: String = nombre
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let limpio: String = limpio.trim_matches('.').chars().take(120).collect();
    let limpio = if limpio.is_empty() { "Documento zamorApp".to_string() } else { limpio };
    format!("{limpio}.pdf")
}

pub fn carpeta_informes<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    let documentos = app.path().document_dir().unwrap_or_else(|_| std::env::temp_dir());
    documentos.join("zamorApp").join("Informes")
}

// Pruebas automáticas: el PDF se guarda sin diálogo en esta carpeta (solo junto con la nube de prueba)
fn carpeta_de_prueba() -> Option<PathBuf> {
    if !en_pruebas() {
        return None;
    }
    std::env::var_os("ZAMORAPP_PDF_PRUEBA").map(PathBuf::from)
}

#[cfg(windows)]
mod webview2 {
    use super::*;
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::{Interface, HSTRING};

    // Diálogo de impresoras de Windows (el clásico «Imprimir»: impresora, páginas, copias)
    pub fn mostrar_dialogo<R: Runtime>(ventana: &WebviewWindow<R>) -> Result<(), String> {
        let (aviso, respuesta) = mpsc::channel::<Result<(), String>>();
        ventana
            .with_webview(move |wv| {
                let r = unsafe {
                    wv.controller()
                        .CoreWebView2()
                        .and_then(|w| w.cast::<ICoreWebView2_16>())
                        .and_then(|w| w.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM))
                };
                let _ = aviso.send(r.map_err(|e| format!("Windows no abrió el diálogo de impresión ({e}). Actualiza Microsoft Edge WebView2 o usa «Guardar PDF».")));
            })
            .map_err(|e| e.to_string())?;
        // Si el diálogo de Windows es modal, ShowPrintUI no vuelve hasta cerrarlo: sin respuesta pronta, ya está a la vista
        match respuesta.recv_timeout(Duration::from_secs(5)) {
            Ok(r) => r,
            Err(_) => {
                anotar("imprimir: el diálogo de impresoras quedó abierto");
                Ok(())
            }
        }
    }

    // El PDF sale del mismo motor que imprime la página (Chromium), con el tamaño de hoja y márgenes del
    // documento (@page), colores de fondo y sin la dirección web ni la fecha del navegador.
    pub fn generar_pdf<R: Runtime>(ventana: &WebviewWindow<R>) -> Result<Vec<u8>, String> {
        let (aviso, respuesta) = mpsc::channel::<Result<String, String>>();
        let parametros = r#"{"printBackground":true,"preferCSSPageSize":true,"displayHeaderFooter":false}"#;
        ventana
            .with_webview(move |wv| {
                let otro = aviso.clone();
                let r = unsafe {
                    wv.controller().CoreWebView2().and_then(|w| {
                        w.CallDevToolsProtocolMethod(
                            &HSTRING::from("Page.printToPDF"),
                            &HSTRING::from(parametros),
                            &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |error, json| {
                                let _ = otro.send(error.map(|_| json).map_err(|e| e.to_string()));
                                Ok(())
                            })),
                        )
                    })
                };
                if let Err(e) = r {
                    let _ = aviso.send(Err(e.to_string()));
                }
            })
            .map_err(|e| e.to_string())?;
        let json = respuesta
            .recv_timeout(Duration::from_secs(120))
            .map_err(|_| "El PDF tardó demasiado en generarse.".to_string())?
            .map_err(|e| format!("No se pudo generar el PDF: {e}"))?;
        let valor: serde_json::Value = serde_json::from_str(&json).map_err(|e| format!("Respuesta inesperada al generar el PDF: {e}"))?;
        let datos = valor.get("data").and_then(|d| d.as_str()).ok_or("El PDF salió vacío.")?;
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.decode(datos).map_err(|e| format!("PDF dañado: {e}"))
    }
}

#[tauri::command]
pub async fn imprimir<R: Runtime>(ventana: WebviewWindow<R>) -> Result<(), String> {
    anotar(&format!("imprimir: diálogo de impresoras en {}", ventana.label()));
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || webview2::mostrar_dialogo(&ventana)).await.map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    ventana.print().map_err(|e| e.to_string())
}

// Diálogo «Guardar como» de Windows, sobre la ventana del documento
#[cfg(windows)]
async fn elegir_ruta<R: Runtime>(ventana: &WebviewWindow<R>, carpeta: PathBuf, archivo: String) -> Result<Option<PathBuf>, String> {
    let dialogo = rfd::FileDialog::new()
        .set_title("Guardar el documento en PDF")
        .set_directory(&carpeta)
        .set_file_name(&archivo)
        .add_filter("Documento PDF", &["pdf"])
        .set_parent(ventana);
    tauri::async_runtime::spawn_blocking(move || dialogo.save_file()).await.map_err(|e| e.to_string())
}

#[cfg(not(windows))]
async fn elegir_ruta<R: Runtime>(_: &WebviewWindow<R>, carpeta: PathBuf, archivo: String) -> Result<Option<PathBuf>, String> {
    Ok(Some(carpeta.join(archivo)))
}

// Devuelve la ruta del PDF guardado, o nada si la persona canceló el diálogo «Guardar como»
#[tauri::command]
pub async fn guardar_pdf<R: Runtime>(app: AppHandle<R>, ventana: WebviewWindow<R>, nombre: String) -> Result<Option<String>, String> {
    let archivo = nombre_archivo(&nombre);
    let ruta = match carpeta_de_prueba() {
        Some(carpeta) => {
            std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
            carpeta.join(&archivo)
        }
        None => {
            let carpeta = carpeta_informes(&app);
            let _ = std::fs::create_dir_all(&carpeta);
            let elegido = elegir_ruta(&ventana, carpeta, archivo).await?;
            match elegido {
                Some(r) if r.extension().map(|x| x.eq_ignore_ascii_case("pdf")).unwrap_or(false) => r,
                Some(r) => r.with_extension("pdf"),
                None => return Ok(None),
            }
        }
    };
    #[cfg(windows)]
    let pdf = {
        let v = ventana.clone();
        tauri::async_runtime::spawn_blocking(move || webview2::generar_pdf(&v)).await.map_err(|e| e.to_string())??
    };
    #[cfg(not(windows))]
    let pdf: Vec<u8> = return Err("Guardar PDF solo está disponible en Windows".into());
    if !pdf.starts_with(b"%PDF") {
        return Err("El PDF salió dañado; vuelve a intentarlo.".into());
    }
    std::fs::write(&ruta, &pdf).map_err(|e| format!("No se pudo guardar {}: {e}. ¿Está abierto en otro programa?", ruta.display()))?;
    anotar(&format!("PDF guardado ({} KB): {}", pdf.len() / 1024, ruta.display()));
    app.state::<Guardados>().0.lock().unwrap().push(ruta.clone());
    Ok(Some(ruta.display().to_string()))
}

// Abre un PDF que se acaba de guardar (abrir = true) o muestra su carpeta con el archivo marcado
#[tauri::command]
pub fn mostrar_pdf<R: Runtime>(app: AppHandle<R>, ruta: String, abrir: bool) -> Result<(), String> {
    let ruta = PathBuf::from(ruta);
    if !app.state::<Guardados>().0.lock().unwrap().contains(&ruta) {
        return Err("Solo se pueden abrir los PDF guardados desde zamorApp en esta sesión.".into());
    }
    if abrir {
        abrir_con_windows(&ruta.display().to_string());
    } else {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // explorer necesita «/select,"ruta"» en un solo argumento sin comillas extra de Rust
            let _ = std::process::Command::new("explorer.exe").raw_arg(format!("/select,\"{}\"", ruta.display())).spawn();
        }
    }
    Ok(())
}

