import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, CalendarCog, Trash2, Building, DatabaseBackup, Fingerprint, FolderInput, Laptop, ListChecks, ShieldCheck, UserCog, Users, Wand2 } from "lucide-react";
import { obtenerSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Configuración" };

const ESCRITORIO = process.env.NEXT_PUBLIC_ESCRITORIO === "1";

type Opcion = { href: string; titulo: string; texto: string; icono: typeof Wand2 };

// Agrupadas por lo que el operador quiere hacer, para no ver todo junto
const GRUPOS: { titulo: string; texto: string; opciones: Opcion[] }[] = [
  {
    titulo: "Atención clínica",
    texto: "Lo que se precarga y se ofrece en cada consulta.",
    opciones: [
      { href: "/configuracion/clinica", titulo: "Ajustes clínicos", texto: "Asistente en 3 pasos: elige la empresa, la evaluación y qué paraclínicos, examen y recomendaciones se precargan.", icono: Wand2 },
      { href: "/configuracion/horario", titulo: "Disponibilidad para citas", texto: "Horario semanal con cupos y días u horas bloqueadas: RR. HH. solo pide en horas libres.", icono: CalendarCog },
      { href: "/configuracion/listas", titulo: "Listas configurables", texto: "Motivos, aptitud, paraclínicos, medicinas, recomendaciones y todos los maestros.", icono: ListChecks },
    ],
  },
  {
    titulo: "Organización y documentos",
    texto: "Los datos que salen impresos y quién firma.",
    opciones: [
      { href: "/configuracion/organizacion", titulo: "Organización y documentos", texto: "Datos del servicio, palabra de aptitud, títulos y notas de los documentos.", icono: Building },
      { href: "/configuracion/perfil", titulo: "Mi perfil profesional", texto: "Cédula, MPPS, Colegio de Médicos y registro INPSASEL para los documentos.", icono: UserCog },
    ],
  },
  {
    titulo: "Acceso y seguridad",
    texto: "Quién entra, cómo entra y qué hizo.",
    opciones: [
      { href: "/configuracion/ingreso", titulo: "Ingreso y seguridad", texto: ESCRITORIO ? "Entrar con Windows Hello (huella, rostro o PIN) sin escribir la clave, también sin internet." : "Entrar con huella, verificación en dos pasos y códigos de respaldo.", icono: Fingerprint },
      { href: "/configuracion/usuarios", titulo: "Usuarios y roles", texto: "Quién entra a la app y qué puede ver o hacer.", icono: Users },
      { href: "/configuracion/auditoria", titulo: "Auditoría", texto: "Quién abrió cada historia y qué se cambió, día por día y con el equipo de origen.", icono: ShieldCheck },
    ],
  },
  {
    titulo: "Equipos y respaldos",
    texto: "Las PC con zamorApp y las copias de seguridad.",
    opciones: [
      { href: "/configuracion/respaldo", titulo: "Respaldos", texto: "«Respaldar ahora», la carpeta de Google Drive, la clave, restaurar una copia y la copia programada de la nube.", icono: DatabaseBackup },
      { href: "/configuracion/equipos", titulo: "Equipos", texto: "PC con zamorApp instalado: última sincronía, revocar o reactivar.", icono: Laptop },
    ],
  },
];

// Cargos repetidos de todas las empresas: solo el administrador
const CARGOS: Opcion = { href: "/configuracion/cargos", titulo: "Unir cargos", texto: "Junta el mismo cargo escrito de varias formas (mayúsculas, acentos, abreviaturas) en todas las empresas.", icono: Briefcase };

// Consultas y trabajadores eliminados (con Restaurar): solo administrador con acceso clínico
const PAPELERA = { href: "/configuracion/papelera", titulo: "Papelera", texto: "Consultas y trabajadores eliminados por error o duplicados, con el motivo. «Restaurar» los devuelve idénticos.", icono: Trash2 };

// Importación de una sola vez (escaneados del SAME): solo administrador o gerente médico con acceso clínico
const ESCANEADOS: Opcion = { href: "/configuracion/escaneados-same", titulo: "Escaneados del SAME", texto: "Sube a cada historia los exámenes escaneados que tenía el SAME (una sola vez).", icono: FolderInput };

export default async function Configuracion() {
  const sesion = await obtenerSesion();
  const gerencia = sesion.rol === "administrador" || sesion.rol === "gerente_medico";
  const extra = (titulo: string, o: Opcion[]) => o.length ? { [titulo]: o } : {};
  const extras: Record<string, Opcion[]> = {
    ...extra("Atención clínica", gerencia && sesion.clinico ? [ESCANEADOS] : []),
    ...extra("Organización y documentos", sesion.rol === "administrador" ? [CARGOS] : []),
    ...extra("Acceso y seguridad", sesion.rol === "administrador" && sesion.clinico ? [PAPELERA] : []),
  };
  const grupos = GRUPOS.map((g) => ({ ...g, opciones: [...g.opciones, ...(extras[g.titulo] ?? [])] }));
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Configuración</h1>
        <p className="text-muted-foreground">Todo se ajusta desde aquí, sin tocar código. {sesion.demo && "En modo demo no se guardan cambios."}</p>
      </div>
      {grupos.map((g) => (
        <section key={g.titulo} aria-labelledby={`g-${g.titulo}`} className="space-y-3">
          <div>
            <h2 id={`g-${g.titulo}`} className="text-lg font-semibold">{g.titulo}</h2>
            <p className="text-sm text-muted-foreground">{g.texto}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.opciones.map(({ href, titulo, texto, icono: Icono }) => (
              <Link key={href} href={href} className="group flex gap-4 rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:bg-primary/5">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icono className="size-5" />
                </span>
                <div className="flex-1">
                  <div className="font-medium">{titulo}</div>
                  <p className="text-sm text-muted-foreground">{texto}</p>
                </div>
                <ArrowRight className="mt-1 size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
