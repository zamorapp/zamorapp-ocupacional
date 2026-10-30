// Avisos que se apagan por empresa (migración 20261030610000). Los plazos legales de accidentes no se apagan.
export const AVISOS_EMPRESA = [
  { clave: "vencimientos", nombre: "Exámenes periódicos vencidos o por vencer", detalle: "En Inicio" },
  { clave: "proxima_evaluacion", nombre: "Alertas para la próxima evaluación", detalle: "En la campana; en la consulta siguen saliendo" },
  { clave: "resultados", nombre: "Resultados de exámenes por recibir", detalle: "En la campana" },
  { clave: "post_vacacional", nombre: "Post vacacional al regreso de vacaciones", detalle: "En la campana" },
] as const;
export type AvisoEmpresa = (typeof AVISOS_EMPRESA)[number]["clave"];
