// Recordatorios de citas (20261030955000): lo que se guarda en organizaciones.ajustes.recordatorio_citas. La base
// (ajustes_recordatorio_citas) aplica los mismos valores por omisión y los mismos topes: si algo falta, 3 días, 1 día
// y 1 hora antes, celular y correo activos, y los avisos de días desde las 7 a. m.
export type UnidadRecordatorio = "dias" | "horas" | "minutos";
export type PasoRecordatorio = { valor: number; unidad: UnidadRecordatorio; activo: boolean };
export type RecordatorioCitas = { avisos: PasoRecordatorio[]; celular: boolean; correo: boolean; hora_dias: number };

export const RECORDATORIO_CITAS_DEFECTO: RecordatorioCitas = {
  avisos: [
    { valor: 3, unidad: "dias", activo: true },
    { valor: 1, unidad: "dias", activo: true },
    { valor: 1, unidad: "horas", activo: true },
  ],
  celular: true,
  correo: true,
  hora_dias: 7,
};

export const TOPES: Record<UnidadRecordatorio, { min: number; max: number }> = {
  dias: { min: 0, max: 30 },
  horas: { min: 1, max: 23 },
  minutos: { min: 5, max: 180 },
};

const unidad = (u: unknown): UnidadRecordatorio => (u === "horas" || u === "minutos" ? u : "dias");
const acotar = (n: unknown, u: UnidadRecordatorio, defecto: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(TOPES[u].max, Math.max(TOPES[u].min, v)) : defecto;
};

export function leerRecordatorioCitas(ajustes: unknown): RecordatorioCitas {
  const rc = ((ajustes ?? {}) as { recordatorio_citas?: Partial<RecordatorioCitas> }).recordatorio_citas ?? {};
  const avisos = Array.isArray(rc.avisos) ? rc.avisos : RECORDATORIO_CITAS_DEFECTO.avisos;
  return {
    avisos: [0, 1, 2].map((i) => {
      const p = (avisos[i] ?? RECORDATORIO_CITAS_DEFECTO.avisos[i]) as Partial<PasoRecordatorio>;
      const u = unidad(p.unidad);
      return { valor: acotar(p.valor, u, RECORDATORIO_CITAS_DEFECTO.avisos[i].valor), unidad: u, activo: p.activo !== false };
    }),
    celular: rc.celular !== false,
    correo: rc.correo !== false,
    hora_dias: Number.isInteger(rc.hora_dias) && rc.hora_dias! >= 0 && rc.hora_dias! <= 23 ? rc.hora_dias! : 7,
  };
}

// Del formulario de Configuración (campos rc_valor_N, rc_unidad_N, rc_activo_N, rc_celular, rc_correo, rc_hora_dias)
export function recordatorioCitasDeFormulario(datos: FormData): RecordatorioCitas {
  const hora = Math.round(Number(datos.get("rc_hora_dias")));
  return {
    avisos: [0, 1, 2].map((i) => {
      const u = unidad(datos.get(`rc_unidad_${i}`));
      return { valor: acotar(datos.get(`rc_valor_${i}`), u, RECORDATORIO_CITAS_DEFECTO.avisos[i].valor), unidad: u, activo: datos.get(`rc_activo_${i}`) === "on" };
    }),
    celular: datos.get("rc_celular") === "on",
    correo: datos.get("rc_correo") === "on",
    hora_dias: Number.isInteger(hora) && hora >= 0 && hora <= 23 ? hora : 7,
  };
}

// «3 días, 1 día y 1 hora antes»
export function describirPaso(p: Pick<PasoRecordatorio, "valor" | "unidad">): string {
  if (p.unidad === "dias") return p.valor === 0 ? "el mismo día" : `${p.valor} ${p.valor === 1 ? "día" : "días"}`;
  if (p.unidad === "horas") return `${p.valor} ${p.valor === 1 ? "hora" : "horas"}`;
  return `${p.valor} min`;
}

export function horaDelDia(h: number): string {
  return h === 0 ? "12:00 a. m." : h < 12 ? `${h}:00 a. m.` : h === 12 ? "12:00 p. m." : `${h - 12}:00 p. m.`;
}
