import "server-only";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { fijarDesfase } from "@/lib/fecha";

// Escritorio: el servidor Next corre en la PC con la fecha de Windows. Cada 30 s (con el reloj monótono, que no se
// mueve al cambiar la fecha) pregunta la hora anclada a la puerta y guarda el desfase; ahora() de @/lib/fecha lo suma.
// Sin puerta o sin respuesta se queda el último desfase conocido. En la web no hace nada.
const CADA_MS = 30_000;
let revisadaEn = -Infinity;
let enCurso: Promise<void> | null = null;

export function sincronizarHora(): Promise<void> {
  if (!ESCRITORIO || performance.now() - revisadaEn < CADA_MS) return Promise.resolve();
  enCurso ??= (async () => {
    try {
      // eslint-disable-next-line no-restricted-syntax -- la fecha de Windows es justo lo que se compara
      const antes = Date.now();
      const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/zamorapp/estado`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
      const hora = Date.parse((await r.json())?.hora ?? "");
      // eslint-disable-next-line no-restricted-syntax -- ídem
      if (Number.isFinite(hora)) fijarDesfase(hora - (antes + Date.now()) / 2);
    } catch {
      // sin puerta: queda el último desfase
    } finally {
      revisadaEn = performance.now();
      enCurso = null;
    }
  })();
  return enCurso;
}

// Para la ventana: el desfase que el servidor ya conoce (la ventana corre en la misma PC, con la misma fecha de Windows)
export async function desfaseParaLaVentana(): Promise<number | null> {
  if (!ESCRITORIO) return null;
  await sincronizarHora();
  return (globalThis as typeof globalThis & { __zamorappDesfase?: number }).__zamorappDesfase ?? 0;
}
