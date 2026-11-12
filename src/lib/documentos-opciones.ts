// Opciones al imprimir (como en el SAME): quitar el membrete (hoja preimpresa), las imágenes de firma y sello
// (firmar a mano), los riesgos del puesto, las limitaciones o las conclusiones
export const OPCIONES_IMPRESION = {
  membrete: "Membrete",
  firma: "Firma y sello digitales",
  riesgos: "Riesgos del puesto",
  limitaciones: "Limitaciones",
  conclusiones: "Conclusiones",
  examen: "Examen detallado por sistema",
  motivo: "Motivo clínico del reposo",
} as const;
export type OpcionImpresion = keyof typeof OPCIONES_IMPRESION;
// «Revisión N: reemplaza los impresos anteriores» en el pie: oculto salvo ?rev=1
export const revisionDeUrl = (rev: string | undefined) => rev === "1";
export const opcionesDeUrl = (sin: string | undefined): OpcionImpresion[] =>
  (sin ?? "").split(",").filter((x): x is OpcionImpresion => x in OPCIONES_IMPRESION);

// Las que tienen sentido en cada documento (membrete y firma, en todos)
export function opcionesDe(tipo: string): OpcionImpresion[] {
  const extra: Partial<Record<string, OpcionImpresion[]>> = {
    constancia: ["riesgos", "limitaciones"],
    informe: ["examen", "limitaciones", "conclusiones"],
    "informe-trabajador": ["examen", "conclusiones"],
    preoperatoria: ["examen", "conclusiones"],
    paquete: ["riesgos", "limitaciones"],
    oam: ["riesgos"],
    reposo: ["motivo"],
  };
  return ["membrete", "firma", ...(extra[tipo] ?? [])];
}
