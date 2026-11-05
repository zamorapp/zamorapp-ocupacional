"use server";

import { obtenerConsulta } from "@/lib/consultas";
import { ES_CAMPO_RECIPE, faltantesMedicinas } from "@/lib/recipe";
import { guardarConsulta, reabrirConsulta, type Resultado } from "@/app/(app)/atencion/acciones";

export type CambioRecipe = { indice: number; medicina: string; campo: string; valor: string };

// Completar desde la hoja del récipe los datos que pide la Res. MPPS 028 sin ir a la consulta.
// Solo escribe en campos VACÍOS de las medicinas que se ven en pantalla (concentración, presentación, vía, dosis,
// frecuencia, duración); lo demás de la consulta queda igual. Se guarda con guardar_consulta (una transacción,
// mismos permisos que el editor). Una consulta firmada no se toca aquí: se corrige en la consulta, con su motivo.
export async function completarRecipe(consultaId: string, cambios: CambioRecipe[]): Promise<Resultado> {
  if (!Array.isArray(cambios) || !cambios.length || cambios.length > 60) return { ok: false, mensaje: "No hay datos para guardar." };
  const consulta = await obtenerConsulta(consultaId);
  if (!consulta) return { ok: false, mensaje: "No se encontró la consulta." };
  const d = consulta.datos;
  if (d.estado === "firmada") return { ok: false, mensaje: "La consulta está firmada: corrígela desde la consulta (queda la versión firmada en el historial)." };

  const tratamiento = d.tratamiento.map((m) => ({ ...m }));
  for (const c of cambios) {
    const valor = typeof c.valor === "string" ? c.valor.replace(/\s+/g, " ").trim() : "";
    const m = tratamiento[c.indice];
    if (!ES_CAMPO_RECIPE(c.campo) || !valor || valor.length > 80) return { ok: false, mensaje: "Revisa los datos: cada uno hasta 80 letras." };
    // La consulta cambió mientras tanto (otra pestaña u otra persona): no se escribe en la medicina equivocada
    if (!m || m.medicina !== c.medicina) return { ok: false, mensaje: "La consulta cambió mientras tanto. Recarga la página." };
    if (String(m[c.campo] ?? "").trim()) continue; // nunca pisa lo que el médico ya escribió
    m[c.campo] = valor;
  }

  const datos = { ...d, tratamiento };
  if (d.estado === "cerrada") {
    // Cerrada: se reabre, se guarda y se vuelve a cerrar en el mismo paso
    const r = await reabrirConsulta(consultaId);
    if (!r.ok) return r;
    const g = await guardarConsulta(datos, true);
    if (!g.ok) return { ok: false, mensaje: `${g.mensaje} La consulta quedó abierta: ciérrala desde la consulta.` };
  } else {
    const g = await guardarConsulta(datos, false);
    if (!g.ok) return g;
  }
  const quedan = faltantesMedicinas(tratamiento).length;
  return quedan ? { ok: true, mensaje: "Guardado. Todavía faltan datos." } : { ok: true, mensaje: "Guardado. El récipe ya se puede imprimir." };
}
