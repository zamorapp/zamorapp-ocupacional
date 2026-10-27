// Opciones al imprimir (como en el SAME): quitar el membrete (hoja preimpresa), las imágenes de firma y sello
// (firmar a mano), los riesgos del puesto, las limitaciones o las conclusiones
export const OPCIONES_IMPRESION = {
  membrete: "Membrete",
  firma: "Firma y sello digitales",
  riesgos: "Riesgos del puesto",
  limitaciones: "Limitaciones",
  conclusiones: "Conclusiones",
} as const;
export type OpcionImpresion = keyof typeof OPCIONES_IMPRESION;
export const opcionesDeUrl = (sin: string | undefined): OpcionImpresion[] =>
  (sin ?? "").split(",").filter((x): x is OpcionImpresion => x in OPCIONES_IMPRESION);

// Las que tienen sentido en cada documento (membrete y firma, en todos)
export function opcionesDe(tipo: string): OpcionImpresion[] {
  const extra: Partial<Record<string, OpcionImpresion[]>> = {
    constancia: ["riesgos", "limitaciones"],
    informe: ["limitaciones", "conclusiones"],
    "informe-trabajador": ["conclusiones"],
    preoperatoria: ["conclusiones"],
    paquete: ["riesgos", "limitaciones"],
    oam: ["riesgos"],
  };
  return ["membrete", "firma", ...(extra[tipo] ?? [])];
}
