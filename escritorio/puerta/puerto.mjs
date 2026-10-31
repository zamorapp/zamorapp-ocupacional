// El puerto de la puerta (54331) es fijo: la app lo trae grabado y la sesión del navegador vive en ese origen, así
// que no se cambia por otro. Al abrir justo después de cerrar o de actualizar, la puerta anterior puede seguir
// soltándolo (31-oct-2026: tres arranques fallidos con «puerto 54331 ocupado» tras pasar a 0.1.291). Aquí se espera
// a que se libere; si lo retiene una puerta huérfana de esta misma instalación (su programa ya se cerró), se cierra;
// si lo usa otra cosa, el error dice qué programa es.
import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function libre(puerto) {
  return new Promise((ok) => {
    const s = net.createServer().once("error", () => ok(false)).once("listening", () => s.close(() => ok(true)));
    s.listen(puerto, "127.0.0.1");
  });
}

const correr = (programa, args) => new Promise((ok) => {
  execFile(programa, args, { windowsHide: true, timeout: 15_000 }, (e, salida) => ok(e ? "" : String(salida)));
});

// Quién escucha en el puerto: { pid, nombre, ruta, padreVivo } o null si no se puede saber
export async function duenoDelPuerto(puerto) {
  const p = Number(puerto);
  if (process.platform === "win32") {
    const script = `$c = Get-NetTCPConnection -LocalPort ${p} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { $x = Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"
  $padre = if ($x) { Get-Process -Id $x.ParentProcessId -ErrorAction SilentlyContinue } else { $null }
  [pscustomobject]@{ pid = [int]$c.OwningProcess; nombre = $x.Name; ruta = $x.ExecutablePath; padreVivo = [bool]$padre } | ConvertTo-Json -Compress }`;
    const salida = await correr("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
    try { return JSON.parse(salida.trim()); } catch { return null; }
  }
  const linea = await correr("ss", ["-ltnpH", `sport = :${p}`]);
  const pid = Number(/pid=(\d+)/.exec(linea)?.[1]);
  if (!pid) return null;
  try {
    const ruta = fs.readlinkSync(`/proc/${pid}/exe`);
    const padre = Number(fs.readFileSync(`/proc/${pid}/stat`, "utf8").replace(/^.*\) /s, "").split(" ")[1]);
    return { pid, nombre: path.basename(ruta), ruta, padreVivo: padre > 1 && fs.existsSync(`/proc/${padre}`) };
  } catch { return { pid, nombre: /\("([^"]+)"/.exec(linea)?.[1] ?? null, ruta: null, padreVivo: true }; }
}

export async function cerrarArbol(pid) {
  if (process.platform === "win32") await correr("taskkill", ["/PID", String(pid), "/T", "/F"]);
  else try { process.kill(pid, "SIGKILL"); } catch { /* ya no estaba */ }
}

const misma = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export async function asegurarPuerto(puerto, { espera = 30_000, registro = () => {}, dueno = duenoDelPuerto, cerrar = cerrarArbol, nodo = process.execPath } = {}) {
  const inicio = performance.now(); // nunca la hora de Windows
  let avisado = false;
  while (!(await libre(puerto))) {
    if (performance.now() - inicio >= espera) break;
    if (!avisado) { registro(`[puerta] el puerto ${puerto} está ocupado; se espera a que la instancia anterior lo suelte`); avisado = true; }
    await dormir(500);
  }
  if (await libre(puerto)) {
    if (avisado) registro(`[puerta] el puerto ${puerto} se liberó a los ${Math.round((performance.now() - inicio) / 1000)} s`);
    return;
  }
  const d = await dueno(puerto).catch(() => null);
  if (d && misma(d.ruta, nodo)) {
    // Mismo node de esta instalación: es una puerta. Solo se cierra si su programa ya no existe (huérfana); si su
    // programa sigue vivo, es zamorApp abierto en otra ventana y no se toca.
    if (d.padreVivo) throw new Error(`zamorApp ya está abierto en otra ventana (su puerta usa el puerto ${puerto}, PID ${d.pid}). Ciérrala o espera a que termine de cerrarse y vuelve a abrir.`);
    registro(`[puerta] una puerta anterior (PID ${d.pid}) quedó sin su programa y retiene el puerto ${puerto}: se cierra`);
    await cerrar(d.pid);
    for (let i = 0; i < 20; i++) { if (await libre(puerto)) return; await dormir(500); }
  }
  throw new Error(d
    ? `El puerto ${puerto} lo está usando otro programa: ${d.nombre ?? "desconocido"} (PID ${d.pid}${d.ruta ? `, ${d.ruta}` : ""}). Ciérralo y vuelve a abrir zamorApp.`
    : `El puerto ${puerto} sigue ocupado después de esperar ${Math.round(espera / 1000)} s y no se pudo saber qué programa lo usa. Reinicia la PC y vuelve a abrir zamorApp.`);
}
