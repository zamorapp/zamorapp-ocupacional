// Motivo clínico del reposo (pedido de Cesar, 05-nov-2026): la hoja de reposo dice POR QUÉ se indica, igual que el
// informe médico deriva del motivo de consulta y de los hallazgos positivos del examen. Si el médico no escribe uno,
// se propone a partir de la consulta; él lo ve completo en la pantalla antes de imprimir y lo puede cambiar.
import type { DatosConsulta, FilaExamen } from "@/lib/consultas-tipos";

/** Tope del texto impreso: original y copia comparten una hoja carta. */
export const MAXIMO_MOTIVO_REPOSO = 160;

const limpiar = (t: string) => t.replace(/\s+/g, " ").trim().replace(/[.;,:\s]+$/, "");
const minuscula = (t: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
// Lo que el médico escribió como normal con otras palabras no es un hallazgo («Sin alteraciones», «DLN», «Niega»…)
const SIN_HALLAZGO = /^(normal(es)?|sin (alteraci[oó]n(es)?|hallazgos|particularidades|patolog[ií]a)( aparentes?)?|dentro de (los )?l[ií]mites normales|dln|niega|no refiere|negativo|conservad[oa]s?|eutr[oó]fic[oa]|evaluaci[oó]n f[ií]sica normal)$/i;
const positivos = (filas: FilaExamen[]) => filas.filter((x) => {
  const v = limpiar(x.valor);
  return v && v !== limpiar(x.normal) && !SIN_HALLAZGO.test(v);
});
// Primera oración de un texto largo (la enfermedad actual suele ocupar un párrafo)
const primeraOracion = (t: string) => limpiar(t).split(/(?<=[a-záéíóúñ0-9)])\.\s+/)[0] ?? "";

function recortar(t: string, max: number) {
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), max * 0.6)).replace(/[.;,:\s]+$/, "")}…`;
}

/** Texto propuesto: «Se indica reposo médico por presentar <motivo>. Al examen físico: <hallazgos positivos>.» */
export function proponerMotivoReposo(c: Pick<DatosConsulta, "motivoTexto" | "enfermedadActual" | "examenFuncional" | "examenFisico" | "diagnosticos">): string {
  const motivo = limpiar(c.motivoTexto) || primeraOracion(c.enfermedadActual)
    || positivos(c.examenFuncional).map((x) => `${minuscula(x.nombre)}: ${limpiar(x.valor)}`).join("; ");
  const hallazgos = positivos(c.examenFisico).map((x) => `${minuscula(limpiar(x.nombre))}: ${minuscula(limpiar(x.valor))}`);
  const inicio = motivo
    ? `Se indica reposo médico por presentar ${minuscula(recortar(motivo, 90))}.`
    : c.diagnosticos[0]?.descripcion ? `Se indica reposo médico por ${minuscula(limpiar(c.diagnosticos[0].descripcion))}.` : "";
  if (!hallazgos.length) return inicio;
  // Se agregan hallazgos mientras quepan; el médico ve en pantalla exactamente lo que sale
  const espacio = MAXIMO_MOTIVO_REPOSO - inicio.length - " Al examen físico: .".length;
  let examen = "";
  for (const h of hallazgos) {
    const siguiente = examen ? `${examen}; ${h}` : h;
    if (siguiente.length > espacio) { if (!examen) examen = recortar(h, espacio); break; }
    examen = siguiente;
  }
  return `${inicio}${inicio ? " " : ""}Al examen físico: ${examen}.`.trim();
}

/** Lo que imprime la hoja: lo escrito por el médico o, si lo dejó vacío, la propuesta. */
export function motivoReposoImpreso(c: Parameters<typeof proponerMotivoReposo>[0] & { reposo: { motivoClinico?: string } }): string {
  return c.reposo.motivoClinico?.trim() || proponerMotivoReposo(c);
}
