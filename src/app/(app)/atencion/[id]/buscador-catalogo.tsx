"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { History, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// Una opción del buscador. «grupo» decide el título bajo el que sale (Mis diagnósticos, Más usados, CIE-10…)
export type Opcion = { clave: string; codigo: string; nombre: string; detalle?: string; grupo: string; usos?: number };

type Props = {
  valor: string;
  codigo?: string;
  conCodigo?: boolean;
  placeholder: string;
  grupos: string[];
  // Puede ser instantáneo (medicinas, en memoria) o ir a la base (diagnósticos): igual funciona sin internet en el escritorio
  buscar: (texto: string) => Promise<Opcion[]> | Opcion[];
  onEscribir: (texto: string) => void;
  onElegir: (o: Opcion) => void;
  // Fila fija al final: «Agregar "…" a mis diagnósticos». Devuelve el mensaje de error, si lo hay
  agregarA: string;
  onAgregar: (nombre: string, codigo: string) => Promise<string | null>;
  // Diagnósticos: al agregar se propone el código CIE-10 más cercano, o «Sin código»
  proponerCodigo?: boolean;
  autoFocus?: boolean;
  className?: string;
};

const POR_GRUPO = 8;

// Sin acentos y en minúsculas, letra por letra: así se resalta en el texto original
const plano = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export const palabrasDe = (texto: string) => plano(texto).split(/\s+/).filter(Boolean);

export function coincide(texto: string, palabras: string[]) {
  const t = plano(texto);
  return palabras.every((p) => t.includes(p));
}

// Primero las que empiezan con lo escrito (al inicio de una palabra), después las que solo lo contienen
function puntaje(texto: string, palabras: string[]) {
  const t = plano(texto);
  return palabras.every((p) => t.startsWith(p) || t.includes(" " + p) || t.includes("(" + p)) ? 0 : 1;
}

function Resaltado({ texto, palabras }: { texto: string; palabras: string[] }) {
  const letras = [...texto];
  const planas = letras.map((l) => plano(l));
  const unido = planas.join("");
  // Posición en el texto plano → letra original
  const origen: number[] = [];
  planas.forEach((p, i) => { for (let k = 0; k < p.length; k++) origen.push(i); });
  const marca = new Array(letras.length).fill(false);
  for (const p of palabras) {
    let desde = unido.indexOf(p);
    while (desde >= 0) {
      for (let k = desde; k < desde + p.length; k++) marca[origen[k]] = true;
      desde = unido.indexOf(p, desde + p.length);
    }
  }
  const partes: ReactNode[] = [];
  let i = 0;
  while (i < letras.length) {
    let j = i;
    while (j < letras.length && marca[j] === marca[i]) j++;
    const trozo = letras.slice(i, j).join("");
    partes.push(marca[i] ? <mark key={i} className="rounded-sm bg-primary/15 text-inherit">{trozo}</mark> : trozo);
    i = j;
  }
  return <>{partes}</>;
}

type Fila = { tipo: "opcion"; o: Opcion } | { tipo: "mas"; grupo: string; resto: number } | { tipo: "agregar" };

export function BuscadorCatalogo(props: Props) {
  const { valor, codigo, conCodigo, placeholder, grupos, buscar, onEscribir, onElegir, agregarA, onAgregar, proponerCodigo, autoFocus, className } = props;
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [resultados, setResultados] = useState<Opcion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [activo, setActivo] = useState(0);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [nuevo, setNuevo] = useState<{ nombre: string; codigo: string; error?: string; guardando?: boolean } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const navego = useRef(false);
  // La función de búsqueda puede cambiar en cada dibujo: se lee de aquí para no reiniciar la búsqueda
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;
  const [cercanosNuevo, setCercanosNuevo] = useState<Opcion[]>([]);
  const palabras = useMemo(() => palabrasDe(valor), [valor]);

  useEffect(() => {
    if (!abierto || valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    let vigente = true;
    setBuscando(true);
    // 150 ms: no busca en cada letra; mientras tanto la lista anterior queda atenuada
    const t = setTimeout(async () => {
      const r = await buscarRef.current(valor);
      if (!vigente) return;
      setResultados(r);
      setActivo(0);
      navego.current = false;
      setAbiertos(new Set());
      setBuscando(false);
    }, 150);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [valor, abierto]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  // Grupos en orden, cada uno ordenado (empieza con → contiene) y con 8 visibles hasta «Ver N más»
  const secciones = useMemo(() => grupos.map((g) => {
    const todas = resultados.filter((o) => o.grupo === g)
      .map((o, i) => ({ o, i, p: puntaje(`${o.nombre} ${o.codigo}`, palabras) }))
      .sort((a, b) => a.p - b.p || a.i - b.i).map((x) => x.o);
    const visibles = abiertos.has(g) ? todas : todas.slice(0, POR_GRUPO);
    return { grupo: g, visibles, resto: todas.length - visibles.length };
  }).filter((s) => s.visibles.length), [grupos, resultados, palabras, abiertos]);

  const filas: Fila[] = useMemo(() => {
    const f: Fila[] = [];
    for (const s of secciones) {
      for (const o of s.visibles) f.push({ tipo: "opcion", o });
      if (s.resto > 0) f.push({ tipo: "mas", grupo: s.grupo, resto: s.resto });
    }
    // Nunca la primera opción: con Enter se elige lo encontrado, no se agrega por error
    if (valor.trim().length >= 2 && !resultados.some((o) => plano(o.nombre) === plano(valor.trim()))) f.push({ tipo: "agregar" });
    return f;
  }, [secciones, valor, resultados]);

  const indiceActivo = Math.min(activo, filas.length - 1);

  useEffect(() => {
    lista.current?.querySelector(`[data-i="${indiceActivo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [indiceActivo]);

  // Ofrece los códigos de los más parecidos; si lo escrito no aparece entero, busca palabra por palabra (la más larga primero)
  const abrirNuevo = async () => {
    setAbierto(false);
    let base = resultados.filter((o) => o.codigo);
    for (const p of palabras.filter((x) => x.length >= 4).sort((x, y) => y.length - x.length)) {
      if (base.length) break;
      base = (await buscarRef.current(p)).filter((o) => o.codigo);
    }
    const unicos = [...new Map(base.map((o) => [o.codigo, o])).values()].slice(0, 6);
    setCercanosNuevo(unicos);
    // Empieza en «Sin código»: el médico elige el código, nunca queda uno puesto sin que lo vea
    setNuevo({ nombre: valor.trim(), codigo: "" });
  };

  const usar = (f: Fila) => {
    if (f.tipo === "opcion") {
      onElegir(f.o);
      setAbierto(false);
    } else if (f.tipo === "mas") {
      setAbiertos((a) => new Set(a).add(f.grupo));
    } else if (proponerCodigo) {
      void abrirNuevo();
    } else {
      void guardarNuevo(valor.trim(), "");
    }
  };

  async function guardarNuevo(nombre: string, cod: string) {
    if (!nombre) return;
    setNuevo((n) => ({ nombre, codigo: cod, ...n, guardando: true, error: undefined }));
    const error = await onAgregar(nombre, cod);
    if (error) setNuevo({ nombre, codigo: cod, error });
    else {
      setNuevo(null);
      setAbierto(false);
    }
  }

  const total = resultados.length;
  const mostrar = abierto && (filas.length > 0 || buscando);

  return (
    <div ref={caja} className={cn("relative", className)}>
      <div className="flex h-9 items-center rounded-md border bg-transparent focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        {conCodigo && (
          <span className={cn("w-20 shrink-0 truncate border-r px-2 font-mono text-sm", codigo ? "text-foreground" : "text-muted-foreground")}>{codigo || "CIE-10"}</span>
        )}
        <input
          role="combobox"
          aria-expanded={mostrar}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={mostrar && filas.length ? `${id}-${indiceActivo}` : undefined}
          value={valor}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onFocus={() => setAbierto(true)}
          onClick={() => setAbierto(true)}
          onChange={(e) => {
            onEscribir(e.target.value);
            setAbierto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") return setAbierto(false);
            if (!filas.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); navego.current = true; setAbierto(true); setActivo(Math.min(indiceActivo + 1, filas.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); navego.current = true; setActivo(Math.max(indiceActivo - 1, 0)); }
            // Enter solo agrega si se llegó a «Agregar» con las flechas: nunca por un Enter apurado
            if (e.key === "Enter" && mostrar && !(filas[indiceActivo].tipo === "agregar" && !navego.current)) {
              e.preventDefault();
              usar(filas[indiceActivo]);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
        />
        {buscando && <Loader2 className="mr-2 size-4 animate-spin text-muted-foreground" aria-hidden />}
      </div>

      {mostrar && (
        <div className={cn("absolute z-30 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg transition-opacity", buscando && "opacity-60")}>
          {total > 0 && <p className="border-b px-3 py-1 text-xs text-muted-foreground">{total >= 40 ? "40 o más" : total} {total === 1 ? "resultado" : "resultados"}</p>}
          <ul ref={lista} id={`${id}-lista`} role="listbox" className="max-h-[60vh] overflow-y-auto py-1 sm:max-h-80">
            {filas.map((f, i) => {
              const nuevoGrupo = f.tipo === "opcion" && (i === 0 || (filas[i - 1].tipo === "opcion" && (filas[i - 1] as { o: Opcion }).o.grupo !== f.o.grupo) || filas[i - 1].tipo === "mas");
              return (
                <li key={f.tipo === "opcion" ? `o${f.o.clave}` : f.tipo === "mas" ? `m${f.grupo}` : "agregar"} role="presentation">
                  {nuevoGrupo && f.tipo === "opcion" && grupos.length > 1 && (
                    <p role="presentation" className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.o.grupo}</p>
                  )}
                  <div
                    id={`${id}-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={i === indiceActivo}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => usar(f)}
                    onMouseEnter={() => setActivo(i)}
                    className={cn("flex cursor-pointer items-start gap-3 px-3 py-1.5 text-sm", i === indiceActivo && "bg-primary/10",
                      f.tipo === "agregar" && "mt-1 border-t pt-2 font-medium text-primary", f.tipo === "mas" && "text-xs text-primary")}
                  >
                    {f.tipo === "opcion" && (
                      <>
                        {conCodigo && <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{f.o.codigo ? <Resaltado texto={f.o.codigo} palabras={palabras} /> : "—"}</span>}
                        <span className="line-clamp-2 min-w-0 flex-1">
                          <Resaltado texto={f.o.nombre} palabras={palabras} />
                          {f.o.detalle && <span className="text-muted-foreground"> · {f.o.detalle}</span>}
                        </span>
                        {!!f.o.usos && f.o.usos > 0 && f.o.usos < 900000 && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-primary" title="Veces usado en el servicio">
                            <History className="size-3" aria-hidden /> {f.o.usos}
                          </span>
                        )}
                      </>
                    )}
                    {f.tipo === "mas" && <span className="pl-1">Ver {f.resto} más</span>}
                    {f.tipo === "agregar" && (
                      <>
                        <Plus className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">Agregar «{valor.trim()}» a {agregarA}</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Agregar en el mismo sitio: nombre y el código CIE-10 más cercano (o sin código; nunca uno inventado) */}
      {nuevo && proponerCodigo && (
        <div className="mt-2 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium">Agregar a {agregarA}</p>
          <input value={nuevo.nombre} maxLength={200} aria-label="Nombre" onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            className="h-9 w-full rounded-md border bg-background px-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          <select value={nuevo.codigo} aria-label="Código CIE-10" onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
            className="h-9 w-full rounded-md border bg-background px-2 outline-none focus:border-primary">
            <option value="">Sin código CIE-10 (puedes elegir uno de los parecidos)</option>
            {cercanosNuevo.map((o) => <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.nombre}</option>)}
          </select>
          {nuevo.error && <p role="alert" className="text-destructive">{nuevo.error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="h-8 rounded-md px-3 text-muted-foreground hover:bg-muted" onClick={() => setNuevo(null)}>Cancelar</button>
            <button type="button" disabled={nuevo.guardando || !nuevo.nombre.trim()}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50"
              onClick={() => guardarNuevo(nuevo.nombre.trim(), nuevo.codigo)}>
              {nuevo.guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} Agregar y usar
            </button>
          </div>
        </div>
      )}
      {nuevo?.error && !proponerCodigo && <p role="alert" className="mt-1 text-xs text-destructive">{nuevo.error}</p>}
    </div>
  );
}
