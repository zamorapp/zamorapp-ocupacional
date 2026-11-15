// Huella en la web con la verificación en dos pasos: registrar la llave pide el código ahí mismo cuando la sesión
// entró sin él (equipo de confianza), y reinstalar la app vuelve a ofrecer la huella sin duplicar llaves (31-oct).
// Uso: node --test scripts/pruebas/huella-codigo.test.mjs
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const datos = new Map();
globalThis.localStorage = {
  getItem: (k) => (datos.has(k) ? datos.get(k) : null),
  setItem: (k, v) => datos.set(k, String(v)),
  removeItem: (k) => datos.delete(k),
};
globalThis.window = globalThis;
globalThis.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => true };

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { activarHuella, puedeOfrecerHuella, huellaActivaAqui } = await jiti.import("../../src/lib/huella.ts");

// Cliente de Supabase de juguete: reglas de la nube que importan aquí (con dos pasos activos, registrar exige aal2;
// el código correcto es 123456; si este equipo ya tiene la llave, el navegador responde «ya registrada»).
function nube({ aal = "aal1", totp = true, falta = false, llaveEnEquipo = false } = {}) {
  const n = { aal, registradas: 0, verificados: 0 };
  n.cliente = {
    auth: {
      getClaims: async () => ({ data: { claims: { aal: n.aal } } }),
      mfa: {
        listFactors: async () => ({ data: { totp: totp ? [{ id: "f1", status: "verified" }] : [], all: [] } }),
        challengeAndVerify: async ({ code }) => {
          if (code !== "123456") return { error: { code: "mfa_verification_failed" } };
          n.verificados += 1; n.aal = "aal2"; return { error: null };
        },
      },
      registerPasskey: async () => {
        if (totp && n.aal !== "aal2") return { error: { code: "insufficient_aal" } };
        if (llaveEnEquipo) return { error: { code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", name: "InvalidStateError" } };
        n.registradas += 1; return { error: null };
      },
      passkey: { list: async () => ({ data: [{ id: "vieja" }], error: null }) },
    },
    rpc: async (f) => (f === "falta_segundo_paso" ? { data: falta } : { data: null }),
  };
  return n;
}

beforeEach(() => datos.clear());

test("equipo de confianza (aal1): pide el código en vez del aviso sin salida", async () => {
  const n = nube();
  const r = await activarHuella(n.cliente);
  assert.equal(r.ok, false);
  assert.equal(r.pideCodigo, true);
  assert.match(r.mensaje, /código de 6 dígitos/);
  assert.equal(n.registradas, 0);
});

test("con el código correcto registra la huella en el mismo paso", async () => {
  const n = nube();
  const r = await activarHuella(n.cliente, "123456");
  assert.deepEqual(r, { ok: true });
  assert.equal(n.verificados, 1);
  assert.equal(n.registradas, 1);
  assert.equal(await huellaActivaAqui(), true);
});

test("código errado: vuelve a pedirlo con la causa y no registra", async () => {
  const n = nube();
  const r = await activarHuella(n.cliente, "000000");
  assert.equal(r.ok, false);
  assert.equal(r.pideCodigo, true);
  assert.match(r.mensaje, /no es correcto/);
  assert.equal(n.registradas, 0);
});

test("con la sesión ya en aal2 no pide código", async () => {
  const n = nube({ aal: "aal2" });
  assert.deepEqual(await activarHuella(n.cliente), { ok: true });
  assert.equal(n.verificados, 0);
});

test("cuenta sin dos pasos: registra directo", async () => {
  const n = nube({ totp: false });
  assert.deepEqual(await activarHuella(n.cliente), { ok: true });
});

test("app reinstalada con la llave aún en el teléfono: queda lista sin crear otra", async () => {
  const n = nube({ aal: "aal2", llaveEnEquipo: true });
  assert.deepEqual(await activarHuella(n.cliente), { ok: true });
  assert.equal(n.registradas, 0);
  assert.equal(await huellaActivaAqui(), true);
});

test("tras reinstalar se vuelve a ofrecer aunque la cuenta ya tenga llaves de antes", async () => {
  const n = nube({ aal: "aal1", falta: false });
  assert.equal(await puedeOfrecerHuella(n.cliente), true);
  localStorage.setItem("zamorapp.huella", "1");
  assert.equal(await puedeOfrecerHuella(n.cliente), false);
});

test("sin el código y sin equipo de confianza no se ofrece (se ofrece tras escribirlo)", async () => {
  const n = nube({ aal: "aal1", falta: true });
  assert.equal(await puedeOfrecerHuella(n.cliente), false);
});
