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
  if (m.linea_base_hasta !== undefined && !/^\d{14}$/.test(m.linea_base_hasta)) throw new Error(`linea_base_hasta no válida: ${JSON.stringify(m.linea_base_hasta)}`);
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

// Primera vez en una base sin registro (las de antes se aplicaron a mano o con el aplicador viejo, que no anotaba):
// se anotan como hechas, sin ejecutarlas, solo las versiones del commit ≤ «linea_base_hasta», el corte que quien
// publica verificó en producción. Una versión mayor que el corte y fuera del manifiesto aborta: nunca se da por
// aplicado algo que pudo unirse a main sin aplicarse.
export function lineaBase(nombresEnCommit, manifiesto) {
  const corte = manifiesto.linea_base_hasta;
  if (!corte) throw new Error("el registro de migraciones está vacío y el manifiesto no trae «linea_base_hasta»: no se sabe qué está aplicado (no se aplicó nada)");
  const nuevas = new Set(manifiesto.migraciones.map((x) => x.archivo.slice(0, 14)));
  const fuera = nombresEnCommit.filter((n) => ARCHIVO.test(n)).sort()
    .map((n) => ({ version: n.slice(0, 14), nombre: n.slice(15, -4) }))
    .filter((x) => !nuevas.has(x.version));
  const dudosas = fuera.filter((x) => x.version > corte);
  if (dudosas.length) throw new Error(`${dudosas.map((x) => x.version).join(", ")} está en main después del corte ${corte} y no viene en el manifiesto: no se sabe si se aplicó (no se aplicó nada)`);
  return fuera;
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

// De «git ls-remote --tags <repo> refs/tags/migraciones-*»: nombre y commit, sin la API de GitHub (no gasta el límite de
// 60 consultas por hora sin cuenta, que se agota desde la IP compartida del VPN). Una etiqueta anotada trae además la
// línea «^{}» con el commit al que apunta, que es el que vale.
export function refsDeLsRemote(texto) {
  const porNombre = new Map();
  for (const linea of String(texto ?? "").split(/\r?\n/)) {
    const m = /^([0-9a-f]{40})\s+refs\/tags\/(\S+?)(\^\{\})?$/.exec(linea.trim());
    if (!m || !ETIQUETA.test(m[2])) continue;
    if (m[3] || !porNombre.has(m[2])) porNombre.set(m[2], { nombre: m[2], tipo: "commit", sha: m[1] });
  }
  return [...porNombre.values()];
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
