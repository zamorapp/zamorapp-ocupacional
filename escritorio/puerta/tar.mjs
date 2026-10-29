// Empaquetado ustar mínimo (sin dependencias) para la carpeta de adjuntos dentro del respaldo (fase C.2).
// Es tar estándar: descifrada la copia, Cesar la abre con 7-Zip o con «tar -xf» si alguna vez hace falta a mano.
// Solo archivos normales; las rutas van con «/» y caben en nombre (100) + prefijo (155).
import fs from "node:fs";
import path from "node:path";

const BLOQUE = 512;

function campo(b, desde, largo, texto) { b.write(String(texto).slice(0, largo), desde, largo, "utf8"); }
function octal(b, desde, largo, n) { campo(b, desde, largo, n.toString(8).padStart(largo - 1, "0") + "\0"); }

function cabecera(ruta, tam, mtime) {
  const b = Buffer.alloc(BLOQUE);
  let nombre = ruta, prefijo = "";
  if (Buffer.byteLength(ruta) > 100) {
    const i = ruta.lastIndexOf("/", 154);
    if (i < 1 || Buffer.byteLength(ruta.slice(i + 1)) > 100) throw new Error(`Ruta demasiado larga para el paquete: ${ruta}`);
    prefijo = ruta.slice(0, i); nombre = ruta.slice(i + 1);
  }
  campo(b, 0, 100, nombre); octal(b, 100, 8, 0o644); octal(b, 108, 8, 0); octal(b, 116, 8, 0);
  octal(b, 124, 12, tam); octal(b, 136, 12, Math.max(0, Math.floor(mtime / 1000)));
  campo(b, 148, 8, "        "); b.write("0", 156, 1); campo(b, 257, 6, "ustar\0"); campo(b, 263, 2, "00");
  campo(b, 345, 155, prefijo);
  let suma = 0; for (const x of b) suma += x;
  campo(b, 148, 8, suma.toString(8).padStart(6, "0") + "\0 ");
  return b;
}

// Lista de archivos (ruta relativa con «/», tamaño) de una carpeta, ordenada: así dos paquetes iguales son iguales
export function listar(carpeta) {
  const salida = [];
  const andar = (dir, rel) => {
    let entradas = [];
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) andar(path.join(dir, e.name), r);
      else if (e.isFile() && !e.name.endsWith(".tmp") && !e.name.endsWith(".parcial")) {
        const st = fs.statSync(path.join(dir, e.name));
        salida.push({ ruta: r, bytes: st.size, mtime: st.mtimeMs });
      }
    }
  };
  andar(carpeta, "");
  return salida;
}

export async function empaquetar(carpeta, destino) {
  const lista = listar(carpeta);
  const fd = fs.openSync(`${destino}.parcial`, "w");
  let bytes = 0;
  try {
    for (const a of lista) {
      fs.writeSync(fd, cabecera(a.ruta, a.bytes, a.mtime));
      const origen = fs.openSync(path.join(carpeta, ...a.ruta.split("/")), "r");
      try {
        const trozo = Buffer.alloc(64 * 1024);
        let leidos = 0, n;
        while ((n = fs.readSync(origen, trozo, 0, trozo.length, null)) > 0) { fs.writeSync(fd, trozo, 0, n); leidos += n; }
        if (leidos !== a.bytes) throw new Error(`El archivo cambió mientras se empaquetaba: ${a.ruta}`);
      } finally { fs.closeSync(origen); }
      const resto = a.bytes % BLOQUE;
      if (resto) fs.writeSync(fd, Buffer.alloc(BLOQUE - resto));
      bytes += a.bytes;
    }
    fs.writeSync(fd, Buffer.alloc(BLOQUE * 2));
  } finally { fs.closeSync(fd); }
  fs.renameSync(`${destino}.parcial`, destino);
  return { archivos: lista.length, bytes };
}

// Nombres que Windows no acepta (Analizar): caracteres <>:"|?*, reservados (CON, PRN, AUX, NUL, COM1-9, LPT1-9) y
// los que terminan en punto o espacio. Se saltan y se cuentan; el resto del paquete sigue.
const RESERVADO = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
export function nombreValidoWindows(parte) {
  return !/[<>:"|?*]/.test(parte) && !RESERVADO.test(parte) && !/[. ]$/.test(parte);
}

// Saca los archivos a la carpeta. Nunca pisa uno que ya exista (el disco de la PC manda sobre la copia).
// Devuelve {restaurados, existentes, omitidos}: omitidos = nombres inválidos para Windows o fuera de la carpeta.
export function desempaquetar(archivo, carpeta) {
  const fd = fs.openSync(archivo, "r");
  const cab = Buffer.alloc(BLOQUE);
  fs.mkdirSync(carpeta, { recursive: true });
  const raiz = fs.realpathSync(carpeta);
  let pos = 0, restaurados = 0, existentes = 0, omitidos = 0;
  try {
    for (;;) {
      if (fs.readSync(fd, cab, 0, BLOQUE, pos) < BLOQUE || cab.every((x) => x === 0)) break;
      pos += BLOQUE;
      const texto = (d, l) => cab.toString("utf8", d, d + l).replace(/\0.*$/s, "");
      const nombre = texto(0, 100), prefijo = texto(345, 155), tipo = texto(156, 1);
      const tamTexto = texto(124, 12).trim();
      if (!/^[0-7]+$/.test(tamTexto)) throw new Error(`Paquete dañado: tamaño no válido en el bloque ${pos / BLOQUE - 1}`);
      const tam = parseInt(tamTexto, 8);
      const ruta = prefijo ? `${prefijo}/${nombre}` : nombre;
      const partes = ruta.split("/");
      const esArchivo = tipo === "0" || tipo === "";
      const valida = esArchivo && partes.every((p) => p && p !== "." && p !== ".." && nombreValidoWindows(p)) && !/[\\\0-\x1f]/.test(ruta);
      if (esArchivo && !valida) omitidos++;
      if (valida) {
        const destino = path.resolve(raiz, ...partes);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        // El padre real (sin junctions ni enlaces) tiene que seguir dentro de la carpeta (Analizar)
        const padreReal = fs.realpathSync(path.dirname(destino));
        if (padreReal !== raiz && !padreReal.startsWith(raiz + path.sep)) { omitidos++; pos += Math.ceil(tam / BLOQUE) * BLOQUE; continue; }
        if (fs.existsSync(destino)) existentes++;
        else {
          const salida = fs.openSync(`${destino}.tmp`, "w");
          try {
            const trozo = Buffer.alloc(64 * 1024);
            let faltan = tam;
            while (faltan > 0) {
              const n = fs.readSync(fd, trozo, 0, Math.min(trozo.length, faltan), pos + (tam - faltan));
              if (n <= 0) throw new Error(`Paquete incompleto en ${ruta}`);
              fs.writeSync(salida, trozo, 0, n); faltan -= n;
            }
          } finally { fs.closeSync(salida); }
          fs.renameSync(`${destino}.tmp`, destino);
          restaurados++;
        }
      }
      pos += Math.ceil(tam / BLOQUE) * BLOQUE;
    }
  } finally { fs.closeSync(fd); }
  return { restaurados, existentes, omitidos };
}
