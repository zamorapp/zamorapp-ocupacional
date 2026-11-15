// Herramientas de redacción del analizador de vigilancia (formato de cifras, frases y reglas de lo que se puede nombrar).
// Puro: lo usan el análisis por cuadro y el análisis integral, en el servidor y en el navegador.

import { MESES } from "@/lib/periodos";
import { confidencial } from "@/lib/vigilancia-ia";

export const n0 = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 0 });
export const n1 = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 1 });
export const n2 = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
export const p = (parte: number, total: number) => (total ? (parte * 100) / total : 0);
export const pc = (parte: number, total: number) => `${n1(p(parte, total))} %`;
export const plural = (n: number, uno: string, varios: string) => `${n0(n)} ${n === 1 ? uno : varios}`;
// Personas con un dato de salud: 1 o 2 no se cuentan con su cifra (RR. HH. lee el análisis y reconocería a alguien)
export const personas = (n: number, uno: string, varios: string) => (n > 0 && n < 3 ? `menos de tres ${varios}` : plural(n, uno, varios));
// Siglas (IVSS, INPSASEL) no se tocan
export const minus = (s: string) => (/^\p{Lu}{2}/u.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
export const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const unir = (partes: string[]) => (partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`);
// Etiqueta del período dentro de una frase: «el I trimestre 2026», «el trimestre febrero – abril 2026», «el período del 01/01/2026 al…»
export const etq = (e: string) => {
  const corta = e.replace(/ \(.*\)$/, "");
  return corta.startsWith("Del ") ? `período ${minus(corta)}` : /^(Trimestre|Año|Período)\b/.test(corta) ? minus(corta) : corta;
};
// «a el» → «al», «de el» → «del» (las etiquetas de período se insertan con artículo)
export const contraer = (t: string) => t.replace(/\b([Aa]) el /g, "$1l ").replace(/\b([Dd]e) el /g, "$1l ");
export const humano = (codigo: string) => codigo.replace(/_/g, " ");
export const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// RR. HH. lee el análisis: un diagnóstico se nombra solo con 3 casos o más y si no es confidencial (VIH, salud mental, embarazo)
export const nombrable = (c: { cie10: string; n: number; pacientes?: number } | undefined) => Boolean(c && Math.min(c.n, c.pacientes ?? c.n) >= 3 && !confidencial(c.cie10));
// Diagnóstico para el texto: «Lumbago (M54.5)», o solo el código si no hay descripción
export const dx = (c: { cie10: string; descripcion: string | null }) => (c.descripcion && c.descripcion !== c.cie10 ? `${c.descripcion} (${c.cie10})` : c.cie10);
export const mesLargo = (aaaamm: string) => MESES[Number(aaaamm.slice(5, 7)) - 1] ?? aaaamm;
// «este trimestre» o «este período» según lo que se eligió en Reportes
export const lapsoDe = (etiqueta: string) => (/trimestre/i.test(etiqueta) ? "este trimestre" : "este período");
// La frase que Cesar pidió para todo cuadro sin datos
export const sinRegistros = (etiqueta: string) => `Para este indicador no se encontraron registros en ${lapsoDe(etiqueta)}.`;
