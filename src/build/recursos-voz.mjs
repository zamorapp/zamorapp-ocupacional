// «Abrir audio» (Whisper en la PC): el motor ONNX se sirve desde la propia app en /voz, nunca desde un CDN.
// Solo el modelo de voz se descarga una vez (Hugging Face) y queda en la caché del navegador; el audio no sale del equipo.
// Versión fija en package.json; si un archivo no coincide con su huella SHA-256, la compilación se detiene.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const RECURSOS = [
  ["@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm", "ort-wasm-simd-threaded.jsep.wasm", "c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39"],
  ["@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.mjs", "08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9"],
];

export function copiarRecursosVoz(raiz = process.cwd()) {
  const destino = path.join(raiz, "public", "voz");
  fs.mkdirSync(destino, { recursive: true });
  for (const [origen, nombre, huella] of RECURSOS) {
    const datos = fs.readFileSync(path.join(raiz, "node_modules", origen));
    const real = crypto.createHash("sha256").update(datos).digest("hex");
    if (real !== huella) throw new Error(`Abrir audio: ${origen} no coincide con la versión aprobada (sha256 ${real}).`);
    const final = path.join(destino, nombre);
    if (!fs.existsSync(final) || crypto.createHash("sha256").update(fs.readFileSync(final)).digest("hex") !== huella) fs.writeFileSync(final, datos);
  }
}
