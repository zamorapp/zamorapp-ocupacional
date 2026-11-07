// Manual: guía paso a paso de cada evaluación de «Evaluaciones de riesgos y puestos de trabajo».
// Cada guía dice qué mide, cuándo usarla, cómo se aplica en el puesto, cómo se llena en zamorApp
// (con los nombres reales de botones y campos) y cómo se interpreta, con su fuente.
// Si cambia una pantalla de /ergonomia, /psicosocial o /riesgos, actualiza aquí el paso que la nombra.
import type { TemaManual } from "@/lib/manual";

export const GRUPO_EVALUACIONES = "Evaluaciones de riesgos y puestos de trabajo";
const REVISADO = "Revisado en zamorApp el 06/11/2026.";

// Pasos comunes a todos los métodos de ergonomía (se repiten en cada guía para que se lea sola).
const ABRIR = (metodo: string) =>
  `Menú Gestión › Evaluaciones de riesgos › «Ergonomía de puestos» › «Nueva evaluación». Elige la empresa, el puesto (o «Otro (escribirlo)»), escribe la tarea que observas, toca la tarjeta «${metodo}» y «Empezar».`;
const DATOS = "Arriba revisa Puesto, Fecha, Tarea observada y Trabajadores expuestos (cuántos hacen esa tarea).";
const FOTOS = "«Fotos de la tarea»: sube hasta 12 fotos (de frente y de lado, con la postura más exigente). Necesitan internet.";
const HALLAZGOS = "«Riesgos y recomendaciones» › «Proponer desde el resultado»: zamorApp escribe los riesgos con su posible daño, la medida y el departamento responsable (Ingeniería, Operaciones, RR. HH. o SST). Ajusta Probabilidad y Severidad (1 a 5): la prioridad y el plazo salen solos. «Agregar» suma uno a mano.";
const CERRAR = "Escribe la «Conclusión» (resumen para la gerencia). Todo se guarda solo («Guardado» arriba). «Cerrar evaluación» la deja como informe entregado; en «Informes» imprimes el «Informe completo» o uno por departamento. Para corregir una cerrada, el administrador o el gerente médico usan «Reabrir para corregir».";
const MATRIZ = "Prioridad de cada hallazgo = Probabilidad × Severidad: 1-4 Bajo (vigilar), 5-9 Medio (menos de 3 meses), 10-16 Alto (menos de 1 mes), 17-25 Crítico (inmediato).";

export const TEMAS_EVALUACIONES: TemaManual[] = [
  {
    id: "evaluaciones",
    grupo: GRUPO_EVALUACIONES,
    titulo: "Cuál evaluación usar y en qué orden",
    para: "servicio",
    resumen: "Todas las evaluaciones del puesto de trabajo están en el menú Gestión › «Evaluaciones de riesgos» (pantalla «Evaluaciones de riesgos y puestos de trabajo»); abajo, «Puestos de trabajo y su riesgo» lista cada puesto con su riesgo más alto. Esta guía te dice cuál usar según lo que ves en el puesto, y debajo tienes cada método explicado paso a paso.",
    claves: "evaluacion evaluaciones metodo método cual elegir ergonomia ergonómica psicosocial mapa de riesgos lopcymat inpsasel det nih",
    pasos: [],
    partes: [
      {
        titulo: "Elige según lo que ves en el puesto",
        items: [
          "No sabes qué riesgos hay o necesitas el mapa del área: «Identificación de riesgos y mapa».",
          "Oficinas (luz, ruido, temperatura, pausas, carga mental, mobiliario): «Trabajo en oficina».",
          "Hay esfuerzo físico, posturas o repetición y no sabes qué método usar: empieza con el DEB. Te dice qué peligro está en rojo o amarillo y qué método específico hacer.",
          "Levantar o bajar cargas con las dos manos: NIOSH.",
          "Empujar o arrastrar carros, carretillas, jaulas o contenedores: KIM-PP.",
          "Movimientos repetidos de brazos y manos por ciclos (empaque, ensamblaje, caja, costura): OCRA Checklist.",
          "Posturas de brazos, muñecas y cuello (sentado o de pie): RULA.",
          "Posturas cambiantes de todo el cuerpo (almacén, limpieza, mantenimiento, enfermería): REBA.",
          "Oficina con computadora (silla, pantalla, teléfono, teclado y mouse): ROSA.",
          "Estrés, ritmo, apoyo de jefes, inseguridad o doble presencia (casa y trabajo): CoPsoQ-istas21 (psicosocial).",
          "Solo quieres dejar fotos y una lista de riesgos con prioridad, sin puntaje: «Inspección con hallazgos».",
        ],
      },
      {
        titulo: "Orden de trabajo recomendado",
        numerada: true,
        items: [
          "Identifica los riesgos del área o del puesto y dibuja el mapa de riesgos.",
          "Haz el DEB en cada puesto con esfuerzo físico.",
          "Para cada peligro en amarillo o rojo, haz el método específico que te indica (el botón «Hacer …» lo abre con el mismo puesto).",
          "Revisa los hallazgos, asigna responsable y plazo, y cierra la evaluación.",
          "Entrega el informe a cada departamento y notifica los riesgos a cada trabajador (Empresas › Puestos › «Notificar»).",
          "Repite la evaluación cuando cambie la tarea, el equipo o el local, o cuando se apliquen las medidas, para comprobar que bajó el riesgo.",
        ],
      },
      {
        titulo: "Base legal",
        items: [
          "LOPCYMAT (Gaceta Oficial 38.236, 26/07/2005): art. 40 (Servicio de Seguridad y Salud en el Trabajo: identificar, evaluar y controlar los riesgos), art. 53 y 56 (informar por escrito a cada trabajador los riesgos de su puesto), art. 59 y 60 (organización del trabajo y adaptación del puesto a la persona).",
          "Los métodos de ergonomía y el cuestionario psicosocial son herramientas técnicas reconocidas internacionalmente; cada guía trae su fuente. " + REVISADO,
        ],
      },
    ],
  },
  {
    id: "riesgos-mapa",
    grupo: GRUPO_EVALUACIONES,
    titulo: "Identificación de riesgos y mapa de riesgos",
    para: "servicio",
    resumen: "Recorrido del área o del puesto para anotar cada riesgo (físico, químico, biológico, de seguridad, ergonómico y psicosocial) con su probabilidad, severidad y medida, y ubicarlo con un símbolo en el plano: el mapa de riesgos.",
    claves: "mapa de riesgo identificacion identificación riesgos por puesto plano croquis simbolos símbolos matriz nt-04 nt04 inspeccion oficina lista de chequeo",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: [
          "Qué riesgos hay en cada puesto o área, cuántos trabajadores están expuestos y qué tan graves son (probabilidad × severidad), y dónde están en el local.",
        ],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "Al abrir el servicio en una empresa nueva, al inaugurar o cambiar un área, al cambiar procesos o equipos, después de un accidente y en la revisión periódica.",
          "Es el punto de partida: de aquí salen los puestos que necesitan DEB, NIOSH, RULA u otra evaluación específica.",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Pide el plano del local (o haz un croquis a mano y tómale foto) y la lista de puestos con sus tareas.",
          "Recorre el área con el delegado de prevención y el supervisor. Observa cada tarea y pregunta a los trabajadores qué les molesta o qué les ha pasado.",
          "Anota por cada riesgo: el agente (ruido, polvo, piso resbaladizo, carga…), la fuente (máquina, proceso), el posible daño y cuántos están expuestos.",
          "Fíjate en los controles que ya existen (resguardos, extracción, EPP, pausas) antes de valorar.",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          "Menú Gestión › Evaluaciones de riesgos › tarjeta «Identificación de riesgos y mapa» › «Nueva identificación». Elige la empresa, el tipo («Todas las áreas» u «Oficina administrativa»), qué se evalúa y el motivo (la lista se edita en Configuración › Listas › «Motivos de identificación de riesgos»). Va en 5 pasos y se guarda sola.",
          "Paso «Datos»: fecha, quiénes participaron (Comité, delegados de prevención, trabajadores consultados) y el acta.",
          "Paso «Puestos»: agrega los puestos o áreas que entran y cuántos trabajadores están expuestos en cada uno.",
          "Paso «Riesgos»: la lista de chequeo va por pantallas, una por grupo (Físico, Químico, Biológico, Mecánico o de seguridad, Disergonómico y Psicosocial). Toca Sí o No en cada riesgo; «Lo que falta de esta sección: No» marca de una vez el resto, y «Siguiente sección» o «Seguir con…» avanza. En «Fotos de la zona» tocas una sugerencia y se abre la cámara (las fotos necesitan internet).",
          "«Valorar los riesgos»: en cada riesgo marcado escribe de dónde viene, el posible daño, los controles que ya existen, Probabilidad y Severidad, la medida recomendada, el responsable y el plazo.",
          "Paso «Mapa»: «Subir plano» o «Usar croquis» (cuadriculado, sirve sin internet). En «Riesgos» tocas un riesgo y luego su lugar en el plano: queda su símbolo con la letra del grupo (F físico, Q químico, B biológico, S seguridad, E ergonómico, P psicosocial), su número y un anillo del color de su nivel. En «Nombres de áreas» escribes el nombre y tocas el plano.",
          "Paso «Resultados»: gráficas por grupo y por puesto. «Proponer conclusión» la escribe con los datos y la ajustas. «Cerrar evaluación» la deja como informe; «Informe y mapa» la imprime. «Pasar a los puestos» copia los riesgos a la matriz de cada puesto (la que usa la notificación de riesgos). «Reabrir» corrige una cerrada.",
          "«Trabajo en oficina» (otra tarjeta del mismo menú) abre la misma identificación con la lista de oficina: pantalla, silla, mesa, luz, ruido, temperatura, pausas y carga mental, con mediciones y sus valores de referencia. Si un puesto de computadora sale mal, sigue con ROSA.",
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          MATRIZ,
          "En el mapa, los símbolos en rojo marcan dónde actuar primero. Publícalo en cartelera y entrégalo al Comité de Seguridad y Salud Laboral.",
          "Cada riesgo alto o crítico de tipo ergonómico pide una evaluación específica (DEB y luego el método que corresponda); cada riesgo psicosocial alto, el CoPsoQ-istas21.",
        ],
      },
      {
        titulo: "Fuente",
        items: [
          "LOPCYMAT art. 40 y 56. Norma Técnica NT-04-2023 del INPSASEL (identificación y evaluación de riesgos; reemplazó a la NT-01-2008). Matriz de probabilidad × severidad 5 × 5. " + REVISADO,
        ],
      },
    ],
  },
  {
    id: "guia-deb",
    grupo: GRUPO_EVALUACIONES,
    titulo: "DEB · Diagnóstico Ergonómico Biomecánico (CENEA)",
    para: "servicio",
    resumen: "Lista de chequeo para recorrer un puesto e identificar los 5 peligros biomecánicos: levantamiento, transporte, empuje y arrastre, movimientos repetitivos y posturas forzadas. Clasifica cada uno en zona verde, amarilla o roja.",
    claves: "deb det cenea diagnostico diagnóstico ergonomico ergonómico biomecanico biomecánico zona verde amarilla roja iso 12295 lista de chequeo",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: [
          "Si cada uno de los 5 peligros está presente y, si lo está, si las condiciones son aceptables (verde), inaceptables (rojo) o dudosas (amarillo, hace falta medir con un método específico).",
          "Además permite anotar otros riesgos del puesto (físicos, químicos, biológicos y psicosociales) y mediciones ambientales.",
        ],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "Siempre primero, en cualquier puesto con esfuerzo físico, posturas o repetición. Es rápido (10 a 20 minutos por puesto) y te dice qué método específico hacer después, para no evaluar de más.",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Observa al menos un ciclo completo de la tarea (o 15 minutos si no hay ciclos) y pregunta cuánto dura en la jornada.",
          "Pesa las cargas (balanza o etiqueta) y mide distancias y alturas con cinta métrica cuando haga falta.",
          "Para cada peligro responde primero si está presente. Si lo está, revisa las condiciones de la zona verde (todas deben cumplirse). Si alguna no se cumple, revisa la zona roja (basta una para que sea rojo).",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("DEB (CENEA)"),
          DATOS,
          FOTOS,
          "Cada peligro es un acordeón: «¿está presente?» (Sí/No). Si es Sí, se abren «condiciones aceptables (zona verde)» y, si hace falta, «condiciones inaceptables (zona roja)». En Levantamiento/Transporte y Empuje hay «aspectos adicionales» opcionales.",
          "Abajo, «Otros riesgos del puesto» (opcional): marca solo los que haya y, si mediste, anota ruido, iluminación o temperatura en «Mediciones ambientales».",
          "Si al cerrar falta algo, zamorApp te muestra «Antes de cerrar, responde lo que falta» con un botón «Ir» a cada peligro.",
          "En el resultado, cada peligro en amarillo o rojo trae su «Evaluación específica» con el botón «Hacer NIOSH», «Hacer OCRA», «Hacer KIM» o «Hacer REBA», que crea esa evaluación con el mismo puesto (si el esfuerzo está en brazos y manos, crea en su lugar un RULA desde «Nueva evaluación»).",
          HALLAZGOS,
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "Zona verde: riesgo aceptable. Mantén las condiciones y reevalúa si cambia la tarea.",
          "Zona amarilla: no se puede descartar el riesgo. Haz la evaluación específica de ese peligro.",
          "Zona roja: riesgo inaceptable. Intervén de inmediato (prioridad «Inmediato») y haz la evaluación específica para elegir la medida.",
          "«Zona verde con alertas»: los 5 peligros están bien, pero marcaste otros riesgos del puesto que hay que corregir.",
          "Evaluación específica de cada peligro: levantamiento → NIOSH; transporte → masa acumulada y NIOSH; empuje y arrastre → KIM-PP; repetitivos → OCRA Checklist; posturas → REBA (cuerpo entero) o RULA (miembro superior).",
        ],
      },
      {
        titulo: "Fuente",
        items: ["CENEA / epm International Ergonomics School, fichas DEB versión 2-2012, basadas en ISO/TR 12295:2014 e ISO 11228-1, -2 y -3 e ISO 11226. " + REVISADO],
      },
    ],
  },
  {
    id: "guia-rula",
    grupo: GRUPO_EVALUACIONES,
    titulo: "RULA · Evaluación rápida de miembros superiores",
    para: "servicio",
    resumen: "Puntúa la postura de brazo, antebrazo, muñeca, cuello, tronco y piernas, más la fuerza y la repetición, y da un nivel de acción del 1 al 4.",
    claves: "rula miembros superiores brazo antebrazo muñeca muneca cuello postura mcatamney corlett nivel de accion acción",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: ["La carga postural del cuello, el tronco y los miembros superiores en una postura concreta. Resultado de 1 a 7."],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "Tareas sentadas o de pie donde trabajan sobre todo brazos, manos y cuello: cajas, ensamblaje, laboratorio, oficina, costura.",
          "Cuando el DEB deja «Posturas y movimientos forzados» en amarillo o rojo y el esfuerzo está en los brazos.",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Observa varios ciclos y elige la postura más exigente o la que más se repite (o la que se mantiene más tiempo).",
          "Toma fotos de lado y de frente para medir los ángulos (puedes usar un goniómetro o la app del teléfono sobre la foto).",
          "Decide qué lado evaluar (el más cargado) o evalúa ambos por separado.",
          "Pregunta el peso de lo que maneja y si la postura se mantiene más de 1 minuto o se repite 4 o más veces por minuto.",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("RULA"),
          DATOS + " Elige el «Lado evaluado» (Derecho, Izquierdo o Ambos).",
          FOTOS,
          "Marca cada zona: Brazo (ángulo, hombro elevado, brazo separado, brazo apoyado), Antebrazo (flexión del codo, cruza la línea media), Muñeca (flexión, desviación, giro, postura estática o repetida, carga en brazo y mano), Cuello, Tronco y «Piernas, actividad y carga».",
          "El resultado aparece a la derecha en cuanto respondes todo. «Cómo se calculó» muestra las tablas A, B y C.",
          HALLAZGOS,
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "1-2 · Nivel 1, aceptable: si no se mantiene ni se repite por largos periodos.",
          "3-4 · Nivel 2, medio: investigar más; pueden requerirse cambios.",
          "5-6 · Nivel 3, alto: investigar y cambiar pronto.",
          "7 · Nivel 4, muy alto: investigar y cambiar de inmediato.",
          "Mira qué zona sumó más (brazo, muñeca, cuello…): ahí va la medida. Repite el RULA después del cambio para comprobar que bajó.",
        ],
      },
      {
        titulo: "Fuente",
        items: ["McAtamney L, Corlett EN. RULA: a survey method for the investigation of work-related upper limb disorders. Applied Ergonomics 1993;24(2):91-99. " + REVISADO],
      },
    ],
  },
  {
    id: "guia-reba",
    grupo: GRUPO_EVALUACIONES,
    titulo: "REBA · Evaluación rápida del cuerpo entero",
    para: "servicio",
    resumen: "Como el RULA, pero para todo el cuerpo y posturas cambiantes: tronco, cuello, piernas, brazos, agarre y actividad. Resultado de 1 a 15 con cinco niveles de riesgo.",
    claves: "reba cuerpo entero postura tronco piernas rodillas agarre hignett mcatamney",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: ["La carga postural de todo el cuerpo en una postura concreta, incluyendo piernas, carga, agarre y actividad (estática, repetida o inestable)."],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "Tareas con posturas que cambian mucho o con todo el cuerpo: almacén, limpieza, mantenimiento, enfermería, construcción, cocina.",
          "Cuando el DEB deja «Posturas y movimientos forzados» en amarillo o rojo y participan tronco y piernas.",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Observa la tarea y elige la postura más exigente, la más frecuente o la que se mantiene más tiempo.",
          "Fotografía de lado para medir el ángulo del tronco, del cuello, de las rodillas y del brazo.",
          "Pesa la carga y califica el agarre (bueno con asa, regular, malo o inaceptable).",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("REBA"),
          DATOS + " Elige el «Lado evaluado».",
          FOTOS,
          "Marca Tronco, Cuello y Piernas (apoyo, rodillas, carga, fuerza de golpe), luego Brazo, «Antebrazo y muñeca» (incluye el agarre) y Actividad.",
          "El resultado sale a la derecha; «Cómo se calculó» muestra los puntajes A, B y C.",
          HALLAZGOS,
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "1 · Inapreciable: no se requiere acción.",
          "2-3 · Bajo: puede requerirse un cambio.",
          "4-7 · Medio: investigar más y cambiar pronto.",
          "8-10 · Alto: investigar e implantar cambios pronto.",
          "11-15 · Muy alto: implantar cambios de inmediato.",
        ],
      },
      {
        titulo: "Fuente",
        items: ["Hignett S, McAtamney L. Rapid Entire Body Assessment (REBA). Applied Ergonomics 2000;31(2):201-205. " + REVISADO],
      },
    ],
  },
  {
    id: "guia-rosa",
    grupo: GRUPO_EVALUACIONES,
    titulo: "ROSA · Puestos de oficina con computadora",
    para: "servicio",
    resumen: "Revisa silla, pantalla, teléfono, teclado y mouse, y cuánto tiempo se usa cada uno. Resultado de 1 a 10.",
    claves: "rosa oficina computadora silla pantalla monitor teclado mouse raton ratón telefono teléfono sonne",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: ["Qué tan bien está ajustado el puesto de oficina a la persona y cuánto tiempo pasa en él."],
      },
      {
        titulo: "Cuándo usarlo",
        items: ["Puestos administrativos, recepción, call center, diseño: cualquiera que use computadora más de 1 hora al día, o cuando alguien consulta por cuello, espalda baja, hombros o muñecas."],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Mira a la persona trabajando normalmente (no posando). Pregunta cuántas horas al día usa cada elemento y cuánto tiempo seguido.",
          "Silla: rodillas a 90°, unos 8 cm (tres dedos) entre el borde del asiento y la rodilla, apoyabrazos y respaldo regulables.",
          "Pantalla a un brazo de distancia y el borde superior a la altura de los ojos; teclado y mouse a la altura del codo, sin estirar el brazo.",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("ROSA"),
          DATOS,
          FOTOS,
          "Marca «Silla: altura y asiento», «Silla: apoyabrazos, respaldo y tiempo», Pantalla, Teléfono, Mouse y Teclado. En cada uno indica también el tiempo de uso (menos de 1 h, 1 a 4 h o más de 4 h al día).",
          HALLAZGOS,
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "1-2 · Bajo: puesto adecuado.",
          "3-4 · Mejorable: ajustar los elementos con puntaje alto cuando sea posible.",
          "5-7 · Alto: evaluar a fondo y corregir pronto (5 es el punto de corte del método).",
          "8-10 · Muy alto: corregir el puesto de inmediato.",
          "Casi siempre se corrige ajustando la silla, subiendo la pantalla o acercando teclado y mouse: medidas baratas y rápidas.",
        ],
      },
      {
        titulo: "Fuente",
        items: ["Sonne M, Villalta DL, Andrews DM. Development and evaluation of an office ergonomic risk checklist: ROSA. Applied Ergonomics 2012;43(1):98-108. Tablas de Cornell University Ergonomics Web. " + REVISADO],
      },
    ],
  },
  {
    id: "guia-niosh",
    grupo: GRUPO_EVALUACIONES,
    titulo: "NIOSH · Ecuación de levantamiento de cargas",
    para: "servicio",
    resumen: "Calcula el peso máximo recomendado para un levantamiento según distancias, alturas, giro, frecuencia, duración y agarre, y lo compara con el peso real: el Índice de Levantamiento (IL).",
    claves: "niosh nih nioch levantamiento carga cargas peso limite límite recomendado indice índice il lpr waters ecuacion ecuación",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: [
          "El Límite de Peso Recomendado (LPR): el peso que casi todos los trabajadores sanos pueden levantar en esas condiciones durante la jornada sin aumentar el riesgo de lumbalgia. Parte de 23 kg y se reduce con cada condición desfavorable.",
          "El Índice de Levantamiento (IL) = peso real ÷ LPR.",
        ],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "Levantar o bajar cargas con las dos manos, de 3 kg o más: almacén, despacho, carga de camiones, producción.",
          "Cuando el DEB deja «Levantamiento de cargas» o «Transporte de cargas» en amarillo o rojo.",
          "No sirve para levantar con una mano, sentado, de rodillas, cargas inestables (líquidos, personas) ni para empujar o arrastrar (para eso, KIM-PP).",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Pesa la carga (la más pesada habitual).",
          "Con cinta métrica, al tomar la carga: distancia horizontal de las manos al punto medio entre los tobillos (H) y altura de las manos desde el suelo (V).",
          "Recorrido vertical (D): altura de las manos al dejar la carga menos altura al tomarla.",
          "Giro del tronco (A) entre tomar y dejar: 0° de frente, 90° de lado.",
          "Cuenta los levantamientos por minuto y pregunta cuántas horas dura la tarea (hasta 1 h, 1 a 2 h o 2 a 8 h). Califica el agarre (bueno con asas, regular sin asas, malo si es voluminosa o resbaladiza).",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("NIOSH"),
          DATOS,
          FOTOS,
          "«La carga»: peso en kg y agarre. «Posición al levantar (origen)»: H, V, D y el giro en grados (cada campo trae la ayuda de cómo medirlo). «Frecuencia y duración»: levantamientos por minuto y horas en la jornada.",
          "El resultado dice «IL 1,45» y debajo «Carga 25 kg · límite recomendado …». «Cómo se calculó» muestra cada factor (HM, VM, DM, AM, FM, CM).",
          HALLAZGOS,
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "IL 1 o menos · Aceptable: la carga no supera el límite recomendado.",
          "IL mayor de 1 hasta 2 · Moderado: riesgo para algunos trabajadores; rediseñar la tarea.",
          "IL mayor de 2 hasta 3 · Alto: riesgo para muchos trabajadores; rediseñar pronto.",
          "IL mayor de 3 · Muy alto: inaceptable para casi todos; rediseñar de inmediato.",
          "El factor más bajo en «Cómo se calculó» dice qué cambiar: acercar la carga (H), subirla a la altura de la cintura (V), evitar giros (A), espaciar los levantamientos (F) o poner asas (C).",
        ],
      },
      {
        titulo: "Fuente",
        items: ["Waters TR, Putz-Anderson V, Garg A, Fine LJ. Revised NIOSH equation for the design and evaluation of manual lifting tasks. Ergonomics 1993;36(7):749-776 · NIOSH, Applications Manual for the Revised NIOSH Lifting Equation, publicación 2021-110 · ISO 11228-1. " + REVISADO],
      },
    ],
  },
  {
    id: "guia-ocra",
    grupo: GRUPO_EVALUACIONES,
    titulo: "OCRA Checklist · Movimientos repetitivos",
    para: "servicio",
    resumen: "Mide el riesgo de lesiones de hombro, codo, muñeca y mano en tareas por ciclos, sumando recuperación, frecuencia, fuerza, posturas y factores adicionales, ajustado al tiempo neto repetitivo.",
    claves: "ocra checklist repetitivo repetitivos ciclos miembro superior tunel carpiano túnel tendinitis colombini occhipinti borg iso 11228-3",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: ["El riesgo de trastornos de la extremidad superior por movimientos repetidos, considerando cuántas pausas hay, qué tan rápido se trabaja, cuánta fuerza se hace y en qué posturas, durante el tiempo real repetitivo de la jornada."],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "Tareas por ciclos con brazos y manos durante al menos 1 hora de la jornada: empaque, ensamblaje, cajas, costura, líneas de producción, procesamiento de alimentos.",
          "Cuando el DEB deja «Movimientos repetitivos de la extremidad superior» en amarillo o rojo.",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Pide el horario: duración del turno, pausas (oficiales y no oficiales), almuerzo y tiempo en tareas no repetitivas (limpiar, reponer, esperar).",
          "Graba en video unos ciclos y cuenta las acciones técnicas por minuto (tomar, colocar, girar, empujar…).",
          "Pregunta al trabajador cuánta fuerza siente que hace con la escala de Borg (0 nada a 10 máximo).",
          "Observa hombro, codo, muñeca y tipo de agarre, y qué fracción del tiempo están en posturas extremas.",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("OCRA Checklist"),
          DATOS + " Elige el «Lado evaluado» (evalúa el más cargado o ambos).",
          FOTOS,
          "Llena «Tiempos de la jornada en el puesto» (minutos), «Recuperación», «Frecuencia de las acciones técnicas», «Fuerza (escala de Borg CR-10)», «Posturas y movimientos» y «Factores adicionales» (guantes, golpes, frío, vibración, compresión, precisión y ritmo impuesto por la máquina).",
          "El tiempo neto repetitivo se calcula solo (turno menos pausas, almuerzo y tareas no repetitivas) y multiplica el puntaje.",
          HALLAZGOS,
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "Hasta 5 · Óptimo · y de 5,1 a 7,5 · Aceptable: no se requieren medidas.",
          "7,6 a 11 · Incierto: nuevo análisis o mejora del puesto.",
          "11,1 a 14 · Inaceptable leve: mejorar el puesto, supervisión médica y entrenamiento.",
          "14,1 a 22,5 · Inaceptable medio: mejorar pronto, supervisión médica y entrenamiento.",
          "Más de 22,5 · Inaceptable alto: mejorar de inmediato.",
          "Las medidas más eficaces suelen ser pausas de recuperación, rotación con tareas no repetitivas y bajar la fuerza (herramientas mejores).",
        ],
      },
      {
        titulo: "Fuente",
        items: ["Colombini D, Occhipinti E, Grieco A. Risk assessment and management of repetitive movements and exertions of upper limbs. Elsevier 2002 · Occhipinti E. OCRA: a concise index. Ergonomics 1998;41(9):1290-1311 · ISO 11228-3. " + REVISADO],
      },
    ],
  },
  {
    id: "guia-kim",
    grupo: GRUPO_EVALUACIONES,
    titulo: "KIM-PP · Empuje y arrastre de cargas",
    para: "servicio",
    resumen: "Método de indicadores clave de la BAuA (Alemania) para mover cargas con carretillas, carros, jaulas, contenedores con ruedas, monorrieles o grúas a mano. Da un puntaje y un nivel de riesgo.",
    claves: "kim kim-pp empuje empujar arrastre arrastrar carro carretilla traspaleta jaula baua iso 11228-2",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: ["La carga física de empujar o arrastrar según la masa, el equipo, el piso, las pendientes, el estado de las ruedas, la postura, la organización y la distancia recorrida en la jornada."],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "Mover cargas con carretilla, diablito, carro, jaula, contenedor con ruedas, traspaleta manual, monorriel o grúa a mano.",
          "Cuando el DEB deja «Empuje y tracción de cargas» en amarillo o rojo.",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Pesa el equipo vacío y súmale la carga más pesada habitual: esa es la masa total.",
          "Calcula el recorrido de la jornada: metros por viaje × viajes. Si solo sabes el tiempo, cada minuto empujando son unos 42 m.",
          "Revisa el piso (liso, dañado, adoquín, tierra), las pendientes, las ruedas (tamaño, desgaste, freno) y las asas.",
          "Observa la postura al empujar y si el trabajo alterna con otras tareas.",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("KIM-PP"),
          DATOS,
          FOTOS,
          "«Equipo y carga» (tipo de equipo, masa total en kg y recorrido en metros), «Piso y pendientes» (no aparece en monorriel ni grúa), «Condiciones del trabajo», «Estado del equipo» y «Postura y organización» (incluye si lo hacen mujeres: el puntaje se multiplica por 1,3).",
          HALLAZGOS,
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "Menos de 20 · Bajo: no se requieren medidas.",
          "20 a 49 · Algo aumentado: para personas menos resistentes, rediseño y prevención pueden ayudar.",
          "50 a 99 · Aumentado: rediseñar el puesto y otras medidas de prevención.",
          "100 o más · Alto: rediseñar es necesario, además de otras medidas.",
          "Si la línea bajo el puntaje dice «masa que no se mueve con seguridad», cambia el equipo o divide la carga antes que nada.",
        ],
      },
      {
        titulo: "Fuente",
        items: ["BAuA (Instituto Federal de Seguridad y Salud en el Trabajo de Alemania), Key Indicator Method KIM-PP, versión 2019 · ISO 11228-2. " + REVISADO],
      },
    ],
  },
  {
    id: "guia-inspeccion-hallazgos",
    grupo: GRUPO_EVALUACIONES,
    titulo: "Inspección con hallazgos (sin método)",
    para: "servicio",
    resumen: "Fotos y lista de riesgos con prioridad y recomendaciones, sin puntaje de postura. Útil para recorridos rápidos o cuando ningún método aplica.",
    claves: "inspeccion inspección hallazgos fotos recorrido libre sin metodo",
    pasos: [],
    partes: [
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          ABRIR("Inspección con hallazgos"),
          DATOS,
          FOTOS,
          "En «Riesgos y recomendaciones» toca «Agregar» por cada riesgo: factor, detalle, posible daño, Probabilidad, Severidad, medida, responsable y plazo.",
          CERRAR,
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [MATRIZ],
      },
    ],
  },
  {
    id: "psicosocial",
    grupo: GRUPO_EVALUACIONES,
    titulo: "Riesgos psicosociales (CoPsoQ-istas21)",
    para: "servicio",
    resumen: "Evaluación anónima de la organización del trabajo con el cuestionario CoPsoQ-istas21 versión corta (ISTAS): 38 preguntas en 6 apartados, comparadas con la población trabajadora de referencia (verde, amarillo, rojo). Se usa sin modificar, con finalidad preventiva y con el acuerdo del Comité de Seguridad y Salud Laboral, como pide su licencia.",
    claves: "psicosocial istas istas21 copsoq estres estrés cuestionario encuesta anonimo anónimo doble presencia estima liderazgo inseguridad exigencias",
    pasos: [],
    partes: [
      {
        titulo: "Qué mide",
        items: [
          "Seis apartados de la organización del trabajo: Exigencias psicológicas; Trabajo activo y posibilidades de desarrollo; Inseguridad sobre el futuro; Apoyo social y calidad de liderazgo; Doble presencia (trabajo y casa); y Estima.",
          "No evalúa a personas: evalúa las condiciones del trabajo en grupo. Nadie ve respuestas individuales.",
        ],
      },
      {
        titulo: "Cuándo usarlo",
        items: [
          "En la evaluación inicial de riesgos de la empresa y luego periódicamente (cada 1 a 2 años), o cuando haya señales: ausentismo, conflictos, rotación, quejas de estrés, consultas por ansiedad o insomnio.",
          "La versión corta está pensada para empresas con menos de 25 trabajadores, o para una primera mirada rápida en empresas más grandes.",
        ],
      },
      {
        titulo: "Cómo se aplica en el puesto",
        numerada: true,
        items: [
          "Acuerda la evaluación con el Comité de Seguridad y Salud Laboral (o los delegados de prevención) y déjalo en acta.",
          "Explica a los trabajadores para qué es, que es anónima y voluntaria, y que los resultados se usarán para mejorar el trabajo.",
          "Reparte los códigos al azar (de una caja), nunca anotando a quién le tocó cuál. Da tiempo dentro de la jornada para responder (unos 10 minutos).",
          "Comparte los resultados con el Comité y con los trabajadores, y acuerden juntos las medidas.",
        ],
      },
      {
        titulo: "Cómo se llena en zamorApp",
        numerada: true,
        items: [
          "Menú Gestión › Evaluaciones de riesgos › «Riesgos psicosociales» › «Nueva evaluación»: elige la empresa, cuántos trabajadores son y los puestos o áreas (mejor áreas amplias que cargos de una sola persona).",
          "Paso 1: anota la fecha del acuerdo con el Comité (o los delegados de prevención) y cómo consta (por ejemplo, el número de acta). Sin esa fecha no se generan códigos. «Guardar».",
          "Paso 2, «Repartir: un enlace para todos o códigos»: lo más fácil es «Un solo enlace para toda la oficina»: copia el mensaje y mándalo al grupo de WhatsApp. Abrirlo no gasta cupo; al tocar «Empezar» el teléfono recibe su propio código de un solo uso. El tope es el número de trabajadores del paso 1. Si el enlace llegó a gente de fuera, «Cambiar enlace» anula el anterior.",
          "Si prefieres códigos sueltos: «Códigos nuevos» genera tantos como trabajadores; «Imprimir papelitos con QR» saca 10 por hoja para recortar y repartir al azar (de una caja), o «WhatsApp» manda el siguiente código libre, uno distinto a cada trabajador.",
          "El trabajador abre el enlace o el QR, elige su puesto y responde una pregunta por pantalla: al tocar una respuesta pasa sola a la siguiente (puede volver con «Atrás» y revisar al final). Tarda unos 10 minutos. No pide nombre ni cédula. Al final ve su propio resultado en su teléfono.",
          "Quien prefiera papel: «Cargar un cuestionario en papel» y marca las 38 respuestas tal cual (S, MV, AV, SA, N). Luego destruye o entrega el papel al Comité.",
          "Paso 3: los resultados salen desde 5 respuestas (cambia el «Mínimo por grupo» si hace falta) y solo al cerrar se ven completos.",
          "Paso 4: «Sugerir» arma las conclusiones con los datos; toca las medidas que propone el método para agregarlas al plan con responsable y plazo.",
          "«Cerrar y entregar»: los códigos y el enlace dejan de servir y RR. HH. ve el informe en su portal. Conclusiones y medidas se siguen editando; reabrir solo lo hace el administrador o el gerente médico. «Informe» imprime la versión para la empresa.",
        ],
      },
      {
        titulo: "Cómo se interpreta",
        items: [
          "Cada trabajador queda en verde (situación más favorable para la salud), amarillo (intermedia) o rojo (más desfavorable) en cada apartado, según los puntos de corte de la población de referencia.",
          "Por apartado ves el porcentaje de trabajadores en cada color. «Prioritario»: la mitad o más está en rojo. «A vigilar»: más de un tercio en rojo (más que la población de referencia).",
          "Riesgo de la oficina por promedio: cada apartado se colorea con el promedio del grupo. Alto si 2 o más apartados quedan en rojo; Moderado si 1 está en rojo o 3 o más en amarillo; Bajo en los demás casos. Es un criterio del servicio para resumir; las prioridades siguen siendo por % en rojo, como pide el método.",
          "«Cada persona (anónima)»: el nivel de cada respuesta, sin nombre ni puesto, ordenado de más a menos grave. Solo lo ve el servicio, solo con la evaluación cerrada y con el mínimo de respuestas; RR. HH. no lo ve. Sirve para saber cuántos están en peor situación, no quiénes.",
          "Actúa primero sobre el apartado con más trabajadores en rojo. Por puesto ves el porcentaje en rojo; los grupos pequeños se juntan en «Otros puestos» para proteger el anonimato.",
          "Ejemplos de medidas: Exigencias → ajustar la plantilla y planificar; Trabajo activo → dar autonomía y formación; Inseguridad → informar con tiempo los cambios; Apoyo y liderazgo → formar a los jefes y aclarar tareas; Doble presencia → horarios flexibles; Estima → reconocer el trabajo y tratar con justicia.",
        ],
      },
      {
        titulo: "Fuente",
        items: [
          "ISTAS (Instituto Sindical de Trabajo, Ambiente y Salud). Evaluación de riesgos psicosociales, versión corta del método CoPsoQ-istas21, versión 1.5, 2010. Uso gratuito con finalidad preventiva, sin modificar preguntas ni puntos de corte, con acuerdo del Comité y anonimato. " + REVISADO,
        ],
      },
    ],
    consejos: [
      "Nadie ve respuestas una por una, ni tú: la base guarda las respuestas sin nombre, sin código y sin hora, y solo entrega totales.",
      "No se cobra por el cuestionario (condición de la licencia); sí por la evaluación, el análisis y la asesoría.",
      "Necesita internet: el trabajador responde en línea y la pantalla del servicio lee la nube. Sin internet, usa papel y cárgalo después con «Cargar un cuestionario en papel».",
    ],
  },
];
