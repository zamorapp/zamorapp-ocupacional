// Datos de ejemplo para la prueba automática de impresión (scripts/pruebas/impresion.mjs).
// «largo» es el peor caso realista: nombres, textos y listas largas, para atrapar documentos que se pasan
// de hoja. Solo los usa /imprimir/prueba, que no existe fuera de la prueba (ZAMORAPP_PRUEBA_IMPRESION=1).
import type { DatosDocumento } from "@/lib/documentos";

const logo = (texto: string, color: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><rect width="240" height="90" rx="12" fill="${color}"/><text x="120" y="56" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">${texto}</text></svg>`).toString("base64")}`;

const repetir = (frase: string, n: number) => Array.from({ length: n }, () => frase).join(" ");

export function documentoDePrueba(caso: "normal" | "largo"): DatosDocumento {
  const largo = caso === "largo";
  const texto = (corto: string, n: number) => (largo ? repetir(corto, n) : corto);
  return {
    datos: {
      id: "00000000-0000-4000-8000-000000000001",
      estado: "firmada",
      revision: largo ? 2 : 1,
      fecha: "2026-10-28",
      tipo: "primera",
      motivoId: null,
      especialidad: "",
      motivoTexto: texto("Evaluación médica periódica anual del trabajador.", 4),
      enfermedadActual: texto("Refiere cefalea ocasional de leve intensidad, sin otros síntomas asociados.", 6),
      antecedentes: Array.from({ length: largo ? 12 : 3 }, (_, i) => ({ id: `a${i}`, nombre: `Antecedente ${i + 1}`, grupo: i % 2 ? "Personales" : "Familiares", observacion: texto("Controlado con tratamiento.", 3) })),
      habitos: [{ clave: "tabaco", nombre: "Tabaco", valor: "No" }, { clave: "alcohol", nombre: "Alcohol", valor: texto("Ocasional, fines de semana.", 2) }],
      signos: { ta: "120/80", fc: "72", fr: "16", temp: "36,5", sat: "98", peso: "78", talla: "175" },
      examenFuncional: Array.from({ length: largo ? 14 : 4 }, (_, i) => ({ clave: `f${i}`, nombre: `Sistema ${i + 1}`, valor: texto("Sin alteraciones.", 2), normal: "Normal" })),
      examenFisico: Array.from({ length: largo ? 16 : 5 }, (_, i) => ({ clave: `x${i}`, nombre: `Región ${i + 1}`, valor: texto("Dentro de límites normales.", 2), normal: "Normal" })),
      paraclinicos: Array.from({ length: largo ? 18 : 4 }, (_, i) => ({ id: `p${i}`, nombre: `Examen de laboratorio ${i + 1}`, grupo: "Hematología", resultado: i % 3 ? "Normal" : "13,5 g/dL", estado: "normal" as const, unidad: "g/dL", referencia: "12-16" })),
      diagnosticos: Array.from({ length: largo ? 6 : 2 }, (_, i) => ({ cie10: `M54.${i}`, descripcion: texto("Lumbalgia mecánica no especificada", largo ? 2 : 1), sistema: "Osteomuscular", origen: i ? "comun" as const : "ocupacional" as const, principal: i === 0 })),
      aptitud: { clasificacion: "elegible_con_restricciones", observacion: texto("Apto con restricciones temporales.", 3), limitaciones: Array.from({ length: largo ? 6 : 2 }, (_, i) => `Evitar levantar cargas mayores de ${10 + i * 5} kg`), vigenteHasta: "2027-10-28" },
      tratamiento: Array.from({ length: largo ? 8 : 2 }, (_, i) => ({ medicina: `Medicamento de prueba ${i + 1}`, concentracion: "500 mg", presentacion: "Tabletas", dosis: "1 tableta", frecuencia: "cada 8 horas", duracion: "7 días", via: "Oral", observacion: texto("Tomar después de las comidas.", 2), notaFarmacia: "" })),
      indicaciones: texto("Reposo relativo, hidratación abundante y control en 15 días.", 5),
      interconsultas: Array.from({ length: largo ? 4 : 1 }, (_, i) => ({ especialidad: `Traumatología ${i + 1}`, motivo: texto("Valoración de dolor lumbar persistente.", 4) })),
      reposo: { activo: true, causa: "enfermedad_comun", ente: "servicio_medico", desde: "2026-10-28", hasta: "2026-11-03", cie10: "M54.5", medicoExterno: "", centroIvss: "", validadoIvss: false },
      reubicacion: { activa: true, tipo: "temporal", puestoActual: "Operador de montacargas", puestoPropuesto: "Almacenista", desde: "2026-10-28", hasta: "2026-12-28", motivo: texto("Lumbalgia en tratamiento.", 3), restricciones: texto("Sin cargas mayores de 10 kg.", 3), resultado: texto("Se adapta bien al puesto propuesto.", 2) },
      informeLibre: { titulo: "Informe médico", dirigidoA: "Gerencia de Recursos Humanos", cuerpo: texto("Por medio de la presente se informa la evolución clínica del trabajador.", largo ? 25 : 3) },
      conclusiones: texto("Trabajador en buenas condiciones generales de salud.", 5),
      recomendacionesEmpresa: texto("Pausas activas cada dos horas y evaluación ergonómica del puesto.", 4),
      recomendacionesTrabajador: texto("Mantener actividad física regular y control de peso.", 4),
      observacionPrivada: "",
      autorizaPaciente: true,
      sano: false,
      potencialDiscapacidad: false,
      discapacidadNota: "",
    },
    trabajador: {
      id: "00000000-0000-4000-8000-000000000002",
      nombre: largo ? "María Alejandra de los Ángeles Fernández Rodríguez de Castillo" : "María Fernández",
      cedula: "V-12.345.678", edad: 38, sexo: "F",
      empresa: largo ? "Corporación Industrial de Alimentos y Bebidas del Oriente, C.A." : "Alimentos del Centro, C.A.",
      empresaId: "00000000-0000-4000-8000-000000000003",
      cargo: largo ? "Supervisora de Operaciones de Planta y Control de Calidad" : "Operadora",
      riesgos: { fisicos: ["Ruido", "Calor"], ergonomicos: ["Levantamiento de cargas", "Posturas forzadas"] },
    },
    medico: "Dr. Médico de Prueba",
    medicoId: "00000000-0000-4000-8000-000000000004",
    nueva: false,
    org: {
      nombre: "OcupaVida Salud Ocupacional", rif: "J-00000000-0", direccion: texto("Av. Principal, Maturín, estado Monagas.", largo ? 2 : 1),
      telefono: "0291-0000000", correo: "consultorio@ejemplo.com", logo: logo("OcupaVida", "#0f766e"), ajustes: {},
    },
    medicoDatos: {
      nombre_completo: "Dr. Médico de Prueba", cedula: "V-9.999.999", mpps: "12345", colegio_medicos: "6789", registro_inpsasel: "INP-001",
      especialidad: "Medicina Ocupacional", correo: "medico@ejemplo.com", firma_url: null, sello_url: null, mostrar_firma: false, mostrar_sello: false,
    },
    motivo: { nombre: "Periódico", codigo: "PER", grupo: "preventivo" },
    empresa: { razon_social: largo ? "Corporación Industrial de Alimentos y Bebidas del Oriente, C.A." : "Alimentos del Centro, C.A.", rif: "J-11111111-1", logo: logo("Empresa", "#1d4ed8") },
    dependencia: largo ? "Gerencia de Producción y Mantenimiento Industrial" : "Producción",
    extra: { fecha_nacimiento: "1988-03-15", fecha_ingreso: "2015-06-01", fecha_ingreso_cargo: "2019-09-16", turno: "Diurno", numero_historia: 1234, ficha: "F-0042", tipo_contrato: "indeterminado", tipo: { nombre: "Trabajador" } },
    impreso: { por: "Usuario de prueba", revision: largo ? 2 : 1, el: "28/10/26, 9:30 a. m." },
    hora: "2026-10-28T13:30:00+00:00",
    cierre: "2026-10-28T14:05:00+00:00",
    sin: [],
    copia: false,
  };
}
