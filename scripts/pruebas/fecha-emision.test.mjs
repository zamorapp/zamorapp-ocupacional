// El informe de vigilancia nunca sale sin fecha de emisión: la elegida, la del día en que se guardó o hoy (Caracas).
// Uso: node --test scripts/pruebas/fecha-emision.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const raiz = fileURLToPath(new URL("../../src/", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@/": raiz } });
const { fechaEmisionDe, limpiarFirmantes } = await jiti.import("../../src/lib/firmantes.ts");

test("la elegida manda", () => assert.equal(fechaEmisionDe({ fecha_emision: "2026-10-15" }, "2026-10-20T15:00:00Z", "2026-10-31"), "2026-10-15"));
test("sin elegida: el día (Caracas) en que se guardó", () => assert.equal(fechaEmisionDe({}, "2026-10-21T02:30:00Z", "2026-10-31"), "2026-10-20"));
test("sin guardar: hoy", () => assert.equal(fechaEmisionDe({ fecha_emision: "" }, null, "2026-10-31"), "2026-10-31"));
test("una fecha mal formada no se usa", () => assert.equal(fechaEmisionDe({ fecha_emision: "31/10/2026" }, undefined, "2026-10-31"), "2026-10-31"));
test("se guarda tal cual", () => assert.equal(limpiarFirmantes({ fecha_emision: "2026-10-31" }).fecha_emision, "2026-10-31"));
