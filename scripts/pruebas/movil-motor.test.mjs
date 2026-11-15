// Celular sin internet: el motor del teléfono sigue las mismas reglas que la bandeja y la réplica de la PC.
// Uso: node --test scripts/pruebas/movil-motor.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { Motor, ErrorNube, DIAS_SIN_CONEXION } = await jiti.import("../../src/lib/movil/motor.ts");
const { AlmacenMemoria } = await jiti.import("../../src/lib/movil/almacen.ts");
const { RelojMovil } = await jiti.import("../../src/lib/movil/reloj.ts");
const { crearLlave, abrirLlave, cambiarPin, cifrar, descifrar, pinValido } = await jiti.import("../../src/lib/movil/cripto.ts");

const UID = "11111111-1111-1111-1111-111111111111";
const ORG = "22222222-2222-2222-2222-222222222222";

// Nube de juguete con las reglas de aplicar_cambios que importan aquí: versión por fila, conflicto si la base no
// coincide, «duplicado» por id de cambio repetido, registro de cambios con seq.
function nubeFalsa() {
  const n = {
    filas: new Map(), registro: [], aplicados: new Map(), seq: 0, enLineaV: true, revocado: false, mudo: false,
    llamadas: [], antesDeResponder: null,
    enLinea: () => n.enLineaV,
    uid: async () => UID,
    fila: async (tabla, id) => n.filas.get(`${tabla}|${id}`) ?? null,
    anotar(tabla, fila_id, op) { n.registro.push({ seq: ++n.seq, tabla, fila_id, op }); },
    async rpc(nombre, a) {
      n.llamadas.push(nombre);
      if (n.revocado) throw new ErrorNube("Equipo no autorizado o desactivado", "42501", 403);
      if (nombre === "instantanea") {
        const filas = [...n.filas.entries()].filter(([k]) => k.startsWith(a.p_tabla + "|")).map(([, f]) => f);
        return { seq: n.seq, filas, ultimo: null };
      }
      if (nombre === "cambios_desde") {
        const cambios = n.registro.filter((g) => g.seq > a.p_desde).map((g) => {
          const fila = n.filas.get(`${g.tabla}|${g.fila_id}`) ?? null;
          return { ...g, fila, version: fila?.version ?? null };
        });
        return { hasta: cambios.length ? cambios[cambios.length - 1].seq : a.p_desde, cambios };
      }
      if (nombre === "reservar_bloque") return { desde: 5001, hasta: 5050 };
      if (nombre === "aplicar_cambios") {
        if (n.antesDeResponder) { const f = n.antesDeResponder; n.antesDeResponder = null; f(); }
        if (n.mudo) return [];
        return a.p_lote.map((c) => {
          if (n.aplicados.has(c.id)) return { ...n.aplicados.get(c.id), estado: "duplicado" };
          const r = responder(c);
          n.aplicados.set(c.id, r);
          return r;
        });
        function responder(c) {
          const k = `${c.tabla}|${c.fila_id}`;
          const actual = n.filas.get(k);
          if (c.op === "I") {
            n.filas.set(k, { ...c.datos, id: c.fila_id, version: 1 });
            n.anotar(c.tabla, c.fila_id, "I");
            return { id: c.id, estado: "aplicado", version: 1 };
          }
          if (!actual) return { id: c.id, estado: "rechazado", motivo: "La fila no existe o no tienes acceso" };
          if (actual.version !== c.version_base) return { id: c.id, estado: "conflicto", motivo: "Otro usuario cambió los mismos campos" };
          if (c.op === "D") { n.filas.delete(k); n.anotar(c.tabla, c.fila_id, "D"); return { id: c.id, estado: "aplicado", version: null }; }
          const nueva = { ...actual, ...c.datos, version: actual.version + 1 };
          n.filas.set(k, nueva); n.anotar(c.tabla, c.fila_id, "U");
          return { id: c.id, estado: "aplicado", version: nueva.version };
        }
      }
      throw new Error("rpc desconocida " + nombre);
    },
  };
  return n;
}

function relojFalso() {
  const f = { fecha: 1_800_000_000_000, mono: 0 };
  const r = new RelojMovil({ fecha: () => f.fecha, mono: () => f.mono });
  return { r, f };
}

async function armar({ nube = nubeFalsa(), almacen = new AlmacenMemoria() } = {}) {
  const { r, f } = relojFalso();
  r.anclar(new Date(f.fecha).toUTCString());
  let revocado = false;
  const m = new Motor(almacen, nube, r, async () => { revocado = true; });
  m.meta.equipo = { id: "eq", secreto: "s", org_id: ORG, nombre: "Celular", uid: UID };
  await m.persistir();
  return { m, nube, almacen, reloj: r, f, revocado: () => revocado };
}

const T = "public.trabajadores";
const C = "clinico.consultas";

test("primera copia y cambios: baja lo de la nube y no pisa lo pendiente del teléfono", async () => {
  const nube = nubeFalsa();
  nube.filas.set(`${T}|a1`, { id: "a1", nombres: "Ana", version: 3 });
  const { m } = await armar({ nube });
  await m.sincronizar();
  assert.equal(m.tabla(T).get("a1").nombres, "Ana");
  assert.equal(m.versionNube.get(`${T}|a1`), 3);
  // Cambio local pendiente sin señal; la nube cambia la misma fila: la bajada no lo pisa
  nube.enLineaV = false;
  m.actualizar(T, "a1", { nombres: "Ana María" }, UID);
  nube.filas.set(`${T}|a1`, { id: "a1", nombres: "Anita", version: 4 }); nube.anotar(T, "a1", "U");
  await m.bajar();
  assert.equal(m.tabla(T).get("a1").nombres, "Ana María");
});

test("alta en el teléfono sube y deja la versión confirmada como base", async () => {
  const { m, nube } = await armar();
  const id = m.insertar(C, { trabajador_id: "a1", motivo_texto: "dolor lumbar", version: 9, dias: 3 }, UID);
  assert.equal(m.estado().pendientes, 1);
  const enviado = [...m.bandeja.values()][0];
  assert.ok(!("version" in enviado.datos) && !("dias" in enviado.datos), "no sube columnas de la nube");
  assert.equal(enviado.datos.org_id, ORG);
  await m.sincronizar();
  assert.equal(m.estado().pendientes, 0);
  assert.equal(m.versionNube.get(`${C}|${id}`), 1);
  m.actualizar(C, id, { conclusiones: "apto" }, UID);
  assert.equal([...m.bandeja.values()][0].version_base, 1);
  await m.sincronizar();
  assert.equal(nube.filas.get(`${C}|${id}`).conclusiones, "apto");
  assert.equal(m.estado().pendientes, 0);
});

test("dos guardados seguidos de la misma fila: se funden y suben sin conflicto falso", async () => {
  const { m, nube } = await armar();
  const id = m.insertar(C, { trabajador_id: "a1" }, UID);
  m.actualizar(C, id, { motivo_texto: "control" }, UID);
  assert.equal(m.bandeja.size, 1, "una inserción pendiente sigue siendo una inserción");
  // Mientras sube, se guarda otra vez: queda pendiente con id nuevo, como U sobre la versión 1
  nube.antesDeResponder = () => m.actualizar(C, id, { conclusiones: "reposo" }, UID);
  await m.subir(UID);
  assert.equal(m.estado().conflictos, 0);
  assert.equal(m.estado().pendientes, 0, "lo fundido sube en la misma pasada");
  assert.equal(nube.filas.get(`${C}|${id}`).conclusiones, "reposo");
  assert.equal(nube.filas.get(`${C}|${id}`).version, 2);
});

test("conflicto: el cambio queda con su motivo, la fila vuelve a bajar y se puede reintentar", async () => {
  const nube = nubeFalsa();
  nube.filas.set(`${T}|a1`, { id: "a1", telefono: "1", version: 1 });
  const { m } = await armar({ nube });
  await m.sincronizar();
  nube.enLineaV = false;
  m.actualizar(T, "a1", { telefono: "2" }, UID);
  nube.filas.set(`${T}|a1`, { id: "a1", telefono: "3", version: 2 }); nube.anotar(T, "a1", "U");
  nube.enLineaV = true;
  await m.sincronizar();
  const e = m.estado();
  assert.equal(e.conflictos, 1);
  assert.equal(m.tabla(T).get("a1").telefono, "3", "la copia muestra lo de la nube");
  const c = [...m.bandeja.values()][0];
  assert.match(c.motivo, /cambió/);
  await m.resolver(c.id, "reintentar");
  const otra = [...m.bandeja.values()][0];
  assert.notEqual(otra.id, c.id, "id nuevo: la nube contestaría «duplicado» al id del conflicto");
  assert.equal(otra.version_base, 2);
  await m.sincronizar();
  assert.equal(nube.filas.get(`${T}|a1`).telefono, "2");
});

test("sin respuesta de la nube 5 veces: queda rechazado, nunca se reintenta para siempre", async () => {
  const { m, nube } = await armar();
  m.insertar(C, { trabajador_id: "a1" }, UID);
  nube.mudo = true;
  for (let i = 0; i < 5; i++) await m.subir(UID);
  assert.equal(m.estado().rechazados, 1);
  assert.equal(m.estado().pendientes, 0);
});

test("borrado en el teléfono de algo creado sin subir: nunca llega a la nube", async () => {
  const { m, nube } = await armar();
  const id = m.insertar(C, { trabajador_id: "a1" }, UID);
  m.borrar(C, id, UID);
  assert.equal(m.bandeja.size, 0);
  await m.sincronizar();
  assert.equal(nube.filas.size, 0);
});

test("equipo desactivado desde la PC o la web: el teléfono se borra", async () => {
  const { m, nube, revocado } = await armar();
  nube.revocado = true;
  await m.sincronizar();
  assert.ok(revocado());
  assert.match(m.error, /desactivado/);
});

test("otro usuario con sesión en el teléfono: no sube nada", async () => {
  const { m, nube } = await armar();
  m.insertar(C, { trabajador_id: "a1" }, UID);
  nube.uid = async () => "otro";
  await m.sincronizar();
  assert.equal(m.estado().pendientes, 1);
  assert.equal(nube.llamadas.filter((x) => x === "aplicar_cambios").length, 0);
});

test("lo guardado sobrevive a cerrar la app (se carga igual desde el almacén)", async () => {
  const { m, almacen, reloj } = await armar();
  const id = m.insertar(T, { cedula: "V-1", nombres: "Luis", apellidos: "Pérez", numero_historia: 5001 }, UID);
  await m.persistir();
  const otro = new Motor(almacen, nubeFalsa(), reloj);
  await otro.cargar();
  assert.equal(otro.tabla(T).get(id).nombres, "Luis");
  assert.equal(otro.estado().pendientes, 1);
  assert.equal(otro.meta.equipo.uid, UID);
});

test("números de historia: el bloque propio se reserva y los usados no se repiten", async () => {
  const { m } = await armar();
  await m.sincronizar();
  assert.equal(m.numerosLibres()[0], 5001);
  m.insertar(T, { cedula: "V-2", nombres: "A", apellidos: "B", numero_historia: 5001 }, UID);
  assert.equal(m.numerosLibres()[0], 5002);
  assert.equal(m.numerosLibres().length, 49);
});

test("7 días sin conectarse: pide conexión antes de mostrar datos", async () => {
  const { m, f } = await armar();
  await m.sincronizar();
  assert.equal(m.bloqueadoPorTiempo(), false);
  f.mono += (DIAS_SIN_CONEXION + 1) * 86_400_000;
  assert.equal(m.bloqueadoPorTiempo(), true);
});

test("reloj: sin ancla no sube el piso ni se marca verificada; con ancla manda la nube", () => {
  const { r, f } = relojFalso();
  f.fecha = Date.UTC(2030, 0, 1);
  assert.equal(r.verificada, false);
  r.ahora();
  assert.equal(r.piso, 0, "una fecha adelantada del teléfono no deja el piso en 2030");
  r.anclar("Fri, 30 Oct 2026 15:00:00 GMT");
  f.mono += 5000;
  assert.equal(r.iso(), "2026-10-30T15:00:05.000Z");
  assert.ok(r.verificada);
});

test("cifrado: el PIN errado no abre, el correcto sí, y se puede cambiar el PIN", async () => {
  const { llave, envuelta } = await crearLlave("48291375", 1000);
  const texto = await cifrar(llave, { cedula: "V-123" });
  assert.ok(!texto.includes("V-123"));
  assert.equal(await abrirLlave("00000000", envuelta), null);
  const abierta = await abrirLlave("48291375", envuelta);
  assert.deepEqual(await descifrar(abierta, texto), { cedula: "V-123" });
  const nueva = await cambiarPin("48291375", "73194628", envuelta);
  assert.deepEqual(await descifrar(await abrirLlave("73194628", nueva), texto), { cedula: "V-123" });
  assert.equal(pinValido("12345678") !== null, true);
  assert.equal(pinValido("11111111") !== null, true);
  assert.equal(pinValido("482913"), "El PIN lleva de 8 a 12 números", "un PIN de 6 ya no basta");
  assert.equal(pinValido("48291375"), null);
});
