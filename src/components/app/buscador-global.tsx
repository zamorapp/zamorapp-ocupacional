"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Loader2, Search, Stethoscope, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { iniciarConsulta } from "@/app/(app)/atencion/acciones";
import { SECCIONES, SECCIONES_EMPRESA } from "@/lib/navegacion";
import { cn } from "@/lib/utils";
import { buscarGlobal, type Encontrado } from "./acciones";
import { RegistroRapido } from "./registro-rapido";
import { PasarAEmpresa } from "./pasar-a-empresa";

export const EVENTO_BUSCADOR = "zamorapp:buscar";
export const abrirBuscador = () => window.dispatchEvent(new Event(EVENTO_BUSCADOR));

type Opcion =
  | { tipo: "paciente"; p: Encontrado }
  | { tipo: "ir"; href: string; titulo: string; descripcion: string; icono: (typeof SECCIONES)[number]["icono"] };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Buscador universal: Ctrl+K o "/" desde cualquier pantalla.
// Enter abre la ficha; Ctrl+Enter (o el botón Atender) abre la consulta directamente.
// «Atender» y las secciones clínicas solo aparecen para el personal de salud.
type Props = { portal?: boolean; clinico?: boolean; empresas?: { id: string; nombre: string }[]; empresaActiva?: string | null };

export function BuscadorGlobal({ portal = false, clinico = false, empresas = [], empresaActiva = null }: Props) {
  const router = useRouter();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [pacientes, setPacientes] = useState<Encontrado[]>([]);
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

  const opciones = useMemo<Opcion[]>(() => {
    const q = sinAcentos(texto.trim());
    const secciones = (portal ? SECCIONES_EMPRESA : SECCIONES)
      .filter((s) => clinico || !s.clinico)
      .filter((s) => !q || sinAcentos(`${s.titulo} ${s.descripcion}`).includes(q))
      .map((s) => ({ tipo: "ir" as const, href: s.href, titulo: s.titulo, descripcion: s.descripcion, icono: s.icono }));
    return [...pacientes.map((p) => ({ tipo: "paciente" as const, p })), ...secciones];
  }, [pacientes, texto, portal, clinico]);

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
        else setError(r.mensaje);
      } else cerrar();
    });
  const elegir = (o: Opcion, consulta = false) => {
    if (o.tipo === "ir") return ir(o.href);
    if (consulta && clinico) return atender(o.p);
    ir(`/pacientes/${o.p.id}`);
  };

  const nPacientes = pacientes.length;

  return (
    <Dialog open={abierto} onOpenChange={(a) => (a ? setAbierto(true) : cerrar())}>
      <DialogContent showCloseButton={false} className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <DialogDescription className="sr-only">Busca un trabajador por cédula o nombre, o ve a una sección.</DialogDescription>
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
            placeholder={portal ? "Buscar trabajador o sección…" : "Cédula, nombre o sección…"}
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
            <li key={o.tipo === "ir" ? o.href : o.p.id} id={`opcion-${i}`} data-indice={i} role="option" aria-selected={i === activo}>
              {(i === 0 && nPacientes > 0) && <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Trabajadores</p>}
              {i === nPacientes && <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Ir a</p>}
              <div
                onMouseMove={() => setActivo(i)}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5", i === activo && "bg-accent text-accent-foreground")}
              >
                <button type="button" onClick={() => elegir(o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    {o.tipo === "paciente" ? <UserRound className="size-[18px]" /> : <o.icono className="size-[18px]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.tipo === "paciente" ? o.p.nombre : o.titulo}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.tipo === "paciente" ? [o.p.cedula, o.p.empresa, o.p.inactiva && "empresa inactiva"].filter(Boolean).join(" · ") : o.descripcion}
                    </span>
                  </span>
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
                ) : (
                  i === activo && <ArrowRight className="size-4 text-muted-foreground" />
                )}
              </div>
            </li>
          ))}
          {texto.trim().length >= 2 && !buscando && nPacientes === 0 && (
            <li className="space-y-3 px-1 py-3">
              <p className="text-center text-sm text-muted-foreground">
                Ningún trabajador coincide con «{texto.trim()}».{" "}
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
          {clinico && <span className="flex items-center gap-1"><kbd className="rounded border bg-card px-1">Ctrl</kbd>+<CornerDownLeft className="size-3" /> atender</span>}
          <span className="ml-auto">Ctrl+K desde cualquier pantalla</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
