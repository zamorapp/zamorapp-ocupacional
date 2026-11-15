// Datos de ejemplo para la prueba automática de impresión (scripts/pruebas/impresion.mjs).
// «largo» es el peor caso realista: nombres, textos y listas largas, para atrapar documentos que se pasan
// de hoja. Solo los usa /imprimir/prueba, que no existe fuera de la prueba (ZAMORAPP_PRUEBA_IMPRESION=1).
import type { DatosDocumento } from "@/lib/documentos";
import { ARTICULACIONES } from "@/lib/mediciones";

const logo = (texto: string, color: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><rect width="240" height="90" rx="12" fill="${color}"/><text x="120" y="56" font-size="28" text-anchor="middle" fill="#fff" font-family="sans-serif">${texto}</text></svg>`).toString("base64")}`;

// Firma de prueba parecida a una real: trazo a mano sobre fondo blanco (como un escaneo), para ver que no tape nada
const firma = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="300" height="120" fill="#fff"/><path d="M18 88c22-50 40-70 48-62s-22 66-8 66 30-58 46-56-8 42 6 40 22-34 34-30-4 26 10 24 30-20 44-18c18 3 40 8 86-6" fill="none" stroke="#1b2a6b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M70 104c60-6 120-10 200-14" fill="none" stroke="#1b2a6b" stroke-width="3" stroke-linecap="round"/></svg>`).toString("base64")}`;

const FUNCIONAL = [["general", "General"], ["neurologico", "Neurológico"], ["sentidos", "Órganos de los sentidos"], ["cardiovascular", "Cardiovascular"], ["respiratorio", "Respiratorio"], ["digestivo", "Digestivo"], ["genitourinario", "Genitourinario"], ["osteomuscular", "Osteomuscular"], ["piel", "Piel y anexos"]];
const FISICO = [["piel", "Piel"], ["cabeza", "Cabeza"], ["ojos", "Ojos"], ["oidos", "Oídos"], ["nariz", "Nariz"], ["boca", "Boca y faringe"], ["cuello", "Cuello"], ["torax", "Tórax"], ["cardiovascular", "Cardiovascular"], ["pulmonar", "Pulmonar"], ["abdomen", "Abdomen"], ["hernias", "Hernias"], ["genitourinario", "Genitourinario"], ["columna", "Columna"], ["msup", "Miembros superiores"], ["minf", "Miembros inferiores"], ["neurologico", "Neurológico"], ["mental", "Estado mental"], ["linfatico", "Sistema linfático"]];

const repetir = (frase: string, n: number) => Array.from({ length: n }, () => frase).join(" ");

// «same»: consulta importada del SAME, firmada y emitida allá (leyenda junto a la firma)
export function documentoDePrueba(caso: "normal" | "largo" | "same" | "particular"): DatosDocumento {
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
      // Catálogos reales (lista_items, nov-2026): 9 sistemas «NRS» y 19 regiones «Normal»; lo alterado en negrita.
      // «largo»: varias filas alteradas con texto largo (peor caso del examen detallado)
      examenFuncional: FUNCIONAL.map(([clave, nombre], i) => ({ clave, nombre, normal: "NRS",
        valor: largo && i % 3 === 0 ? repetir("Refiere dolor lumbar de 3 meses de evolución que empeora con la carga.", 2) : i === 7 ? "Refiere dolor lumbar ocasional." : "NRS" })),
      examenFisico: FISICO.map(([clave, nombre], i) => ({ clave, nombre, normal: clave === "hernias" ? "No presenta" : "Normal",
        valor: largo && i % 4 === 1 ? repetir("Contractura paravertebral lumbar bilateral, dolor a la palpación.", 2) : clave === "columna" ? "Contractura paravertebral lumbar; Lasègue negativo." : clave === "hernias" ? "No presenta" : "Normal" })),
      paraclinicos: [
        ...Array.from({ length: largo ? 18 : 4 }, (_, i) => ({ id: `p${i}`, nombre: `Examen de laboratorio ${i + 1}`, grupo: "Hematología", resultado: i % 3 ? "Normal" : "13,5 g/dL", estado: "normal" as const, unidad: "g/dL", referencia: "12-16" })),
        // Goniometría y espirometría con valores (opcionales): el informe trae su tabla de detalle
        { id: "libre-espirometria", nombre: "Espirometría", grupo: "Estudios funcionales", resultado: "Patrón obstructivo leve. FVC 4,1 L (96 %) · FEV1 2,9 L (82 %) · FEV1/FVC 69 %.", estado: "fuera" as const, manual: true,
          medicion: { tipo: "espirometria" as const, valores: { fvc: 4.1, fvcPct: 96, fev1: 2.9, fev1Pct: 82, relacion: 69, pef: 7.8 }, nota: "Buena colaboración." } },
        { id: "libre-goniometria", nombre: "Goniometría", grupo: "Estudios funcionales", resultado: "Limitación leve: hombro der. abducción 150° de 180°.", estado: "fuera" as const, manual: true,
          medicion: { tipo: "goniometria" as const, filas: [
            { clave: "hombro.abd", lado: "D" as const, grados: 150, normal: 180 }, { clave: "hombro.abd", lado: "I" as const, grados: 180, normal: 180 },
            ...(largo ? ARTICULACIONES.flatMap((a) => a.movimientos.flatMap((mv) => (mv.lados ? (["D", "I"] as const) : (["U"] as const)).map((lado) => ({ clave: mv.clave, lado, grados: mv.deficit ? 0 : mv.normal, normal: mv.normal })))).filter((f) => f.clave !== "hombro.abd") : []),
          ], nota: largo ? repetir("Dolor al final del arco en el hombro derecho.", 4) : "" } },
      ],
      diagnosticos: Array.from({ length: largo ? 6 : 2 }, (_, i) => ({ cie10: `M54.${i}`, descripcion: texto("Lumbalgia mecánica no especificada", largo ? 2 : 1), sistema: "Osteomuscular", origen: i ? "comun" as const : "ocupacional" as const, principal: i === 0 })),
      aptitud: { clasificacion: "elegible_con_restricciones", observacion: texto("Apto con restricciones temporales.", 3), limitaciones: Array.from({ length: largo ? 6 : 2 }, (_, i) => `Evitar levantar cargas mayores de ${10 + i * 5} kg`), vigenteHasta: "2027-10-28" },
      tratamiento: Array.from({ length: largo ? 8 : 2 }, (_, i) => ({ medicina: `Medicamento de prueba ${i + 1}`, concentracion: "500 mg", presentacion: "Tabletas", dosis: "1 tableta", frecuencia: "cada 8 horas", duracion: "7 días", via: "Oral", observacion: texto("Tomar después de las comidas.", 2), notaFarmacia: "" })),
      indicaciones: texto("Reposo relativo, hidratación abundante y control en 15 días.", 5),
      interconsultas: Array.from({ length: largo ? 4 : 1 }, (_, i) => ({ especialidad: `Traumatología ${i + 1}`, motivo: texto("Valoración de dolor lumbar persistente.", 4) })),
      reposo: { activo: true, causa: "enfermedad_comun", ente: "servicio_medico", desde: "2026-10-28", hasta: "2026-11-03", cie10: "M54.5", medicoExterno: "", centroIvss: "", validadoIvss: false,
        // Peor caso: el tope completo del motivo clínico (MAXIMO_MOTIVO_REPOSO, en mayúsculas: lo más ancho)
        motivoClinico: largo ? repetir("DOLOR LUMBAR INTENSO CON LIMITACIÓN FUNCIONAL PARA LA FLEXIÓN.", 7).slice(0, 160)
          : "Se indica reposo médico por presentar lumbalgia aguda con limitación funcional. Al examen físico: contractura paravertebral; Lasègue positivo derecho." },
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
      // Claves de GRUPOS_RIESGO (lib/pacientes): con «fisicos» no se imprimían y la prueba no veía el peor caso
      riesgos: largo
        ? { fisico: ["Ruido", "Calor", "Vibraciones"], quimico: ["Polvos", "Solventes"], mecanico: ["Atrapamiento", "Caídas al mismo nivel"], disergonomico: ["Levantamiento de cargas", "Posturas forzadas", "Movimientos repetitivos"], psicosocial: ["Trabajo por turnos"] }
        : { fisico: ["Ruido", "Calor"], disergonomico: ["Levantamiento de cargas", "Posturas forzadas"] },
    },
    medico: "Dr. Médico de Prueba",
    medicoId: "00000000-0000-4000-8000-000000000004",
    firmadaEnSame: caso === "same" ? "2024-03-12T14:30:00-04:00" : null,
    registrada: "2026-10-28",
    nueva: false,
    org: {
      nombre: "OcupaVida Salud Ocupacional", rif: "J-00000000-0", direccion: texto("Av. Principal, Maturín, estado Monagas.", largo ? 2 : 1),
      telefono: "0291-0000000", correo: "consultorio@ejemplo.com", logo: logo("OcupaVida", "#0f766e"),
      // Titular primero en el membrete (como lo pidió Cesar): la prueba mide con el membrete más alto
      ajustes: { membrete_titular: "Dr. Nombre de Prueba", membrete_credenciales: "Especialista en Medicina del Trabajo, mención Salud Ocupacional (UDO – UNEG)" },
    },
    medicoDatos: {
      nombre_completo: "Dr. Médico de Prueba", cedula: "V-9.999.999", mpps: "12345", colegio_medicos: "6789", registro_inpsasel: "INP-001",
      especialidad: "Medicina Ocupacional", correo: "medico@ejemplo.com", firma_url: firma, sello_url: logo("Sello", "#1d4ed8"), mostrar_firma: true, mostrar_sello: true,
    },
    motivo: { nombre: "Periódico", codigo: "PER", grupo: "preventivo" },
    // ?caso=particular: paciente sin empresa (la bolsa «Pacientes particulares»); el papel nunca dice «Empresa»
    empresa: caso === "particular" ? { razon_social: "Pacientes particulares", rif: "PARTICULR", logo: null, proyecto: null } : { razon_social: largo ? "Corporación Industrial de Alimentos y Bebidas del Oriente, C.A." : "Alimentos del Centro, C.A.", rif: "J-11111111-1", logo: logo("Empresa", "#1d4ed8"), proyecto: largo ? "Acciones mecánicas y corrección de fallas de los sistemas de distribución de gas metano, Área operacional Charallave - El Cují, estado Miranda, Contrato #4600141983/1C-132-012-A-24-S-0064" : null },
    dependencia: largo ? "Gerencia de Producción y Mantenimiento Industrial" : "Producción",
    extra: { fecha_nacimiento: "1988-03-15", fecha_ingreso: "2015-06-01", fecha_ingreso_cargo: "2019-09-16", turno: "Diurno", numero_historia: 1234, ficha: "F-0042", tipo_contrato: "indeterminado", tipo: { nombre: "Trabajador" } },
    impreso: { por: "Usuario de prueba", revision: largo ? 2 : 1, el: "28/10/26, 9:30 a. m." },
    hora: "2026-10-28T13:30:00+00:00",
    cierre: "2026-10-28T14:05:00+00:00",
    sin: [],
    copia: false,
    firmaEnlace: null,
  };
}

// Historia clínica de ejemplo: tres consultas con elegibilidad, diagnósticos y signos que cambian.
// La última es la del documento base; las anteriores son variantes de ella.
export function historiaDePrueba(caso: "normal" | "largo") {
  const d = documentoDePrueba(caso);
  const c = d.datos;
  const consultas = [
    { datos: { ...c, id: "00000000-0000-4000-8000-0000000000a1", fecha: "2024-02-12", tipo: "primera" as const, diagnosticos: [], sano: true, reposo: { ...c.reposo, activo: false },
      aptitud: { ...c.aptitud, clasificacion: "elegible" as const, limitaciones: [], vigenteHasta: "2025-02-12" }, signos: { ...c.signos, ta: "115/75", peso: "70" }, interconsultas: [], tratamiento: [] },
      motivo: "Pre-empleo", medico: "Dra. Ana Pérez (histórico)" },
    { datos: { ...c, id: "00000000-0000-4000-8000-0000000000a2", fecha: "2025-03-04", tipo: "sucesiva" as const, diagnosticos: c.diagnosticos.slice(0, 1),
      reposo: { ...c.reposo, desde: "2025-03-04", hasta: "2025-03-10" }, potencialDiscapacidad: true, discapacidadNota: "Lumbalgia recurrente en estudio",
      aptitud: { ...c.aptitud, clasificacion: "diferido" as const, limitaciones: [], vigenteHasta: "" }, signos: { ...c.signos, ta: "130/85", peso: "76" } },
      motivo: "Consulta por enfermedad", medico: "Dr. Médico de Prueba" },
    { datos: c, motivo: d.motivo?.nombre ?? null, medico: d.medico },
  ];
  return { d, consultas, ficha: { fechaNacimiento: "1988-03-15", grupoSanguineo: "O+", lateralidad: "diestro", telefono: "0414-0000000", riesgos: d.trabajador.riesgos } };
}
