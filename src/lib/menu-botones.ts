import type { LucideIcon } from "lucide-react";
import { ATAJOS, visibleAtajo } from "@/lib/atajos";
import { SECCIONES, SECCIONES_EMPRESA, type Seccion } from "@/lib/navegacion";

// Vista de botones (/menu): las mismas secciones del menú lateral, clasificadas por categoría, cada una con sus
// atajos más usados. Los permisos son los del buscador (lib/atajos): cada rol ve solo lo suyo y el portal de
// empresas solo sus cuatro secciones. Una sección nueva que no esté en ninguna categoría cae en «Gestión y empresas».

export type Categoria = { clave: string; titulo: string; descripcion: string; color: string; hrefs: string[] };

// color = token de gráficos (globals.css), probado en claro y oscuro; nunca el rojo de alerta
export const CATEGORIAS: Categoria[] = [
  { clave: "dia", titulo: "Atención del día", descripcion: "Pacientes, consultas, envíos y lo que piden las empresas", color: "var(--chart-1)", hrefs: ["/panel", "/portal", "/pacientes", "/atencion", "/envios", "/solicitudes"] },
  { clave: "sst", titulo: "Seguridad y salud en el trabajo", descripcion: "Riesgos, accidentes y cumplimiento legal", color: "var(--chart-2)", hrefs: ["/evaluaciones", "/ergonomia", "/psicosocial", "/accidentes", "/inspeccion"] },
  { clave: "gestion", titulo: "Gestión y empresas", descripcion: "Clientes, reportes, documentos y cobros", color: "var(--chart-4)", hrefs: ["/empresas", "/reportes", "/documentos", "/facturacion"] },
  { clave: "ajustes", titulo: "Ajustes y ayuda", descripcion: "Configuración, respaldos y manual", color: "var(--chart-3)", hrefs: ["/configuracion", "/ayuda", "/conflictos"] },
];

export type Atajito = { href: string; titulo: string };
export type Boton = { href: string; titulo: string; descripcion: string; icono: LucideIcon; atajos: Atajito[]; mas: number };
export type GrupoBotones = Omit<Categoria, "hrefs"> & { botones: Boton[] };

type Opciones = { portal?: boolean; clinico?: boolean; rol?: string | null };

const ruta = (href: string) => href.split(/[?#]/)[0];
const MAX_ATAJOS = 4;

export function gruposDeBotones(o: Opciones, extras: Seccion[] = []): GrupoBotones[] {
  const secciones = [...(o.portal ? SECCIONES_EMPRESA : SECCIONES).filter((s) => visibleAtajo(s, o)), ...extras];
  const atajos = o.portal ? [] : ATAJOS.filter((a) => visibleAtajo(a, o));
  const boton = (s: Seccion): Boton => {
    const propias = [s.href, ...((s as Seccion & { incluye?: string[] }).incluye ?? [])];
    const vistos = new Set<string>();
    const lista = atajos.filter((a) => {
      const r = ruta(a.href);
      if (!propias.some((p) => r === p || r.startsWith(p + "/")) || a.titulo === s.titulo || vistos.has(a.titulo)) return false;
      vistos.add(a.titulo);
      return true;
    });
    return { href: s.href, titulo: s.titulo, descripcion: s.descripcion, icono: s.icono, atajos: lista.slice(0, MAX_ATAJOS).map(({ href, titulo }) => ({ href, titulo })), mas: Math.max(0, lista.length - MAX_ATAJOS) };
  };
  const ubicadas = new Set(CATEGORIAS.flatMap((c) => c.hrefs));
  return CATEGORIAS.map(({ hrefs, ...c }) => ({
    ...c,
    botones: [
      ...hrefs.map((h) => secciones.find((s) => s.href === h)).filter((s): s is Seccion => Boolean(s)),
      ...(c.clave === "gestion" ? secciones.filter((s) => !ubicadas.has(s.href)) : []),
    ].map(boton),
  })).filter((g) => g.botones.length > 0);
}
