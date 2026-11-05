"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Building2, CornerDownLeft, History, Loader2, Search, Stethoscope, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { iniciarConsulta } from "@/app/(app)/atencion/acciones";
import { buscarSecciones, normalizar, type Destino } from "@/lib/atajos";
import { cn } from "@/lib/utils";
import { buscarGlobal, ultimosParaBuscador, type Encontrado } from "./acciones";
import type { Atendido } from "@/lib/ultimos-atendidos";
import { RegistroRapido } from "./registro-rapido";
import { PasarAEmpresa } from "./pasar-a-empresa";

export const EVENTO_BUSCADOR = "zamorapp:buscar";
export const abrirBuscador = () => window.dispatchEvent(new Event(EVENTO_BUSCADOR));

type Opcion =
  | { tipo: "paciente"; p: Encontrado }
  | { tipo: "atendido"; a: Atendido }
  | { tipo: "empresa"; e: { id: string; nombre: string } }
  | ({ tipo: "ir" } & Destino);
type Grupo = { titulo: string; opciones: Opcion[] };

// Buscador universal: Ctrl+K o "/" desde cualquier pantalla.
// Enter abre la ficha; Ctrl+Enter (o el botón Atender) abre la consulta directamente.
// «Atender» y las secciones clínicas solo aparecen para el personal de salud.
// También encuentra pantallas, pestañas, configuraciones y funciones (lib/atajos): «precios», «membrete», «nueva cita»…,
// y empresas por su nombre. Sin escribir nada muestra los últimos atendidos de todas las empresas (personal de salud).
type Props = { portal?: boolean; clinico?: boolean; rol?: string | null; empresas?: { id: string; nombre: string }[]; empresaActiva?: string | null };

// Hay texto sin números y alguna pantalla coincide
const seccionesPrimero = (texto: string, nSecciones: number) => nSecciones > 0 && /\p{L}/u.test(texto) && !/\d/.test(texto);

export function BuscadorGlobal({ portal = false, clinico = false, rol = null, empresas = [], empresaActiva = null }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [pacientes, setPacientes] = useState<Encontrado[]>([]);
  const [recientes, setRecientes] = useState<Atendido[]>([]);
  const [activo, setActivo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Trabajador de una empresa inactiva al que se quiso atender: se ofrece pasarlo a una empresa activa
  const [pasando, setPasando] = useState<Encontrado | null>(null);
  const [buscando, iniciarBusqueda] = useTransition();
  const [abriendo, iniciarApertura] = useTransition();
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    const teclas = (e: KeyboardEvent) => {
      const enCampo = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !enCampo)) {
        e.preventDefault();
        setAbierto((a) => !a);
      }
    };
    window.addEventListener(EVENTO_BUSCADOR, abrir);
    window.addEventListener("keydown", teclas);
    return () => {
      window.removeEventListener(EVENTO_BUSCADOR, abrir);
      window.removeEventListener("keydown", teclas);
    };
  }, []);

  // Cada vez que se abre: las últimas consultas al día (lo atendido hace un minuto ya sale)
  useEffect(() => {
    if (!abierto || !clinico || portal) return;
    let vigente = true;
    ultimosParaBuscador().then((r) => vigente && setRecientes(r)).catch(() => {});
    return () => { vigente = false; };
  }, [abierto, clinico, portal]);

  useEffect(() => {
    if (!abierto) return;
    const t = setTimeout(
      () =>
        iniciarBusqueda(async () => {
          try {
            setPacientes(await buscarGlobal(texto));
          } catch {
            setPacientes([]);
          }
        }),
      300,
    );
    return () => clearTimeout(t);
  }, [texto, abierto]);

  const grupos = useMemo<Grupo[]>(() => {
    const q = texto.trim();
    const secciones: Opcion[] = buscarSecciones(texto, { portal, clinico, rol }).map((d) => ({ tipo: "ir" as const, ...d }));
    const trabajadores: Opcion[] = pacientes.map((p) => ({ tipo: "paciente" as const, p }));
    if (!q) {
      // Sin texto: lo último atendido (a un toque) y luego el menú
      return [
        { titulo: "Últimos atendidos · todas las empresas", opciones: recientes.map((a) => ({ tipo: "atendido" as const, a })) },
        { titulo: "Ir a", opciones: secciones },
      ];
    }
    const n = normalizar(q);
    const empresasHalladas: Opcion[] = portal || n.length < 2 ? [] : empresas.filter((e) => normalizar(e.nombre).includes(n)).slice(0, 4).map((e) => ({ tipo: "empresa" as const, e }));
    const pantallas = { titulo: "Pantallas, funciones y configuración", opciones: secciones };
    const personas = { titulo: "Trabajadores", opciones: trabajadores };
    const compania = { titulo: "Empresas", opciones: empresasHalladas };
    // Con palabras («precios», «nueva cita») van primero las pantallas; con cédula, los trabajadores
    return seccionesPrimero(texto, secciones.length) ? [pantallas, compania, personas] : [personas, compania, pantallas];
  }, [pacientes, recientes, texto, portal, clinico, rol, empresas]);
  const visibles = useMemo(() => grupos.filter((g) => g.opciones.length > 0), [grupos]);
  const opciones = useMemo(() => visibles.flatMap((g) => g.opciones), [visibles]);
  // Índice de la primera opción de cada grupo: ahí va su encabezado
  const inicios = new Map<number, string>();
  visibles.reduce((i, g) => (inicios.set(i, g.titulo), i + g.opciones.length), 0);

  useEffect(() => setActivo(0), [opciones.length]);
  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  // Al cambiar de pantalla (por ejemplo, al abrir la consulta) el buscador se cierra solo
  useEffect(() => {
    setAbierto(false);
    setTexto("");
    setError(null);
    setPasando(null);
  }, [ruta]);

  const cerrar = () => {
    setAbierto(false);
    setTexto("");
    setError(null);
    setPasando(null);
  };
  const ir = (href: string) => {
    cerrar();
    router.push(href);
  };
  const atender = (p: Encontrado) =>
    iniciarApertura(async () => {
      setError(null);
      setPasando(null);
      const r = await iniciarConsulta(p.id);
      if (r && !r.ok) {
        if (r.empresaInactiva) setPasando(p);
        // Inactivo: se abre su ficha, donde está «Reingresar»
        else if (r.inactivo) ir(`/pacientes/${p.id}`);
        else setError(r.mensaje);
      } else cerrar();
    });
  const elegir = (o: Opcion, consulta = false) => {
    if (o.tipo === "ir") return ir(o.href);
    if (o.tipo === "atendido") return ir(consulta ? `/pacientes/${o.a.trabajadorId}` : `/atencion/${o.a.id}`);
    if (o.tipo === "empresa") return ir(`/empresas/${o.e.id}`);
    if (consulta && clinico) return atender(o.p);
    ir(`/pacientes/${o.p.id}`);
  };

  const nPacientes = pacientes.length;
  const nSecciones = opciones.length - nPacientes;

  return (
    <Dialog open={abierto} onOpenChange={(a) => (a ? setAbierto(true) : cerrar())}>
      <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <DialogDescription className="sr-only">Busca un trabajador por cédula o nombre, una empresa, o una pantalla, función o configuración por su nombre.</DialogDescription>
        <label className="flex items-center gap-3 border-b px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => Math.min(i + 1, opciones.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && opciones[activo]) { e.preventDefault(); elegir(opciones[activo], e.ctrlKey || e.metaKey); }
            }}
            placeholder={portal ? "Buscar trabajador o sección…" : "Paciente, empresa o función (ej.: nueva cita)…"}
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls="resultados-buscador"
            aria-activedescendant={opciones[activo] ? `opcion-${activo}` : undefined}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {(buscando || abriendo) && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">Esc</kbd>
        </label>
        {error && <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
        {pasando && (
          <div className="border-b p-2">
            <p className="px-1 pb-1.5 text-sm font-medium">{pasando.nombre} · <span className="font-mono text-xs">{pasando.cedula}</span></p>
            <PasarAEmpresa trabajadorId={pasando.id} empresaActual={pasando.empresa} empresas={empresas} alPasar={() => atender({ ...pasando, inactiva: false })} />
          </div>
        )}
        <ul id="resultados-buscador" ref={lista} role="listbox" className="max-h-[60dvh] overflow-y-auto p-2">
          {opciones.map((o, i) => (
            <li key={clave(o)} id={`opcion-${i}`} data-indice={i} role="option" aria-selected={i === activo}>
              {inicios.has(i) && <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">{inicios.get(i)}</p>}
              <div
                onMouseMove={() => setActivo(i)}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5", i === activo && "bg-accent text-accent-foreground")}
              >
                <button type="button" onClick={() => elegir(o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icono o={o} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{titulo(o)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{detalle(o)}</span>
                  </span>
                  {o.tipo === "atendido" && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.a.cuando}</span>}
                </button>
                {o.tipo === "paciente" && clinico ? (
                  <button
                    type="button"
                    onClick={() => atender(o.p)}
                    disabled={abriendo}
                    className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                  >
                    <Stethoscope className="size-3.5" /> Atender
                  </button>
                ) : o.tipo === "atendido" ? (
                  <button
                    type="button"
                    onClick={() => elegir(o, true)}
                    className="rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    Ficha
                  </button>
                ) : (
                  i === activo && <ArrowRight className="size-4 text-muted-foreground" />
                )}
              </div>
            </li>
          ))}
          {texto.trim().length >= 2 && !buscando && nPacientes === 0 && nSecciones === 0 && (
            <li className="space-y-3 px-1 py-3">
              <p className="text-center text-sm text-muted-foreground">
                Ningún trabajador, empresa ni pantalla coincide con «{texto.trim()}».{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => ir(`/pacientes?q=${encodeURIComponent(texto.trim())}`)}>
                  Ver en Pacientes
                </button>
              </p>
              {!portal && (
                <RegistroRapido texto={texto} empresas={empresas} empresaActiva={empresaActiva} clinico={clinico} alListo={(href) => (href ? ir(href) : cerrar())} />
              )}
            </li>
          )}
        </ul>
        <div className="hidden items-center gap-4 border-t bg-muted/50 px-4 py-2 text-[11px] text-muted-foreground sm:flex">
          <span className="flex items-center gap-1"><kbd className="rounded border bg-card px-1">↑</kbd><kbd className="rounded border bg-card px-1">↓</kbd> moverse</span>
          <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> abrir</span>
          {clinico && <span className="flex items-center gap-1"><kbd className="rounded border bg-card px-1">Ctrl</kbd>+<CornerDownLeft className="size-3" /> {texto.trim() ? "atender" : "ficha"}</span>}
          <span className="ml-auto">Ctrl+K desde cualquier pantalla</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const clave = (o: Opcion) =>
  o.tipo === "ir" ? `${o.href}|${o.titulo}` : o.tipo === "paciente" ? o.p.id : o.tipo === "atendido" ? `c-${o.a.id}` : `e-${o.e.id}`;

const titulo = (o: Opcion) => (o.tipo === "paciente" ? o.p.nombre : o.tipo === "atendido" ? o.a.paciente : o.tipo === "empresa" ? o.e.nombre : o.titulo);

function detalle(o: Opcion) {
  if (o.tipo === "paciente") return [o.p.cedula, o.p.empresa, o.p.inactivo && "inactivo", o.p.inactiva && "empresa inactiva"].filter(Boolean).join(" · ");
  if (o.tipo === "atendido") return [o.a.cedula, o.a.empresa, o.a.motivo].filter(Boolean).join(" · ");
  if (o.tipo === "empresa") return "Empresa · ficha, sedes y puestos";
  return o.descripcion;
}

function Icono({ o }: { o: Opcion }) {
  if (o.tipo === "paciente") return <UserRound className="size-[18px]" />;
  if (o.tipo === "atendido") return <History className="size-[18px]" />;
  if (o.tipo === "empresa") return <Building2 className="size-[18px]" />;
  return <o.icono className="size-[18px]" />;
}
