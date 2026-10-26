// Tema claro / oscuro / según el sistema. Se guarda por dispositivo (preferencia visual, no dato clínico).
export type Tema = "claro" | "oscuro" | "sistema";
export const CLAVE_TEMA = "zamorapp-tema";

// Se ejecuta antes de pintar la página para no mostrar un destello claro en modo oscuro.
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem('${CLAVE_TEMA}')||'sistema';var o=t==='oscuro'||(t==='sistema'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',o)}catch(e){}})();`;

export function leerTema(): Tema {
  try {
    const t = localStorage.getItem(CLAVE_TEMA);
    return t === "claro" || t === "oscuro" ? t : "sistema";
  } catch {
    return "sistema";
  }
}

export function aplicarTema(tema: Tema) {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {}
  const oscuro = tema === "oscuro" || (tema === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", oscuro);
}
