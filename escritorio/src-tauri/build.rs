fn main() {
    // Comandos propios que la página puede pedir (imprimir, guardar PDF y el dictado de Windows); cada uno con su permiso
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["imprimir", "guardar_pdf", "mostrar_pdf", "dictado_windows"]),
    ))
    .expect("no se pudo preparar la compilación de Tauri");
}
