// Dictado en el escritorio con el dictado por voz de Windows (Win + H). El reconocimiento de voz del navegador
// interno (WebView2) no funciona: falla antes de abrir el micrófono aunque el permiso esté concedido (30-oct, PC
// de Cesar: Windows nunca registró que zamorApp pidiera el micrófono). La página pone el cursor en el campo y
// pide este comando; Windows escribe lo dictado en ese campo como si se tecleara.
use tauri::{Runtime, WebviewWindow};

use crate::anotar;

#[tauri::command]
pub fn dictado_windows<R: Runtime>(ventana: WebviewWindow<R>) -> Result<(), String> {
    ventana.set_focus().map_err(|e| e.to_string())?;
    anotar("dictado: se abre el dictado por voz de Windows (Win + H)");
    pulsar_win_h()
}

#[cfg(windows)]
fn pulsar_win_h() -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    let tecla = |vk: VIRTUAL_KEY, soltar: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if soltar { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) }, time: 0, dwExtraInfo: 0 },
        },
    };
    let teclas = [tecla(VK_LWIN, false), tecla(VK_H, false), tecla(VK_H, true), tecla(VK_LWIN, true)];
    let enviadas = unsafe { SendInput(&teclas, std::mem::size_of::<INPUT>() as i32) };
    if enviadas as usize == teclas.len() {
        Ok(())
    } else {
        anotar(&format!("dictado: Windows aceptó {enviadas} de 4 teclas"));
        Err("Windows no abrió el dictado. Pulsa Win + H con el cursor en el campo.".into())
    }
}

#[cfg(not(windows))]
fn pulsar_win_h() -> Result<(), String> {
    Err("El dictado de Windows solo existe en Windows.".into())
}
