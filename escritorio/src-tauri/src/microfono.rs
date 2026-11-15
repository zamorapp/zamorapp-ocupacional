// Micrófono para el dictado. El navegador interno (WebView2) no se lo concede solo a la página: sin respuesta,
// pide permiso con su propio cuadro y, si alguna vez se rechazó, lo recuerda y el dictado falla con «Permite el
// micrófono» sin que zamorApp aparezca en ninguna parte de Windows. Aquí se concede el micrófono solo a las
// páginas de la propia app (127.0.0.1), y al abrir se borra cualquier rechazo guardado para esas direcciones.
// Lo que sigue dependiendo de Windows (Privacidad › Micrófono › aplicaciones de escritorio) lo explica la página.
use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{Runtime, Webview, WebviewWindow};

use crate::documentos::es_de_la_app;
use crate::{anotar, PUERTO_APP, PUERTO_PUERTA};

pub fn responder<R: Runtime>(webview: &Webview<R>, tipo: PermissionKind) -> PermissionResponse {
    if !matches!(tipo, PermissionKind::Microphone) {
        return PermissionResponse::Default;
    }
    match webview.url() {
        Ok(url) if es_de_la_app(&url) => {
            anotar("micrófono concedido al dictado");
            PermissionResponse::Allow
        }
        Ok(url) => {
            anotar(&format!("micrófono pedido por una página ajena, sin conceder: {}", url.origin().ascii_serialization()));
            PermissionResponse::Default
        }
        Err(e) => {
            anotar(&format!("micrófono pedido sin dirección conocida: {e}"));
            PermissionResponse::Default
        }
    }
}

#[cfg(windows)]
pub fn quitar_rechazo_guardado<R: Runtime>(ventana: &WebviewWindow<R>) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::SetPermissionStateCompletedHandler;
    use windows::core::{Interface, HSTRING};
    let r = ventana.with_webview(|wv| {
        for puerto in [PUERTO_PUERTA, PUERTO_APP] {
            let origen = HSTRING::from(format!("http://127.0.0.1:{puerto}"));
            let r = unsafe {
                wv.controller()
                    .CoreWebView2()
                    .and_then(|w| w.cast::<ICoreWebView2_13>())
                    .and_then(|w| w.Profile())
                    .and_then(|p| p.cast::<ICoreWebView2Profile4>())
                    .and_then(|p| {
                        p.SetPermissionState(
                            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                            &origen,
                            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                            &SetPermissionStateCompletedHandler::create(Box::new(move |error| {
                                if let Err(e) = error {
                                    anotar(&format!("no se pudo permitir el micrófono en el puerto {puerto}: {e}"));
                                }
                                Ok(())
                            })),
                        )
                    })
            };
            // Un WebView2 viejo sin esta función sigue con el manejador de arriba
            if let Err(e) = r {
                anotar(&format!("micrófono: el navegador interno no deja fijar el permiso ({e})"));
            }
        }
    });
    if let Err(e) = r {
        anotar(&format!("micrófono: {e}"));
    }
}

#[cfg(not(windows))]
pub fn quitar_rechazo_guardado<R: Runtime>(_ventana: &WebviewWindow<R>) {}
