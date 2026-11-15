// Informe de vigilancia con datos de ejemplo (inventados, sin personas reales) para la prueba automática de
// impresión: /imprimir/prueba/vigilancia solo existe con ZAMORAPP_PRUEBA_IMPRESION=1 (CI y banco local).
// «vacio»: un trimestre sin registros, para ver que cada cuadro dice «no se encontraron registros».

import type { Item } from "@/lib/listas";
import { mismoPeriodoAnioAnterior, periodoAnterior, periodoDeConsulta } from "@/lib/periodos";
import type { Reporte } from "@/lib/reportes";
import type { DatosBrutosVigilancia } from "@/lib/vigilancia";
import type { Series } from "@/lib/vigilancia-analisis";

const lista = (pares: [string, string][]): Item[] => pares.map(([codigo, nombre], i) => ({ id: codigo, codigo, nombre, grupo: null, texto: null, orden: i, activo: true }));
const causa = (cie10: string, descripcion: string, n: number, pacientes = n) => ({ cie10, descripcion, n, pacientes });

const serie = (k: number): Series => ({
  por_mes: [
    { mes: "2026-07", consultas: Math.round(48 * k), preventivas: Math.round(20 * k), diagnosticos: Math.round(30 * k), dias_reposo: Math.round(40 * k) },
    { mes: "2026-08", consultas: Math.round(55 * k), preventivas: Math.round(22 * k), diagnosticos: Math.round(36 * k), dias_reposo: Math.round(62 * k) },
    { mes: "2026-09", consultas: Math.round(51 * k), preventivas: Math.round(18 * k), diagnosticos: Math.round(33 * k), dias_reposo: Math.round(45 * k) },
  ],
  piramide: [
    { grupo: "18-24", F: 6, M: 14, n: 20 }, { grupo: "25-34", F: 18, M: 42, n: 60 }, { grupo: "35-44", F: 15, M: 35, n: 50 },
    { grupo: "45-54", F: 8, M: 22, n: 30 }, { grupo: "55-64", F: 4, M: 16, n: 20 },
  ],
  capitulos: [
    { nombre: "Osteomuscular", n: Math.round(38 * k) }, { nombre: "Respiratorio", n: Math.round(22 * k) }, { nombre: "Traumatismos", n: Math.round(9 * k) },
    { nombre: "Circulatorio", n: Math.round(8 * k) }, { nombre: "Digestivo", n: Math.round(7 * k) }, { nombre: "Piel", n: Math.round(5 * k) }, { nombre: "Ojo y anexos", n: Math.round(4 * k) },
  ],
});

const reporte: Reporte = {
  poblacion: { total: 180, femenino: 51, masculino: 129, por_tipo: [], discapacidad: 3, vigilancia_ocupacional: 24, vigilancia_no_ocupacional: 11 },
  consultas: {
    total: 154, pacientes: 112, preventivas: 60, no_preventivas: 94, sanos: 41, patologicos: 71,
    por_motivo: [
      { nombre: "Morbilidad", n: 82, grupo: "no_preventivo" }, { nombre: "Periódico", n: 28, grupo: "preventivo" }, { nombre: "Pre-empleo", n: 14, grupo: "preventivo" },
      { nombre: "Pre vacacional", n: 9, grupo: "preventivo" }, { nombre: "Post vacacional", n: 6, grupo: "preventivo" }, { nombre: "Egreso", n: 3, grupo: "preventivo" },
      { nombre: "Control", n: 12, grupo: "no_preventivo" },
    ],
    por_tipo: {},
    por_tipo_paciente: [{ nombre: "Obrero", n: 96 }, { nombre: "Empleado", n: 38 }, { nombre: "Aspirante", n: 14 }, { nombre: "Contratado", n: 6 }],
    por_sexo: { F: 52, M: 102 },
    por_edad: [{ grupo: "18-24", n: 14 }, { grupo: "25-34", n: 46 }, { grupo: "35-44", n: 44 }, { grupo: "45-54", n: 30 }, { grupo: "55-64", n: 20 }],
    por_dependencia: [{ nombre: "Producción", n: 70, personal: 80 }, { nombre: "Almacén", n: 38, personal: 25 }, { nombre: "Mantenimiento", n: 26, personal: 35 }, { nombre: "Administración", n: 20, personal: 40 }],
    por_dependencia_motivo: [
      { dependencia: "Administración", motivo: "Periódico", consultas: 12, diagnosticos: 3 }, { dependencia: "Administración", motivo: "Morbilidad", consultas: 8, diagnosticos: 7 },
      { dependencia: "Almacén", motivo: "Morbilidad", consultas: 30, diagnosticos: 28 }, { dependencia: "Almacén", motivo: "Control", consultas: 6, diagnosticos: 4 }, { dependencia: "Almacén", motivo: "Prenatal", consultas: 2, diagnosticos: 1 },
      { dependencia: "Mantenimiento", motivo: "Morbilidad", consultas: 16, diagnosticos: 15 }, { dependencia: "Mantenimiento", motivo: "Periódico", consultas: 10, diagnosticos: 2 },
      { dependencia: "Producción", motivo: "Morbilidad", consultas: 28, diagnosticos: 26 }, { dependencia: "Producción", motivo: "Pre-empleo", consultas: 14, diagnosticos: 2 }, { dependencia: "Producción", motivo: "Pre vacacional", consultas: 9, diagnosticos: 1 },
      { dependencia: "Producción", motivo: "Post vacacional", consultas: 6, diagnosticos: 1 }, { dependencia: "Producción", motivo: "Periódico", consultas: 6, diagnosticos: 1 }, { dependencia: "Producción", motivo: "Control", consultas: 6, diagnosticos: 4 }, { dependencia: "Producción", motivo: "Egreso", consultas: 1, diagnosticos: 0 },
    ],
  },
  catalogo: {
    motivos: ["Pre-empleo", "Periódico", "Pre vacacional", "Post vacacional", "Egreso", "Reintegro", "Anual", "Cambio de puesto", "Morbilidad", "Control", "Urgencia", "Prenatal"].map((nombre, i) => ({ nombre, grupo: i < 8 ? "preventivo" : "no_preventivo" })),
    sistemas: ["Osteomuscular", "Respiratorio", "Traumatismos", "Circulatorio", "Digestivo", "Piel", "Ojo y anexos", "Oído", "Nervioso", "Genitourinario", "Endocrino"],
  },
  legal: {
    examenes: { programados: 48, realizados: 37, vencidos: 11, evaluados_periodo: 52, por_vencer: 21, sin_evaluacion: 4,
      por_dependencia: [
        { dependencia: "Producción", programados: 24, realizados: 17, vencidos: 7 },
        { dependencia: "Almacén", programados: 12, realizados: 9, vencidos: 3 },
        { dependencia: "Mantenimiento", programados: 8, realizados: 7, vencidos: 1 },
        { dependencia: "Administración", programados: 4, realizados: 4, vencidos: 0 },
      ] },
    enfermedades: { registradas: 2, declaradas: 2, a_tiempo: 1, por_declarar: 0, informe_nt02: 1, informe_a_tiempo: 1, informe_pendiente: 1, certificadas: 0, sospechas_sin_registro: 2,
      por_grupo: [{ grupo: "010 Trastornos musculoesqueléticos", n: 1 }, { grupo: "070 Afecciones por factores psicosociales", n: 1 }] },
    resultados: [
      { estudio: "Audiometría", grupo: "Expuestos a ruido", expuesto: true, evaluados: 14, normales: 9, alterados: 4, sin_resultado: 1 },
      { estudio: "Audiometría", grupo: "Sin exposición a ruido registrada", expuesto: false, evaluados: 6, normales: 6, alterados: 0, sin_resultado: 0 },
      { estudio: "Espirometría", grupo: "Expuestos a polvos, humos o químicos", expuesto: true, evaluados: 9, normales: 8, alterados: 1, sin_resultado: 0 },
    ],
    expuestos_sin_estudio: { ruido: 5, respiratorio: 3 },
  },
  morbilidad: {
    total: 99, pacientes: 71,
    por_sistema: [{ nombre: "Osteomuscular", n: 38 }, { nombre: "Respiratorio", n: 22 }, { nombre: "Traumatismos", n: 9 }, { nombre: "Circulatorio", n: 8 }, { nombre: "Digestivo", n: 7 }],
    por_origen: { comun: 86, accidente_comun: 7, accidente_laboral: 4, ocupacional: 2 },
    por_tipo_consulta: { primera: { n: 70, pacientes: 60 }, sucesiva: { n: 25, pacientes: 18 }, derivada: { n: 4, pacientes: 4 } },
    primeras_causas: [causa("M54.5", "Lumbago no especificado", 21, 16), causa("J00", "Rinofaringitis aguda", 14, 13), causa("M75.1", "Síndrome del manguito rotador", 8, 6), causa("I10", "Hipertensión esencial", 7, 7), causa("K29.7", "Gastritis", 6, 6), causa("S93.4", "Esguince de tobillo", 5, 5), causa("L23.9", "Dermatitis alérgica de contacto", 4, 4), causa("H10.9", "Conjuntivitis", 3, 3), causa("F32.9", "Episodio depresivo", 1, 1)],
    cortes: {
      sexo: { F: [causa("J00", "Rinofaringitis aguda", 6, 6), causa("M54.5", "Lumbago no especificado", 4, 4)], M: [causa("M54.5", "Lumbago no especificado", 17, 12), causa("M75.1", "Síndrome del manguito rotador", 7, 5), causa("J00", "Rinofaringitis aguda", 8, 7)] },
      edad: { "25-34": [causa("M54.5", "Lumbago no especificado", 9, 7), causa("J00", "Rinofaringitis aguda", 6, 6)], "55-64": [causa("I10", "Hipertensión esencial", 5, 5), causa("M54.5", "Lumbago no especificado", 3, 3)] },
      cargo: { "Operador de montacargas": [causa("M54.5", "Lumbago no especificado", 9, 7), causa("M75.1", "Síndrome del manguito rotador", 4, 3)], Soldador: [causa("H10.9", "Conjuntivitis", 3, 3), causa("L23.9", "Dermatitis alérgica de contacto", 3, 3)], "Gerente general": [causa("I10", "Hipertensión esencial", 1, 1)] },
      dependencia: { Producción: [causa("M54.5", "Lumbago no especificado", 12, 9), causa("M75.1", "Síndrome del manguito rotador", 6, 4)], Almacén: [causa("M54.5", "Lumbago no especificado", 6, 5), causa("S93.4", "Esguince de tobillo", 3, 3), causa("F32.9", "Episodio depresivo", 1, 1)] },
      origen: { comun: [causa("M54.5", "Lumbago no especificado", 18, 14), causa("J00", "Rinofaringitis aguda", 14, 13)], accidente_laboral: [causa("S93.4", "Esguince de tobillo", 3, 3)] },
      tipo: { primera: [causa("J00", "Rinofaringitis aguda", 12, 12), causa("M54.5", "Lumbago no especificado", 10, 10)], sucesiva: [causa("M54.5", "Lumbago no especificado", 9, 5), causa("I10", "Hipertensión esencial", 4, 4)] },
    },
  },
  referencias: { total: 18, por_especialidad: [{ nombre: "Traumatología", n: 8 }, { nombre: "Fisiatría", n: 5 }, { nombre: "Cardiología", n: 3 }, { nombre: "Oftalmología", n: 2 }] },
  ausentismo: {
    reposos: 24, reposos_iniciados: 22, dias_perdidos: 147, dias_periodo: 92, dias_computables: 147, trabajadores_ausentes: 17,
    por_causa: [{ nombre: "enfermedad_comun", n: 17, dias: 96 }, { nombre: "accidente_comun", n: 4, dias: 26 }, { nombre: "accidente_laboral", n: 3, dias: 25 }],
    permisos: [{ nombre: "paternidad", n: 2, dias: 28 }],
    por_ente: [{ nombre: "ivss", n: 14, dias: 101 }, { nombre: "interno", n: 10, dias: 46 }],
    primeras_causas: [{ ...causa("M54.5", "Lumbago no especificado", 7), dias: 52 }, { ...causa("S93.4", "Esguince de tobillo", 4), dias: 38 }, { ...causa("J00", "Rinofaringitis aguda", 6), dias: 14 }, { ...causa("M75.1", "Síndrome del manguito rotador", 3), dias: 30 }, { ...causa("F32.9", "Episodio depresivo", 1), dias: 7 }],
    detalle: [
      { causa: "enfermedad_comun", ente: "ivss", cie10: "M54.5", descripcion: "Lumbago no especificado", n: 7, dias: 52 },
      { causa: "enfermedad_comun", ente: "interno", cie10: "J00", descripcion: "Rinofaringitis aguda", n: 6, dias: 14 },
      { causa: "accidente_laboral", ente: "ivss", cie10: "S93.4", descripcion: "Esguince de tobillo", n: 3, dias: 25 },
      // Un solo caso y confidencial (F): en lo que va a la empresa no puede salir ni el código ni la descripción
      { causa: "enfermedad_comun", ente: "interno", cie10: "F32.9", descripcion: "Episodio depresivo", n: 1, dias: 7 },
      { causa: "accidente_comun", ente: "interno", cie10: "S93.4", descripcion: "Esguince de tobillo", n: 1, dias: 13 },
    ],
    por_dependencia: [{ nombre: "Producción", n: 12, dias: 84 }, { nombre: "Almacén", n: 7, dias: 41 }, { nombre: "Mantenimiento", n: 3, dias: 15 }, { nombre: "Administración", n: 2, dias: 7 }],
  },
  enfermedad_ocupacional: { casos: 1, dias: 12, casos_anteriores: 1, dias_anteriores: 20 },
  accidentes: [
    { fecha: "2026-07-14T14:30:00Z", tipo: "Accidente con lesión", lugar: "Almacén", lesion: "Esguince", parte: "Tobillo", gravedad: "Leve", dias: 9, estado: "Declarado" },
    { fecha: "2026-08-03T12:10:00Z", tipo: "Accidente con lesión", lugar: "Producción", lesion: "Contusión", parte: "Mano", gravedad: "Leve", dias: 6, estado: "Declarado" },
    { fecha: "2026-09-21T16:45:00Z", tipo: "Accidente con lesión", lugar: "Almacén", lesion: "Esguince", parte: "Tobillo", gravedad: "Moderada", dias: 10, estado: "Por declarar" },
  ],
  aptitud: { apto: 41, elegible_con_restricciones: 6, no_apto: 1 },
  especialidades_externas: [{ nombre: "Traumatología", n: 6 }, { nombre: "Fisiatría", n: 4 }],
  reubicaciones: { total: 3, por_resultado: [{ nombre: "efectiva", n: 2 }, { nombre: "en_seguimiento", n: 1 }], por_tipo: { temporal: 2, definitiva: 1 } },
  criterio: { solo_efectivos: true, tipos: ["Obrero", "Empleado", "Contratado"] },
};

const vacio: Reporte = {
  poblacion: { total: 12, femenino: 5, masculino: 7, por_tipo: [] },
  consultas: { total: 0, pacientes: 0, preventivas: 0, no_preventivas: 0, sanos: 0, por_motivo: [], por_tipo: {}, por_sexo: { F: 0, M: 0 }, por_edad: [] },
  morbilidad: { total: 0, por_sistema: [], por_origen: {}, primeras_causas: [] },
  ausentismo: { reposos: 0, dias_perdidos: 0, dias_periodo: 92, dias_computables: 0, por_causa: [], por_ente: [] },
  aptitud: {},
};

export function vigilanciaDePrueba(caso: "normal" | "vacio" = "normal"): DatosBrutosVigilancia {
  const periodo = periodoDeConsulta({ p: "t", anio: "2026", t: "3" });
  const anterior = periodoAnterior(periodo), anterior2 = periodoAnterior(anterior);
  const lleno = caso === "normal";
  return {
    empresas: [], empresa: null,
    periodo, anterior, anioAnterior: mismoPeriodoAnioAnterior(periodo), anterior2, anterior3: periodoAnterior(anterior2),
    r: lleno ? reporte : vacio,
    s: lleno ? serie(1) : { por_mes: [], piramide: [{ grupo: "25-34", F: 5, M: 7, n: 12 }], capitulos: [] },
    sAnt: lleno ? { ...serie(0.8), capitulos: serie(0.8).capitulos.map((c) => (c.nombre === "Traumatismos" ? { ...c, n: 3 } : c)) } : null,
    sAnio: lleno ? serie(0.9) : null,
    sAnt2: lleno ? serie(0.7) : null,
    sAnt3: lleno ? serie(0.75) : null,
    accBase: lleno
      ? { hht: 0, meses_con_horas: 0, hay_estimado: true, accidentes: 3, con_tiempo_perdido: 3, incidentes: 0, enfermedades: 1, dias_perdidos: 25, dias_cargados: 0, declarados_a_tiempo: 2, por_declarar: 1 }
      : { hht: 0, meses_con_horas: 0, hay_estimado: true, accidentes: 0, con_tiempo_perdido: 0, incidentes: 0, enfermedades: 0, dias_perdidos: 0, dias_cargados: 0, declarados_a_tiempo: 0, por_declarar: 0 },
    listas: {
      causa_reposo: lista([["enfermedad_comun", "Enfermedad común"], ["accidente_comun", "Accidente común"], ["accidente_laboral", "Accidente laboral"], ["enfermedad_ocupacional", "Enfermedad ocupacional"], ["paternidad", "Paternidad"]]),
      ente_emisor_reposo: lista([["ivss", "IVSS"], ["interno", "Servicio médico interno"]]),
      clasificacion_aptitud: lista([["apto", "Apto"], ["elegible_con_restricciones", "Apto con restricciones"], ["no_apto", "No apto"]]),
      resultado_reubicacion: lista([["efectiva", "Efectiva"], ["en_seguimiento", "En seguimiento"]]),
    },
    informe: null, riesgos: {}, perfil: null, criterioHoras: "same", previos: null,
  };
}

// Portada con todos los datos (personas inventadas): la prueba de impresión verifica que quepa en una hoja.
// «largo»: el peor caso razonable, 11 firmantes, NIL, aprobación y dirección larga.
export function portadaDePrueba(caso: "normal" | "largo" = "normal") {
  const p = (nombre: string, cedula: string, cargo: string, registro = "") => ({ nombre, cedula, cargo, registro });
  const largo = caso === "largo";
  return {
    logoEmpresa: null,
    orgLogo: null,
    org: "Servicio de prueba",
    empresa: {
      razonSocial: "SERVICIOS INDUSTRIALES DE EJEMPLO, C.A.", rif: "J-00000000-0", nil: largo ? "000000000" : null, actividad: "Servicios industriales",
      direccion: largo ? "Avenida de ejemplo, galpón 12, zona industrial norte, sector de prueba, municipio de ejemplo, estado de ejemplo" : "Avenida de ejemplo, zona industrial",
      telefono: "0412-0000000",
    },
    firmantes: {
      medico: p("Médico de Prueba", "10000000", "Médico ocupacional", "MPPS 00000"),
      servicio: [p("Coordinadora de Prueba", "11000000", "Coordinadora SSO"), p("Inspector de Prueba", "12000000", "Inspector SSO"), ...(largo ? [p("Analista de Prueba", "12500000", "Analista SSO")] : [])],
      representantes: [p("Gerente de Prueba", "13000000", "Gerente de proyecto"), p("Coordinador de Prueba", "14000000", "Coordinador AIT"), p("Analista de Prueba", "15000000", "Coordinadora de aseguramiento de calidad"), ...(largo ? [p("Jefe de Prueba", "15500000", "Jefe de operaciones")] : [])],
      delegados: [p("Delegada de Prueba", "16000000", "Delegada de prevención"), p("Delegado de Prueba", "17000000", "Delegado de prevención"), ...(largo ? [p("Delegado Tres", "17500000", "Delegado de prevención")] : [])],
      custodio: "Gerencia",
      autoridad: largo ? "Gerencia general" : undefined,
      centro_trabajo: "Galpones e instalaciones de la empresa ubicados en la avenida de ejemplo, zona industrial",
      trabajadores: "75",
    },
    fechaEmision: "2026-11-04",
    titulo: "III trimestre 2026",
    subtitulo: null,
    periodo: { desde: "2026-07-01", hasta: "2026-09-30" },
    poblacion: { total: 180, femenino: 51, masculino: 129 },
  };
}
