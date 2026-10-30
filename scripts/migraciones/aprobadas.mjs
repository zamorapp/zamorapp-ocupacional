// Lógica pura del aplicador de migraciones (sin red ni base), para poder probarla aparte.
// La fuente aprobada es una etiqueta «migraciones-AAAAMMDD-N» del repo: solo la crea quien escribe en el repo,
// cuando Cesar ya dio el sí. La etiqueta trae supabase/migraciones-aprobadas.json con el SHA-256 de cada archivo.
import crypto from "node:crypto";

export const ETIQUETA = /^migraciones-\d{8}-\d+$/;
export const ARCHIVO = /^\d{14}_[a-z0-9_]+\.sql$/;
export const MANIFIESTO = "supabase/migraciones-aprobadas.json";

// La etiqueta más nueva por fecha y número (no por orden alfabético: -10 va después de -9)
export function ultimaEtiqueta(nombres) {
  const clave = (n) => { const [, f, k] = n.split("-"); return [Number(f), Number(k)]; };
  const validas = nombres.filter((n) => ETIQUETA.test(n));
  validas.sort((a, b) => { const [fa, ka] = clave(a), [fb, kb] = clave(b); return fa - fb || ka - kb; });
  return validas.at(-1) ?? null;
}

export function sha256(texto) {
  return crypto.createHash("sha256").update(texto).digest("hex");
}

// Valida el manifiesto entero antes de usar nada de él; cualquier rareza aborta
export function leerManifiesto(texto, etiqueta) {
  const m = JSON.parse(texto);
  if (m.etiqueta !== etiqueta) throw new Error(`el manifiesto dice «${m.etiqueta}» pero se bajó de «${etiqueta}»`);
  if (!Array.isArray(m.migraciones) || m.migraciones.length === 0) throw new Error("el manifiesto no trae migraciones");
  const vistos = new Set();
  for (const x of m.migraciones) {
    if (!ARCHIVO.test(x?.archivo ?? "")) throw new Error(`nombre de migración no válido: ${JSON.stringify(x?.archivo)}`);
    if (!/^[0-9a-f]{64}$/.test(x.sha256 ?? "")) throw new Error(`SHA-256 no válido para ${x.archivo}`);
    if (typeof x.descripcion !== "string" || !x.descripcion.trim()) throw new Error(`falta la descripción de ${x.archivo}`);
    const v = x.archivo.slice(0, 14);
    if (vistos.has(v)) throw new Error(`versión repetida en el manifiesto: ${v}`);
    vistos.add(v);
  }
  return { ...m, migraciones: [...m.migraciones].sort((a, b) => a.archivo.localeCompare(b.archivo)) };
}

// Las del manifiesto que la base aún no tiene, en orden de versión
export function pendientes(manifiesto, versionesAplicadas) {
  const ya = new Set(versionesAplicadas);
  return manifiesto.migraciones.filter((x) => !ya.has(x.archivo.slice(0, 14)));
}

// Una pendiente más vieja que la última aplicada quiere decir que la base y el repo se desfasaron: no se adivina
export function revisarOrden(lista, versionesAplicadas) {
  const mayor = [...versionesAplicadas].sort().at(-1);
  const viejas = mayor ? lista.filter((x) => x.archivo.slice(0, 14) < mayor) : [];
  if (viejas.length) throw new Error(`${viejas.map((x) => x.archivo).join(", ")} es anterior a la última aplicada (${mayor}): la base y el repo no van en orden; avisa antes de seguir (no se aplicó nada)`);
}

// Del listado de git/matching-refs/tags/migraciones-: nombre y objeto (commit, o etiqueta anotada que hay que resolver)
export function refsDeEtiquetas(refs) {
  return refs.map((r) => ({ nombre: r.ref.replace(/^refs\/tags\//, ""), tipo: r.object.type, sha: r.object.sha })).filter((r) => ETIQUETA.test(r.nombre));
}

// compare/<commit>...main: «ahead» (main lo contiene y tiene más) o «identical» quieren decir que está en main
export const estaEnMain = (comparacion) => ["ahead", "identical"].includes(comparacion?.status);

export function verificar(migracion, contenido) {
  const s = sha256(contenido);
  if (s !== migracion.sha256) throw new Error(`${migracion.archivo}: el archivo bajado no coincide con el aprobado (SHA-256 ${s.slice(0, 12)}… ≠ ${migracion.sha256.slice(0, 12)}…)`);
  return contenido;
}

// Lo que ve Cesar antes de decir S/N: en palabras, sin nombres técnicos de más
export function resumen(lista) {
  if (lista.length === 0) return "No hay cambios nuevos para aplicar: la base ya está al día.";
  const lineas = lista.map((x, i) => `  ${i + 1}. ${x.descripcion} (${x.archivo.slice(0, 14)})`);
  return `Se aplicará${lista.length === 1 ? "" : "n"} ${lista.length} cambio${lista.length === 1 ? "" : "s"} aprobado${lista.length === 1 ? "" : "s"}:\n${lineas.join("\n")}`;
}

export const respuestaSi = (r) => /^\s*s(i|í)?\s*$/i.test(r ?? "");
