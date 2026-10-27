import {
  BookOpen,
  Building2,
  CalendarClock,
  FileText,
  HardHat,
  Inbox,
  LayoutDashboard,
  Receipt,
  Send,
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

// Áreas de la barra lateral del servicio médico (especificación, sección 13)
export const SECCIONES: Seccion[] = [
  { href: "/panel", titulo: "Inicio", icono: LayoutDashboard, descripcion: "Alertas, agenda y cumplimiento" },
  { href: "/pacientes", titulo: "Pacientes", icono: Users, descripcion: "Expediente único del trabajador, importación desde Excel" },
  { href: "/atencion", titulo: "Atención médica", icono: Stethoscope, descripcion: "Cola, consultas, aptitud, reposos y récipes", clinico: true },
  { href: "/accidentes", titulo: "Accidentes", icono: HardHat, descripcion: "Accidentes, incidentes y enfermedades ocupacionales" },
  { href: "/empresas", titulo: "Empresas", icono: Building2, descripcion: "Empresas clientes, sedes, dependencias y puestos" },
  { href: "/reportes", titulo: "Reportes", icono: BarChart3, descripcion: "Atendidos, morbilidad, aptitud, reposos e informe trimestral" },
  { href: "/facturacion", titulo: "Facturación", icono: Receipt, descripcion: "Servicios, pacientes atendidos y notas de cobro" },
  { href: "/envios", titulo: "Envíos", icono: Send, descripcion: "Evaluaciones del día por correo o WhatsApp a la empresa", clinico: true },
  { href: "/solicitudes", titulo: "Solicitudes", icono: Inbox, descripcion: "Lo que piden las empresas: informes, copias y constancias" },
  { href: "/documentos", titulo: "Documentos", icono: FileText, descripcion: "Constancias, reposos e informes emitidos" },
  { href: "/configuracion", titulo: "Configuración", icono: Settings, descripcion: "Usuarios, roles y listas configurables" },
  { href: "/ayuda", titulo: "Manual de uso", icono: BookOpen, descripcion: "Cómo usar cada función" },
];

// Portal de empresas (RR. HH. y gerentes de la empresa cliente)
export const SECCIONES_EMPRESA: Seccion[] = [
  { href: "/portal", titulo: "Inicio", icono: CalendarClock, descripcion: "Citas, evaluaciones y avisos" },
  { href: "/pacientes", titulo: "Trabajadores", icono: Users, descripcion: "Nómina y aptitud vigente" },
  { href: "/accidentes", titulo: "Accidentes", icono: HardHat, descripcion: "Reporte de accidentes e incidentes" },
  { href: "/ayuda", titulo: "Manual de uso", icono: BookOpen, descripcion: "Cómo usar el portal" },
];

// Rutas que puede abrir un usuario de empresa
export const RUTAS_EMPRESA = ["/portal", "/pacientes", "/accidentes", "/ayuda"];
