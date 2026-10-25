import {
  Building2,
  FileText,
  HardHat,
  LayoutDashboard,
  Receipt,
  type LucideIcon,
  BarChart3,
  Settings,
  Stethoscope,
  Users,
} from "lucide-react";

export type Seccion = {
  href: string;
  titulo: string;
  icono: LucideIcon;
  descripcion: string;
  clinico?: boolean; // solo personal de salud
};

// Las 7 áreas de la barra lateral (especificación, sección 13)
export const SECCIONES: Seccion[] = [
  { href: "/panel", titulo: "Inicio", icono: LayoutDashboard, descripcion: "Alertas, agenda y cumplimiento" },
  { href: "/pacientes", titulo: "Pacientes", icono: Users, descripcion: "Expediente único del trabajador, importación desde Excel" },
  { href: "/atencion", titulo: "Atención médica", icono: Stethoscope, descripcion: "Cola, consultas, aptitud, reposos y récipes", clinico: true },
  { href: "/accidentes", titulo: "Accidentes", icono: HardHat, descripcion: "Accidentes, incidentes y enfermedades ocupacionales" },
  { href: "/empresas", titulo: "Empresas", icono: Building2, descripcion: "Empresas clientes, sedes, dependencias y puestos" },
  { href: "/reportes", titulo: "Reportes", icono: BarChart3, descripcion: "Morbilidad, ausentismo e informe trimestral" },
  { href: "/facturacion", titulo: "Facturación", icono: Receipt, descripcion: "Servicios, pacientes atendidos y notas de cobro" },
  { href: "/documentos", titulo: "Documentos", icono: FileText, descripcion: "Constancias, reposos e informes emitidos" },
  { href: "/configuracion", titulo: "Configuración", icono: Settings, descripcion: "Usuarios, roles y listas configurables" },
];
