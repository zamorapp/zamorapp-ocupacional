// «Mejorar con IA» del informe de vigilancia, gratis y opcional: arma un pedido con cifras agregadas para pegarlo en
// Claude o ChatGPT (cuenta gratuita) y lee la respuesta pegada de vuelta. No llama a ningún servicio: sin internet
// el analizador propio sigue funcionando. Nunca lleva la razón social, nombres ni casos individuales, y las
// cifras de 1 o 2 casos salen como «<3» para que nadie sea reconocible.
// Puro: corre en el navegador (editor de Reportes).

import type { DatosAnalisis } from "@/lib/vigilancia-analisis";

const MINIMO = 3;
const n = (x: number) => (x > 0 && x < MINIMO ? `<${MINIMO}` : x.toLocaleString("es-VE"));
const p1 = (x: number) => x.toLocaleString("es-VE", { maximumFractionDigits: 1 });
// Solo los grupos con 3 casos o más llevan nombre; los demás van juntos en «otras» (un nombre con 1 caso ya delata a alguien)
const lista = (l: { nombre: string; n: number }[], max = 6, sumarOtras = 0) => {
  const visibles = l.filter((x) => x.n >= MINIMO).slice(0, max);
  const otras = l.filter((x) => !visibles.includes(x)).reduce((t, x) => t + x.n, sumarOtras);
  return [...visibles.map((x) => `${x.nombre}: ${n(x.n)}`), ...(otras ? [`otras: ${n(otras)}`] : [])].join("; ") || "sin datos";
};
// Nunca salen por su nombre, sea cual sea la cifra: VIH, salud mental, embarazo y parto (y sus códigos Z)
const CONFIDENCIAL = /^(B2[0-4]|Z21|F\d|O\d|Z3[2-6])/i;
export const confidencial = (cie10: string) => CONFIDENCIAL.test(cie10.trim());
// La razón social, el RIF y sus variantes sin guiones se borran del texto libre de riesgos
function sinIdentidad(texto: string, quitar: string[]) {
  let t = texto;
  for (const q of quitar.map((x) => x.trim()).filter((x) => x.length >= 3)) {
    for (const v of new Set([q, q.replace(/[-.\s]/g, "")])) t = t.split(v).join("[empresa]");
    t = t.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[empresa]");
  }
  return t;
}

export const TITULOS_IA = {
  conclusiones: "CONCLUSIÓN MÉDICO-OCUPACIONAL",
  recomendaciones_medicas: "RECOMENDACIONES MÉDICO-OCUPACIONALES",
  recomendaciones: "RECOMENDACIONES DE SEGURIDAD Y SALUD EN EL TRABAJO",
} as const;
export type ClaveIA = keyof typeof TITULOS_IA;

// quitar: razón social y RIF de la empresa, que se borran también del texto libre de riesgos
export function pedidoIA(d: DatosAnalisis, riesgos: string, quitar: string[] = []): string {
  const r = d.r;
  const origen = Object.entries(r.morbilidad.por_origen).map(([k, x]) => ({ nombre: k.replace(/_/g, " "), n: x }));
  const reposo = r.ausentismo.por_causa.map((c) => ({ nombre: (d.causas[c.nombre] ?? c.nombre).toLowerCase(), n: c.n }));
  const aptitud = Object.entries(r.aptitud).map(([k, x]) => ({ nombre: (d.aptitudes[k] ?? k).toLowerCase(), n: x }));
  const causas = r.morbilidad.primeras_causas.filter((c) => !confidencial(c.cie10)).map((c) => ({ nombre: `${c.descripcion} (${c.cie10})`, n: c.n }));
  const ocultas = r.morbilidad.primeras_causas.filter((c) => confidencial(c.cie10)).reduce((t, c) => t + c.n, 0);
  const sensible = (nombre: string) => /mental|comportamiento|embarazo|parto|puerperio|vih|inmunodeficiencia/i.test(nombre);
  const sistemas = r.morbilidad.por_sistema.filter((x) => !sensible(x.nombre));
  const sistemasOcultos = r.morbilidad.por_sistema.filter((x) => sensible(x.nombre)).reduce((t, x) => t + x.n, 0);
  const pocos = r.poblacion.femenino < MINIMO || r.poblacion.masculino < MINIMO;
  const datos = [
    `Período: ${d.etiqueta}.`,
    // Con menos de 3 de un sexo no se da la división: junto a una causa identificaría a la persona
    `Población: ${n(r.poblacion.total)} trabajadores${pocos ? "" : ` (mujeres ${n(r.poblacion.femenino)}, hombres ${n(r.poblacion.masculino)})`}.`,
    `Consultas: ${n(r.consultas.total)} a ${n(r.consultas.pacientes)} trabajadores; preventivas ${n(r.consultas.preventivas)}, asistenciales ${n(r.consultas.no_preventivas)}.`,
    `Motivos de consulta: ${lista(r.consultas.por_motivo)}.`,
    `Morbilidad: ${n(r.morbilidad.total)} diagnósticos. Por aparato o sistema: ${lista(sistemas, 6, sistemasOcultos)}.`,
    `Primeras causas: ${lista(causas, 8, ocultas)}.`,
    `Origen de los diagnósticos: ${lista(origen)}.`,
    `Ausentismo: ${p1(d.pct)} % (meta < 2,5 %), ${n(r.ausentismo.dias_computables)} días perdidos en ${n(r.ausentismo.reposos)} reposos. Por causa: ${lista(reposo)}.`,
    d.acc ? `Accidentes de trabajo: ${n(d.acc.accidentes)} (${n(d.acc.conTiempoPerdido)} con tiempo perdido, ${n(d.acc.diasPerdidos)} días perdidos)${d.acc.ifn !== null ? `; índice de frecuencia ${p1(d.acc.ifn)}, de severidad ${p1(d.acc.is ?? 0)}` : ""}.` : "Accidentes de trabajo: sin datos.",
    `Referencias a especialistas: ${n(r.referencias?.total ?? 0)}. Aptitud emitida: ${lista(aptitud)}.`,
    `Riesgos de los puestos de trabajo (de su evaluación): ${sinIdentidad(riesgos, [d.empresa ?? "", ...quitar]).trim().slice(0, 1500) || "no registrados"}.`,
  ];
  return [
    "Eres médico ocupacional en Venezuela. Con estos datos agregados del informe trimestral de vigilancia epidemiológica de una empresa (artículo 34 del Reglamento Parcial de la LOPCYMAT), redacta en español formal y concreto:",
    "",
    ...datos.map((x) => `- ${x}`),
    "",
    "Responde SOLO con estos tres apartados, cada uno con su título exacto en una línea aparte:",
    `${TITULOS_IA.conclusiones}: un párrafo de 5 a 8 líneas que interprete los indicadores y su relación con el trabajo.`,
    `${TITULOS_IA.recomendaciones_medicas}: lista numerada de 4 a 7 acciones del servicio médico (vigilancia, evaluaciones, programas de salud, seguimiento).`,
    `${TITULOS_IA.recomendaciones}: lista numerada de 4 a 7 acciones de la empresa, su Servicio de SST y el Comité (controles en la fuente, el ambiente y el trabajador; EPP; capacitación; investigación).`,
    "No inventes cifras ni nombres; usa solo los datos dados y la normativa venezolana vigente (LOPCYMAT, NT-02-2008).",
  ].join("\n");
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// Separa la respuesta pegada por los tres títulos (tolera **negritas**, #, dos puntos y tildes de más o de menos)
export function leerRespuestaIA(texto: string): Partial<Record<ClaveIA, string>> {
  const claves = Object.keys(TITULOS_IA) as ClaveIA[];
  const marcas: { clave: ClaveIA; desde: number; hasta: number }[] = [];
  const lineas = texto.replace(/\r/g, "").split("\n");
  let pos = 0;
  for (const l of lineas) {
    const limpia = sinTildes(l.replace(/[#*_:]/g, "")).trim();
    const clave = claves.find((k) => limpia.startsWith(sinTildes(TITULOS_IA[k])));
    if (clave) {
      const resto = l.slice(l.search(/:/) >= 0 ? l.indexOf(":") + 1 : l.length).replace(/^[\s*]+/, "");
      marcas.push({ clave, desde: pos + l.length - resto.length, hasta: 0 });
    }
    pos += l.length + 1;
  }
  const out: Partial<Record<ClaveIA, string>> = {};
  marcas.forEach((m, i) => {
    const fin = i + 1 < marcas.length ? texto.replace(/\r/g, "").lastIndexOf("\n", marcas[i + 1].desde - 1) : texto.length;
    const t = texto.replace(/\r/g, "").slice(m.desde, Math.max(m.desde, fin)).replace(/\*\*/g, "").trim();
    if (t) out[m.clave] = t;
  });
  return out;
}
