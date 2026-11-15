// Ficha del trabajador escrita y no guardada: queda en sessionStorage (solo esta pestaña) hasta guardarse bien.
// La clave lleva el usuario: si alguien sale sin cerrar la pestaña y entra otro, no ve el borrador (Analizar, 30-oct).
const PREFIJO = "zamorapp:ficha-sin-guardar:";
const clave = (uid: string, trabajadorId: string) => `${PREFIJO}${uid}:${trabajadorId}`;

export function leerBorradorFicha(uid: string, trabajadorId: string): Record<string, string> | null {
  try { const x = sessionStorage.getItem(clave(uid, trabajadorId)); return x ? (JSON.parse(x) as Record<string, string>) : null; } catch { return null; }
}

export function escribirBorradorFicha(uid: string, trabajadorId: string, f: Record<string, string> | null) {
  try {
    if (f) sessionStorage.setItem(clave(uid, trabajadorId), JSON.stringify(f));
    else sessionStorage.removeItem(clave(uid, trabajadorId));
  } catch { /* sin almacenamiento: queda solo en pantalla */ }
}

// Al salir: se borran todos los borradores de ficha de esta pestaña
export function borrarBorradoresFicha() {
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIJO)) sessionStorage.removeItem(k);
  } catch { /* nada que borrar */ }
}
