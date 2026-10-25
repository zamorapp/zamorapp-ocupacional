// Facturación: tipos, totales y formato de moneda (servidor y cliente).

export type Categoria = "consulta" | "evaluacion" | "paraclinico" | "informe" | "asesoria" | "evaluacion_puesto" | "formacion" | "otro";
export type Unidad = "servicio" | "hora" | "trabajador" | "mes";
export type EstadoCobro = "borrador" | "emitida" | "pagada" | "anulada";

export type Servicio = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: Categoria;
  unidad: Unidad;
  precioUsd: number;
  motivos: string;
  activo: boolean;
};

export type ItemCobro = {
  id?: string;
  servicioId: string | null;
  consultaId: string | null;
  descripcion: string;
  detalle: string;
  cantidad: number;
  precioUsd: number;
};

export type Cobro = {
  id: string;
  numero: number;
  empresaId: string;
  empresa: string;
  rif: string;
  fecha: string;
  desde: string | null;
  hasta: string | null;
  estado: EstadoCobro;
  tasaBcv: number | null;
  ivaPct: number;
  igtfPct: number;
  observacion: string;
  numeroFacturaFiscal: string;
  fechaPago: string | null;
  items: ItemCobro[];
};

export type Atencion = {
  id: string;
  fecha: string;
  estado: string;
  paciente: string;
  cedula: string;
  cargo: string | null;
  motivo: string | null;
  motivoCodigo: string | null;
  aptitud: string | null;
  cobroId: string | null;
};

export const ETIQUETA_CATEGORIA: Record<Categoria, string> = {
  consulta: "Consulta",
  evaluacion: "Evaluación médica",
  paraclinico: "Paraclínico",
  informe: "Informe",
  asesoria: "Asesoría",
  evaluacion_puesto: "Evaluación de puesto",
  formacion: "Formación",
  otro: "Otro",
};

export const ETIQUETA_UNIDAD: Record<Unidad, string> = { servicio: "servicio", hora: "hora", trabajador: "trabajador", mes: "mes" };

export const ETIQUETA_ESTADO_COBRO: Record<EstadoCobro, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  pagada: "Pagada",
  anulada: "Anulada",
};

export function totales(c: Pick<Cobro, "items" | "ivaPct" | "igtfPct" | "tasaBcv">) {
  const subtotal = c.items.reduce((s, i) => s + i.cantidad * i.precioUsd, 0);
  const iva = (subtotal * c.ivaPct) / 100;
  const igtf = ((subtotal + iva) * c.igtfPct) / 100;
  const total = subtotal + iva + igtf;
  return { subtotal, iva, igtf, total, totalBs: c.tasaBcv ? total * c.tasaBcv : null };
}

export const usd = (n: number) => `$ ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const bs = (n: number) => `Bs. ${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Servicio que corresponde a una atención según su motivo (PRE → Evaluación pre-empleo…)
export function servicioParaMotivo(servicios: Servicio[], motivoCodigo: string | null) {
  if (!motivoCodigo) return null;
  const c = motivoCodigo.toUpperCase();
  return servicios.find((s) => s.activo && s.motivos.split(",").map((x) => x.trim().toUpperCase()).includes(c)) ?? null;
}
