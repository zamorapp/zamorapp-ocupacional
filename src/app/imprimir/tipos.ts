// Documentos de una consulta que se imprimen por /imprimir/<tipo>/<consulta> (y en la prueba de impresión)
import { Certificado, Constancia, ConstanciaAtencion, OrdenAtencion, Informe, InformeLibre, InformeTrabajador, Orden, Preoperatoria, Recipe, Referencia, Reposo, Reubicacion } from "./documentos";

export const TIPOS = {
  constancia: { titulo: "Constancia de aptitud", Componente: Constancia },
  reposo: { titulo: "Reposo médico", Componente: Reposo },
  informe: { titulo: "Informe médico", Componente: Informe },
  "informe-trabajador": { titulo: "Informe para el trabajador", Componente: InformeTrabajador },
  preoperatoria: { titulo: "Evaluación preoperatoria", Componente: Preoperatoria },
  recipe: { titulo: "Récipe e indicaciones", Componente: Recipe },
  orden: { titulo: "Orden de exámenes", Componente: Orden },
  certificado: { titulo: "Certificado de salud", Componente: Certificado },
  referencia: { titulo: "Referencia médica", Componente: Referencia },
  reubicacion: { titulo: "Reubicación laboral", Componente: Reubicacion },
  libre: { titulo: "Informe libre", Componente: InformeLibre },
  atencion: { titulo: "Constancia de atención médica", Componente: ConstanciaAtencion },
  oam: { titulo: "Orden de atención médica ocupacional", Componente: OrdenAtencion },
} as const;
