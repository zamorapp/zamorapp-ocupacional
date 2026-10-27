// Servidor de actualizaciones de PRUEBA para la prueba de humo del CI: sirve un latest.json que anuncia una
// versión más nueva y el instalador firmado. Anuncia la actualización UNA sola vez: el programa recién
// actualizado (que hereda las mismas variables) ya no la vuelve a ver, para que no se actualice en bucle.
//   node actualizacion-cli.mjs --setup "ruta\\al\\setup.exe" --version 0.1.999 [--puerto 55600]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const arg = (nombre, def) => { const i = process.argv.indexOf(`--${nombre}`); return i >= 0 ? process.argv[i + 1] : def; };
const SETUP = path.resolve(arg("setup"));
const VERSION = arg("version");
const PUERTO = Number(arg("puerto", "55600"));
if (!fs.existsSync(SETUP) || !VERSION) { console.error("Uso: --setup <setup.exe firmado> --version <x.y.z>"); process.exit(2); }
const firma = fs.readFileSync(`${SETUP}.sig`, "utf8").trim();
const nombre = path.basename(SETUP);
let anunciada = 0;

http.createServer((req, res) => {
  const ruta = new URL(req.url, "http://x").pathname;
  console.log(`[actualizacion] ${req.method} ${ruta}`);
  if (ruta === "/latest.json") {
    if (anunciada++) { res.writeHead(204); return res.end(); } // ya se anunció: "no hay versión nueva"
    const cuerpo = JSON.stringify({
      version: VERSION, notes: "Versión de prueba", pub_date: new Date().toISOString(),
      platforms: { "windows-x86_64": { signature: firma, url: `http://127.0.0.1:${PUERTO}/${encodeURIComponent(nombre)}` } },
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(cuerpo);
  }
  if (decodeURIComponent(ruta.slice(1)) === nombre) {
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": fs.statSync(SETUP).size });
    return fs.createReadStream(SETUP).pipe(res);
  }
  res.writeHead(404); res.end();
}).listen(PUERTO, "127.0.0.1", () => process.stdout.write(`ACTUALIZACION_LISTA http://127.0.0.1:${PUERTO}/latest.json (${nombre} como ${VERSION})\n`));
