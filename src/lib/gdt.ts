// Conexión con winspiroPRO (espirómetro ErgoSpir de MIR) por su interfaz oficial GDT 2.1 (pedido de Cesar, 06-nov-2026:
// «que los resultados se transmitan automáticamente, sin tener que estar copiando a mano»).
// zamorApp Escritorio escribe WPROZAMO.GDT (registro 6301: datos del paciente) en la carpeta de winspiroPRO, lo abre con
// /GDT y, cuando la persona lo cierra, lee ZAMOWPRO.GDT (registro 6310: la mejor maniobra con sus previstos). No se
// cambia nada del programa, su base ni su configuración (regla de Cesar: winspiroPRO es de SOLO LECTURA, como el SAME).
// Formato de cada línea: 3 dígitos de largo total (con CR LF) + 4 dígitos de campo + contenido. Juego de caracteres 2
// (IBM CP437). Aquí solo se arma y se lee el texto; el archivo y el programa los maneja escritorio/src-tauri/src/espirometro.rs.
import type { ValoresEspiro } from "@/lib/mediciones";

export const ID_GDT = "ZAMO"; // nombre corto de zamorApp en los archivos (WPRO + ZAMO y ZAMO + WPRO)

export type PacienteGdt = {
  id: string; // número del paciente en winspiroPRO: la cédula sin puntos ni letras
  apellidos: string;
  nombres: string;
  nacimiento: string | null; // AAAA-MM-DD
  sexo: string | null; // "M" | "F"
  tallaCm: number | null;
  pesoKg: number | null;
  fecha: string; // AAAA-MM-DD de la prueba
};

// CP437: solo las letras del español que existen en esa tabla; las demás pierden el acento
const CP437: Record<string, number> = { á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a, É: 0x90 };
const DESDE_CP437 = new Map(Object.entries(CP437).map(([c, b]) => [b, c]));

function aBytes(texto: string): number[] {
  const out: number[] = [];
  for (const c of texto) {
    if (CP437[c] !== undefined) out.push(CP437[c]);
    else {
      const b = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      for (const x of b) out.push(x.charCodeAt(0) < 128 ? x.charCodeAt(0) : 0x3f);
    }
  }
  return out;
}

export function deBytes(bytes: Uint8Array | number[]): string {
  let s = "";
  for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : (DESDE_CP437.get(b) ?? "?");
  return s;
}

const linea = (campo: string, contenido: string) => {
  const cuerpo = aBytes(contenido.replace(/[\r\n]/g, " "));
  return [...aBytes(String(3 + 4 + cuerpo.length + 2).padStart(3, "0") + campo), ...cuerpo, 13, 10];
};
const ddmmaaaa = (f: string) => `${f.slice(8, 10)}${f.slice(5, 7)}${f.slice(0, 4)}`;
const limpio = (t: string) => t.trim().replace(/\s+/g, " ").slice(0, 60);

export const idPaciente = (cedula: string) => cedula.replace(/\D/g, "").slice(0, 20);

/** Registro 6301 (datos del paciente) listo para escribir como bytes. */
export function armarPedido(p: PacienteGdt): number[] {
  const cuerpo: number[] = [
    ...linea("8315", "MIRWPRO1"),
    ...linea("8316", "ZAMORAPP"),
    ...linea("9206", "2"),
    ...linea("9218", "02.10"),
    ...linea("3000", p.id),
    ...linea("3101", limpio(p.apellidos)),
    ...linea("3102", limpio(p.nombres)),
  ];
  if (p.nacimiento && /^\d{4}-\d{2}-\d{2}$/.test(p.nacimiento)) cuerpo.push(...linea("3103", ddmmaaaa(p.nacimiento)));
  if (p.sexo === "M" || p.sexo === "F") cuerpo.push(...linea("3110", p.sexo === "M" ? "1" : "2"));
  if (p.tallaCm && p.tallaCm > 30 && p.tallaCm < 260) cuerpo.push(...linea("3622", String(Math.round(p.tallaCm))));
  if (p.pesoKg && p.pesoKg > 2 && p.pesoKg < 400) cuerpo.push(...linea("3623", String(Math.round(p.pesoKg))));
  cuerpo.push(...linea("6200", ddmmaaaa(p.fecha)));
  const tipo = linea("8000", "6301");
  const largo = tipo.length + 14 + cuerpo.length; // la línea 8100 mide 14 bytes (014 + 8100 + 5 dígitos + CR LF)
  return [...tipo, ...linea("8100", String(largo).padStart(5, "0")), ...cuerpo];
}

export type ResultadoGdt = {
  paciente: string | null; // campo 3000 que devolvió winspiroPRO
  valores: ValoresEspiro;
  textos: string[]; // 8470: teóricos usados e interpretación de winspiroPRO
  medidos: Record<string, { valor: number; unidad: string; previsto: number | null }>;
};

const num = (t: string | undefined) => {
  if (t === undefined) return null;
  const n = Number(t.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const red = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
// Los nombres de parámetro pueden venir en el idioma de winspiroPRO
const ALIAS: Record<string, string> = {
  FVC: "FVC", CVF: "FVC", FEV1: "FEV1", VEF1: "FEV1", VEMS: "FEV1",
  "FEV1%": "FEV1%", "VEF1%": "FEV1%", "FEV1/FVC": "FEV1%", "VEF1/CVF": "FEV1%",
  "FEV1/VC": "FEV1/VC", "VEF1/CV": "FEV1/VC", PEF: "PEF", FEM: "PEF", FLUJO_PICO: "PEF",
};

/** Lee el registro 6310 de winspiroPRO. null si no es un resultado de espirometría. */
export function leerResultado(texto: string): ResultadoGdt | null {
  let tipo = "";
  let paciente: string | null = null;
  let actual: string | null = null;
  const medidos: ResultadoGdt["medidos"] = {};
  const textos: string[] = [];
  for (const l of texto.split(/\r?\n/)) {
    if (l.length < 7 || !/^\d{7}/.test(l)) continue;
    const campo = l.slice(3, 7);
    const v = l.slice(7);
    if (campo === "8000") tipo = v.trim();
    else if (campo === "3000") paciente = v.trim();
    else if (campo === "8410") actual = v.trim().toUpperCase();
    else if (campo === "8420" && actual) {
      const n = num(v);
      if (n !== null) medidos[actual] = { valor: n, unidad: medidos[actual]?.unidad ?? "", previsto: medidos[actual]?.previsto ?? null };
    } else if (campo === "8421" && actual && medidos[actual]) medidos[actual].unidad = v.trim();
    else if (campo === "8460" && actual && medidos[actual]) medidos[actual].previsto = num(v);
    else if (campo === "8470" && v.trim()) textos.push(v.trim());
  }
  if (tipo !== "6310") return null;

  const de = (clave: string) => Object.entries(medidos).find(([k]) => ALIAS[k] === clave)?.[1];
  const pct = (m: { valor: number; previsto: number | null } | undefined) =>
    m && m.previsto && m.previsto > 0 ? Math.round((m.valor / m.previsto) * 100) : null;
  const fvc = de("FVC");
  const fev1 = de("FEV1");
  const rel = de("FEV1%");
  const relVc = de("FEV1/VC");
  const pef = de("PEF");
  const relacion = rel && rel.valor > 0 ? rel.valor : relVc && relVc.valor > 0 ? relVc.valor : null;
  return {
    paciente,
    textos,
    medidos,
    valores: {
      fvc: fvc ? red(fvc.valor) : null,
      fvcPct: pct(fvc),
      fev1: fev1 ? red(fev1.valor) : null,
      fev1Pct: pct(fev1),
      relacion: relacion !== null && relacion <= 100 ? red(relacion, 1) : null,
      pef: pef ? red(pef.valor) : null,
    },
  };
}

/** Nota que acompaña los valores: de dónde vienen y qué dijo winspiroPRO. */
export const notaDeResultado = (r: ResultadoGdt) => ["winspiroPRO", ...r.textos].join(" · ").slice(0, 300);
