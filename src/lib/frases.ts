// Frases frecuentes (recomendaciones, conclusiones) de una o varias líneas: se suman y se quitan como bloque.
// Sin dependencias: lo usan la consulta (chips) y las plantillas de examen (servidor y cliente).

const lineas = (s: string) => s.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);

/** Las líneas de una frase del stock (los textos del SAME traen \r\n) */
export const lineasDeFrase = (frase: string) => lineas(frase);

/** La frase ya está en el campo: todas sus líneas están, en cualquier lugar */
export function fraseUsada(valor: string, frase: string) {
  const f = lineas(frase);
  if (!f.length) return false;
  const v = new Set(lineas(valor));
  return f.every((l) => v.has(l));
}

/** Agrega las líneas de la frase que falten, al final y en su orden */
export function sumarFrase(valor: string, frase: string) {
  const actual = lineas(valor);
  const nuevas = lineas(frase).filter((l) => !actual.includes(l));
  return [...actual, ...nuevas].join("\n");
}

/** Quita las líneas de la frase (una vez cada una); lo escrito a mano queda */
export function quitarFrase(valor: string, frase: string) {
  const quitar = lineas(frase);
  return lineas(valor).filter((l) => {
    const i = quitar.indexOf(l);
    if (i < 0) return true;
    quitar.splice(i, 1);
    return false;
  }).join("\n");
}
