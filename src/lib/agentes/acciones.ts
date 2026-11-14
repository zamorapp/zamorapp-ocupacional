// Catálogo de la puerta para agentes: lo que un agente (Claude, ChatGPT, Gemini…) puede pedir.
// Es solo la descripción para el agente; quien manda es la base (public.agente, migración 20261030938000):
// ella valida la llave, la organización y cada dato. Una acción que no esté allá no existe aunque se escriba aquí.

type Esquema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
// «rpc»: la función de la base que la atiende (por defecto public.agente). Cada familia nueva va en su propia
// función (puerta_facturacion, puerta_vigilancia…) para que no se pisen.
export type AccionAgente = { nombre: string; titulo: string; descripcion: string; crea: boolean; esquema: Esquema; rpc?: string };

const texto = (description: string) => ({ type: "string", description });
const id = (description: string) => ({ type: "string", format: "uuid", description });
const fecha = (description: string) => ({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: `${description} (AAAA-MM-DD)` });
const ENSAYO = { type: "boolean", description: "true = solo dice lo que crearía, sin guardar nada. Úsalo primero y muéstrale el resultado al doctor." };
const objeto = (properties: Record<string, unknown>, required: string[] = []): Esquema => ({ type: "object", properties, required, additionalProperties: false });

export const ACCIONES: AccionAgente[] = [
  { nombre: "resumen", titulo: "Resumen", crea: false,
    descripcion: "Nombre de la organización, fecha de hoy en Caracas y conteos (empresas, trabajadores, citas de los próximos 7 días, presupuestos en borrador). Sirve para probar la llave.",
    esquema: objeto({}) },
  { nombre: "buscar_empresas", titulo: "Buscar empresas", crea: false,
    descripcion: "Empresas cliente por nombre o RIF (hasta 50). Sin «texto» lista todas.",
    esquema: objeto({ texto: texto("Parte del nombre o del RIF") }) },
  { nombre: "ver_empresa", titulo: "Ver empresa", crea: false,
    descripcion: "Datos de una empresa y sus dependencias (departamentos). Indica empresa_id o rif.",
    esquema: objeto({ empresa_id: id("Identificador de la empresa"), rif: texto("RIF, con o sin guiones") }) },
  { nombre: "buscar_trabajadores", titulo: "Buscar trabajadores", crea: false,
    descripcion: "Trabajadores por nombre, cédula o empresa (hasta 50). Solo identificación y empresa: nunca datos de salud.",
    esquema: objeto({ texto: texto("Nombre o apellido"), cedula: texto("Cédula, con o sin puntos"), empresa_id: id("Solo los de esta empresa") }) },
  { nombre: "catalogo", titulo: "Catálogo", crea: false,
    descripcion: "Listas del servicio: servicios con su precio, perfiles de exámenes, motivos de consulta o nombres de exámenes.",
    esquema: objeto({ tipo: { type: "string", enum: ["servicios", "perfiles", "motivos", "examenes"], description: "Qué lista" }, texto: texto("Filtra por parte del nombre") }, ["tipo"]) },
  { nombre: "listar_citas", titulo: "Listar citas", crea: false,
    descripcion: "Citas entre dos fechas (por defecto, de hoy a 7 días; máximo 92 días), de todas las empresas o de una.",
    esquema: objeto({ desde: fecha("Desde"), hasta: fecha("Hasta"), empresa_id: id("Solo esta empresa") }) },
  { nombre: "listar_presupuestos", titulo: "Listar presupuestos", crea: false,
    descripcion: "Presupuestos con sus renglones, total y el enlace para abrirlos (hasta 50, del más reciente al más viejo).",
    esquema: objeto({ presupuesto_id: id("Solo este presupuesto"), empresa_id: id("Solo esta empresa"), desde: fecha("Desde"), hasta: fecha("Hasta") }) },
  { nombre: "enlaces", titulo: "Enlaces", crea: false,
    descripcion: "Enlaces para que el doctor abra con su sesión: el presupuesto, y las órdenes de laboratorio e imagen de un perfil para un trabajador. La firma y el sello los decide él al imprimir.",
    esquema: objeto({ presupuesto_id: id("Presupuesto"), perfil_id: id("Perfil de exámenes (con trabajador_id)"), trabajador_id: id("Trabajador de las órdenes"),
      recomendaciones: texto("Indicaciones para el trabajador que salen con las órdenes: horas, direcciones, ayuno (hasta 2500 letras)") }) },
  { nombre: "crear_empresa", titulo: "Crear empresa", crea: true,
    descripcion: "Crea una empresa cliente con sus dependencias (departamentos). Si el RIF ya existe no cambia la empresa: solo agrega las dependencias que falten.",
    esquema: objeto({ rif: texto("RIF, por ejemplo J-12345678-9"), razon_social: texto("Razón social"), nombre_comercial: texto("Nombre comercial"),
      estado: texto("Estado"), municipio: texto("Municipio"), parroquia: texto("Parroquia"), direccion: texto("Dirección"), telefono: texto("Teléfono"),
      correo: texto("Correo"), actividad_economica: texto("Actividad económica"),
      dependencias: { type: "array", items: { type: "string" }, maxItems: 40, description: "Nombres de los departamentos" }, ensayo: ENSAYO }, ["rif"]) },
  { nombre: "crear_servicio", titulo: "Crear servicio", crea: true,
    descripcion: "Crea un servicio con su precio en dólares. Si ya hay uno con ese nombre no lo cambia.",
    esquema: objeto({ nombre: texto("Nombre del servicio"),
      categoria: { type: "string", enum: ["consulta", "evaluacion", "paraclinico", "informe", "asesoria", "evaluacion_puesto", "formacion", "otro"], description: "Categoría (por defecto: otro)" },
      unidad: { type: "string", enum: ["servicio", "hora", "trabajador", "mes"], description: "Se cobra por… (por defecto: servicio)" },
      precio_usd: { type: "number", minimum: 0, description: "Precio en USD" }, ensayo: ENSAYO }, ["nombre"]) },
  { nombre: "crear_perfil", titulo: "Crear perfil de exámenes", crea: true,
    descripcion: "Crea un perfil (grupo) de exámenes de laboratorio e imagen, sugerido para ciertas empresas y motivos. Escribe cada examen tal como te lo dieron, sin traducir ni explicar siglas. No incluye la consulta: esa va en el presupuesto.",
    esquema: objeto({ nombre: texto("Nombre del perfil"), codigo: texto("Código corto, por ejemplo A"),
      examenes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 80, description: "Nombres de los exámenes" },
      empresa_ids: { type: "array", items: { type: "string", format: "uuid" }, description: "Empresas a las que se sugiere" },
      motivo_ids: { type: "array", items: { type: "string", format: "uuid" }, description: "Motivos de consulta en los que se sugiere (catalogo, tipo motivos)" }, ensayo: ENSAYO }, ["nombre", "examenes"]) },
  { nombre: "crear_presupuesto", titulo: "Crear presupuesto", crea: true,
    descripcion: "Crea un presupuesto EN BORRADOR para una empresa: el doctor lo revisa y lo envía. Cada renglón lleva un servicio del catálogo o una descripción con su precio. Repetir el mismo presupuesto el mismo día no lo duplica.",
    esquema: objeto({ empresa_id: id("Empresa"),
      renglones: { type: "array", minItems: 1, maxItems: 30, description: "Renglones del presupuesto",
        items: { type: "object", additionalProperties: false, properties: { servicio_id: id("Servicio del catálogo"), descripcion: texto("Descripción (si no hay servicio, o para cambiar su nombre)"),
          detalle: texto("Detalle que sale debajo"), cantidad: { type: "number", exclusiveMinimum: 0, description: "Cantidad (por defecto 1)" },
          precio_usd: { type: "number", minimum: 0, description: "Precio unitario en USD (por defecto, el de la empresa o el del servicio)" } } } },
      observacion: texto("Observación del presupuesto"), valido_dias: { type: "integer", minimum: 1, maximum: 90, description: "Días de validez (por defecto 15)" }, ensayo: ENSAYO }, ["empresa_id", "renglones"]) },
  { nombre: "crear_trabajador", titulo: "Crear trabajador", crea: true,
    descripcion: "Registra a un trabajador en una empresa. Si la cédula ya está en esa empresa no cambia nada; si está en OTRA empresa se detiene y lo dice: no lo muevas, pregúntale al doctor.",
    esquema: objeto({ empresa_id: id("Empresa"), cedula: texto("Cédula, por ejemplo V-12345678"), nombres: texto("Nombres"), apellidos: texto("Apellidos"),
      sexo: { type: "string", enum: ["F", "M"], description: "Sexo" }, fecha_nacimiento: fecha("Fecha de nacimiento"), fecha_ingreso: fecha("Fecha de ingreso a la empresa"),
      dependencia_id: id("Departamento (ver_empresa)"), telefono: texto("Teléfono"), correo: texto("Correo"), ensayo: ENSAYO }, ["empresa_id", "cedula"]) },
  { nombre: "crear_cita", titulo: "Crear cita", crea: true,
    descripcion: "Agenda una cita para un trabajador (de hoy a un año). Si ya tiene cita ese día no crea otra ni la cambia.",
    esquema: objeto({ trabajador_id: id("Trabajador"), fecha: fecha("Día de la cita"), hora: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", description: "Hora en 24 horas, HH:MM" },
      motivo_id: id("Motivo de consulta (catalogo, tipo motivos)"), observacion: texto("Nota de la cita"), ensayo: ENSAYO }, ["trabajador_id", "fecha"]) },
  // ───── Cobros y precios (public.puerta_facturacion, migración 20261030954000): la llave necesita «Cobros y precios» ─────
  { nombre: "listar_cobros", titulo: "Listar notas de cobro", crea: false, rpc: "puerta_facturacion",
    descripcion: "Notas de cobro (prefacturas y facturas) con estado, total, Nº de factura y enlace (hasta 100; por defecto los últimos 3 meses).",
    esquema: objeto({ empresa_id: id("Solo esta empresa"), estado: { type: "string", enum: ["borrador", "emitida", "pagada", "anulada"], description: "Solo este estado" },
      desde: fecha("Desde"), hasta: fecha("Hasta") }) },
  { nombre: "atendidos_por_cobrar", titulo: "Atendidos por cobrar", crea: false, rpc: "puerta_facturacion",
    descripcion: "Pacientes atendidos en un período que aún no están en ninguna nota, agrupados por servicio y empresa, con su precio. Sin nombres ni datos clínicos.",
    esquema: objeto({ desde: fecha("Desde"), hasta: fecha("Hasta"), empresa_id: id("Solo esta empresa") }, ["desde", "hasta"]) },
  { nombre: "crear_notas_cobro", titulo: "Crear notas de cobro", crea: true, rpc: "puerta_facturacion",
    descripcion: "Crea de 1 a 20 notas de cobro EN BORRADOR, una por empresa (sirven de prefactura; la factura es la misma nota cuando el doctor pulsa «Imprimir factura», que le pone el Nº del talonario). Cada nota puede llevar los atendidos del período, un presupuesto, renglones del catálogo o libres, y un descuento SOLO si el doctor lo pidió. Precio de cada servicio: el convenido con la empresa o, si no hay, el del catálogo. Repetir la misma orden el mismo día no duplica.",
    esquema: objeto({ notas: { type: "array", minItems: 1, maxItems: 20, description: "Una nota por empresa",
      items: { type: "object", additionalProperties: false, required: ["empresa_id"], properties: {
        empresa_id: id("Empresa"), desde: fecha("Inicio del período"), hasta: fecha("Fin del período"),
        atendidos: { type: "boolean", description: "true = incluir los atendidos del período que aún no están en otra nota" },
        presupuesto_id: id("Copiar los renglones de este presupuesto de la misma empresa"),
        renglones: { type: "array", maxItems: 30, description: "Renglones adicionales",
          items: { type: "object", additionalProperties: false, properties: { servicio_id: id("Servicio del catálogo"), descripcion: texto("Descripción (si no hay servicio, o para cambiar su nombre)"),
            detalle: texto("Detalle que sale debajo"), cantidad: { type: "number", exclusiveMinimum: 0, description: "Cantidad (por defecto 1)" },
            precio_usd: { type: "number", minimum: 0, description: "Precio unitario en USD (por defecto, el de la empresa o el del servicio)" } } } },
        descuento: { type: "object", additionalProperties: false, description: "Solo si el doctor lo pidió: porcentaje O monto_usd, y el motivo",
          properties: { porcentaje: { type: "number", exclusiveMinimum: 0, maximum: 100, description: "Porcentaje sobre el total de la nota" },
            monto_usd: { type: "number", exclusiveMinimum: 0, description: "Monto fijo en USD" }, motivo: texto("Motivo, sale debajo del descuento") } },
        observacion: texto("Observación de la nota") } } }, ensayo: ENSAYO }, ["notas"]) },
  { nombre: "proponer_precio", titulo: "Proponer precio", crea: true, rpc: "puerta_facturacion",
    descripcion: "Propone un precio nuevo para un servicio: el general del catálogo o, con empresa_id, solo para esa empresa. NO cambia nada: el doctor lo aprueba en zamorApp. Úsalo solo cuando el doctor pida cambiar un precio.",
    esquema: objeto({ servicio_id: id("Servicio (catalogo, tipo servicios)"), precio_usd: { type: "number", minimum: 0, description: "Precio nuevo en USD" },
      empresa_id: id("Solo para esta empresa (si no, cambia el precio general)"), motivo: texto("Por qué (por ejemplo «pedido del doctor»)"), ensayo: ENSAYO }, ["servicio_id", "precio_usd"]) },
];

export const ACCION = new Map(ACCIONES.map((a) => [a.nombre, a]));

// Lo que se le dice al agente al conectarse
export const INSTRUCCIONES = [
  "Esta es la puerta para agentes de zamorApp Ocupacional (salud ocupacional, Venezuela). Trabajas para el médico dueño de la llave.",
  "Antes de crear algo: búscalo (no dupliques), llama la acción con ensayo: true, muéstrale al doctor lo que se crearía y crea solo con su visto bueno.",
  "No inventes datos (RIF, cédulas, precios, fechas): si falta uno, pregúntalo.",
  "Los nombres de exámenes van tal como te los dan; no traduzcas ni expliques siglas.",
  "Esta puerta no lee ni escribe historias, diagnósticos, firma ni sello, y no borra ni modifica lo que ya existe: eso lo hace el doctor en la aplicación.",
  "Cobros: las notas quedan en borrador; tú nunca pones el Nº de factura, emites, cobras ni eliges la tasa BCV. Los precios solo se proponen. Descuentos, solo si el doctor los pide.",
  "Si una cédula ya está en otra empresa, detente y avísale; no intentes otro camino.",
  "Los enlaces que devuelve los abre el doctor con su sesión iniciada. Fechas en hora de Caracas.",
].join("\n");
