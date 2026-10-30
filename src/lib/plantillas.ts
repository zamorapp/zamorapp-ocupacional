// Plantillas de examen por tipo (motivo de consulta): tipos y aplicación a una consulta. Servidor y cliente.
// Se guardan en lista_items (lista «plantilla_examen», codigo = código del motivo) y referencian por código
// los perfiles de examen y las recomendaciones de la organización.
import type { DatosConsulta, FilaExamen } from "@/lib/consultas-tipos";
import { sumarMeses } from "@/lib/fecha";
import { completarPerfil } from "@/lib/perfil-opciones";

export type DatosPlantilla = {
  funcional: string | null; // código de perfil_examen_funcional
  fisico: string | null; // código de perfil_examen_fisico
  aptitud: string[]; // códigos de recomendacion_aptitud
  empresa: string[]; // códigos de recomendacion_empresa
  trabajador: string[]; // códigos de recomendacion_paciente
  meses: number | null; // vigencia de la aptitud; null = la de la organización
  conclusiones: string;
  clasificacion: string; // la que pone «Perfil normal» (código de clasificacion_aptitud); "" = ninguna
  sano: boolean; // «Perfil normal» marca «sin diagnósticos» si no hay ninguno
};

export type Plantilla = { id: string; motivo: string; nombre: string; activo: boolean; datos: DatosPlantilla };

// Lo mínimo de un item de lista que hace falta para aplicar (Item de lib/listas cumple)
type ItemTexto = { codigo: string | null; nombre: string; texto: string | null };

export const PLANTILLA_VACIA: DatosPlantilla = { funcional: null, fisico: null, aptitud: [], empresa: [], trabajador: [], meses: null, conclusiones: "", clasificacion: "", sano: false };

// Lee el jsonb guardado tolerando campos faltantes o con otro tipo
export function leerDatosPlantilla(x: unknown): DatosPlantilla {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const meses = Number(o.meses);
  return {
    funcional: texto(o.funcional),
    fisico: texto(o.fisico),
    aptitud: lista(o.aptitud),
    empresa: lista(o.empresa),
    trabajador: lista(o.trabajador),
    meses: Number.isInteger(meses) && meses > 0 && meses <= 60 ? meses : null,
    conclusiones: typeof o.conclusiones === "string" ? o.conclusiones : "",
    // Plantillas guardadas antes de estos campos: «Perfil normal» clasifica «Elegible» y marca sano
    clasificacion: typeof o.clasificacion === "string" ? o.clasificacion : "elegible",
    sano: typeof o.sano === "boolean" ? o.sano : true,
  };
}

const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// «Fila: valor» por línea sobre la tabla del examen, como valor normal (igual que el botón «… normal»)
function aplicarExamen(filas: FilaExamen[], texto: string | null): FilaExamen[] {
  if (!texto) return filas;
  const nuevas = [...filas];
  for (const linea of texto.split("\n")) {
    const i = linea.indexOf(":");
    if (i < 1) continue;
    const nombre = linea.slice(0, i).trim();
    const valor = linea.slice(i + 1).trim();
    const j = nuevas.findIndex((f) => clave(f.nombre) === clave(nombre) || clave(f.clave) === clave(nombre));
    if (j >= 0) nuevas[j] = { ...nuevas[j], valor, normal: valor };
    else nuevas.push({ clave: `extra-${clave(nombre)}`, nombre, valor, normal: valor });
  }
  return nuevas;
}

// Agrega las frases elegidas (una por línea) sin repetir las que ya están
function sumarFrases(actual: string, codigos: string[], items: ItemTexto[] = []) {
  const lineas = actual.split("\n").filter((l) => l.trim());
  for (const c of codigos) {
    const it = items.find((i) => i.codigo === c);
    const frase = it ? (it.texto || it.nombre).trim() : "";
    if (frase && !lineas.some((l) => l.trim() === frase)) lineas.push(frase);
  }
  return lineas.join("\n");
}

// Listas de la organización por código (las que falten se toman vacías)
export type ListasPlantilla = Record<string, ItemTexto[] | undefined>;

// Aplica la plantilla sin borrar lo escrito: el examen toma el perfil como normal (solo si la fila no fue
// cambiada a mano), las recomendaciones se suman, y conclusiones y vigencia solo se llenan si están vacías.
export function aplicarPlantilla(d: DatosConsulta, p: DatosPlantilla, listas: ListasPlantilla): DatosConsulta {
  // Un perfil con opciones {a|b} entra con la primera de cada una (el médico la cambia en la fila)
  const perfil = (items: ItemTexto[] = [], codigo: string | null) => {
    const texto = codigo ? items.find((i) => i.codigo === codigo)?.texto ?? null : null;
    return texto && completarPerfil(texto);
  };
  const sinTocar = (filas: FilaExamen[]) => filas.filter((f) => f.valor.trim() === f.normal.trim());
  const examen = (filas: FilaExamen[], texto: string | null) => {
    const aplicadas = aplicarExamen(sinTocar(filas), texto);
    // Las filas alteradas por el médico se conservan tal cual, en su lugar
    return filas.map((f) => (f.valor.trim() !== f.normal.trim() ? f : aplicadas.find((x) => x.clave === f.clave) ?? f))
      .concat(aplicadas.filter((x) => !filas.some((f) => f.clave === x.clave)));
  };
  return {
    ...d,
    examenFuncional: examen(d.examenFuncional, perfil(listas.perfil_examen_funcional, p.funcional)),
    examenFisico: examen(d.examenFisico, perfil(listas.perfil_examen_fisico, p.fisico)),
    aptitud: {
      ...d.aptitud,
      observacion: sumarFrases(d.aptitud.observacion, p.aptitud, listas.recomendacion_aptitud),
      vigenteHasta: d.aptitud.vigenteHasta || (p.meses ? sumarMeses(d.fecha, p.meses) : ""),
    },
    recomendacionesEmpresa: sumarFrases(d.recomendacionesEmpresa, p.empresa, listas.recomendacion_empresa),
    recomendacionesTrabajador: sumarFrases(d.recomendacionesTrabajador, p.trabajador, listas.recomendacion_paciente),
    conclusiones: d.conclusiones.trim() ? d.conclusiones : p.conclusiones,
  };
}

// «Perfil normal»: la plantilla completa más todo el examen en su valor normal, la clasificación y «sano». Solo llena lo
// vacío: lo que el médico ya escribió (filas alteradas, aptitud elegida, diagnósticos) no se toca. No firma.
export function aplicarPerfilNormal(d: DatosConsulta, p: DatosPlantilla, listas: ListasPlantilla): DatosConsulta {
  const base = aplicarPlantilla(d, p, listas);
  const vacias = (filas: FilaExamen[]) => filas.map((f) => (f.valor.trim() || !f.normal.trim() ? f : { ...f, valor: f.normal }));
  const sinDiagnosticos = !base.diagnosticos.some((x) => x.descripcion.trim());
  return {
    ...base,
    examenFuncional: vacias(base.examenFuncional),
    examenFisico: vacias(base.examenFisico),
    aptitud: base.aptitud.clasificacion || !p.clasificacion ? base.aptitud : { ...base.aptitud, clasificacion: p.clasificacion as DatosConsulta["aptitud"]["clasificacion"] },
    sano: base.sano || (p.sano && sinDiagnosticos),
  };
}

// Resumen corto para la tarjeta de Configuración y el aviso de la consulta
export function resumenPlantilla(p: DatosPlantilla) {
  return [
    (p.funcional || p.fisico) && "examen precargado",
    p.aptitud.length + p.empresa.length + p.trabajador.length > 0 && `${p.aptitud.length + p.empresa.length + p.trabajador.length} recomendaciones`,
    p.meses && `vigencia ${p.meses} ${p.meses === 1 ? "mes" : "meses"}`,
    p.conclusiones.trim() && "conclusiones base",
  ].filter(Boolean).join(" · ");
}
