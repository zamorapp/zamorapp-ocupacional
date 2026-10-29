// Punto de entrada de la puerta local. La ventana de zamorApp la arranca y la detiene.
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";
import { Estado } from "./estado.mjs";
import { Motor, puertoLibre } from "./motor.mjs";
import { Nube } from "./nube.mjs";
import { Replica } from "./replica.mjs";
import { Bandeja } from "./bandeja.mjs";
import { Bloques } from "./bloques.mjs";
import { Respaldo } from "./respaldo.mjs";
import { crearPuerta } from "./servidor.mjs";

fs.mkdirSync(CONFIG.datos, { recursive: true });

// Si el estado no se puede abrir (la llave de Windows se perdió, p. ej. al cambiar de usuario o de PC),
// se aparta la copia y se empieza de cero: todo vuelve a bajar desde la nube. Nada se borra.
function abrirEstado() {
  try {
    return new Estado(CONFIG.datos, CONFIG.llave);
  } catch (e) {
    const aparte = `${CONFIG.datos}-anterior-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    fs.renameSync(CONFIG.datos, aparte);
    fs.mkdirSync(CONFIG.datos, { recursive: true });
    fs.writeFileSync(path.join(CONFIG.datos, "puerta.log"), `${new Date().toISOString()} [puerta] estado ilegible (${e.message}); la copia anterior quedó en ${aparte}\n`);
    return new Estado(CONFIG.datos, CONFIG.llave);
  }
}
const estado = abrirEstado();
const bitacora = fs.createWriteStream(path.join(CONFIG.datos, "puerta.log"), { flags: "a" });
const registro = (m) => bitacora.write(`${new Date().toISOString()} ${String(m).trimEnd()}\n`);
const motor = new Motor(estado);
motor.registro = registro;
const nube = new Nube(estado, registro);
const replica = new Replica(estado, nube, motor, registro);
const bandeja = new Bandeja(estado, nube, motor, replica, registro);
const bloques = new Bloques(estado, nube, motor, replica, registro);
// Sincronía completa (la usa el botón «Respaldar ahora» antes de copiar la base)
// Orden: sube filas, baja lo de la nube, suben los adjuntos (después de sus filas, así clinico.adjuntos ya está en la
// nube cuando llega el archivo), se reponen bloques y se anotan respaldos pendientes
let adjuntos = null; // lo crea la puerta (crearPuerta)
const sincronizar = async () => {
  await nube.comprobar(); await bandeja.subir(); await replica.ciclo();
  if (adjuntos) await adjuntos.subir().catch((e) => registro(`[adjuntos] ${e.message}`));
  await bloques.reponer(); await respaldo.anotarPendientes();
};
const respaldo = new Respaldo({ estado, nube, motor, replica, registro, sincronizar });

async function principal() {
  await motor.iniciar();
  await nube.comprobar();
  nube.reloj.arranque(nube.enLinea); // arranques seguidos sin nube: parte del plazo sin conexión
  // La app trae grabada la dirección de la puerta: este puerto es fijo (si está ocupado, se avisa).
  const puerto = CONFIG.puertoPuerta;
  if ((await puertoLibre(puerto)) !== puerto) throw new Error(`El puerto ${puerto} está ocupado por otro programa`);
  const origen = process.env.ZAMORAPP_ORIGEN || "http://127.0.0.1:54332";
  const puerta = crearPuerta({ estado, nube, motor, replica, bandeja, bloques, respaldo, origen, control: process.env.ZAMORAPP_CONTROL || "", registro });
  adjuntos = puerta.adjuntos;
  puerta.listen(puerto, "127.0.0.1", () => {
    registro(`[puerta] lista en 127.0.0.1:${puerto} (base ${motor.puertoBase}, PostgREST ${motor.puertoPostgrest})`);
    // La ventana lee esta línea para saber el puerto final
    process.stdout.write(`PUERTA_LISTA ${puerto}\n`);
  });
  // Cada ciclo sincroniza (filas, bajada, adjuntos, bloques); una vez al día, además, deja el respaldo automático
  const ciclo = async () => { await sincronizar(); if (respaldo.vencido()) await respaldo.hacer({ sincronizar: false, automatico: true }); };
  ciclo();
  setInterval(ciclo, CONFIG.cadaSincronia).unref?.();
}

const salir = () => { motor.detener(); process.exit(0); };
process.on("SIGINT", salir);
process.on("SIGTERM", salir);
process.stdin.on("end", salir); // la ventana cierra la entrada al terminar
process.stdin.resume();

principal().catch((e) => { registro(`[puerta] no arrancó: ${e.stack || e.message}`); process.stderr.write(`${e.message}\n`); motor.detener(); process.exit(1); });
