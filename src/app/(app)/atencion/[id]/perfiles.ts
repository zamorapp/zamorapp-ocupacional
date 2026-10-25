// Aplicación de perfiles preestablecidos (examen y paraclínicos) a una consulta.
import type { FilaExamen, Paraclinico } from "@/lib/consultas-tipos";
import type { Item } from "@/lib/listas";

const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// «Fila: valor» por línea. Las filas que no existen en la plantilla se agregan al final.
export function aplicarPerfilExamen(filas: FilaExamen[], texto: string): FilaExamen[] {
  const nuevas = [...filas];
  for (const linea of texto.split("\n")) {
    const i = linea.indexOf(":");
    if (i < 1) continue;
    const nombre = linea.slice(0, i).trim();
    const valor = linea.slice(i + 1).trim();
    const j = nuevas.findIndex((f) => clave(f.nombre) === clave(nombre) || clave(f.clave) === clave(nombre));
    if (j >= 0) nuevas[j] = { ...nuevas[j], valor };
    else nuevas.push({ clave: `extra-${clave(nombre)}`, nombre, valor, normal: "" });
  }
  return nuevas;
}

// Un examen por línea; los que no están en el catálogo se agregan como examen libre.
export function aplicarPerfilParaclinicos(actuales: Paraclinico[], texto: string, catalogo: Item[]): Paraclinico[] {
  const salida = [...actuales];
  for (const linea of texto.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const item = catalogo.find((c) => clave(c.nombre) === clave(linea));
    const id = item?.id ?? `libre-${clave(linea)}`;
    if (!salida.some((p) => p.id === id)) salida.push({ id, nombre: item?.nombre ?? linea, grupo: item?.grupo ?? null, resultado: "" });
  }
  return salida;
}

export const examenesDePerfil = (texto: string | null) => (texto ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
