import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building, Laptop, ListChecks, ShieldCheck, UserCog, Users, Wand2 } from "lucide-react";
import { obtenerSesion } from "@/lib/sesion";

export const metadata: Metadata = { title: "Configuración" };

const OPCIONES = [
  { href: "/configuracion/listas", titulo: "Listas configurables", texto: "Motivos, aptitud, paraclínicos, medicinas, recomendaciones y todos los maestros.", icono: ListChecks },
  { href: "/configuracion/plantillas", titulo: "Plantillas de examen", texto: "Qué se precarga en pre-empleo, periódico, egreso o reintegro: examen, recomendaciones y vigencia.", icono: Wand2 },
  { href: "/configuracion/organizacion", titulo: "Organización y documentos", texto: "Datos del servicio, palabra de aptitud, títulos y notas de los documentos.", icono: Building },
  { href: "/configuracion/usuarios", titulo: "Usuarios y roles", texto: "Quién entra a la app y qué puede ver o hacer.", icono: Users },
  { href: "/configuracion/auditoria", titulo: "Auditoría", texto: "Quién abrió cada historia y qué se cambió, día por día y con el equipo de origen.", icono: ShieldCheck },
  { href: "/configuracion/equipos", titulo: "Equipos", texto: "PC con zamorApp instalado: última sincronía, revocar o reactivar.", icono: Laptop },
  { href: "/configuracion/perfil", titulo: "Mi perfil profesional", texto: "Cédula, MPPS, Colegio de Médicos y registro INPSASEL para los documentos.", icono: UserCog },
];

export default async function Configuracion() {
  const sesion = await obtenerSesion();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Configuración</h1>
        <p className="text-muted-foreground">Todo se ajusta desde aquí, sin tocar código. {sesion.demo && "En modo demo no se guardan cambios."}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {OPCIONES.map(({ href, titulo, texto, icono: Icono }) => (
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
    </div>
  );
}
