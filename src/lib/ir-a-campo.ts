// Datos faltantes en las historias: marcar en rojo (o ámbar) la casilla donde va el dato y llevar a ella.
// Genérico para cualquier formulario: la casilla se encuentra por data-campo, name o id (en ese orden).
// Lo que esté plegado se abre: <details> nativos solos; secciones de React con useAbrirAlIr.

export type Faltante = {
  campo: string; // data-campo, name o id de la casilla
  etiqueta: string; // lo que se lee en el aviso («motivo de consulta»)
  importante?: boolean; // rojo (true, por defecto) o ámbar
  paso?: string; // pestaña de la historia donde está (si la hay)
};

const EVENTO = "zamorapp:ir-a-campo";
const ENFOCABLE = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])";

const buscar = (campo: string): HTMLElement | null => {
  const c = CSS.escape(campo);
  return document.querySelector<HTMLElement>(`[data-campo="${c}"]`) ?? document.querySelector<HTMLElement>(`[name="${c}"]`) ?? document.getElementById(campo);
};

// Casilla vacía: rojo si el dato es importante, ámbar si no; aria-invalid para el lector de pantalla
export const marcaFalta = (falta: boolean, importante = true) =>
  falta ? ({ "data-falta": importante ? "rojo" : "ambar", "aria-invalid": true } as const) : {};

// Lleva a la casilla: espera a que la pestaña la muestre, abre lo plegado, desplaza, enfoca y la hace parpadear
export function irACampo(campo: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: campo }));
  let intentos = 0;
  const intentar = () => {
    const el = buscar(campo);
    // La pestaña o la sección pueden tardar un instante en mostrarla (hasta ~1,5 s)
    if (!el || (!el.closest("details:not([open])") && el.getClientRects().length === 0)) {
      if (intentos++ < 30) setTimeout(intentar, 50);
      return;
    }
    for (let p = el.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement && !p.open) p.open = true;
    requestAnimationFrame(() => {
      const foco = el.matches(ENFOCABLE) ? el : el.querySelector<HTMLElement>(ENFOCABLE) ?? el;
      const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "center" });
      foco.focus({ preventScroll: true });
      el.classList.remove("campo-senalado");
      void el.offsetWidth; // reinicia el parpadeo si se toca dos veces
      el.classList.add("campo-senalado");
      setTimeout(() => el.classList.remove("campo-senalado"), 2000);
    });
  };
  intentar();
}

// Para secciones plegadas con estado de React (no <details>): se abren cuando piden ir a uno de sus campos
export function escucharIrACampo(alPedir: (campo: string) => void) {
  const f = (e: Event) => alPedir((e as CustomEvent<string>).detail);
  window.addEventListener(EVENTO, f);
  return () => window.removeEventListener(EVENTO, f);
}
