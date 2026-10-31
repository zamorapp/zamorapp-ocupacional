// Análisis ampliado del informe de vigilancia: lectura de los cuadros que no la tenían (también los que dan cero),
// de cada cuadro del anexo estadístico y el análisis integral final (tendencias, cruces entre cuadros, prioridades,
// recomendaciones para la empresa y conclusión final). Analizador propio: sin IA ni servicios externos.
// Puro: corre en el servidor (informe impreso) y en el navegador (editor de Reportes).
// Regla de RR. HH.: nunca nombres, diagnósticos con menos de 3 casos ni confidenciales, ni cifras de 1 o 2 personas.

import type { Reporte } from "@/lib/reportes";
import type { DatosAnalisis, Series } from "@/lib/vigilancia-analisis";
import { dx, etq, humano, mayus, minus, n0, n1, n2, nombrable, p, pc, personas, plural, sinRegistros, unir } from "@/lib/vigilancia-redaccion";

export type Herramientas = { elige: <T>(a: T[]) => T; baraja: <T>(a: T[]) => T[]; azar: () => number };
export type Totales = { consultas: number; preventivas: number; diagnosticos: number; dias: number; poblacion: number };
export type Historico = Totales & { etiqueta: string };

// Claves de las cortes del anexo (mismo orden que vigilancia-textos.CORTES) y su nombre en la frase
const CORTES_ANEXO = [
  ["tipo", "tipo de consulta"],
  ["origen", "origen"],
  ["sexo", "sexo"],
  ["edad", "grupo etario"],
  ["actividad", "actividad"],
  ["sistema", "aparato o sistema"],
  ["motivo", "motivo de consulta"],
  ["dependencia", "dependencia"],
] as const;
export const CAUSAS_REPOSO = ["accidente_comun", "accidente_laboral", "enfermedad_comun", "enfermedad_ocupacional"] as const;
const ETIQUETA: Record<string, string> = {
  primera: "primera consulta", sucesiva: "consulta sucesiva", derivada: "consulta derivada",
  comun: "enfermedad común", ocupacional: "enfermedad ocupacional", accidente_comun: "accidente común", accidente_laboral: "accidente laboral",
  F: "mujeres", M: "hombres", preventiva: "consultas preventivas", no_preventiva: "consultas asistenciales",
};
const etiqueta = (k: string) => ETIQUETA[k] ?? humano(k);

// Filas del resumen del art. 34 (las usan el cuadro impreso, la hoja de cartelera y su análisis)
export function filasArt34(r: Reporte, accidentes: number | undefined, causas: Record<string, string>): [string, number][] {
  return [
    ["Accidentes comunes", r.morbilidad.por_origen.accidente_comun ?? 0],
    ["Accidentes laborales", accidentes ?? r.morbilidad.por_origen.accidente_laboral ?? 0],
    ["Enfermedades comunes", r.morbilidad.por_origen.comun ?? 0],
    ["Enfermedades ocupacionales", r.morbilidad.por_origen.ocupacional ?? 0],
    ["Referencias a especialidades", r.referencias?.total ?? 0],
    ...CAUSAS_REPOSO.map((c) => [`Reposos por ${(causas[c] ?? humano(c)).toLowerCase()}`, r.ausentismo.por_causa.find((x) => x.nombre === c)?.n ?? 0] as [string, number]),
  ];
}

const sumar = <T,>(l: T[], f: (x: T) => number) => l.reduce((a, x) => a + f(x), 0);

// ---------- Cuadros del cuerpo del informe que no tenían lectura
export function analisisCuadros(d: DatosAnalisis, h: Herramientas) {
  const { elige, baraja } = h;
  const { r, s } = d;
  const sin = sinRegistros(d.etiqueta);
  const pob = r.poblacion.total;
  const junta = (f: string[]) => [f[0], ...baraja(f.slice(1))].filter(Boolean).join(" ");

  // Vigilancia clínica (población actual)
  const vigilancia_clinica = (() => {
    const vo = r.poblacion.vigilancia_ocupacional ?? 0, vno = r.poblacion.vigilancia_no_ocupacional ?? 0;
    if (!vo && !vno) return `${sin} ${elige([
      "Ningún trabajador figura en un programa de vigilancia clínica: si hay puestos con exposición a ruido, cargas, químicos o pantallas, conviene definir esos grupos y abrir su seguimiento.",
      "No hay trabajadores incorporados a la vigilancia clínica; el primer paso es identificar los grupos de exposición homogénea y programar sus exámenes específicos.",
    ])}`;
    const f = [elige([
      `${mayus(personas(vo + vno, "trabajador está", "trabajadores están"))} en vigilancia clínica${pob ? ` (${pc(vo + vno, pob)} de la población)` : ""}.`,
      `La vigilancia clínica abarca a ${personas(vo + vno, "trabajador", "trabajadores")}${pob ? `, el ${pc(vo + vno, pob)} de la plantilla` : ""}.`,
    ])];
    if (vo && vno) f.push(vo >= vno
      ? elige([`Predomina la vigilancia de origen ocupacional, ligada a la exposición en el puesto, que debe sostenerse con los exámenes específicos de cada riesgo.`, `La mayor parte responde a exposiciones del trabajo, lo que confirma la necesidad de los exámenes dirigidos por riesgo.`])
      : elige([`Predomina la vigilancia de origen no ocupacional (condiciones crónicas), que requiere controles periódicos y adecuación del puesto cuando haga falta.`, `La mayoría se vigila por enfermedades crónicas de origen común, cuyo control evita descompensaciones en el trabajo.`]));
    else if (!vo) f.push("Ningún trabajador tiene vigilancia de origen ocupacional: si existen puestos con exposición, falta abrir su programa.");
    if (pob && p(vo + vno, pob) >= 30) f.push("La proporción en vigilancia es alta y anticipa más controles y ajustes de puesto en los próximos trimestres.");
    return junta(f);
  })();

  // Consultas por tipo de paciente, sexo y grupo etario
  const demografia = (() => {
    const c = r.consultas;
    if (!c.total) return sin;
    const f: string[] = [];
    const tipos = [...(c.por_tipo_paciente ?? [])].filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    if (tipos[0]) {
      const efectivos = new Set((r.criterio?.tipos ?? []).map((x) => x.toLowerCase()));
      const otros = efectivos.size ? sumar(tipos.filter((x) => !efectivos.has(x.nombre.toLowerCase())), (x) => x.n) : 0;
      f.push(elige([
        `Por tipo de paciente, ${minus(tipos[0].nombre)} concentra el ${pc(tipos[0].n, c.total)} de las consultas.`,
        `La mayor parte de la demanda (${pc(tipos[0].n, c.total)}) corresponde a pacientes de tipo ${minus(tipos[0].nombre)}.`,
      ]));
      if (otros && p(otros, c.total) >= 10) f.push(`El ${pc(otros, c.total)} de las consultas fue a pacientes que no son trabajadores efectivos (aspirantes, contratistas u otros): consumen tiempo del servicio pero no entran en las tasas.`);
    }
    const { F: cf, M: cm } = c.por_sexo;
    if (r.poblacion.femenino >= 3 && r.poblacion.masculino >= 3 && cf + cm) {
      const tf = (cf * 100) / r.poblacion.femenino, tm = (cm * 100) / r.poblacion.masculino;
      const razon = Math.max(tf, tm) / Math.max(Math.min(tf, tm), 0.01);
      f.push(razon >= 1.3
        ? elige([
            `En proporción a cada grupo, ${tf > tm ? "las mujeres" : "los hombres"} consultaron más: ${n0(Math.max(tf, tm))} consultas por cada 100 ${tf > tm ? "trabajadoras" : "trabajadores"} frente a ${n0(Math.min(tf, tm))} en ${tf > tm ? "los hombres" : "las mujeres"}, diferencia que conviene vincular con las tareas de cada grupo.`,
            `La tasa de uso es ${n1(razon)} veces mayor en ${tf > tm ? "mujeres" : "hombres"} (${n0(tf)} frente a ${n0(tm)} consultas por cada 100 de cada sexo).`,
          ])
        : `Hombres y mujeres usan el servicio en proporción parecida (${n0(tm)} y ${n0(tf)} consultas por cada 100 de cada sexo).`);
    }
    const edades = c.por_edad.filter((e) => e.n > 0);
    if (edades.length) {
      const pobEdad = new Map(s.piramide.map((g) => [g.grupo, g.n]));
      const tasas = edades.filter((e) => (pobEdad.get(e.grupo) ?? 0) >= 3).map((e) => ({ ...e, tasa: (e.n * 100) / pobEdad.get(e.grupo)! })).sort((a, b) => b.tasa - a.tasa);
      const mas = [...edades].sort((a, b) => b.n - a.n)[0];
      f.push(elige([`Por edad, el grupo de ${mas.grupo} años aporta más consultas (${pc(mas.n, c.total)}).`, `El grupo etario con más consultas es el de ${mas.grupo} años.`]));
      if (tasas.length >= 2 && tasas[0].grupo !== mas.grupo) f.push(`Relativo a su tamaño, el grupo de ${tasas[0].grupo} años es el que más consulta (${n0(tasas[0].tasa)} consultas por cada 100 trabajadores de esa edad).`);
    }
    return f.length ? junta(f) : sin;
  })();

  // Índices de ausentismo: frecuencia, severidad, afectados, reincidencia y proyección
  const indices_ausentismo = (() => {
    const a = r.ausentismo;
    if (!a.dias_computables && !a.reposos) return `${sin} ${elige(["Sin reposos, los índices de frecuencia y severidad del ausentismo valen cero.", "Con cero reposos, todos los índices de ausentismo quedan en cero, el mejor resultado posible."])}`;
    if (!pob) return "Sin población efectiva registrada no se pueden calcular los índices de ausentismo.";
    const reposos = a.reposos_iniciados ?? a.reposos;
    const f = [elige([
      `Se iniciaron ${n1((reposos * 100) / pob)} reposos por cada 100 trabajadores y se perdieron ${n2(a.dias_computables / pob)} días por trabajador en el lapso.`,
      `La frecuencia fue de ${n1((reposos * 100) / pob)} reposos por cada 100 trabajadores, con una severidad de ${n2(a.dias_computables / pob)} días perdidos por trabajador.`,
    ])];
    if (a.trabajadores_ausentes) {
      f.push(`El ${pc(a.trabajadores_ausentes, pob)} de la plantilla tuvo al menos un día de reposo.`);
      const veces = a.reposos / a.trabajadores_ausentes;
      if (veces >= 1.3) f.push(`Cada trabajador ausente acumuló en promedio ${n1(veces)} reposos: hay reincidencia que conviene revisar caso por caso en el servicio médico.`);
    }
    const dif = d.pct - 2.5;
    f.push(dif >= 0
      ? `El porcentaje de ausentismo queda ${n2(dif)} puntos por encima de la meta de 2,5 %.`
      : `El porcentaje de ausentismo queda ${n2(-dif)} puntos por debajo de la meta de 2,5 %.`);
    if (a.dias_periodo) f.push(elige([
      `Si el ritmo se mantiene, el año cerraría con unos ${n0((a.dias_computables * 365) / a.dias_periodo)} días perdidos.`,
      `Proyectado a doce meses, este ritmo equivale a unos ${n0((a.dias_computables * 365) / a.dias_periodo)} días de trabajo perdidos.`,
    ]));
    return junta(f);
  })();

  // Diez primeras causas de reposo
  const causas_reposo = (() => {
    const l = r.ausentismo.primeras_causas ?? [];
    if (!l.length) return sin;
    const dias = r.ausentismo.dias_perdidos || sumar(l, (x) => x.dias);
    const porDias = [...l].sort((a, b) => b.dias - a.dias);
    const tres = sumar(porDias.slice(0, 3), (x) => x.dias);
    const f = [elige([
      `Las tres causas de reposo con más días suman el ${pc(tres, dias)} del tiempo perdido.`,
      `El ${pc(tres, dias)} de los días de reposo se explica por tres diagnósticos.`,
    ])];
    const top = porDias.find(nombrable);
    if (top) f.push(elige([
      `${mayus(dx(top))} encabeza los días perdidos (${plural(top.dias, "día", "días")}, ${n1(top.dias / Math.max(top.n, 1))} por caso).`,
      `El diagnóstico que más días costó fue ${dx(top)}, con un promedio de ${n1(top.dias / Math.max(top.n, 1))} días por reposo.`,
    ]));
    const largos = l.filter((x) => x.n >= 3 && x.dias / x.n >= 15);
    if (largos.length) f.push(`${mayus(plural(largos.length, "causa genera", "causas generan"))} reposos de 15 días o más en promedio: son casos que pueden requerir evaluación de reintegro y adecuación del puesto.`);
    const masFrec = r.morbilidad.primeras_causas[0];
    if (masFrec && porDias[0] && masFrec.cie10.charAt(0) !== porDias[0].cie10.charAt(0)) f.push(elige([
      "La causa que más días cuesta no pertenece al grupo de diagnósticos más frecuente en consulta: el impacto laboral lo marca la gravedad, no solo la frecuencia.",
      "Lo que más se consulta no es lo que más ausentismo genera, por lo que el plan de control debe atender ambas listas.",
    ]));
    return junta(f);
  })();

  // Índices COVENIN y de enfermedad ocupacional
  const indices_accidentes = (() => {
    const a = d.acc;
    const eo = r.enfermedad_ocupacional;
    if (!a) return `${sin} No hay horas hombre registradas para calcular los índices de accidentalidad.`;
    const incidentes = (r.accidentes ?? []).filter((x) => /incidente/i.test(x.tipo)).length;
    if (!a.accidentes && !eo?.casos) return `${sin} ${elige([
      "Con cero lesiones, los índices de frecuencia y severidad valen cero; la meta es sostener esa marca.",
      "Sin lesiones ni enfermedades ocupacionales, IFN, IFB, IS, TAEO y TIEO quedan en cero.",
    ])}${incidentes ? ` Se reportaron ${plural(incidentes, "incidente", "incidentes")} sin lesión, información valiosa para prevenir.` : " Registrar también los incidentes (casi accidentes) permite actuar antes de que haya lesiones."}`;
    const f: string[] = [];
    if (a.accidentes) {
      f.push(elige([
        `De ${plural(a.accidentes, "lesión registrada", "lesiones registradas")}, el ${pc(a.conTiempoPerdido, a.accidentes)} generó tiempo perdido (IFB ${n2(a.ifb ?? 0)} frente a IFN ${n2(a.ifn ?? 0)}).`,
        `La relación entre el índice bruto (${n2(a.ifb ?? 0)}) y el neto (${n2(a.ifn ?? 0)}) indica que el ${pc(a.conTiempoPerdido, a.accidentes)} de las lesiones causó incapacidad.`,
      ]));
      if (a.conTiempoPerdido && a.diasPerdidos) f.push(`Cada lesión con tiempo perdido costó en promedio ${n1(a.diasPerdidos / a.conTiempoPerdido)} días${a.diasPerdidos / a.conTiempoPerdido > 10 ? ", señal de lesiones de gravedad importante" : ""}.`);
      if (!incidentes) f.push("No se registraron incidentes sin lesión: por cada accidente suelen ocurrir muchos casi accidentes, y reportarlos es la forma más barata de prevenir.");
    }
    if (eo?.casos && a.hht) f.push(`La tasa de incidencia de enfermedad ocupacional fue de ${n2((eo.casos * 1_000_000) / a.hht)} casos por millón de horas hombre.`);
    if (eo?.dias_anteriores) f.push(`Los casos de enfermedad ocupacional de años anteriores siguen generando ${plural(eo.dias_anteriores, "día", "días")} de reposo, costo que se arrastra si no se logra su reintegro.`);
    return f.length ? junta(f) : sin;
  })();

  // Especialidades por consulta externa
  const externas = (() => {
    const l = [...(r.especialidades_externas ?? [])].filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    if (!l.length) return sin;
    const total = sumar(l, (x) => x.n);
    const visibles = l.filter((x) => x.n >= 3);
    const f = [elige([
      `Se registraron ${plural(total, "consulta externa o especializada", "consultas externas o especializadas")} en ${plural(l.length, "especialidad", "especialidades")}.`,
      `La consulta especializada sumó ${plural(total, "atención", "atenciones")}, repartidas en ${plural(l.length, "especialidad", "especialidades")}.`,
    ])];
    if (visibles[0]) f.push(`${mayus(visibles[0].nombre.toLowerCase())} fue la más frecuente (${pc(visibles[0].n, total)}).`);
    if (r.consultas.total) f.push(`Equivale al ${pc(total, r.consultas.total)} de las consultas del servicio.`);
    return junta(f);
  })();

  // Reubicaciones
  const reubicaciones = (() => {
    const reu = r.reubicaciones;
    if (!reu?.total) return `${sin} ${elige(["Ningún trabajador requirió cambio de puesto por razones de salud.", "No hubo reubicaciones de puesto por motivos médicos."])}`;
    const f = [`Se gestionaron ${personas(reu.total, "reubicación", "reubicaciones")} por razones de salud.`];
    const tipos = Object.entries(reu.por_tipo ?? {}).filter(([, n]) => n > 0);
    const definitivas = sumar(tipos.filter(([k]) => /defin|perman/i.test(k)), ([, n]) => n);
    if (definitivas && reu.total >= 3) f.push(`El ${pc(definitivas, reu.total)} fue definitiva, lo que obliga a revisar si el puesto de origen puede corregirse para que no afecte a otros trabajadores.`);
    f.push("Cada reubicación debe verificarse en su eficacia: que el nuevo puesto respete las restricciones y que la salud del trabajador mejore.");
    return f.join(" ");
  })();

  // Resumen del art. 34
  const art34 = (() => {
    const filas = filasArt34(r, d.acc?.accidentes, d.causas);
    const total = sumar(filas, ([, n]) => n);
    if (!total) return `${sin} ${elige(["Todos los conceptos del artículo 34 quedan en cero en el lapso.", "Ningún concepto del artículo 34 registra eventos en el lapso."])}`;
    const ceros = filas.filter(([, n]) => !n).map(([k]) => minus(k));
    const mayor = [...filas].sort((a, b) => b[1] - a[1])[0];
    const f = [elige([
      `En el resumen del artículo 34 destaca «${mayor[0].toLowerCase()}» con ${n0(mayor[1])}.`,
      `El concepto con más eventos del artículo 34 es «${mayor[0].toLowerCase()}» (${n0(mayor[1])}).`,
    ])];
    if (ceros.length) f.push(`Sin registros en: ${unir(ceros)}.`);
    const laborales = (filas[1][1] ?? 0) + (filas[3][1] ?? 0);
    f.push(laborales
      ? "Hay eventos de origen laboral, que deben estar declarados ante el INPSASEL y tener su investigación."
      : "No hay eventos de origen laboral: los conceptos registrados son de origen común.");
    f.push("Este cuadro se publica en cartelera para que los trabajadores conozcan los indicadores del trimestre.");
    return f.join(" ");
  })();

  return { vigilancia_clinica, demografia, indices_ausentismo, causas_reposo, indices_accidentes, externas, reubicaciones, art34 };
}

// ---------- Anexo estadístico: un análisis por cuadro, también cuando no hay datos
export function analisisAnexo(d: DatosAnalisis, h: Herramientas, causasNombre: Record<string, string>, entes: Record<string, string>) {
  const { elige } = h;
  const { r } = d;
  const sin = sinRegistros(d.etiqueta);
  const cortes = r.morbilidad.cortes ?? {};
  const pocosPorSexo = r.poblacion.femenino < 3 || r.poblacion.masculino < 3;

  const corte = (g: string, nombre: string) => {
    const grupos = Object.entries(cortes[g] ?? {}).filter(([, l]) => l.length);
    if (!grupos.length) return sin;
    if (g === "sexo" && pocosPorSexo) return "Uno de los sexos tiene menos de tres trabajadores: para proteger la confidencialidad no se comparan las causas por sexo.";
    const filas = grupos.map(([k, l]) => ({ k, nombre: etiqueta(k), total: sumar(l, (x) => x.n), top: l.find(nombrable), lista: l })).sort((a, b) => b.total - a.total);
    const suma = sumar(filas, (x) => x.total);
    const mayor = filas[0];
    const f: string[] = [filas.length === 1
      ? `Por ${nombre}, todas las primeras causas corresponden a ${mayor.nombre}.`
      : elige([
          `Por ${nombre}, ${mayor.nombre} reúne más diagnósticos (${pc(mayor.total, suma)} de los casos de este cuadro).`,
          `Al separar por ${nombre}, el grupo con más casos es ${mayor.nombre} (${pc(mayor.total, suma)}).`,
        ])];
    if (mayor.top) {
      const peso = p(mayor.top.n, mayor.total);
      f.push(`En ${mayor.nombre} la primera causa es ${dx(mayor.top)} (${plural(mayor.top.n, "caso", "casos")}${peso >= 40 ? ", una morbilidad muy concentrada" : ""}).`);
    }
    // Causa transversal: entre las tres primeras de dos grupos o más
    if (filas.length >= 2) {
      const veces = new Map<string, { c: (typeof filas)[number]["lista"][number]; n: number }>();
      for (const x of filas) for (const c of x.lista.slice(0, 3)) if (nombrable(c)) veces.set(c.cie10, { c, n: (veces.get(c.cie10)?.n ?? 0) + 1 });
      const comun = [...veces.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n)[0];
      if (comun) f.push(`${mayus(dx(comun.c))} aparece entre las primeras causas de ${plural(comun.n, "grupo", "grupos")}: es un problema transversal que pide una acción común.`);
      const tops = filas.filter((x) => x.top).slice(0, 3);
      if (tops.length >= 2 && new Set(tops.map((x) => x.top!.cie10)).size === tops.length) f.push(`La primera causa cambia según el grupo (${unir(tops.map((x) => `${x.nombre}: ${minus(x.top!.descripcion || x.top!.cie10)}`))}), por lo que las acciones deben ser diferenciadas.`);
    }
    if (g === "origen" && filas.some((x) => x.k === "ocupacional" || x.k === "accidente_laboral")) f.push("Hay causas de origen laboral, que deben vincularse con la investigación y la declaración de cada caso.");
    if (g === "tipo" && filas.some((x) => x.k === "sucesiva")) f.push("Las causas de las consultas sucesivas señalan los casos que necesitan seguimiento hasta su resolución.");
    if (g === "actividad" && filas.some((x) => x.k === "preventiva")) f.push("Lo hallado en las consultas preventivas es detección precoz: casos que se captan antes de que generen ausentismo.");
    if (g === "dependencia" && mayor.top) f.push(`Este dato orienta la inspección de los puestos de ${mayor.nombre}.`);
    if (g === "edad") {
      const mayores = filas.find((x) => /(5\d|6\d|más)/.test(x.k) && x.top);
      if (mayores && mayores !== mayor) f.push(`En el grupo de ${mayores.nombre} años la primera causa es ${minus(mayores.top!.descripcion || mayores.top!.cie10)}, propia de la edad, que justifica controles dirigidos.`);
    }
    return f.join(" ");
  };

  const reposoPor = (c: (typeof CAUSAS_REPOSO)[number]) => {
    const l = (r.ausentismo.detalle ?? []).filter((x) => x.causa === c);
    if (!l.length) return sin;
    const dias = sumar(l, (x) => x.dias), casos = sumar(l, (x) => x.n);
    const porEnte = new Map<string, number>();
    for (const x of l) porEnte.set(x.ente, (porEnte.get(x.ente) ?? 0) + x.dias);
    const ente = [...porEnte.entries()].sort((a, b) => b[1] - a[1])[0];
    const causa = minus(causasNombre[c] ?? humano(c));
    const f = [elige([
      `Los reposos por ${causa} suman ${plural(dias, "día", "días")} en ${plural(casos, "caso", "casos")} (${n1(dias / Math.max(casos, 1))} días por caso).`,
      `Por ${causa} se perdieron ${plural(dias, "día", "días")}, con un promedio de ${n1(dias / Math.max(casos, 1))} días por reposo.`,
    ])];
    if (ente && porEnte.size > 1) f.push(`La mayoría de esos días los emitió ${minus(entes[ente[0]] ?? humano(ente[0]))} (${pc(ente[1], dias)}).`);
    const top = [...l].map((x) => ({ cie10: x.cie10 ?? "", descripcion: x.descripcion, n: x.n, dias: x.dias })).filter((x) => x.cie10).sort((a, b) => b.dias - a.dias).find(nombrable);
    if (top) f.push(`El diagnóstico con más días es ${dx(top)}.`);
    if (c === "accidente_laboral" || c === "enfermedad_ocupacional") f.push("Por su origen laboral, cada caso debe tener investigación, declaración y seguimiento hasta el reintegro.");
    return f.join(" ");
  };

  const reposoDependencia = (() => {
    const l = [...(r.ausentismo.por_dependencia ?? [])].filter((x) => x.dias > 0).sort((a, b) => b.dias - a.dias);
    if (!l.length) return sin;
    const dias = sumar(l, (x) => x.dias);
    const visibles = l.filter((x) => x.n >= 3);
    if (!visibles.length) return `Los reposos se reparten en ${plural(l.length, "dependencia", "dependencias")} con menos de tres casos cada una; para proteger la confidencialidad no se nombran.`;
    const top = visibles[0];
    const f = [elige([
      `${mayus(top.nombre)} acumula el ${pc(top.dias, dias)} de los días de reposo.`,
      `Por dependencia, los días de reposo se concentran en ${top.nombre} (${pc(top.dias, dias)}).`,
    ])];
    if (p(top.dias, dias) >= 50 && l.length > 1) f.push("Más de la mitad del ausentismo sale de una sola área, donde el plan de control rinde más.");
    const largo = [...visibles].sort((a, b) => b.dias / b.n - a.dias / a.n)[0];
    if (largo && visibles.length >= 2 && largo.nombre !== top.nombre) f.push(`Los reposos más largos en promedio son los de ${largo.nombre} (${n1(largo.dias / largo.n)} días por caso).`);
    return f.join(" ");
  })();

  return {
    ...Object.fromEntries(CORTES_ANEXO.map(([g, nombre]) => [`anexo_${g}`, corte(g, nombre)])),
    ...Object.fromEntries(CAUSAS_REPOSO.map((c) => [`anexo_reposo_${c}`, reposoPor(c)])),
    anexo_reposo_dependencia: reposoDependencia,
  } as Record<string, string>;
}

// ---------- Análisis integral: tendencias, cruces, prioridades, recomendaciones y conclusión final
type Prioridad = { nivel: 1 | 2 | 3; texto: string; accion?: string };

export function analisisIntegral(d: DatosAnalisis, h: Herramientas, t: Totales, capitulos: Series["capitulos"]) {
  const { elige } = h;
  const { r } = d;
  const sin = sinRegistros(d.etiqueta);
  const pob = r.poblacion.total;
  const historial = (d.historial ?? []).filter((x) => x.consultas || x.diagnosticos || x.dias || x.preventivas);

  // Tendencia contra los trimestres anteriores
  const tendencias = (() => {
    if (!historial.length) return `${sin.replace("este indicador", "la tendencia")} ${elige([
      "No hay trimestres anteriores con datos para comparar; la tendencia se podrá leer a partir del próximo informe.",
      "Es el primer período con registros: este informe queda como línea base para los siguientes.",
    ])}`;
    const f: string[] = [];
    const serie: Historico[] = [...historial, { etiqueta: d.etiqueta, ...t }];
    const indicadores = [
      ["consultas", "las consultas"],
      ["preventivas", "las evaluaciones preventivas"],
      ["diagnosticos", "los diagnósticos"],
      ["dias", "los días de reposo"],
    ] as const;
    for (const [k, nombre] of indicadores) {
      const vals = serie.map((x) => x[k]);
      const actual = vals[vals.length - 1];
      const previos = vals.slice(0, -1);
      const media = sumar(previos, (x) => x) / previos.length;
      // Racha: períodos seguidos subiendo o bajando hasta el actual
      let sube = 0, baja = 0;
      for (let i = vals.length - 1; i > 0; i--) { if (vals[i] > vals[i - 1] && !baja) sube++; else if (vals[i] < vals[i - 1] && !sube) baja++; else break; }
      if (sube >= 2) f.push(`${mayus(nombre)} suben por ${sube === 2 ? "segundo" : sube === 3 ? "tercer" : "cuarto"} período consecutivo.`);
      else if (baja >= 2) f.push(`${mayus(nombre)} bajan por ${baja === 2 ? "segundo" : baja === 3 ? "tercer" : "cuarto"} período consecutivo.`);
      else if (media && Math.abs(actual - media) / media >= 0.25) f.push(`${mayus(nombre)} (${n0(actual)}) quedan ${n0((Math.abs(actual - media) * 100) / media)} % ${actual > media ? "por encima" : "por debajo"} del promedio de ${previos.length === 1 ? "el período anterior" : `los ${previos.length} períodos anteriores`} (${n0(media)}).`);
    }
    if (!f.length) f.push(elige([`Los indicadores se mantienen dentro de su rango habitual frente a los ${historial.length === 1 ? "datos del período anterior" : `${historial.length} períodos anteriores`}, sin cambios bruscos.`, "No hay cambios bruscos frente a los períodos anteriores: el comportamiento es estable."]));
    // Corregido por el tamaño de la plantilla
    const prev = historial[historial.length - 1];
    if (prev.poblacion && t.poblacion && Math.abs(t.poblacion - prev.poblacion) / prev.poblacion >= 0.1 && prev.consultas) {
      f.push(`Como la plantilla cambió (${n0(prev.poblacion)} → ${n0(t.poblacion)} trabajadores), la comparación justa es por tasa: las consultas pasaron de ${n0((prev.consultas * 100) / prev.poblacion)} a ${n0((t.consultas * 100) / t.poblacion)} por cada 100 trabajadores.`);
    }
    // Capítulos que emergen o ceden frente al período anterior
    const capAnt = new Map((d.anterior?.s.capitulos ?? []).map((c) => [c.nombre, c.n]));
    if (capAnt.size) {
      const emergen = capitulos.filter((c) => c.n >= 3 && c.n >= 1.5 * (capAnt.get(c.nombre) ?? 0) && c.n - (capAnt.get(c.nombre) ?? 0) >= 2).slice(0, 2);
      const ceden = [...capAnt.entries()].filter(([nombre, n]) => n >= 3 && (capitulos.find((c) => c.nombre === nombre)?.n ?? 0) <= n / 2).slice(0, 2);
      if (emergen.length) f.push(`Gana peso el grupo ${unir(emergen.map((c) => `${minus(c.nombre)} (${n0(capAnt.get(c.nombre) ?? 0)} → ${n0(c.n)})`))}, que debe vigilarse en el próximo trimestre.`);
      if (ceden.length) f.push(`Cede el grupo ${unir(ceden.map(([nombre]) => minus(nombre)))}, posible efecto de las medidas tomadas.`);
    }
    if (d.anioAnterior) {
      const a = d.anioAnterior.s.por_mes.reduce((x, m) => x + m.dias_reposo, 0);
      if (a && Math.abs(t.dias - a) / a >= 0.2) f.push(`Frente al mismo período del año anterior, los días de reposo ${t.dias > a ? "aumentaron" : "disminuyeron"} ${n0((Math.abs(t.dias - a) * 100) / a)} %, comparación que descarta el efecto de la temporada.`);
    }
    return f.join(" ");
  })();

  // Semáforo de indicadores y prioridades
  const prioridades: Prioridad[] = [];
  const semaforo: { nombre: string; estado: 0 | 1 | 2 }[] = [];
  const periodicas = r.consultas.por_motivo.filter((m) => m.grupo === "preventivo" && /periodic|anual/i.test(m.nombre.normalize("NFD").replace(/[̀-ͯ]/g, ""))).reduce((a, m) => a + m.n, 0);
  const cobertura = pob ? p(r.consultas.pacientes, pob) : 0;
  if (pob) {
    semaforo.push({ nombre: "ausentismo", estado: d.pct < 2.5 ? 0 : d.pct < 3.75 ? 1 : 2 });
    if (d.pct >= 2.5) prioridades.push({ nivel: d.pct >= 3.75 ? 1 : 2, texto: `ausentismo de ${n2(d.pct)} %, sobre la meta de 2,5 %`, accion: "Revisar con RR. HH. y el servicio médico los reposos largos y reincidentes, empezando por el área con más días, y fijar la meta de bajar el ausentismo por debajo de 2,5 % en el próximo trimestre." });
    semaforo.push({ nombre: "evaluaciones periódicas", estado: p(periodicas, pob) >= 20 ? 0 : 1 });
    if (p(periodicas, pob) < 20) prioridades.push({ nivel: 2, texto: periodicas ? `el atraso de las evaluaciones periódicas (${pc(periodicas, pob)} de la plantilla)` : "la falta de evaluaciones periódicas", accion: `Programar las evaluaciones periódicas faltantes: al menos ${n0(Math.ceil(pob / 4))} trabajadores en el próximo trimestre para cubrir a toda la plantilla en el año.` });
    semaforo.push({ nombre: "cobertura del servicio", estado: cobertura >= 25 ? 0 : 1 });
  }
  const acc = d.acc;
  semaforo.push({ nombre: "accidentalidad", estado: !acc?.accidentes ? 0 : acc.conTiempoPerdido ? 2 : 1 });
  if (acc?.porDeclarar) prioridades.push({ nivel: 1, texto: `${plural(acc.porDeclarar, "declaración pendiente", "declaraciones pendientes")} ante el INPSASEL`, accion: `Formalizar de inmediato ante el INPSASEL ${acc.porDeclarar === 1 ? "la declaración pendiente" : `las ${n0(acc.porDeclarar)} declaraciones pendientes`} (plazo legal: 24 horas desde el evento).` });
  if (acc?.conTiempoPerdido) prioridades.push({ nivel: 1, texto: `${plural(acc.conTiempoPerdido, "accidente con tiempo perdido", "accidentes con tiempo perdido")}`, accion: "Cerrar la investigación de cada accidente con tiempo perdido y presentar al Comité de Seguridad y Salud Laboral sus causas básicas, acciones correctivas, responsables y fechas." });
  else if (acc?.accidentes) prioridades.push({ nivel: 2, texto: `${plural(acc.accidentes, "accidente sin tiempo perdido", "accidentes sin tiempo perdido")}`, accion: "Investigar también los accidentes leves: repiten las mismas causas que los graves." });
  const eo = r.enfermedad_ocupacional?.casos ?? 0;
  semaforo.push({ nombre: "enfermedad ocupacional", estado: eo ? 2 : 0 });
  if (eo) prioridades.push({ nivel: 1, texto: `${plural(eo, "enfermedad ocupacional", "enfermedades ocupacionales")} en el período`, accion: "Corregir en la fuente la exposición que originó cada enfermedad ocupacional y verificar que ningún otro trabajador del mismo puesto presente signos tempranos." });
  // Cruces entre cuadros
  const cruces: string[] = [];
  const trauma = capitulos.find((c) => /traumat/i.test(c.nombre))?.n ?? 0;
  const origenLaboral = r.morbilidad.por_origen.accidente_laboral ?? 0;
  if (trauma >= 3 && !acc?.accidentes) {
    cruces.push(`la consulta registra ${plural(trauma, "lesión traumática", "lesiones traumáticas")} y no hay accidentes de trabajo registrados: conviene verificar que ninguna haya ocurrido en el trabajo sin notificarse`);
    prioridades.push({ nivel: 2, texto: "lesiones traumáticas sin accidentes registrados (posible subregistro)", accion: "Cruzar las lesiones traumáticas atendidas con el registro de accidentes e incidentes para descartar eventos laborales no notificados." });
  }
  if (origenLaboral > (acc?.accidentes ?? 0)) cruces.push(`hay más diagnósticos por accidente laboral (${n0(origenLaboral)}) que accidentes registrados (${n0(acc?.accidentes ?? 0)}), diferencia que debe conciliarse con el Servicio de SST`);
  const ocup = r.morbilidad.por_origen.ocupacional ?? 0;
  if (ocup > eo) cruces.push(`${plural(ocup, "diagnóstico de posible origen ocupacional espera", "diagnósticos de posible origen ocupacional esperan")} su calificación, que definirá si se declaran`);
  const top = capitulos[0];
  const totalDx = r.morbilidad.total;
  if (top && totalDx && p(top.n, totalDx) >= 35) {
    semaforo.push({ nombre: "concentración de la morbilidad", estado: 1 });
    prioridades.push({ nivel: 2, texto: `concentración de la morbilidad en el grupo ${minus(top.nombre)} (${pc(top.n, totalDx)})`, accion: `Fijar como meta del próximo trimestre reducir en 10 % los diagnósticos del grupo ${minus(top.nombre)} (hoy ${n0(top.n)}), con acciones sobre los puestos donde se concentran.` });
  }
  const masFrec = r.morbilidad.primeras_causas[0];
  const masDias = [...(r.ausentismo.primeras_causas ?? [])].sort((a, b) => b.dias - a.dias)[0];
  if (masFrec && masDias && masFrec.cie10.charAt(0) === masDias.cie10.charAt(0) && nombrable(masFrec)) cruces.push(`el mismo grupo de diagnósticos encabeza la consulta y los días de reposo (${minus(masFrec.descripcion || masFrec.cie10)}), lo que lo convierte en la prioridad clínica y económica del período`);
  const deps = (r.consultas.por_dependencia ?? []).filter((x) => x.personal >= 3 && x.n > 0).map((x) => ({ ...x, tasa: x.n / x.personal })).sort((a, b) => b.tasa - a.tasa);
  const depRep = [...(r.ausentismo.por_dependencia ?? [])].filter((x) => x.n >= 3).sort((a, b) => b.dias - a.dias);
  if (deps[0] && depRep[0] && deps[0].nombre === depRep[0].nombre) {
    cruces.push(`${deps[0].nombre} tiene a la vez la mayor frecuencia de consultas por trabajador y la mayor cantidad de días de reposo: es el foco del trimestre`);
    prioridades.push({ nivel: 2, texto: `${deps[0].nombre} como área foco (más consultas por trabajador y más días de reposo)`, accion: `Inspeccionar las condiciones de trabajo de ${deps[0].nombre} con el Servicio de SST y los delegados de prevención, y presentar sus hallazgos al Comité.` });
  }
  const aptTotal = Object.values(r.aptitud).reduce((a, n) => a + n, 0);
  const restr = Object.entries(r.aptitud).filter(([k]) => /restric|condic|limit/i.test(`${k} ${d.aptitudes[k] ?? ""}`)).reduce((a, [, n]) => a + n, 0);
  if (restr) {
    cruces.push(`el ${pc(restr, aptTotal)} de las aptitudes emitidas lleva restricciones, que deben reflejarse en la asignación de tareas`);
    prioridades.push({ nivel: 2, texto: "trabajadores con restricciones médicas", accion: "Confirmar por escrito, con cada supervisor, que los trabajadores con restricciones tienen tareas compatibles, y reevaluarlos al vencer su plazo." });
  }
  if (r.referencias?.total && r.consultas.total) cruces.push(`el servicio resolvió el ${pc(r.consultas.total - r.referencias.total, r.consultas.total)} de las consultas sin referir a especialistas`);
  const mayores = d.s.piramide.filter((g) => /55|65|más/.test(g.grupo)).reduce((a, g) => a + g.n, 0);
  const cronicos = capitulos.filter((c) => /circulat|endocrin|metab/i.test(c.nombre)).reduce((a, c) => a + c.n, 0);
  if (pob && p(mayores, pob) >= 15 && cronicos >= 3) cruces.push(`la plantilla con 55 años o más (${pc(mayores, pob)}) coincide con ${plural(cronicos, "diagnóstico", "diagnósticos")} cardiovasculares o metabólicos, que justifican un programa de riesgo cardiometabólico`);
  if (pob && r.consultas.pacientes < pob) {
    const sinVer = pob - r.consultas.pacientes;
    if (p(sinVer, pob) >= 50) cruces.push(`el ${pc(sinVer, pob)} de la plantilla no pasó por el servicio en el lapso, población cuyo estado de salud se desconoce`);
  }
  if (tendencias && historial.length) {
    const prev = historial[historial.length - 1];
    if (prev.dias && t.dias >= prev.dias * 1.25 && t.dias - prev.dias >= 5) prioridades.push({ nivel: 2, texto: `aumento de los días de reposo (${n0(prev.dias)} → ${n0(t.dias)})`, accion: "Analizar los reposos nuevos del trimestre por causa y área para frenar la subida de los días perdidos." });
  }

  const verdes = semaforo.filter((x) => x.estado === 0).length;
  const amarillos = semaforo.filter((x) => x.estado === 1).length;
  const rojos = semaforo.filter((x) => x.estado === 2).length;

  const integral = (() => {
    const hayDatos = r.consultas.total || r.morbilidad.total || r.ausentismo.dias_perdidos || acc?.accidentes;
    if (!hayDatos) return `${sin} Sin consultas, diagnósticos, reposos ni accidentes no hay comportamiento que analizar; conviene confirmar que la atención del servicio se esté registrando en el sistema.`;
    const f = [elige([
      `De ${plural(semaforo.length, "indicador evaluado", "indicadores evaluados")}, ${n0(verdes)} ${verdes === 1 ? "está" : "están"} en rango favorable, ${n0(amarillos)} en vigilancia y ${n0(rojos)} en nivel crítico.`,
      `Al integrar todos los cuadros y gráficos, el balance es de ${n0(verdes)} ${verdes === 1 ? "indicador favorable" : "indicadores favorables"}, ${n0(amarillos)} en vigilancia y ${n0(rojos)} ${rojos === 1 ? "crítico" : "críticos"}.`,
    ])];
    if (pob && r.consultas.total) f.push(`La demanda fue de ${n1((r.consultas.total * 100) / pob)} consultas por cada 100 trabajadores${r.morbilidad.pacientes ? `, con ${pc(r.morbilidad.pacientes, pob)} de la plantilla con algún diagnóstico` : ""}${r.consultas.pacientes && r.consultas.sanos ? ` y ${pc(r.consultas.sanos, r.consultas.pacientes)} de los atendidos sanos` : ""}.`);
    if (cruces.length) f.push(`Al cruzar los cuadros se observa que ${unir(cruces.slice(0, 5))}.`);
    else f.push("Los cuadros no muestran relaciones de alerta entre sí: morbilidad, ausentismo y accidentalidad se comportan de forma independiente y dentro de lo esperado.");
    return f.join(" ");
  })();

  prioridades.sort((a, b) => a.nivel - b.nivel);
  const nivel = ["", "Prioridad alta", "Prioridad media", "Prioridad baja"];
  const texPrioridades = (() => {
    const lineas = ([1, 2] as const).map((n) => {
      const l = prioridades.filter((x) => x.nivel === n);
      return l.length ? `${nivel[n]}: ${unir(l.map((x) => x.texto))}.` : "";
    }).filter(Boolean);
    const sostener: string[] = [];
    if (pob && d.pct < 2.5) sostener.push(r.ausentismo.dias_perdidos ? "ausentismo dentro de la meta" : "ausentismo nulo");
    if (!acc?.accidentes) sostener.push("cero accidentes de trabajo");
    if (!eo) sostener.push("sin enfermedades ocupacionales");
    if (pob && p(periodicas, pob) >= 20) sostener.push("ritmo adecuado de evaluaciones periódicas");
    if (sostener.length) lineas.push(`${nivel[3]} (sostener): ${unir(sostener)}.`);
    if (!prioridades.length) lineas.unshift("No hay alertas de prioridad alta ni media en este trimestre.");
    return lineas.join("\n");
  })();

  const recomendaciones_empresa = (() => {
    const l = prioridades.map((x) => x.accion).filter((x): x is string => Boolean(x));
    l.push(`Medir en el próximo informe estas metas: ausentismo menor de 2,5 %, cero accidentes con tiempo perdido${pob ? `, al menos ${n0(Math.ceil(pob / 4))} evaluaciones periódicas` : ""} y todas las declaraciones al día.`);
    return [...new Set(l)].map((x, i) => `${i + 1}. ${x}`).join("\n");
  })();

  const conclusion_final = (() => {
    const lugar = d.empresa ? "la empresa" : "el conjunto de empresas";
    const altas = prioridades.filter((x) => x.nivel === 1);
    const f = [elige([
      `En síntesis, el ${etq(d.etiqueta)} cierra para ${lugar} con ${n0(verdes)} de ${plural(semaforo.length, "indicador", "indicadores")} en rango favorable${rojos ? ` y ${plural(rojos, "indicador crítico", "indicadores críticos")}` : ""}.`,
      `Como conclusión final, ${lugar} termina el ${etq(d.etiqueta)} con ${rojos ? `${plural(rojos, "indicador crítico", "indicadores críticos")} y ` : ""}${n0(verdes)} de ${n0(semaforo.length)} indicadores en rango favorable.`,
    ])];
    if (altas.length) f.push(`Lo primero a resolver es ${unir(altas.slice(0, 2).map((x) => x.texto))}.`);
    else if (prioridades.length) f.push(`No hay alertas graves; el foco del próximo trimestre es ${prioridades[0].texto}.`);
    else f.push("No hay alertas graves ni medias: la tarea es sostener los resultados y la vigilancia periódica.");
    if (historial.length) {
      const prev = historial[historial.length - 1];
      const dif = prev.consultas ? (t.consultas - prev.consultas) / prev.consultas : 0;
      f.push(Math.abs(dif) < 0.1 ? "La demanda de atención se mantiene estable frente al período anterior." : `La demanda de atención ${dif > 0 ? "crece" : "baja"} frente al período anterior.`);
    }
    f.push(elige([
      "Con las recomendaciones de este informe, el próximo trimestre permitirá medir si los indicadores mejoran.",
      "El cumplimiento de las recomendaciones se verificará con los mismos indicadores en el próximo informe.",
    ]));
    return f.join(" ");
  })();

  return { tendencias, integral, prioridades: texPrioridades, recomendaciones_empresa, conclusion_final };
}
