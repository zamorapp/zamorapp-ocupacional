// La puerta espera su puerto, cierra solo una puerta huérfana de esta instalación y nombra a cualquier otro dueño
// (31-oct-2026: tres arranques fallidos con «puerto 54331 ocupado» tras actualizar)
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { test } from "node:test";
import { asegurarPuerto, duenoDelPuerto, libre } from "../puerta/puerto.mjs";

const ocupar = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => ok(s)); });
const soltar = (s) => new Promise((ok) => s.close(() => ok()));

test("espera a que la instancia anterior suelte el puerto", async () => {
  const s = await ocupar();
  const puerto = s.address().port;
  const lineas = [];
  setTimeout(() => soltar(s), 1500);
  await asegurarPuerto(puerto, { espera: 10_000, registro: (l) => lineas.push(l), dueno: async () => assert.fail("no hacía falta buscar dueño") });
  assert.ok(await libre(puerto));
  assert.match(lineas.join("\n"), /se liberó/);
});

test("una puerta huérfana de esta instalación (su programa ya no existe) se cierra", async () => {
  const s = await ocupar();
  const puerto = s.address().port;
  let cerrado = null;
  await asegurarPuerto(puerto, {
    espera: 600, nodo: "/x/recursos/node/node.exe",
    dueno: async () => ({ pid: 4242, nombre: "node.exe", ruta: "/x/recursos/node/node.exe", padreVivo: false }),
    cerrar: async (pid) => { cerrado = pid; await soltar(s); },
  });
  assert.equal(cerrado, 4242);
});

test("si su programa sigue abierto (otra ventana de zamorApp) no se toca y se avisa", async () => {
  const s = await ocupar();
  const puerto = s.address().port;
  try {
    await assert.rejects(asegurarPuerto(puerto, {
      espera: 600, nodo: "/x/recursos/node/node.exe",
      dueno: async () => ({ pid: 4242, nombre: "node.exe", ruta: "/x/recursos/node/node.exe", padreVivo: true }),
      cerrar: async () => assert.fail("no se cierra una puerta viva"),
    }), /ya está abierto en otra ventana/);
  } finally { await soltar(s); }
});

test("otro programa en el puerto: no se cierra y el error lo nombra", async () => {
  const s = await ocupar();
  const puerto = s.address().port;
  try {
    await assert.rejects(asegurarPuerto(puerto, {
      espera: 600, nodo: "/x/recursos/node/node.exe",
      dueno: async () => ({ pid: 77, nombre: "skype.exe", ruta: "C:\\Programas\\skype.exe", padreVivo: false }),
      cerrar: async () => assert.fail("no se cierra otro programa"),
    }), /otro programa: skype\.exe \(PID 77/);
  } finally { await soltar(s); }
});

// La búsqueda real del dueño (PowerShell en Windows, ss en Linux) con un node hijo que escucha
const sinHerramienta = process.platform !== "win32" && spawnSync("ss", ["-V"]).error;
test("encuentra al dueño real del puerto: pid, ruta del programa y si su padre sigue vivo", { skip: sinHerramienta ? "sin ss" : false, timeout: 60_000 }, async () => {
  const hijo = spawn(process.execPath, ["-e", "const s=require('net').createServer().listen(0,'127.0.0.1',()=>console.log(s.address().port));setInterval(()=>{},1e3)"], { stdio: ["ignore", "pipe", "inherit"] });
  try {
    const puerto = Number(await new Promise((ok) => hijo.stdout.once("data", (d) => ok(String(d).trim()))));
    const d = await duenoDelPuerto(puerto);
    assert.equal(d?.pid, hijo.pid, JSON.stringify(d));
    assert.equal(d.ruta.toLowerCase(), process.execPath.toLowerCase());
    assert.equal(d.padreVivo, true, "su padre (esta prueba) está vivo");
  } finally { hijo.kill(); }
});
