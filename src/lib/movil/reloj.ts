// Reloj del celular, con las mismas reglas que el de la PC (escritorio/puerta/reloj.mjs, Analizar 29-oct):
// con internet manda la hora de la nube (cabecera Date) más lo que avanzó performance.now(); la hora nunca
// retrocede (un piso que solo suben las horas ancladas); sin ancla se usa max(fecha del teléfono, piso) y queda la
// marca «hora sin verificar». Los plazos (7 días sin conectarse) se cuentan con esta hora.
import { fechaDeWindows } from "@/lib/fecha";

export type FuentesReloj = { fecha: () => number; mono: () => number };

const fuentesNavegador: FuentesReloj = {
  fecha: fechaDeWindows, // solo como respaldo sin ancla, igual que en reloj.mjs
  mono: () => performance.now(),
};

export class RelojMovil {
  ancla: { nube: number; mono: number } | null = null;
  piso = 0;
  constructor(private f: FuentesReloj = fuentesNavegador, private alSubirPiso: (piso: number) => void = () => {}) {}

  anclar(fechaCabecera: string | null | undefined) {
    const t = Date.parse(String(fechaCabecera || ""));
    if (!Number.isFinite(t)) return false;
    this.ancla = { nube: t, mono: this.f.mono() };
    if (this.piso > t + 60e3) this.piso = t; // un piso por encima de la nube es un error: manda la nube
    this.subirPiso(t);
    return true;
  }

  get verificada() { return Boolean(this.ancla); }

  ahora() {
    if (this.ancla) {
      const t = Math.max(this.ancla.nube + (this.f.mono() - this.ancla.mono), this.piso);
      this.subirPiso(t);
      return Math.round(t);
    }
    return Math.round(Math.max(this.f.fecha(), this.piso));
  }

  iso() { return new Date(this.ahora()).toISOString(); }

  private subirPiso(t: number) {
    if (t <= this.piso) return;
    // Se avisa solo si subió más de un minuto: no se escribe el disco en cada lectura de la hora
    const avisar = t - this.piso > 60e3;
    this.piso = t;
    if (avisar) this.alSubirPiso(t);
  }
}
