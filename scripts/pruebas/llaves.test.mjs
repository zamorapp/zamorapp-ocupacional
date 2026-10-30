// Llaves pegadas a mano en Vercel: se limpian y la pública VAPID sale de la privada.
// Uso: node --test scripts/pruebas/llaves.test.mjs
import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { limpiarLlave, publicaDeVapid } = await jiti.import("../../src/lib/llaves.ts");

test("quita espacios, saltos y comillas que se cuelan al copiar", () => {
  assert.equal(limpiarLlave("  abc123 \n"), "abc123");
  assert.equal(limpiarLlave("`abc123`"), "abc123");
  assert.equal(limpiarLlave('"abc123"'), "abc123");
  assert.equal(limpiarLlave("'abc123' "), "abc123");
  assert.equal(limpiarLlave("abcd efgh ijkl mnop"), "abcdefghijklmnop"); // contraseña de aplicación de Google
  assert.equal(limpiarLlave(undefined), "");
});

test("la pública VAPID sale de la privada, aunque se haya pegado con espacios o comillas", () => {
  const a = createECDH("prime256v1"); a.generateKeys();
  const privada = a.getPrivateKey().toString("base64url"), publica = a.getPublicKey().toString("base64url");
  assert.equal(publicaDeVapid(privada), publica);
  assert.equal(publicaDeVapid(limpiarLlave(` \`${privada}\`\n`)), publica);
  assert.equal(publicaDeVapid(privada.slice(0, 20)), null);
  assert.equal(publicaDeVapid(""), null);
});
