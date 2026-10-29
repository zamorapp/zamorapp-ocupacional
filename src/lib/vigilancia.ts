import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { recordar } from "@/lib/memo";
import { mismoPeriodoAnioAnterior, periodoAnterior, periodoDeConsulta, type ConsultaPeriodo, type Periodo } from "@/lib/periodos";
import {
  completarHorasHombre, indicadoresAusentismo, type CriterioHoras, indicesCovenin, obtenerAccidentalidad, obtenerInforme, obtenerReporte, obtenerSeries, riesgosDeEmpresa, type Firmantes,
} from "@/lib/reportes";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { generarAnalisis, sinDiscapacidad, type DatosAnalisis } from "@/lib/vigilancia-analisis";
import { textosSugeridos } from "@/lib/vigilancia-textos";

// Los cálculos del período se recuerdan 3 minutos por usuario: cambiar de trimestre y volver, o pasar de la
// pantalla al informe impreso, no repite las consultas a la base. Guardar una consulta, un paciente, un accidente o el informe los borra (olvidar).
const TRES_MINUTOS = 3 * 60 * 1000;
const clave = (sesion: Sesion, que: string, empresaId: string | null, p: Pick<Periodo, "desde" | "hasta">) => `${sesion.orgId}|${sesion.usuarioId}|${que}|${empresaId ?? "*"}|${p.desde}|${p.hasta}`;

// Todo lo que necesitan la pantalla de Reportes y el informe impreso, calculado una sola vez
// paraEmpresa: los textos sugeridos y el análisis se arman sin la discapacidad (versión que se envía a RR. HH.)
export async function cargarVigilancia(sesion: Sesion, empresaId: string | null, q: ConsultaPeriodo, { paraEmpresa = false } = {}) {
  const empresas = await listarEmpresas();
  const empresa = empresas.find((e) => e.id === empresaId) ?? null;
  const periodo = periodoDeConsulta(q, empresa?.mesInicioGestion ?? 1);
  const anterior = periodoAnterior(periodo);
  const anioAnterior = mismoPeriodoAnioAnterior(periodo);
  const listo = !sesion.demo && supabaseConfigurado;
  const memo = <T,>(que: string, p: Periodo, fn: () => Promise<T>) => recordar(clave(sesion, que, empresaId, p), TRES_MINUTOS, fn);

  const [r, s, sAnt, sAnio, accBase, listas, informe, riesgos, perfil, criterioHoras] = await Promise.all([
    listo ? memo("reporte", periodo, () => obtenerReporte(empresaId, periodo)) : null,
    listo ? memo("series", periodo, () => obtenerSeries(empresaId, periodo)) : null,
    listo ? memo("series", anterior, () => obtenerSeries(empresaId, anterior)) : null,
    listo ? memo("series", anioAnterior, () => obtenerSeries(empresaId, anioAnterior)) : null,
    listo ? memo("accidentes", periodo, () => obtenerAccidentalidad(empresaId, periodo)) : null,
    opciones(sesion.orgId, ["causa_reposo", "ente_emisor_reposo", "clasificacion_aptitud", "resultado_reubicacion"]),
    listo ? obtenerInforme(empresaId, periodo) : null,
    listo ? riesgosDeEmpresa(empresaId) : {},
    listo
      ? (async () => (await (await crearClienteServidor()).from("perfiles").select("nombre_completo, cedula").eq("id", sesion.usuarioId).maybeSingle()).data)()
      : null,
    // Configuración › Organización › Informe de vigilancia: horas hombre como el SAME (por defecto) o según nómina
    listo
      ? (async () => {
          const { data } = await (await crearClienteServidor()).from("organizaciones").select("ajustes").eq("id", sesion.orgId!).maybeSingle();
          return ((data?.ajustes as { vigilancia_horas?: string } | null)?.vigilancia_horas === "nomina" ? "nomina" : "same") as CriterioHoras;
        })()
      : ("same" as CriterioHoras),
  ]);
  const nombre = (lista: string) => Object.fromEntries(listas[lista].map((i) => [i.codigo ?? i.nombre, i.nombre]));
  const causas = nombre("causa_reposo");
  const entes = nombre("ente_emisor_reposo");
  const aptitudes = nombre("clasificacion_aptitud");
  const resultadosReubicacion = nombre("resultado_reubicacion");
  const acc = accBase && r ? completarHorasHombre(accBase, r.poblacion.total, periodo, criterioHoras) : null;
  const ix = acc ? indicesCovenin(acc) : null;
  const ausentismo = r ? indicadoresAusentismo(r) : { pad: 0, pct: 0 };
  const rTexto = r && paraEmpresa ? sinDiscapacidad(r) : r;

  // Datos que usa la redacción del análisis (también viajan al editor para «Otra redacción»)
  const datosAnalisis: DatosAnalisis | null = r
    ? {
        empresa: empresa?.razonSocial ?? null,
        etiqueta: periodo.etiqueta,
        desde: periodo.desde,
        hasta: periodo.hasta,
        r: rTexto!,
        s: s ?? { por_mes: [], piramide: [], capitulos: [] },
        anterior: sAnt ? { etiqueta: anterior.etiqueta, s: sAnt } : null,
        anioAnterior: sAnio ? { etiqueta: anioAnterior.etiqueta, s: sAnio } : null,
        pct: ausentismo.pct,
        pad: ausentismo.pad,
        acc: acc && ix
          ? { accidentes: acc.accidentes, conTiempoPerdido: acc.con_tiempo_perdido, diasPerdidos: acc.dias_perdidos, ifn: ix.ifn, is: ix.is, aTiempo: ix.aTiempo, porDeclarar: acc.por_declarar }
          : null,
        causas,
        aptitudes,
      }
    : null;
  const variante = informe?.variante ?? 0;
  const analisis = datosAnalisis ? generarAnalisis(datosAnalisis, variante) : null;

  const base = r
    ? textosSugeridos({
        r: rTexto!,
        pct: ausentismo.pct,
        accidentes: acc?.accidentes ?? 0,
        conTiempoPerdido: acc?.con_tiempo_perdido ?? 0,
        enfermedades: acc?.enfermedades ?? 0,
        riesgos,
        causas,
        aptitudes,
      })
    : null;
  // Resumen y conclusión salen del análisis (redacción variable); recomendaciones, riesgos y medidas, de las sugerencias por riesgo
  const sugeridos = base && analisis ? { ...base, resumen: analisis.resumen, conclusiones: analisis.conclusion } : base;
  // El médico que redacta firma por defecto como médico ocupacional
  const firmantesBase: Firmantes = perfil?.nombre_completo ? { medico: { nombre: perfil.nombre_completo, cedula: perfil.cedula ?? "" } } : {};

  return {
    empresas, empresa, periodo, anterior, anioAnterior, r, s, sAnt, sAnio, acc, ix, causas, entes, aptitudes, resultadosReubicacion, ausentismo,
    informe, sugeridos, firmantesBase, datosAnalisis, analisis, variante,
  };
}
