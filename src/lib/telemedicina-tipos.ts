// Telemedicina (consulta a distancia): tipos y textos compartidos entre servidor y cliente.

export type Medio = "llamada" | "videollamada" | "whatsapp" | "nota_voz";
export type Consentimiento = "pendiente" | "escrito" | "verbal";

export const MEDIOS: { valor: Medio; nombre: string }[] = [
  { valor: "llamada", nombre: "Llamada" },
  { valor: "videollamada", nombre: "Videollamada" },
  { valor: "whatsapp", nombre: "WhatsApp escrito" },
  { valor: "nota_voz", nombre: "Nota de voz" },
];
export const NOMBRE_MEDIO: Record<Medio, string> = Object.fromEntries(MEDIOS.map((m) => [m.valor, m.nombre])) as Record<Medio, string>;

export type Teleconsulta = {
  medio: Medio;
  duracionMin: number | null;
  ubicacion: string;
  telefono: string;
  identidad: string;
  consentimiento: Consentimiento;
  consentimientoEn: string | null; // ISO
  enlaceVence: string | null; // ISO; hay enlace de consentimiento enviado
  fallas: string;
  controlId: string | null;
};

// Lo que espera en la sala (la alerta dejada en esta consulta a distancia)
export type EnSala = { alertaId: string; revisarAntes: string | null };

export type Seguimiento = {
  alertaId: string; consultaId: string; trabajadorId: string; paciente: string; empresa: string | null; medio: Medio;
  fecha: string; revisarAntes: string | null; estado: string; respuesta: string | null; pedidos: string[]; texto: string;
  telefono: string | null; controlId: string | null;
};

export const TEXTO_SALA = "Seguimiento a distancia: esperar que vuelva";
export const PLAZOS_SALA = [7, 15, 30, 60, 90] as const;
export const PLAZO_SALA = 30;
export const plazoSala = (dias: unknown) => {
  const n = Math.round(Number(dias));
  return Number.isFinite(n) && n >= 1 && n <= 180 ? n : PLAZO_SALA;
};
