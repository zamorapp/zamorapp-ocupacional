// Novedades del manual («Lo nuevo»): un archivo JSON por novedad en src/lib/novedades/, así dos cambios que se
// publican a la vez nunca chocan en el mismo archivo. Solo se lee en el servidor (página /ayuda y pruebas).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Novedad = { fecha: string; texto: string; tema: string };

const CARPETA = join(process.cwd(), "src", "lib", "novedades");
const NOMBRE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.json$/;

function leer(): Novedad[] {
  const lista: (Novedad & { archivo: string })[] = [];
  for (const archivo of readdirSync(CARPETA)) {
    if (!archivo.endsWith(".json")) continue;
    if (!NOMBRE.test(archivo)) throw new Error(`Novedad con nombre inválido: ${archivo} (AAAA-MM-DD-palabras.json)`);
    const n = JSON.parse(readFileSync(join(CARPETA, archivo), "utf8")) as Partial<Novedad>;
    if (typeof n.fecha !== "string" || typeof n.texto !== "string" || typeof n.tema !== "string" || !archivo.startsWith(n.fecha))
      throw new Error(`Novedad incompleta o con fecha distinta al nombre: ${archivo}`);
    lista.push({ fecha: n.fecha, texto: n.texto, tema: n.tema, archivo });
  }
  // La más reciente arriba; el mismo día, en el orden del nombre del archivo
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.archivo.localeCompare(b.archivo));
  return lista.map(({ fecha, texto, tema }) => ({ fecha, texto, tema }));
}

export const NOVEDADES: Novedad[] = leer();
