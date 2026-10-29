// Reloj anclado: la fecha de Windows se mueve (Cesar la cambia para abrir el SAME) y la hora de la app no.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Reloj } from "../puerta/reloj.mjs";

const DIA = 864e5;
function armar(windowsMs, estadoGuardado = {}) {
  const estado = { d: { ...estadoGuardado }, guardadas: 0, guardar() { this.guardadas++; } };
  const f = { windows: windowsMs, mono: 1000 };
  const reloj = new Reloj(estado, () => {}, { fecha: () => f.windows, mono: () => f.mono });
  return { reloj, estado, f };
}

test("con la nube: la hora es la de la nube más lo que pasó, aunque Windows esté atrasado o adelantado", () => {
  const nube = Date.UTC(2026, 9, 29, 12, 0, 0);
  const { reloj, f } = armar(nube - 30 * DIA);
  assert.equal(reloj.verificada, false);
  assert.ok(reloj.anclar(new Date(nube).toUTCString()));
  assert.equal(reloj.verificada, true);
  assert.ok(Math.abs(reloj.ahora() - nube) < 1000);
  f.mono += 5000; f.windows += 400 * DIA; // Windows salta 400 días: no importa
  assert.ok(Math.abs(reloj.ahora() - (nube + 5000)) < 1000);
  f.windows -= 800 * DIA; // Windows vuelve atrás: tampoco
  assert.ok(Math.abs(reloj.ahora() - (nube + 5000)) < 1000);
});

test("sin nube: nunca retrocede del piso guardado, y queda «sin verificar» hasta reconectar", () => {
  const nube = Date.UTC(2026, 9, 29, 12, 0, 0);
  const a = armar(nube);
  a.reloj.anclar(new Date(nube).toUTCString());
  a.f.mono += 3 * DIA; a.reloj.ahora(); // tres días con la app abierta
  assert.ok(a.estado.d.reloj.piso >= nube + 3 * DIA - 1000);
  // Reinicio sin internet con la fecha de Windows atrasada un mes: manda el piso
  const b = armar(nube - 30 * DIA, structuredClone(a.estado.d));
  assert.equal(b.reloj.verificada, false);
  assert.ok(b.reloj.ahora() >= nube + 3 * DIA - 1000, "no retrocede");
  // Con Windows adelantado, se usa Windows (es mayor): nunca menos que el piso
  const c = armar(nube + 10 * DIA, structuredClone(a.estado.d));
  assert.ok(Math.abs(c.reloj.ahora() - (nube + 10 * DIA)) < 1000);
  assert.ok(c.estado.d.reloj.piso >= nube + 10 * DIA - 1000, "el piso sube");
  assert.equal(c.reloj.verificada, false);
  c.reloj.anclar(new Date(nube + 11 * DIA).toUTCString());
  assert.equal(c.reloj.verificada, true);
});

test("plazo sin conexión: cuenta con la hora anclada y con los arranques seguidos sin nube", () => {
  const nube = Date.UTC(2026, 9, 29, 12, 0, 0);
  const { reloj, estado, f } = armar(nube);
  reloj.anclar(new Date(nube).toUTCString());
  const ultimoOnline = reloj.ahora();
  f.windows = nube - 60 * DIA; // Windows atrasado dos meses
  assert.equal(reloj.sinConexionVencida(ultimoOnline, 7, 7), false);
  f.mono += 8 * DIA;
  assert.equal(reloj.sinConexionVencida(ultimoOnline, 7, 7), true, "8 días reales aunque Windows diga dos meses antes");
  // Arranques: 7 seguidos sin nube se toleran, el octavo no
  const r2 = armar(nube, { reloj: { piso: nube, arranquesSinNube: 0 } });
  for (let i = 0; i < 7; i++) r2.reloj.arranque(false);
  assert.equal(r2.reloj.sinConexionVencida(nube, 7, 7), false);
  r2.reloj.arranque(false);
  assert.equal(r2.reloj.sinConexionVencida(nube, 7, 7), true);
  r2.reloj.arranque(true);
  assert.equal(r2.reloj.arranquesSinNube(), 0);
  assert.ok(estado.guardadas >= 1, "el piso se guarda en el estado cifrado");
});

test("una cabecera Date rota no ancla nada", () => {
  const { reloj } = armar(Date.UTC(2026, 9, 29));
  assert.equal(reloj.anclar("basura"), false);
  assert.equal(reloj.anclar(null), false);
  assert.equal(reloj.verificada, false);
});
