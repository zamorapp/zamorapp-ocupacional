// Lector de laboratorio (Tesseract.js): sus archivos se sirven desde la propia app en /ocr, nunca desde un CDN.
// Así funciona sin internet en el programa de escritorio y ninguna imagen clínica sale del equipo.
// Versiones fijas en package.json; si un archivo no coincide con su huella SHA-256, la compilación se detiene.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const RECURSOS = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js", "576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js", "eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js", "861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3"],
  // Modelo en español «best_int»: más preciso en cifras que el «fast» y pesa 2 MB
  ["@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz", "spa.traineddata.gz", "40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb"],
];

export function copiarRecursosOcr(raiz = process.cwd()) {
  const destino = path.join(raiz, "public", "ocr");
  fs.mkdirSync(destino, { recursive: true });
  for (const [origen, nombre, huella] of RECURSOS) {
    const archivo = path.join(raiz, "node_modules", origen);
    const datos = fs.readFileSync(archivo);
    const real = crypto.createHash("sha256").update(datos).digest("hex");
    if (real !== huella) throw new Error(`Lector de laboratorio: ${origen} no coincide con la versión aprobada (sha256 ${real}).`);
    const final = path.join(destino, nombre);
    if (!fs.existsSync(final) || crypto.createHash("sha256").update(fs.readFileSync(final)).digest("hex") !== huella) fs.writeFileSync(final, datos);
  }
}
