// Los procesos que arranca zamorApp (puerta, base, PostgREST y servidor de la app) mueren con él, también si
// Windows lo cierra a la fuerza o se cae: van en un «trabajo» de Windows que se cierra al terminar el programa.
// Antes, un cierre brusco dejaba vivo el servidor de la app (node) ocupando el puerto 54332: la siguiente
// apertura, incluso tras actualizar, mostraba la versión vieja (aviso del CI del 28/10/2026).
use std::process::Child;

#[cfg(windows)]
mod windows_trabajo {
    use std::os::windows::io::AsRawHandle;
    use std::sync::OnceLock;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    struct Trabajo(HANDLE);
    unsafe impl Send for Trabajo {}
    unsafe impl Sync for Trabajo {}

    // Se abre una vez y nunca se cierra a mano: Windows lo cierra al terminar zamorApp y con él a los hijos.
    fn trabajo() -> Option<&'static Trabajo> {
        static TRABAJO: OnceLock<Option<Trabajo>> = OnceLock::new();
        TRABAJO
            .get_or_init(|| unsafe {
                let t = CreateJobObjectW(None, PCWSTR::null()).ok()?;
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    t,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
                .ok()?;
                Some(Trabajo(t))
            })
            .as_ref()
    }

    pub fn atar(hijo: &std::process::Child) -> Result<(), String> {
        let t = trabajo().ok_or("Windows no creó el trabajo de procesos")?;
        unsafe { AssignProcessToJobObject(t.0, HANDLE(hijo.as_raw_handle())) }.map_err(|e| e.to_string())
    }
}

// Solo los hijos van al trabajo, no zamorApp: el instalador de una actualización (que zamorApp lanza y
// luego se cierra) no debe morir con él.
pub fn atar(hijo: &Child) -> Result<(), String> {
    #[cfg(windows)]
    return windows_trabajo::atar(hijo);
    #[cfg(not(windows))]
    {
        let _ = hijo;
        Ok(())
    }
}
