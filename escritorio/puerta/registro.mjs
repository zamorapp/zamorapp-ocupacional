// Registros de la PC con tope: puerta.log y base.log se abrían en modo «agregar» y crecían sin límite (puerta.log
// anota cada petición lenta). Al pasar el tope, el registro actual pasa a «<nombre>.1.log» (se pisa el anterior)
// y se empieza uno nuevo: como mucho quedan dos archivos por registro.
import fs from "node:fs";

export const TOPE_REGISTRO = 5 * 1024 * 1024;

const anterior = (ruta) => ruta.replace(/\.log$/, "") + ".1.log";

// Para un registro que nadie tiene abierto (base.log antes de encender la base)
export function rotarSiPasa(ruta, tope = TOPE_REGISTRO) {
  try {
    if (fs.statSync(ruta).size <= tope) return false;
    fs.rmSync(anterior(ruta), { force: true });
    fs.renameSync(ruta, anterior(ruta));
    return true;
  } catch {
    return false; // no existe o Windows lo tiene tomado: se intenta la próxima vez
  }
}

// Registro de la puerta: devuelve { write } (como el flujo que reemplaza) y rota también mientras el programa sigue abierto.
// Escritura directa (sin flujo): al rotar, el archivo ya está cerrado y Windows permite renombrarlo.
export function abrirRegistro(ruta, tope = TOPE_REGISTRO) {
  rotarSiPasa(ruta, tope);
  let fd = fs.openSync(ruta, "a");
  let bytes = fs.fstatSync(fd).size;
  const write = (linea) => {
    try {
      if (bytes > tope) {
        fs.closeSync(fd);
        rotarSiPasa(ruta, 0);
        fd = fs.openSync(ruta, "a");
        bytes = fs.fstatSync(fd).size;
      }
      bytes += fs.writeSync(fd, linea);
    } catch {
      // Un registro que no se puede escribir nunca frena la puerta. Si falló al rotar (un antivirus con el archivo
      // tomado, p. ej.), se intenta reabrir para que las líneas siguientes no se pierdan hasta reiniciar.
      try {
        fd = fs.openSync(ruta, "a");
        bytes = fs.fstatSync(fd).size;
      } catch {
        // se reintenta en la próxima línea
      }
    }
  };
  return { write };
}
