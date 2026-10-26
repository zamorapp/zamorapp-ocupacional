// Punto de entrada de la puerta local. La ventana de zamorApp la arranca y la detiene.
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.mjs";
import { Estado } from "./estado.mjs";
import { Motor, puertoLibre } from "./motor.mjs";
import { Nube } from "./nube.mjs";
import { Replica } from "./replica.mjs";
import { crearPuerta } from "./servidor.mjs";

fs.mkdirSync(CONFIG.datos, { recursive: true });
const bitacora = fs.createWriteStream(path.join(CONFIG.datos, "puerta.log"), { flags: "a" });
const registro = (m) => bitacora.write(`${new Date().toISOString()} ${String(m).trimEnd()}\n`);

const estado = new Estado(CONFIG.datos, CONFIG.llave);
const motor = new Motor(estado);
motor.registro = registro;
const nube = new Nube(estado);
const replica = new Replica(estado, nube, motor, registro);

async function principal() {
  await motor.iniciar();
  await nube.comprobar();
  const puerto = await puertoLibre(CONFIG.puertoPuerta);
  const origen = process.env.ZAMORAPP_ORIGEN || "http://127.0.0.1:54332";
  crearPuerta({ estado, nube, motor, replica, origen, registro }).listen(puerto, "127.0.0.1", () => {
    registro(`[puerta] lista en 127.0.0.1:${puerto} (base ${motor.puertoBase}, PostgREST ${motor.puertoPostgrest})`);
    // La ventana lee esta línea para saber el puerto final
    process.stdout.write(`PUERTA_LISTA ${puerto}\n`);
  });
  const ciclo = async () => { await nube.comprobar(); await replica.ciclo(); };
  ciclo();
  setInterval(ciclo, CONFIG.cadaSincronia).unref?.();
}

const salir = () => { motor.detener(); process.exit(0); };
process.on("SIGINT", salir);
process.on("SIGTERM", salir);
process.stdin.on("end", salir); // la ventana cierra la entrada al terminar
process.stdin.resume();

principal().catch((e) => { registro(`[puerta] no arrancó: ${e.stack || e.message}`); process.stderr.write(`${e.message}\n`); motor.detener(); process.exit(1); });
