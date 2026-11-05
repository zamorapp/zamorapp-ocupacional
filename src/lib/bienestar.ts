// Contenido de la hoja de recomendaciones de bienestar que el médico entrega al trabajador: pausas activas (rutina
// por zona del cuerpo y frecuencia), cuidados ocupacionales (lumbalgia, cuello, várices, hernias) y salud mental
// (higiene mental, estrés, sobrecarga, acoso, inteligencia emocional, meditación, gerentes). Cada tema lleva su fuente. Antes de imprimir, el médico puede tocar cualquier texto y cambiarlo.

export type EjercicioPausa = { hacer: string; dosis: string };
export type ZonaPausa = { zona: string; ejercicios: EjercicioPausa[] };

export const PAUSAS = {
  intro: "Pausas cortas de movimiento para prevenir dolores, fatiga visual y cansancio. De pie o sentado, sin equipo.",
  frecuencia: [
    { cifra: "Cada 2 h", texto: "pausa de 5 a 10 min (3 a 4 por jornada)" },
    { cifra: "Cada hora", texto: "micro-pausa de 30 a 60 s en tareas repetitivas" },
    { cifra: "20-20-20", texto: "en pantallas: cada 20 min, mirar a 6 m por 20 s" },
  ],
  // Textos cortos (una línea con letra de 9 pt): la rutina completa tiene que caber en una carta
  zonas: [
    { zona: "Cuello", ejercicios: [
      { hacer: "Oreja al hombro, sin subirlo", dosis: "10 s c/lado" },
      { hacer: "Mentón al pecho y volver despacio", dosis: "5 veces" },
      { hacer: "Girar y mirar sobre cada hombro", dosis: "5 c/lado" },
    ] },
    { zona: "Hombros", ejercicios: [
      { hacer: "Subir los hombros y soltarlos", dosis: "10 veces" },
      { hacer: "Círculos de hombros hacia atrás", dosis: "10 veces" },
      { hacer: "Brazo cruzado sobre el pecho", dosis: "15 s c/lado" },
    ] },
    { zona: "Brazos y muñecas", ejercicios: [
      { hacer: "Palma arriba: bajar los dedos", dosis: "15 s c/lado" },
      { hacer: "Palma abajo: bajar el dorso", dosis: "15 s c/lado" },
      { hacer: "Círculos lentos de muñecas", dosis: "10 veces" },
    ] },
    { zona: "Manos y dedos", ejercicios: [
      { hacer: "Abrir la mano y cerrar el puño suave", dosis: "10 veces" },
      { hacer: "Pulgar a la punta de cada dedo", dosis: "3 rondas" },
      { hacer: "Sacudir las manos sueltas", dosis: "10 s" },
    ] },
    { zona: "Espalda alta y pecho", ejercicios: [
      { hacer: "Manos atrás entrelazadas: abrir el pecho", dosis: "15 s" },
      { hacer: "Manos al frente: redondear la espalda", dosis: "15 s" },
      { hacer: "Juntar los omóplatos, codos atrás", dosis: "10 veces" },
    ] },
    { zona: "Cintura y espalda baja", ejercicios: [
      { hacer: "Manos en la cintura: inclinarse atrás", dosis: "5 veces" },
      { hacer: "Brazo arriba: inclinarse al otro lado", dosis: "10 s c/lado" },
      { hacer: "Sentado: girar el tronco", dosis: "10 s c/lado" },
    ] },
    { zona: "Piernas", ejercicios: [
      { hacer: "Puntas de pie, apoyado en una silla", dosis: "15 veces" },
      { hacer: "Talón a la nalga, apoyado", dosis: "15 s c/pierna" },
      { hacer: "Sentado: estirar la pierna, punta arriba", dosis: "15 s c/pierna" },
    ] },
    { zona: "Ojos", ejercicios: [
      { hacer: "Mirar un punto lejano", dosis: "20 s" },
      { hacer: "Parpadear despacio", dosis: "10 veces" },
      { hacer: "Mirar arriba, abajo y a los lados", dosis: "5 c/lado" },
    ] },
  ] as ZonaPausa[],
  reglas: [
    "Lento, sin rebotes ni dolor; respire normal y termine con 3 respiraciones profundas.",
    "Si un ejercicio duele, no lo haga y avise al servicio médico. Con lesión, hernia o cirugía reciente, solo los que indique el médico.",
  ],
  fuente:
    "OMS, Directrices sobre actividad física y comportamientos sedentarios (2020). Centro Canadiense de Salud y Seguridad Ocupacional (CCOHS), Office Ergonomics: Stretching (2023). Academia Americana de Oftalmología, regla 20-20-20 (2024).",
};

// Días de la semana para marcar cada pausa hecha (4 por jornada)
export const REGISTRO_PAUSAS = { dias: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"], pausas: 4 };

export type TemaBienestar = { clave: string; boton: string; titulo: string; grupos: { titulo?: string; items: string[] }[]; fuente: string };

// Temas que el médico agrega con un botón. «pausas» tiene su propio diseño (rutina por zona y registro)
export const TEMAS: TemaBienestar[] = [
  {
    clave: "lumbalgia",
    boton: "Lumbalgia",
    titulo: "Lumbalgia: cuidar la espalda baja en el trabajo",
    grupos: [
      {
        items: [
          "Mantenerse activo: el reposo en cama prolongado retrasa la mejoría.",
          "Al levantar una carga: pies separados, rodillas dobladas, espalda recta y la carga pegada al cuerpo; para girar, mover los pies, nunca torcer el tronco con peso.",
          "Empujar es mejor que halar; usar carretilla, transpaleta o pedir ayuda para lo pesado.",
          "Sentado: espalda apoyada con soporte en la cintura, pies en el piso y levantarse cada hora.",
          "De pie mucho tiempo: apoyar un pie en un escalón o barra baja y alternar.",
          "Al manejar: asiento cerca del volante y parar a caminar cada 2 horas.",
          "Fortalecer abdomen y espalda con los ejercicios que le indiquen, y caminar a diario.",
          "Bajar de peso si hay sobrepeso: descarga la columna.",
          "Urgencia: dolor con pérdida de fuerza en las piernas, adormecimiento entre las piernas o problemas para orinar o defecar.",
        ],
      },
    ],
    fuente: "NICE NG59, Low back pain and sciatica in over 16s (2016, actualizada 2020). Qaseem A y cols., Guía ACP 2017 de dolor lumbar, Ann Intern Med 2017;166:514. NIOSH, ecuación revisada de levantamiento de cargas (1994).",
  },
  {
    clave: "cuello",
    boton: "Cervicalgia",
    titulo: "Cervicalgia y cervicobraquialgia: cuidar el cuello y los brazos",
    grupos: [
      {
        items: [
          "Pantalla a la altura de los ojos y a un brazo de distancia; los papeles en un atril al lado de la pantalla.",
          "Teléfono con audífonos o altavoz; nunca sostenerlo entre la oreja y el hombro.",
          "Hombros relajados y codos apoyados en ángulo recto; teclado y ratón cerca del cuerpo.",
          "Evitar trabajar mucho tiempo con los brazos por encima de los hombros: usar escalera o plataforma.",
          "Cada 30 a 60 minutos, los ejercicios de cuello y hombros de las pausas activas.",
          "Calor local 15 minutos en la noche si hay contractura.",
          "Dormir de lado o boca arriba, con una almohada que mantenga el cuello recto; no dormir boca abajo.",
          "Consultar si el dolor baja al brazo con hormigueo o pérdida de fuerza, o si dura más de 6 semanas.",
        ],
      },
    ],
    fuente: "Blanpied PR y cols., Guía de práctica clínica de dolor de cuello, J Orthop Sports Phys Ther 2017;47:A1. INSST (España), Guía técnica de pantallas de visualización de datos (2021).",
  },
  {
    clave: "venas",
    boton: "Insuficiencia venosa",
    titulo: "Insuficiencia venosa de miembros inferiores (várices)",
    grupos: [
      {
        titulo: "En el trabajo",
        items: [
          "No pasar más de 1 hora de pie o sentado sin moverse: caminar o mover los tobillos 2 a 3 minutos.",
          "De pie: pasar el peso de una pierna a la otra y subir en puntas de pie 15 veces cada hora.",
          "Sentado: no cruzar las piernas; mover los pies en círculos y de punta a talón.",
          "Medias de compresión graduada durante la jornada, puestas al levantarse (la presión la indica el médico).",
          "Alejar las piernas de fuentes de calor (hornos, calderas) y evitar ropa ajustada en la cintura.",
        ],
      },
      {
        titulo: "En casa",
        items: [
          "Elevar las piernas por encima del corazón 15 a 20 minutos al llegar.",
          "Caminar 30 minutos diarios; nadar o montar bicicleta también ayudan.",
          "Bajar de peso si hay sobrepeso: alivia la presión en las venas. No fumar.",
          "Calzado cómodo con tacón bajo (2 a 4 cm); consultar si aparece una herida o úlcera en la pierna.",
          "Urgencia: una sola pierna hinchada, caliente, roja o dolorosa (puede ser un coágulo).",
        ],
      },
    ],
    fuente: "De Maeseneer MG y cols., Guía ESVS 2022 de enfermedad venosa crónica de miembros inferiores, Eur J Vasc Endovasc Surg 2022;63:184.",
  },
  {
    clave: "hernias",
    boton: "Hernia umbilical o inguinal",
    titulo: "Hernia umbilical o inguinal: cuidados en el trabajo",
    grupos: [
      {
        items: [
          "Evitar levantar cargas pesadas y los esfuerzos bruscos; el peso máximo lo indica el médico.",
          "Al levantar algo: exhalar al hacer la fuerza y no aguantar el aire (no pujar).",
          "Pedir ayuda o usar carretilla para las cargas pesadas.",
          "Evitar el estreñimiento con fibra y agua, y tratar la tos crónica: ambos aumentan la presión del abdomen.",
          "Bajar de peso si hay sobrepeso: reduce la presión sobre la pared del abdomen.",
          "La faja o el braguero no curan la hernia: usarlos solo si el médico lo indica.",
          "Después de la operación: volver al trabajo y a las cargas poco a poco, según indique el cirujano.",
          "Urgencia: si la hernia no se mete, se pone dura, muy dolorosa o morada, o hay vómitos.",
        ],
      },
    ],
    fuente: "HerniaSurge Group, International guidelines for groin hernia management, Hernia 2018;22:1. Henriksen NA y cols., Guía EHS/AHS de hernias umbilicales y epigástricas, Br J Surg 2020;107:171.",
  },
  {
    clave: "higiene",
    boton: "Higiene mental",
    titulo: "Higiene mental: cuidar la mente cada día",
    grupos: [
      {
        items: [
          "Rutina estable: horas fijas para dormir, comer, trabajar y descansar.",
          "Reservar cada día un rato para algo que disfrute: música, lectura, un oficio, la fe o la naturaleza.",
          "Limitar las noticias y las redes sociales a horarios fijos; evitar el teléfono al despertar y al acostarse.",
          "Tomar la luz del sol por la mañana y moverse todos los días.",
          "Practicar la gratitud: anotar cada noche tres cosas buenas del día.",
          "Poner límites: aprender a decir que no, sin culpa.",
          "Hablarse con amabilidad: cambiar el «no sirvo» por «estoy aprendiendo».",
          "Ponerse metas pequeñas y celebrarlas al cumplirlas.",
          "Pedir ayuda a tiempo: hablar de lo que siente no es debilidad.",
        ],
      },
    ],
    fuente: "OMS, Informe mundial sobre salud mental: transformar la salud mental para todos (2022). OMS, En tiempos de estrés, haz lo que importa (2020).",
  },
  {
    clave: "meditacion",
    boton: "Meditación",
    titulo: "Meditación y atención plena",
    grupos: [
      {
        items: [
          "Elegir un momento fijo del día (al despertar, en el descanso o antes de dormir); empezar con 5 minutos y subir poco a poco hasta 10 o 20.",
          "Sentarse con la espalda recta, los pies en el piso y las manos sobre los muslos; cerrar los ojos o mirar un punto en el piso.",
          "Respirar por la nariz y fijar la atención en el aire que entra y sale; contar 1 al inhalar y 2 al exhalar, hasta 10, y volver a empezar.",
          "La mente se va a distraer muchas veces: notar el pensamiento sin juzgarlo y volver con calma a la respiración. Eso es meditar.",
          "Recorrido del cuerpo: llevar la atención de los pies a la cabeza, soltando la tensión de cada parte.",
          "Atención plena en lo cotidiano: comer, caminar o bañarse con los cinco sentidos y sin el teléfono.",
          "La constancia vale más que la duración: 10 minutos diarios rinden más que una hora a la semana.",
          "Si tiene depresión, ansiedad intensa o vivió un trauma, practíquela con la guía de un profesional.",
        ],
      },
    ],
    fuente: "Goyal M y cols., Meditation programs for psychological stress and well-being, JAMA Intern Med 2014;174:357. NCCIH (EE. UU.), Meditation and Mindfulness: Effectiveness and Safety (2022).",
  },
  {
    clave: "estres",
    boton: "Manejo del estrés",
    titulo: "Manejo del estrés",
    grupos: [
      {
        items: [
          "Respiración 4-6: inhalar en 4 segundos y exhalar en 6, durante 2 a 5 minutos, apenas note la tensión.",
          "Identificar qué le causa estrés y separar lo que puede cambiar de lo que no; actuar sobre lo primero.",
          "Organizar el día con una lista corta de 3 prioridades; una tarea a la vez, con pausas entre tareas.",
          "Dormir 7 a 8 horas con horario fijo; dejar las pantallas una hora antes de acostarse.",
          "Moverse: 30 minutos de caminata al día bajan la tensión y mejoran el ánimo.",
          "No calmar el estrés con alcohol, cigarrillo, exceso de café o comida.",
          "Hablar con alguien de confianza y mantener el contacto con la familia y los amigos.",
          "Separar el trabajo del descanso: fuera del horario, silenciar el correo y los grupos del trabajo cuando sea posible.",
          "Consultar al servicio médico si por más de 2 semanas tiene insomnio, tristeza, irritabilidad, palpitaciones o no logra rendir.",
        ],
      },
    ],
    fuente: "OMS, En tiempos de estrés, haz lo que importa: guía ilustrada (2020). OMS y OIT, Directrices sobre salud mental en el trabajo (2022).",
  },
  {
    clave: "sobrecarga",
    boton: "Sobrecarga de trabajo",
    titulo: "Si se siente agobiado por el trabajo",
    grupos: [
      {
        items: [
          "Hacer una lista de todo lo pendiente y clasificarlo: urgente, importante, puede esperar o se puede delegar.",
          "Hablar con su supervisor con la lista en la mano y pedir ayuda para fijar prioridades y plazos realistas.",
          "Dividir las tareas grandes en pasos pequeños y empezar por el primero.",
          "Respetar la jornada y la hora de almuerzo: las horas extra seguidas aumentan los errores y los accidentes.",
          "Hacer las pausas de la jornada aunque haya mucho trabajo: se rinde más.",
          "Al terminar la jornada, anotar lo pendiente para mañana y dejar el trabajo allí.",
          "Señales de agotamiento (burnout): cansancio que no mejora con el descanso, desgano, distancia con el trabajo y sentirse ineficaz. Consulte al servicio médico.",
          "La ley protege su jornada, sus descansos y sus vacaciones.",
        ],
      },
    ],
    fuente: "OMS, CIE-11, QD85 Síndrome de desgaste ocupacional (2019). OMS y OIT, Directrices sobre salud mental en el trabajo (2022). LOPCYMAT (2005), art. 53. LOTTT (2012).",
  },
  {
    clave: "acoso",
    boton: "Acoso laboral",
    titulo: "Acoso laboral: cómo reconocerlo y qué hacer",
    grupos: [
      {
        titulo: "Cómo reconocerlo",
        items: [
          "Trato hostil, humillante o intimidante que se repite: gritos, burlas, insultos, amenazas o aislamiento.",
          "Quitarle tareas sin razón o cargarlo de trabajo imposible para hacerlo fallar.",
          "Comentarios, contactos o propuestas sexuales no deseadas.",
          "No es su culpa y no tiene por qué aguantarlo.",
        ],
      },
      {
        titulo: "Qué hacer",
        items: [
          "Anotar cada hecho: fecha, hora, lugar, qué pasó, quién lo hizo y quién lo vio; guardar mensajes y correos.",
          "Si se siente seguro, decir con calma y claridad que esa conducta no es aceptable.",
          "Denunciarlo por escrito ante su supervisor, Recursos Humanos o el Comité de Seguridad y Salud Laboral, y pedir copia sellada.",
          "Puede acudir al Delegado o Delegada de Prevención y a la Gerencia Estadal de Salud de los Trabajadores (INPSASEL).",
          "Buscar apoyo en la familia, en compañeros de confianza y en el servicio médico: el acoso afecta la salud y se puede atender.",
          "Si es testigo: apoyar a la persona afectada y servir de testigo.",
        ],
      },
    ],
    fuente: "LOPCYMAT (2005), art. 56, numeral 5. LOTTT (2012), art. 164. OIT, Convenio 190 sobre la violencia y el acoso (2019).",
  },
  {
    clave: "emocional",
    boton: "Inteligencia emocional",
    titulo: "Inteligencia emocional",
    grupos: [
      {
        items: [
          "Conocerse: ponerle nombre a lo que siente (rabia, miedo, tristeza, frustración); nombrar la emoción baja su intensidad.",
          "Hacer una pausa antes de reaccionar: respirar y contar hasta 10 antes de responder un mensaje o una discusión.",
          "Si la emoción es muy fuerte, retirarse unos minutos y retomar la conversación con calma.",
          "Escuchar para entender, no para responder: dejar terminar a la otra persona y repetir con sus palabras lo que entendió.",
          "Ponerse en el lugar del otro: preguntarse cómo ve la situación y qué necesita.",
          "Hablar en primera persona, sin atacar ni callar: «Yo me siento… cuando… y necesito…».",
          "Diario de emociones: cada noche, anotar una situación, lo que sintió, cómo respondió y qué haría distinto.",
          "Reconocer lo bueno: agradecer y felicitar a otros con hechos concretos.",
        ],
      },
    ],
    fuente: "Mayer JD, Salovey P, What is emotional intelligence? (1997). Goleman D, Inteligencia emocional (1995). OMS, Habilidades para la vida (1997).",
  },
  {
    clave: "gerentes",
    boton: "Para gerentes",
    titulo: "Recomendaciones para gerentes y supervisores",
    grupos: [
      {
        titulo: "Su salud",
        items: [
          "Hacerse un control al año como mínimo: tensión, azúcar, colesterol, peso y cintura.",
          "Proteger el descanso: dormir 7 a 8 horas, tomar las vacaciones completas y tener un día a la semana sin trabajo.",
          "Reservar en la agenda la hora de almuerzo, lejos del escritorio, y 30 minutos de actividad física.",
          "Delegar con claridad (qué, para cuándo y con qué recursos) en lugar de cargar con todo.",
          "Reuniones cortas, con agenda y hora de fin; reservar horas sin interrupciones para pensar.",
        ],
      },
      {
        titulo: "Su equipo",
        items: [
          "Dar instrucciones claras y metas alcanzables; revisar la carga de trabajo antes de asignar más.",
          "Reconocer el buen trabajo a tiempo y con hechos concretos; corregir en privado y con respeto.",
          "Conversar a solas con cada persona de forma periódica: preguntar cómo está, no solo qué hizo.",
          "Respetar el horario: no escribir fuera de la jornada salvo urgencias.",
          "Estar atento a señales de estrés (ausencias, errores, irritabilidad, aislamiento) y referir al servicio médico.",
          "Dar el ejemplo: hacer las pausas activas con el equipo y usar el equipo de protección.",
          "Actuar pronto ante conflictos, maltrato o acoso.",
        ],
      },
    ],
    fuente: "OMS y OIT, Directrices sobre salud mental en el trabajo (2022), recomendación de formar a los gerentes. LOPCYMAT (2005), art. 56, deberes del empleador.",
  },
];

// Temas elegidos en la URL (?tema=pausas,estres). Sin parámetro, la hoja sale con las pausas activas
export const temasBienestar = (texto: string | undefined) => {
  if (texto === undefined || texto === "") return ["pausas"];
  const validas = ["pausas", ...TEMAS.map((t) => t.clave)];
  const lista = texto.split(",").filter((c) => validas.includes(c));
  return lista.length ? lista : ["pausas"];
};

export const BOTONES_BIENESTAR = [{ clave: "pausas", boton: "Pausas activas" }, ...TEMAS.map(({ clave, boton }) => ({ clave, boton }))];
