// Manual de uso de zamorApp. Se actualiza junto con cada función nueva.
// "para": quién ve la sección (servicio médico, portal de empresas o ambos).

export type TemaManual = {
  id: string;
  titulo: string;
  para: "servicio" | "empresa" | "todos";
  resumen: string;
  pasos: string[];
  consejos?: string[];
};

export const MANUAL_ACTUALIZADO = "2026-10-26";

export const MANUAL: TemaManual[] = [
  {
    id: "atajos",
    titulo: "Buscar rápido, atajos y tema oscuro",
    para: "todos",
    resumen: "Llega a cualquier trabajador o sección en dos teclas, desde cualquier pantalla.",
    pasos: [
      "Pulsa Ctrl+K (o la tecla /) y escribe la cédula o el nombre. En el celular, toca «Buscar» en la barra de abajo.",
      "Con las flechas eliges; Enter abre la ficha del trabajador.",
      "Servicio médico: para atenderlo de una vez, toca «Atender» en el resultado o pulsa Ctrl+Enter: se abre la consulta nueva sin pasar por la ficha.",
      "Si escribes el nombre de una sección (por ejemplo «reportes»), te lleva allí.",
      "Tema claro u oscuro: toca tu inicial arriba a la derecha y elige Claro, Oscuro o Sistema (sigue al del equipo). Se recuerda en cada equipo.",
    ],
    consejos: ["En el celular y la tablet, la barra de abajo tiene Inicio, Pacientes, Atención y Buscar al alcance del pulgar."],
  },
  {
    id: "ingreso",
    titulo: "Ingresar, instalar y recuperar la contraseña",
    para: "todos",
    resumen: "zamorApp funciona en la PC, el celular y la tablet desde zamorapp-ocupacional.vercel.app, con los mismos datos en todos.",
    pasos: [
      "Abre zamorapp-ocupacional.vercel.app y entra con tu correo y contraseña.",
      "Para tenerla como app de escritorio o en el celular, toca «Instalar app» arriba, junto a la campanita. En iPhone: Compartir → «Agregar a inicio».",
      "Si olvidaste la contraseña, toca «¿La olvidaste?», escribe tu correo y abre el enlace que te llega. Ahí creas la nueva.",
      "Para salir, toca tu inicial arriba a la derecha → «Salir».",
    ],
    consejos: [
      "Necesita internet: los datos viven en la nube y se respaldan cada día en tu PC y en OneDrive.",
      "Si ves «No se pudo conectar con zamorApp», revisa el internet y toca «Reintentar». No se pierde nada de lo ya guardado.",
    ],
  },
  {
    id: "inicio",
    titulo: "Inicio (panel)",
    para: "servicio",
    resumen: "Resumen del día: alertas, agenda de citas y cumplimiento de exámenes.",
    pasos: [
      "Arriba eliges la empresa activa o «Todas las empresas»; todo lo que ves se filtra por esa elección.",
      "La campanita muestra avisos nuevos (solicitudes de cita del portal, aptitudes emitidas, etc.).",
      "El buscador de arriba (o Ctrl+K, o la tecla /) encuentra trabajadores por cédula o nombre y también te lleva a cualquier sección.",
    ],
  },
  {
    id: "empresas",
    titulo: "Empresas, dependencias y puestos",
    para: "servicio",
    resumen: "Ficha de cada empresa cliente con sus datos legales, dependencias, puestos de trabajo y horas trabajadas.",
    pasos: [
      "Empresas → «Nueva empresa» para registrarla. Desde su ficha puedes editar los datos cuando quieras.",
      "Si faltan datos legales, sale un aviso; puedes completarlos o marcar «Ignorar» si no aplican.",
      "En «Dependencias» creas departamentos o sedes.",
      "En «Puestos» describes cada cargo y su evaluación de riesgos (agentes físicos, químicos, biológicos, ergonómicos, psicosociales).",
      "En «Horas trabajadas» cargas las horas-hombre por mes; con ellas se calculan los índices de accidentalidad.",
    ],
  },
  {
    id: "pacientes",
    titulo: "Pacientes (trabajadores)",
    para: "todos",
    resumen: "Expediente único de cada trabajador: datos personales, puesto, riesgos, consultas y resultados.",
    pasos: [
      "Pacientes → «Nuevo» para registrar uno, o «Importar» para cargar la nómina desde Excel (acepta fechas en formato Excel).",
      "Abre un paciente para ver sus pestañas: Resumen, Laboral y riesgos, Consultas y Resultados.",
      "«Nueva consulta» abre la atención médica del trabajador (solo personal de salud).",
      "En «Historia laboral» registras sus empleos anteriores: empresa, cargo, tiempo, riesgos, equipos de protección, accidentes y enfermedades previas.",
      "Depurar nómina: marca como egresados, de una vez, a quienes no tienen consulta desde una fecha (ej. hace un año). Primero te dice cuántos son y luego confirmas.",
      "En «Resultados» adjuntas PDF o fotos de laboratorio, Rx o informes externos (hasta 10 MB cada uno). Desde el celular puedes tomar la foto directamente.",
    ],
    consejos: ["Los resultados adjuntos y el contenido clínico solo los ve el personal de salud; la empresa solo ve la aptitud de consultas cerradas. Un usuario limitado a ciertas empresas solo ve la historia clínica de esas empresas."],
  },
  {
    id: "atencion",
    titulo: "Atención médica: cola, citas y consultas",
    para: "servicio",
    resumen: "Donde se atiende: cola del día, citas, solicitudes del portal y la consulta completa.",
    pasos: [
      "En Atención médica ves la cola del día, las citas y las solicitudes que llegan del portal de empresas (las apruebas o rechazas).",
      "«Nueva cita» agenda a un trabajador; «Citas por lote» agenda a varios de una vez (por ejemplo, todos los pre-empleo de una empresa).",
      "El botón verde de WhatsApp en cada cita abre tu WhatsApp con el recordatorio listo para enviar al trabajador.",
      "«Nueva consulta» abre el editor, organizado en pasos numerados (Generales, Antecedentes, Examen…). Un ✓ verde marca los pasos que ya tienen información; muévete con las pestañas o con los botones Anterior / Siguiente de abajo.",
      "Guarda con el botón «Guardar» o con Ctrl + S; arriba ves si hay cambios sin guardar. En el último paso aparece «Cerrar consulta».",
      "Motivo: elige el tipo de evaluación. En pre-empleo y otros preventivos el «detalle del motivo» se desactiva solo.",
      "Antecedentes: personales y familiares. Si no marcas familiares, el informe dice «No refiere antecedentes familiares».",
      "Examen físico y funcional: usa un perfil (por ejemplo «síndrome viral») o la casilla «Evaluación física normal», que llena todo con las descripciones normales.",
      "Paraclínicos: elige exámenes sueltos o un perfil (ej. «Ingreso COSAPI»), escribe resultados y adjunta los archivos.",
      "Diagnóstico: escribe y elige del buscador CIE-10, o marca «Sano» si cumple los protocolos.",
      "Tratamiento: busca el medicamento y la dosis, vía, frecuencia y días se llenan con sus valores habituales; puedes cambiarlos.",
      "Aptitud y recomendaciones: elige la clasificación y usa los textos frecuentes para aptitud, empresa y trabajador.",
      "Al terminar, toca «Cerrar consulta»: recién ahí la empresa ve la aptitud y recibe el aviso (los borradores no se muestran). Una consulta cerrada puede «Reabrirse» para corregirla, o «Firmarse»: firmada queda bloqueada para siempre (no se edita, no se reabre ni se borra). Firma el médico que atendió o el gerente médico; enfermería no firma. Los botones de documentos imprimen Constancia, Reposo, Informe, Certificado de salud, Récipe y Orden de exámenes.",
      "Con la aptitud puesta y la consulta cerrada, «Enviar a RR. HH.» abre WhatsApp o tu correo con el resultado para la empresa; adjunta la constancia en PDF.",
    ],
    consejos: ["Todo texto frecuente, perfil y lista se edita en Configuración › Listas."],
  },
  {
    id: "documentos",
    titulo: "Documentos e impresión",
    para: "servicio",
    resumen: "Constancia de aptitud, reposo (original y copia), informe médico, récipe con indicaciones y orden de exámenes.",
    pasos: [
      "Desde la consulta o desde Documentos, toca el documento que necesites; se abre listo para imprimir o guardar en PDF.",
      "El récipe no se imprime si faltan datos exigidos por la Res. MPPS 028; la pantalla te dice cuáles.",
      "La orden de exámenes agrupa los paraclínicos con casillas y tu firma.",
      "Títulos, pies de página y la nota de la orden se cambian en Configuración › Organización. Ahí también eliges si la firma y el sello del médico van en casillas separadas (como en el Integral) o en una sola línea.",
    ],
  },
  {
    id: "accidentes",
    titulo: "Accidentes e incidentes",
    para: "todos",
    resumen: "Registro de accidentes, incidentes y enfermedades ocupacionales según COVENIN, con índices de accidentalidad.",
    pasos: [
      "Accidentes → «Nuevo» y llena el tipo, lugar, lesión, parte del cuerpo y causas.",
      "Con las horas trabajadas cargadas en la empresa, se calculan los índices de frecuencia, frecuencia bruta y severidad.",
    ],
  },
  {
    id: "reportes",
    titulo: "Reportes",
    para: "servicio",
    resumen: "Morbilidad, ausentismo, vigilancia epidemiológica y pacientes atendidos.",
    pasos: [
      "Elige empresa y período; el reporte se calcula al momento.",
      "Usa «Imprimir» para el informe de vigilancia o la lista de atendidos.",
    ],
  },
  {
    id: "facturacion",
    titulo: "Facturación",
    para: "servicio",
    resumen: "Catálogo de servicios, precios por empresa, tasa BCV y notas de cobro de los pacientes atendidos.",
    pasos: [
      "En «Servicios» defines lo que cobras (consultas, evaluaciones, asesorías por hora, evaluaciones de puestos…) y sus precios por empresa.",
      "Registra la tasa BCV del día para convertir a bolívares.",
      "«Nuevo cobro»: eliges empresa y período, marcas las atenciones y se arma la nota de cobro. Una atención no se puede cobrar dos veces.",
      "Desde el cobro lo imprimes y marcas cuando se pague. En el borrador puedes agregar servicios del catálogo (asesorías por hora, evaluaciones de puesto…).",
      "Presupuestos: elige la empresa arriba, crea el presupuesto, agrega servicios y cantidades, imprímelo y márcalo enviado. Si lo aprueban, «Convertir en nota de cobro».",
      "Cuentas por cobrar: lo que debe cada empresa en notas emitidas sin pagar, por antigüedad (0-30, 31-60, 61-90 y más de 90 días).",
    ],
  },
  {
    id: "configuracion",
    titulo: "Configuración",
    para: "servicio",
    resumen: "Todo lo editable de la app: organización, usuarios, listas, perfiles y textos.",
    pasos: [
      "Organización: nombre, RIF, dirección, logo y textos de los documentos, incluidos el certificado de salud y las plantillas de WhatsApp y correo.",
      "Mi perfil: tus datos de médico (cédula, MPPS, colegio, INPSASEL) y las fotos de tu firma y tu sello. Marca si quieres que se impriman o dejar la casilla vacía para firmar y sellar a mano. Las fotos de firma y sello son privadas: solo las usa el personal de salud al imprimir; RR. HH. de las empresas no puede verlas.",
      "Usuarios: agrega a cada persona con el correo con el que creó su cuenta y su rol. Los roles de la empresa cliente (RR. HH., trabajador, supervisor, delegado de prevención, auditor) deben tener su empresa asignada y solo ven esa.",
      "Listas: motivos de consulta, exámenes, perfiles, medicamentos, textos frecuentes, causas de reposo y más. Puedes agregar, editar, ordenar o desactivar.",
      "Mis diagnósticos: agrega tus diagnósticos con su código CIE-10 (ej. «Hernia umbilical mínima» → K42.9). Salen primero en el buscador de la consulta, marcados «Mío».",
      "Medicinas: al agregar o editar una, escribe su indicación una línea por campo (concentracion, presentacion, via, dosis, frecuencia, duracion, observacion); se llena sola al elegirla en la consulta.",
      "En las listas largas usa el buscador de arriba para encontrar un elemento.",
    ],
  },
  {
    id: "portal",
    titulo: "Portal de empresas",
    para: "empresa",
    resumen: "Para RR. HH. de las empresas clientes: pedir citas, ver la nómina con su aptitud y recibir avisos.",
    pasos: [
      "En Inicio tocas «Solicitar cita», eliges el trabajador, el tipo de evaluación y la fecha deseada.",
      "El servicio médico la aprueba o propone otra fecha; te llega un aviso en la campanita.",
      "En Trabajadores ves la nómina y la aptitud vigente de cada uno (sin datos clínicos).",
      "Cuando el médico cierra la consulta con su aptitud, recibes un aviso (una sola vez por consulta).",
    ],
  },
  {
    id: "integral",
    titulo: "Datos traídos del Sistema Integral",
    para: "servicio",
    resumen: "Las empresas, pacientes y consultas del Integral (2021-2026) están en zamorApp; el Integral no se modificó y puedes seguir usándolo.",
    pasos: [
      "Cada paciente del Integral aparece en Pacientes con su historia, cargo y aptitud; sus consultas antiguas se abren desde la pestaña Consultas.",
      "Las consultas importadas quedan cerradas. Si necesitas corregir una, ábrela y usa «Reabrir».",
      "Los diagnósticos conservan el nombre que usabas en el Integral y llevan el código CIE-10 equivalente.",
      "Las 122 medicinas que recetabas están en el vademécum con la dosis, vía y frecuencia que más usabas.",
      "Si sigues registrando en el Integral, haz doble clic en «actualizar-desde-integral.cmd» (carpeta zamorapp-ocupacional): respalda y trae lo nuevo sin duplicar.",
    ],
  },
  {
    id: "respaldo",
    titulo: "Respaldos",
    para: "servicio",
    resumen: "Copia diaria de todos los datos en la PC (Documentos\\zamorApp Respaldos) y en OneDrive; se guardan los últimos 30.",
    pasos: [
      "Para que sea automática, haz doble clic una vez en «programar-respaldo.cmd» dentro de la carpeta zamorapp-ocupacional.",
      "Para un respaldo manual en cualquier momento: scripts\\respaldo.ps1.",
      "Abre OneDrive e inicia sesión para que la copia suba a la nube.",
    ],
  },
];
