import {
  BookOpen,
  Building2,
  CalendarClock,
  FileText,
  HeartPulse,
  HardHat,
  Inbox,
  LayoutDashboard,
  Receipt,
  Send,
  type LucideIcon,
  BarChart3,
  Settings,
  ShieldAlert,
  ClipboardCheck,
  Stethoscope,
  Users,
} from "lucide-react";

export type Seccion = {
  href: string;
  titulo: string;
  icono: LucideIcon;
  descripcion: string;
  clinico?: boolean; // solo personal de salud
  incluye?: string[]; // otras rutas que quedan marcadas en el menú con esta sección
};

// Áreas de la barra lateral del servicio médico (especificación, sección 13)
export const SECCIONES: Seccion[] = [
  { href: "/panel", titulo: "Inicio", icono: LayoutDashboard, descripcion: "Alertas, agenda y cumplimiento" },
  { href: "/pacientes", titulo: "Pacientes", icono: Users, descripcion: "Expediente único del trabajador, importación desde Excel" },
  { href: "/atencion", titulo: "Atención médica", icono: Stethoscope, descripcion: "Cola, consultas, aptitud, reposos y récipes", clinico: true },
  { href: "/enfermeria", titulo: "Enfermería", icono: HeartPulse, descripcion: "Tensión, tratamientos, procedimientos, curas e inspecciones de enfermería", clinico: true },
  { href: "/accidentes", titulo: "Accidentes", icono: HardHat, descripcion: "Accidentes, incidentes y enfermedades ocupacionales" },
  { href: "/inspeccion", titulo: "Cumplimiento INPSASEL", icono: ClipboardCheck, descripcion: "Lo que revisa el inspector, medido con tus registros, y el paquete para imprimir" },
  // Ergonomía, psicosocial, identificación de riesgos con mapa y puestos de trabajo en una sola entrada (Cesar, 06-nov)
  { href: "/evaluaciones", titulo: "Evaluaciones de riesgos", icono: ShieldAlert, descripcion: "Identificación de riesgos y mapa de riesgos, ergonomía, psicosocial y puestos de trabajo", incluye: ["/riesgos", "/ergonomia", "/psicosocial"] },
  { href: "/empresas", titulo: "Empresas", icono: Building2, descripcion: "Empresas clientes, sedes, dependencias y puestos" },
  { href: "/reportes", titulo: "Reportes", icono: BarChart3, descripcion: "Atendidos, morbilidad, aptitud, reposos e informe trimestral" },
  { href: "/facturacion", titulo: "Facturación", icono: Receipt, descripcion: "Servicios, pacientes atendidos y notas de cobro" },
  { href: "/envios", titulo: "Envíos", icono: Send, descripcion: "Evaluaciones del día por correo o WhatsApp a la empresa", clinico: true },
  { href: "/solicitudes", titulo: "Solicitudes", icono: Inbox, descripcion: "Lo que piden las empresas: informes, copias y constancias" },
  { href: "/documentos", titulo: "Documentos", icono: FileText, descripcion: "Constancias, reposos e informes emitidos" },
  { href: "/configuracion", titulo: "Configuración", icono: Settings, descripcion: "Usuarios, roles y listas configurables" },
  { href: "/ayuda", titulo: "Manual de uso", icono: BookOpen, descripcion: "Cómo usar cada función" },
];

// Grupos de la barra lateral (en este orden). Una sección nueva que no esté en ninguna lista cae en «Gestión».
export type Grupo = { titulo: string; hrefs: string[] };
export const GRUPOS: Grupo[] = [
  { titulo: "Día a día", hrefs: ["/panel", "/pacientes", "/atencion", "/enfermeria", "/envios", "/solicitudes"] },
  { titulo: "Gestión", hrefs: ["/empresas", "/accidentes", "/evaluaciones", "/inspeccion", "/reportes", "/documentos", "/facturacion"] },
  { titulo: "Ajustes", hrefs: ["/configuracion", "/ayuda"] },
];

export function seccionesPorGrupo(secciones: Seccion[]): { titulo: string; secciones: Seccion[] }[] {
  const ubicadas = new Set(GRUPOS.flatMap((g) => g.hrefs));
  return GRUPOS.map((g) => ({
    titulo: g.titulo,
    secciones: [
      ...g.hrefs.map((h) => secciones.find((s) => s.href === h)).filter((s): s is Seccion => Boolean(s)),
      ...(g.titulo === "Gestión" ? secciones.filter((s) => !ubicadas.has(s.href)) : []),
    ],
  })).filter((g) => g.secciones.length > 0);
}

// Portal de empresas (RR. HH. y gerentes de la empresa cliente)
export const SECCIONES_EMPRESA: Seccion[] = [
  { href: "/portal", titulo: "Inicio", icono: CalendarClock, descripcion: "Citas, evaluaciones y avisos" },
  { href: "/pacientes", titulo: "Trabajadores", icono: Users, descripcion: "Nómina y aptitud vigente" },
  { href: "/accidentes", titulo: "Accidentes", icono: HardHat, descripcion: "Reporte de accidentes e incidentes" },
  { href: "/ayuda", titulo: "Manual de uso", icono: BookOpen, descripcion: "Cómo usar el portal" },
];

// Rutas que puede abrir un usuario de empresa
export const RUTAS_EMPRESA = ["/portal", "/pacientes", "/accidentes", "/ayuda", "/menu"];
