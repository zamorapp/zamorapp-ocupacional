// Entrar con Windows Hello (huella, rostro o PIN de Windows).
// La página no recibe comandos nativos: para pedir la huella navega a /zamorapp/huella/ventana/<acción> de la
// puerta local. La ventana intercepta esa navegación (la página no cambia), Windows verifica a la persona y el
// programa avisa a la puerta con la clave de control de esta sesión. La respuesta vuelve a la página como el
// evento "zamorapp-huella".

use tauri::{Url, WebviewWindow};

/// Si la dirección es un pedido de huella de la página, devuelve la acción y el código que trae.
pub fn pedido(url: &Url, puerto_puerta: u16) -> Option<(String, String)> {
    if url.host_str() != Some("127.0.0.1") || url.port() != Some(puerto_puerta) {
        return None;
    }
    let accion = url.path().strip_prefix("/zamorapp/huella/ventana/")?;
    if accion != "activar" && accion != "entrar" {
        return None;
    }
    let codigo = url.query_pairs().find(|(k, _)| k == "codigo").map(|(_, v)| v.into_owned()).unwrap_or_default();
    Some((accion.to_string(), codigo))
}

/// Atiende el pedido en otro hilo: pide la huella a Windows y le avisa a la puerta.
/// `avisar_puerta(ruta)` hace el POST con la clave de control y devuelve el cuerpo de la respuesta.
pub fn atender(ventana: WebviewWindow, accion: String, codigo: String, avisar_puerta: fn(&str) -> Result<String, String>, anotar: fn(&str)) {
    std::thread::spawn(move || {
        responder(&ventana, &accion, serde_json::json!({ "estado": "pidiendo" }));
        let mensaje = if accion == "activar" { "Confirma que eres tú para activar Windows Hello en zamorApp" } else { "Entrar a zamorApp" };
        let resultado = verificar(&ventana, mensaje).and_then(|()| {
            let ruta = if accion == "activar" {
                format!("/zamorapp/huella/activar?codigo={}", codificar(&codigo))
            } else {
                "/zamorapp/huella/entrar".to_string()
            };
            let cuerpo = avisar_puerta(&ruta).map_err(|_| "La base local no respondió. Cierra y vuelve a abrir zamorApp.".to_string())?;
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&cuerpo) else {
                anotar(&format!("Windows Hello: respuesta ilegible de la puerta: {}", cuerpo.chars().take(200).collect::<String>()));
                return Err("La base local respondió algo inesperado. Cierra y vuelve a abrir zamorApp.".to_string());
            };
            // La puerta explica por qué no (p. ej. más de 7 días sin conexión)
            if v["ok"] == true { Ok(v) } else { Err(v["mensaje"].as_str().unwrap_or("No se pudo entrar con Windows Hello.").to_string()) }
        });
        match resultado {
            Ok(v) => {
                anotar(&format!("Windows Hello: {accion} ok"));
                responder(&ventana, &accion, serde_json::json!({ "ok": true, "codigo": v["codigo"] }));
            }
            Err(e) => {
                anotar(&format!("Windows Hello: {accion} no: {e}"));
                responder(&ventana, &accion, serde_json::json!({ "ok": false, "mensaje": e }));
            }
        }
    });
}

fn responder(ventana: &WebviewWindow, accion: &str, mut detalle: serde_json::Value) {
    detalle["accion"] = accion.into();
    // JSON es JavaScript válido: el detalle va como objeto literal, sin armar textos a mano
    let _ = ventana.eval(&format!("window.dispatchEvent(new CustomEvent('zamorapp-huella', {{ detail: {detalle} }}))"));
}

fn codificar(texto: &str) -> String {
    texto.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect()
}

// Pruebas automáticas: los equipos del CI no tienen huella. Solo con la nube de prueba (127.0.0.1), la misma
// condición que abre el puerto de depuración, se da por verificada para probar el resto del camino.
fn en_pruebas() -> bool {
    std::env::var("ZAMORAPP_NUBE_URL").map(|v| v.starts_with("http://127.0.0.1:")).unwrap_or(false)
        && std::env::var("ZAMORAPP_HELLO_PRUEBA").as_deref() == Ok("1")
}

#[cfg(windows)]
fn verificar(ventana: &WebviewWindow, mensaje: &str) -> Result<(), String> {
    use windows::core::{factory, HSTRING};
    use windows_future::IAsyncOperation;
    use windows::Security::Credentials::UI::{UserConsentVerificationResult as R, UserConsentVerifier, UserConsentVerifierAvailability as D};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::IUserConsentVerifierInterop;

    if en_pruebas() {
        return Ok(());
    }
    let no_disponible = "Esta PC no tiene Windows Hello configurado. Actívalo en Configuración de Windows → Cuentas → Opciones de inicio de sesión (huella o PIN).";
    let disponible = UserConsentVerifier::CheckAvailabilityAsync().and_then(|op| op.get()).map_err(|_| no_disponible.to_string())?;
    if disponible != D::Available {
        return Err(no_disponible.into());
    }
    // El cuadro de Windows Hello se abre delante de la ventana de zamorApp
    let hwnd = ventana.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let interop = factory::<UserConsentVerifier, IUserConsentVerifierInterop>().map_err(|e| e.to_string())?;
    let operacion: IAsyncOperation<R> = unsafe { interop.RequestVerificationForWindowAsync(HWND(hwnd as _), &HSTRING::from(mensaje)) }.map_err(|e| e.to_string())?;
    match operacion.get().map_err(|e| e.to_string())? {
        R::Verified => Ok(()),
        R::Canceled => Err("Se canceló Windows Hello. Puedes intentarlo de nuevo o usar tu contraseña.".into()),
        R::RetriesExhausted => Err("Demasiados intentos con Windows Hello. Entra con tu contraseña.".into()),
        _ => Err(no_disponible.into()),
    }
}

#[cfg(not(windows))]
fn verificar(_ventana: &WebviewWindow, _mensaje: &str) -> Result<(), String> {
    if en_pruebas() { Ok(()) } else { Err("Windows Hello solo existe en Windows.".into()) }
}
