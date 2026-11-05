"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { type Cambios, MAX_C, escribirCambios, leerCambios } from "@/lib/cambios-hoja";

// Guarda un cambio en la URL (?c=): la hoja impresa, el PDF y el envío al trabajador salen con lo que el médico ajustó
function useGuardarCambio() {
  const router = useRouter();
  const ruta = usePathname();
  return (id: string, valor: string | string[]) => {
    // Se lee la URL del momento (otra lista pudo cambiarla recién)
    const q = new URLSearchParams(window.location.search);
    const cambios: Cambios = { ...leerCambios(q.get("c")), [id]: valor };
    const c = escribirCambios(cambios);
    if (c && c.length > MAX_C) {
      void confirmar({ titulo: "El último cambio no se guardó", texto: "Son demasiados cambios para esta hoja. Escríbalo en «Indicaciones del médico» o quite otros cambios.", accion: "Entendido", cancelar: "Cerrar" });
      return;
    }
    if (c) q.set("c", c);
    else q.delete("c");
    router.replace(`${ruta}?${q}`, { scroll: false });
  };
}

// Las señales de urgencia («Urgencia: …», «Acudir de inmediato…») se leen de un vistazo: en rojo, negrita y con «!»
const esUrgencia = (texto: string) => /^(urgencia\b|acudir de inmediato)/i.test(texto.trim());

const vacio = "outline-none focus:bg-amber-50 empty:before:text-[#9aa7a4] empty:before:content-['Escriba_aquí…'] print:empty:before:content-none";

// Texto suelto de la hoja que el médico puede cambiar tocándolo
export function TextoEditable({ id, valor, className = "", bloque }: { id: string; valor: string; className?: string; bloque?: boolean }) {
  const guardar = useGuardarCambio();
  const props = {
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: false,
    className: `${vacio} ${className}`,
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const nuevo = e.currentTarget.innerText.trim();
      if (nuevo !== valor) guardar(id, nuevo);
    },
  };
  return bloque ? <p key={valor} {...props}>{valor}</p> : <span key={valor} {...props}>{valor}</span>;
}

// Lista que el médico ajusta antes de imprimir: cambia un renglón (tocándolo), lo quita con la ✕ o agrega uno nuevo.
// Los botones no salen en el papel.
export function ListaEditable({ id, items, className = "", columnas }: { id: string; items: string[]; className?: string; columnas?: boolean }) {
  const guardar = useGuardarCambio();
  const [lista, setLista] = useState(() => items.map((texto, i) => ({ n: i, texto })));
  const [siguiente, setSiguiente] = useState(items.length);
  const cambiar = (nueva: typeof lista) => {
    setLista(nueva);
    // Los renglones vacíos no se guardan
    guardar(id, nueva.map((x) => x.texto.trim()).filter(Boolean));
  };
  const agregar = () => {
    setLista((l) => [...l, { n: siguiente, texto: "" }]);
    setSiguiente((n) => n + 1);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-lista="${id}"] [data-renglon="${siguiente}"]`)?.focus());
  };
  return (
    <div data-lista={id}>
      <ul className={`${columnas ? "columns-2 gap-5" : "space-y-0.5"} ${className}`}>
        {lista.map((x) => (
          <li key={x.n} className={`group relative mb-0.5 break-inside-avoid pl-2.5 pr-4 -indent-2.5 print:pr-0 ${esUrgencia(x.texto) ? "font-bold text-[#b42318]" : ""}`}>
            {esUrgencia(x.texto) ? "!" : "•"}{" "}
            {/* key con el texto: al guardarse se vuelve a montar limpio (React no pelea con lo que el navegador editó) */}
            <span
              key={x.texto}
              data-renglon={x.n}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              className={vacio}
              onBlur={(e) => {
                const nuevo = e.currentTarget.innerText.trim();
                if (nuevo !== x.texto) cambiar(lista.map((y) => (y.n === x.n ? { ...y, texto: nuevo } : y)));
              }}
            >
              {x.texto}
            </span>
            <button
              type="button"
              onClick={() => cambiar(lista.filter((y) => y.n !== x.n))}
              aria-label="Quitar este renglón"
              title="Quitar este renglón"
              className="absolute top-0 right-0 indent-0 text-[#b42318] opacity-40 transition hover:opacity-100 group-hover:opacity-100 print:hidden"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={agregar} className="mt-0.5 inline-flex items-center gap-1 rounded border border-dashed border-doc-linea px-1.5 text-[10px] text-doc-tenue hover:border-doc-acento hover:text-doc-acento print:hidden">
        <Plus className="size-3" /> Agregar
      </button>
    </div>
  );
}
