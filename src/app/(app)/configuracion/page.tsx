import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Briefcase, CalendarCog, Building, ClipboardList, DatabaseBackup, Fingerprint, FolderInput, HeartPulse, Landmark, Laptop, ListChecks, type LucideIcon, ShieldCheck, Sparkles, Tags, Trash2, UserCog, Users, Wand2 } from "lucide-react";
import { obtenerSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Configuración" };

const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";

type Opcion = { href: string; titulo: string; texto: string; icono: LucideIcon };
type Bloque = { titulo: string; texto: string; opciones: Opcion[] };

const INGRESO: Opcion = { href: "/configuracion/ingreso", titulo: "Ingreso y seguridad", texto: ESCRITORIO ? "Entrar con Windows Hello (huella, rostro o PIN) sin escribir la clave, también sin internet." : "Entrar con huella, verificación en dos pasos y códigos de respaldo.", icono: Fingerprint };

// Agrupadas por tarea: lo de la consulta primero; lo que casi no se toca, al final
const BLOQUES: Bloque[] = [
  {
    titulo: "Consulta",
    texto: "Lo que aparece listo al atender",
    opciones: [
      { href: "/configuracion/clinica", titulo: "Ajustes clínicos", texto: "Asistente en 3 pasos: elige la empresa, la evaluación y qué paraclínicos, examen y recomendaciones se precargan.", icono: Wand2 },
      { href: "/configuracion/plantillas", titulo: "Plantillas de examen", texto: "Por motivo de consulta: examen normal, recomendaciones, vigencia y la aptitud del botón «Perfil normal».", icono: ClipboardList },
      { href: "/configuracion/listas", titulo: "Listas configurables", texto: "Motivos, aptitud, paraclínicos, medicinas, recomendaciones y todos los maestros.", icono: ListChecks },
      { href: "/configuracion/horario", titulo: "Disponibilidad para citas", texto: "Horario semanal con cupos y días u horas bloqueadas: RR. HH. solo pide en horas libres.", icono: CalendarCog },
    ],
  },
  {
    titulo: "Cobros",
    texto: "Precios y cambio del día",
    opciones: [
      { href: "/facturacion?vista=servicios", titulo: "Servicios y precios", texto: "Lo que cobras por cada servicio, en dólares; los presupuestos y las notas lo toman de aquí.", icono: Tags },
      { href: "/facturacion", titulo: "Tasa BCV", texto: "La tasa del día para mostrar los montos en bolívares. Se cambia arriba en Facturación.", icono: Landmark },
    ],
  },
  {
    titulo: "Documentos",
    texto: "Lo que sale impreso o por correo",
    opciones: [
      { href: "/configuracion/organizacion", titulo: "Organización y documentos", texto: "Datos del servicio, palabra de aptitud, títulos y notas de los documentos.", icono: Building },
      { href: "/configuracion/perfil", titulo: "Mi perfil profesional", texto: "Cédula, MPPS, Colegio de Médicos y registro INPSASEL para los documentos.", icono: UserCog },
    ],
  },
  {
    titulo: "Seguridad y equipos",
    texto: "Quién entra, desde dónde y las copias",
    opciones: [
      INGRESO,
      { href: "/configuracion/usuarios", titulo: "Usuarios y roles", texto: "Quién entra a la app y qué puede ver o hacer.", icono: Users },
      { href: "/configuracion/auditoria", titulo: "Auditoría", texto: "Quién abrió cada historia y qué se cambió, día por día y con el equipo de origen.", icono: ShieldCheck },
      { href: "/configuracion/equipos", titulo: "Equipos", texto: "PC con zamorApp instalado: última sincronía, revocar o reactivar.", icono: Laptop },
      { href: "/configuracion/respaldo", titulo: "Respaldos", texto: "«Respaldar ahora», la carpeta de Google Drive, la clave, restaurar una copia y la copia programada de la nube.", icono: DatabaseBackup },
    ],
  },
];

// Puerta para agentes (Claude, ChatGPT, Gemini…): solo el administrador
const AGENTES: Opcion = { href: "/configuracion/agentes", titulo: "Puerta para agentes", texto: "Deja que Claude u otro agente cree empresas, presupuestos, trabajadores y citas por ti. Tú la enciendes con una llave, la apagas con un clic y ves todo lo que hizo.", icono: Bot };

// Cargos repetidos de todas las empresas: solo el administrador
const CARGOS: Opcion = { href: "/configuracion/cargos", titulo: "Unir cargos", texto: "Junta el mismo cargo escrito de varias formas (mayúsculas, acentos, abreviaturas) en todas las empresas.", icono: Briefcase };

// Importación de una sola vez (escaneados del SAME): solo administrador o gerente médico con acceso clínico
const ESCANEADOS: Opcion = { href: "/configuracion/escaneados-same", titulo: "Escaneados del SAME", texto: "Sube a cada historia los exámenes escaneados que tenía el SAME (una sola vez).", icono: FolderInput };

// Papelera de consultas y trabajadores: solo administrador con acceso clínico
const LIMPIEZA: Opcion = { href: "/configuracion/limpieza", titulo: "Limpieza", texto: "Lo temporal (PDF de enlaces vencidos, avisos leídos, enlaces sin llenar…) se borra solo cada madrugada. Plazos, espacio usado y «Limpiar ahora».", icono: Sparkles };
const ENFERMERIA: Opcion = { href: "/configuracion/enfermeria", titulo: "Enfermería", texto: "Unir su morbilidad con la del médico y llevar sus indicadores a la vigilancia.", icono: HeartPulse };
const PAPELERA: Opcion = { href: "/configuracion/papelera", titulo: "Papelera", texto: "Consultas y trabajadores eliminados por error o duplicados, con el motivo. «Restaurar» los devuelve idénticos.", icono: Trash2 };

export default async function Configuracion() {
  const sesion = await obtenerSesion();
  const gerencia = sesion.rol === "administrador" || sesion.rol === "gerente_medico";
  const mantenimiento = [...(sesion.rol === "administrador" ? [CARGOS] : []), ...(sesion.rol === "administrador" ? [LIMPIEZA] : []), ...(sesion.rol === "administrador" && sesion.clinico ? [PAPELERA] : []), ...(gerencia && sesion.clinico ? [ESCANEADOS] : [])];
  const bloques: Bloque[] = [...BLOQUES.map((b, i) => (i === 0 && gerencia ? { ...b, opciones: [...b.opciones, ENFERMERIA] } : i === 3 && sesion.rol === "administrador" ? { ...b, opciones: [...b.opciones, AGENTES] } : b)), ...(mantenimiento.length ? [{ titulo: "Mantenimiento", texto: "Limpieza, papelera y arreglos, solo para la gerencia", opciones: mantenimiento }] : [])];
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Configuración</h1>
        <p className="text-muted-foreground">Todo se ajusta desde aquí, sin tocar código. {sesion.demo && "En modo demo no se guardan cambios."}</p>
      </div>
      {bloques.map((b) => (
        <section key={b.titulo} aria-labelledby={`bloque-${b.titulo}`} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 border-b pb-1.5">
            <h2 id={`bloque-${b.titulo}`} className="text-sm font-semibold uppercase tracking-[.08em] text-foreground/80">{b.titulo}</h2>
            <p className="text-sm text-muted-foreground">{b.texto}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {b.opciones.map(({ href, titulo, texto, icono: Icono }) => (
              <Link key={href + titulo} href={href} className="group flex gap-4 rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:bg-primary/5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icono className="size-5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium">{titulo}</div>
                  <p className="text-sm text-muted-foreground">{texto}</p>
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
