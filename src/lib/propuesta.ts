// Otra hora propuesta por el servicio a una cita pedida por RR. HH. (sirve en servidor y en pantalla)
export type ModoPropuesta = "exacta" | "rango" | "desde";
export type Propuesta = { fecha: string; desde: string; hasta: string | null; modo: ModoPropuesta; nota: string | null; en: string | null };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** «08:30» → «8:30 a. m.» */
export function hora12(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
}
/** «sáb 01/11 entre las 8:00 a. m. y las 10:00 a. m.» */
export function textoPropuesta(p: Pick<Propuesta, "fecha" | "desde" | "hasta" | "modo">) {
  const [a, m, d] = p.fecha.split("-").map(Number);
  const dia = `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  if (p.modo === "rango" && p.hasta) return `${dia} entre las ${hora12(p.desde)} y las ${hora12(p.hasta)}`;
  if (p.modo === "desde") return `${dia} a partir de las ${hora12(p.desde)}`;
  return `${dia} a las ${hora12(p.desde)}`;
}
