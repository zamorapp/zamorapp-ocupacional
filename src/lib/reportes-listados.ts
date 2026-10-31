import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { periodoDeConsulta, type ConsultaPeriodo } from "@/lib/periodos";
import { columnasVista, ETIQUETAS_FIJAS, reporte, type DefReporte } from "@/lib/reportes-catalogo";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { hoyCaracas } from "@/lib/fecha";

export type Valor = string | number | null;
export type Fila = Record<string, Valor>;
export type Barra = { nombre: string; n: number };
export type Pivote = { titulo: string; columnas: string[]; filas: { nombre: string; celdas: number[]; total: number; pacientes: number }[]; totales: number[]; total: number; pacientes: number };

// Parámetros de URL de un reporte: período + empresa + filtros (f_<columna>) + opciones (o_<opción>) + búsqueda (q)
// + columnas opcionales a mostrar (ver=a,b)
export type ConsultaReporte = ConsultaPeriodo & { empresa?: string; q?: string; ver?: string; [k: `f_${string}` | `o_${string}`]: string | undefined };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Cuenta (o suma "valor") por cada valor de la columna "por"; "separar" parte textos con «; » (criterios, limitaciones)
export function contar(filas: Fila[], por: string, valor?: string, separar?: boolean): Barra[] {
  const m = new Map<string, number>();
  for (const f of filas) {
    const claves = separar ? String(f[por] ?? "").split("; ").filter(Boolean) : [String(f[por] ?? "") || "Sin dato"];
    for (const k of claves) m.set(k, (m.get(k) ?? 0) + (valor ? Number(f[valor] ?? 0) : 1));
  }
  return [...m.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
}

function armarPivote(filas: Fila[], fil: string, col: string, titulo: string): Pivote {
  const columnas = contar(filas, col).map((c) => c.nombre);
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = String(f[fil] ?? "Sin dato");
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const unicos = (fs: Fila[]) => new Set(fs.map((f) => f.cedula)).size;
  const salida = [...grupos.entries()]
    .map(([nombre, fs]) => ({ nombre, celdas: columnas.map((c) => fs.filter((f) => String(f[col] ?? "Sin dato") === c).length), total: fs.length, pacientes: unicos(fs) }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  return {
    titulo,
    columnas,
    filas: salida,
    totales: columnas.map((_, i) => salida.reduce((s, f) => s + f.celdas[i], 0)),
    total: filas.length,
    pacientes: unicos(filas),
  };
}

// Indicadores de cabecera según el reporte
function indicadores(def: DefReporte, filas: Fila[]): { titulo: string; valor: string; detalle?: string }[] {
  const n = (x: number) => x.toLocaleString("es-VE");
  const unicos = (k: string) => new Set(filas.map((f) => f[k]).filter(Boolean)).size;
  const suma = (k: string) => filas.reduce((s, f) => s + Number(f[k] ?? 0), 0);
  const cuenta = (k: string, v: string) => filas.filter((f) => f[k] === v).length;
  switch (def.clave) {
    case "atendidos":
    case "relacion":
      return [
        { titulo: "Consultas", valor: n(filas.length) },
        { titulo: "Pacientes", valor: n(unicos("cedula")), detalle: "distintos" },
        { titulo: "Empresas", valor: n(unicos("empresa")) },
        { titulo: "Promedio por paciente", valor: unicos("cedula") ? (filas.length / unicos("cedula")).toFixed(1).replace(".", ",") : "—", detalle: "consultas" },
      ];
    case "morbilidad":
      return [
        { titulo: "Diagnósticos", valor: n(suma("casos")), detalle: `${n(filas.length)} códigos CIE-10` },
        { titulo: "Pacientes atendidos", valor: n([...new Map(filas.map((f) => [f.grupo, Number(f.atendidos ?? 0)])).values()].reduce((s, x) => s + x, 0)), detalle: "base del % de atendidos" },
        { titulo: "Origen ocupacional", valor: n(suma("ocupacional")), detalle: suma("casos") ? `${Math.round((suma("ocupacional") * 100) / suma("casos"))} %` : undefined },
        { titulo: "Primera causa", valor: String(filas[0]?.cie10 ?? "—"), detalle: String(filas[0]?.descripcion ?? "") },
      ];
    case "diagnosticos":
      return [
        { titulo: "Diagnósticos", valor: n(filas.length) },
        { titulo: "Pacientes", valor: n(unicos("cedula")) },
        { titulo: "Códigos distintos", valor: n(unicos("cie10")) },
        { titulo: "Ocupacionales", valor: n(filas.filter((f) => /ocupacional|laboral/i.test(String(f.origen))).length) },
      ];
    case "reposos":
      return [
        { titulo: "Reposos", valor: n(filas.length) },
        { titulo: "Trabajadores", valor: n(unicos("cedula")) },
        { titulo: "Días en el período", valor: n(suma("dias_periodo")), detalle: `${n(suma("dias"))} días en total` },
        { titulo: "Promedio por reposo", valor: filas.length ? (suma("dias") / filas.length).toFixed(1).replace(".", ",") : "—", detalle: "días" },
      ];
    case "aptitud":
    case "limitaciones":
      return [
        { titulo: "Constancias", valor: n(filas.length) },
        { titulo: "Trabajadores", valor: n(unicos("cedula")) },
        { titulo: "Con restricciones", valor: n(filas.filter((f) => f.restricciones).length) },
        { titulo: "Vencidas hoy", valor: n(filas.filter((f) => f.vigente_hasta && String(f.vigente_hasta) < hoyCaracas()).length), detalle: "según vigencia" },
      ];
    case "citas": {
      const validas = filas.length - cuenta("estado", "Cancelada");
      return [
        { titulo: "Citas", valor: n(filas.length) },
        { titulo: "Atendidas", valor: n(cuenta("estado", "Atendido")) },
        { titulo: "No asistió", valor: n(cuenta("estado", "No asistió")) },
        { titulo: "Asistencia", valor: validas ? `${Math.round((cuenta("estado", "Atendido") * 100) / validas)} %` : "—", detalle: "sin contar canceladas" },
      ];
    }
    case "estadistica":
      return [
        { titulo: "Consultas", valor: n(suma("consultas")) },
        { titulo: "Médicos", valor: n(unicos("medico")) },
        { titulo: "Firmadas", valor: n(suma("firmadas")), detalle: suma("consultas") ? `${Math.round((suma("firmadas") * 100) / suma("consultas"))} %` : undefined },
      ];
    case "medicos":
      return [
        { titulo: "Consultas", valor: n(suma("consultas")) },
        { titulo: "Médicos", valor: n(filas.length) },
        { titulo: "Pacientes", valor: n(suma("pacientes")), detalle: "suma por médico" },
        { titulo: "Aptitudes", valor: n(suma("aptitudes")), detalle: `${n(suma("restringidas"))} restringidas o no elegibles` },
      ];
    case "declaracion":
      return [
        { titulo: "Casos", valor: n(filas.length) },
        { titulo: "EDO (MPPS)", valor: n(filas.filter((f) => /MPPS/.test(String(f.notificacion))).length), detalle: `${n(filas.filter((f) => /inmediata/i.test(String(f.notificacion))).length)} inmediatas` },
        { titulo: "INPSASEL", valor: n(filas.filter((f) => /INPSASEL/.test(String(f.notificacion))).length) },
        { titulo: "Sin evento registrado", valor: n(filas.filter((f) => /INPSASEL/.test(String(f.notificacion)) && !f.evento).length), detalle: "ocupacionales por declarar" },
      ];
    case "examenes":
      return [
        { titulo: "Exámenes", valor: n(filas.length) },
        { titulo: "Pacientes", valor: n(unicos("cedula")) },
        { titulo: "Pendientes de resultado", valor: n(cuenta("estado_resultado", "Pendiente")) },
        { titulo: "Tipos de examen", valor: n(unicos("examen")) },
      ];
    case "pacientes":
      return [
        { titulo: "Trabajadores", valor: n(filas.length) },
        { titulo: "Activos", valor: n(cuenta("estado", "Activo") + cuenta("estado", "En reposo")) },
        { titulo: "Sin consulta", valor: n(filas.filter((f) => !f.ultima_consulta).length) },
        { titulo: "Aptitud vencida", valor: n(filas.filter((f) => f.vigente_hasta && String(f.vigente_hasta) < hoyCaracas()).length) },
      ];
    case "vencimientos":
      return [
        { titulo: "Vencidos", valor: n(cuenta("situacion", "Vencido")), detalle: "examen atrasado" },
        { titulo: "Por vencer", valor: n(cuenta("situacion", "Por vencer")) },
        { titulo: "Sin evaluación", valor: n(cuenta("situacion", "Sin evaluación")), detalle: "activos sin aptitud" },
        { titulo: "Empresas", valor: n(unicos("empresa")) },
      ];
    case "accidentalidad": {
      // Índices del período completo: se calculan sobre los totales, no se promedian los meses
      const hht = suma("hht");
      const indice = (x: number) => (hht > 0 ? ((x * 1_000_000) / hht).toLocaleString("es-VE", { maximumFractionDigits: 2 }) : "—");
      return [
        { titulo: "IF neta", valor: indice(suma("con_tiempo_perdido")), detalle: `${n(suma("con_tiempo_perdido"))} con tiempo perdido` },
        { titulo: "IF bruta", valor: indice(suma("accidentes")), detalle: `${n(suma("accidentes"))} accidentes` },
        { titulo: "Índice de severidad", valor: indice(suma("dias_perdidos") + suma("dias_cargados")), detalle: `${n(suma("dias_perdidos") + suma("dias_cargados"))} días perdidos y cargados` },
        { titulo: "Horas hombre", valor: n(hht), detalle: filas.some((f) => f.metodo !== "Nómina") ? "incluye horas estimadas" : "según nómina" },
      ];
    }
    default:
      return [
        { titulo: "Registros", valor: n(filas.length) },
        ...(filas.some((f) => f.cedula) ? [{ titulo: "Pacientes", valor: n(unicos("cedula")) }] : []),
      ];
  }
}

// Carga un reporte del catálogo con sus filas ya traducidas (etiquetas), filtradas y resumidas.
// La pantalla, la impresión y el Excel usan exactamente lo mismo.
export async function cargarListado(clave: string, q: ConsultaReporte) {
  const def = reporte(clave);
  if (!def) return null;
  const [sesion, empresas, cookieEmpresa] = await Promise.all([obtenerSesion(), listarEmpresas(true), empresaActivaId()]);
  const empresaId = q.empresa ?? cookieEmpresa;
  const empresa = empresas.find((e) => e.id === empresaId) ?? null;
  const periodo = periodoDeConsulta(q, empresa?.mesInicioGestion ?? 1);
  // Opciones elegidas (solo valores del catálogo; la primera es la predeterminada)
  const opc: Record<string, string> = Object.fromEntries(
    (def.opciones ?? []).map((o) => [o.k, o.valores.some(([v]) => v === q[`o_${o.k}`]) ? q[`o_${o.k}`]! : o.valores[0][0]]),
  );
  const pOpciones = Object.fromEntries(
    (def.opciones ?? []).filter((o) => o.sql && opc[o.k]).map((o) => [o.k, /^\d+$/.test(opc[o.k]) ? Number(opc[o.k]) : opc[o.k] === "true" ? true : opc[o.k]]),
  );
  const ver = (q.ver ?? "").split(",").filter((k) => def.columnas.some((c) => c.opcional && c.k === k));
  const listo = supabaseConfigurado && !sesion.demo;

  const [crudas, listas] = await Promise.all([
    listo
      ? (async () => {
          const supabase = await crearClienteServidor();
          const { data, error } = await supabase.rpc(def.funcion ?? "reporte_listado", {
            p_tipo: def.fuente, p_empresa: empresa?.id ?? null, p_desde: periodo.desde, p_hasta: periodo.hasta, p_opciones: pOpciones,
          });
          if (error) throw error;
          return (data ?? []) as Fila[];
        })()
      : Promise.resolve([] as Fila[]),
    opciones(sesion.orgId, ["causa_reposo", "ente_emisor_reposo", "clasificacion_aptitud"]),
  ]);
  const deLista = (l: string) => Object.fromEntries(listas[l].map((i) => [i.codigo ?? i.nombre, i.nombre]));
  const etiquetas: Record<string, Record<string, string>> = {
    ...ETIQUETAS_FIJAS,
    aptitud: { ...ETIQUETAS_FIJAS.aptitud, ...deLista("clasificacion_aptitud") },
    causa: deLista("causa_reposo"),
    ente: deLista("ente_emisor_reposo"),
  };

  // Traduce códigos a texto (aptitud, causa, origen…) y sí/no; las fechas quedan en ISO
  const todas: Fila[] = crudas.map((f) => {
    const s: Fila = { ...f };
    for (const c of def.columnas) {
      const v = f[c.k] as unknown;
      if (c.tipo === "si_no") s[c.k] = v === true ? "Sí" : v === false ? "No" : null;
      else if (c.etiqueta && typeof v === "string") s[c.k] = etiquetas[c.etiqueta]?.[v] ?? v.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
    }
    return s;
  });

  // Valores posibles de cada filtro (antes de filtrar, para poder cambiarlos)
  const opcionesFiltro = Object.fromEntries(def.filtros.map((k) => [k, contar(todas, k).map((b) => b.nombre)]));
  const activos = Object.fromEntries(def.filtros.map((k) => [k, q[`f_${k}`] ?? ""]).filter(([, v]) => v));
  const busqueda = (q.q ?? "").trim();
  const b = sinAcentos(busqueda);
  const filas = todas.filter(
    (f) =>
      Object.entries(activos).every(([k, v]) => String(f[k] ?? "") === v || (!f[k] && v === "Sin dato")) &&
      (!b || def.columnas.some((c) => f[c.k] !== null && sinAcentos(String(f[c.k])).includes(b))),
  );

  // Morbilidad: posición y % sobre los casos de su grupo, y % de los pacientes atendidos afectados (el % del SAME)
  if (def.ranking) {
    const casosGrupo = new Map<Valor, number>();
    for (const f of filas) casosGrupo.set(f.grupo ?? null, (casosGrupo.get(f.grupo ?? null) ?? 0) + Number(f.casos ?? 0));
    const puesto = new Map<Valor, number>();
    for (const f of filas) {
      const g = f.grupo ?? null;
      const total = casosGrupo.get(g) ?? 0;
      puesto.set(g, (puesto.get(g) ?? 0) + 1);
      const pct = (n: number, d: number) => (d ? Math.round((n * 1000) / d) / 10 : 0);
      Object.assign(f, { puesto: puesto.get(g), pct: pct(Number(f.casos), total), pct_atendidos: pct(Number(f.pacientes), Number(f.atendidos ?? 0)) });
    }
  }

  const resumenes = def.resumenes.map((r) => ({ ...r, filas: contar(filas, r.por, r.valor, r.separar).slice(0, r.limite ?? 10) }));
  const totales = Object.fromEntries(def.columnas.filter((c) => c.total).map((c) => [c.k, filas.reduce((s, f) => s + Number(f[c.k] ?? 0), 0)]));

  return {
    def,
    sesion,
    empresa,
    periodo,
    opc,
    ver,
    listo,
    columnas: columnasVista(def, { sinClinico: Boolean(def.clinico && !sesion.clinico), ver, agrupado: opc.agrupar || undefined }),
    // Columna por la que se agrupa la impresión: el grupo de la morbilidad o, en el consolidado, la empresa
    agrupar: opc.agrupar ? "grupo" : !empresa && !def.pivote && def.columnas.some((c) => c.k === "empresa") ? "empresa" : null,
    filas,
    total: todas.length,
    totales,
    opcionesFiltro,
    activos,
    busqueda,
    resumenes,
    indicadores: indicadores(def, filas),
    pivote: def.pivote ? armarPivote(filas, opc.filas || def.pivote.filas, def.pivote.columnas, def.columnas.find((c) => c.k === (opc.filas || def.pivote!.filas))?.t ?? "") : null,
    // Sin acceso clínico, un reporte clínico sale vacío por las reglas de la base: se avisa en pantalla
    sinAccesoClinico: Boolean(def.clinico && !sesion.clinico),
  };
}

export type Listado = NonNullable<Awaited<ReturnType<typeof cargarListado>>>;

// Parámetros para reproducir el mismo reporte (impresión y Excel): período, empresa, filtros, opciones, búsqueda
export function parametrosListado(q: ConsultaReporte, empresaId: string | null) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (typeof v === "string" && v && k !== "empresa") p.set(k, v);
  if (empresaId) p.set("empresa", empresaId);
  return p;
}
