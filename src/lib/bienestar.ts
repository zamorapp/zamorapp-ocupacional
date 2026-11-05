// Contenido de la hoja de recomendaciones de bienestar que el médico entrega al trabajador: pausas activas (rutina
// por zona del cuerpo y frecuencia), meditación, manejo del estrés, inteligencia emocional y recomendaciones para
// gerentes. Cada tema lleva su fuente. Antes de imprimir, el médico puede tocar cualquier texto y cambiarlo.

export type EjercicioPausa = { hacer: string; dosis: string };
export type ZonaPausa = { zona: string; ejercicios: EjercicioPausa[] };

export const PAUSAS = {
  intro:
    "Pausas cortas de movimiento durante la jornada para prevenir dolores de cuello, espalda, hombros, manos y piernas, la fatiga visual y el cansancio. Se hacen de pie o sentado, con ropa de trabajo y sin equipo.",
  frecuencia: [
    { cifra: "Cada 2 h", texto: "una pausa de 5 a 10 minutos (3 a 4 por jornada)" },
    { cifra: "Cada hora", texto: "una micro-pausa de 30 a 60 segundos si la tarea es repetitiva o de pie o sentado sin moverse" },
    { cifra: "20-20-20", texto: "frente a pantallas: cada 20 minutos, mirar a 6 metros durante 20 segundos" },
  ],
  zonas: [
    {
      zona: "Cuello",
      ejercicios: [
        { hacer: "Inclinar la cabeza hacia un hombro, sin subirlo; luego al otro", dosis: "10 s por lado" },
        { hacer: "Llevar el mentón al pecho y volver despacio al centro", dosis: "5 veces" },
        { hacer: "Girar la cabeza para mirar sobre un hombro y luego sobre el otro", dosis: "5 por lado" },
      ],
    },
    {
      zona: "Hombros",
      ejercicios: [
        { hacer: "Subir los hombros hacia las orejas y soltarlos de golpe", dosis: "10 veces" },
        { hacer: "Hacer círculos con los hombros hacia atrás", dosis: "10 veces" },
        { hacer: "Cruzar un brazo por delante del pecho y sostenerlo con el otro", dosis: "15 s por lado" },
      ],
    },
    {
      zona: "Brazos y muñecas",
      ejercicios: [
        { hacer: "Brazo al frente, palma arriba: bajar los dedos con la otra mano", dosis: "15 s por lado" },
        { hacer: "Brazo al frente, palma abajo: bajar el dorso de la mano con la otra", dosis: "15 s por lado" },
        { hacer: "Círculos lentos con las muñecas, hacia un lado y hacia el otro", dosis: "10 veces" },
      ],
    },
    {
      zona: "Manos y dedos",
      ejercicios: [
        { hacer: "Abrir la mano separando bien los dedos y cerrar el puño sin apretar", dosis: "10 veces" },
        { hacer: "Tocar con el pulgar la punta de cada dedo, ida y vuelta", dosis: "3 rondas" },
        { hacer: "Sacudir las manos sueltas", dosis: "10 s" },
      ],
    },
    {
      zona: "Espalda alta y pecho",
      ejercicios: [
        { hacer: "Entrelazar las manos detrás de la espalda y abrir el pecho", dosis: "15 s" },
        { hacer: "Entrelazar las manos al frente y redondear la espalda, como abrazando un barril", dosis: "15 s" },
        { hacer: "Juntar los omóplatos llevando los codos hacia atrás", dosis: "10 veces" },
      ],
    },
    {
      zona: "Cintura y espalda baja",
      ejercicios: [
        { hacer: "De pie, manos en la cintura: inclinarse hacia atrás con suavidad", dosis: "5 veces" },
        { hacer: "Un brazo arriba: inclinar el tronco hacia el lado contrario", dosis: "10 s por lado" },
        { hacer: "Sentado, girar el tronco tomándose del espaldar de la silla", dosis: "10 s por lado" },
      ],
    },
    {
      zona: "Piernas",
      ejercicios: [
        { hacer: "Subir en puntas de pie y bajar despacio, apoyado en una silla o pared", dosis: "15 veces" },
        { hacer: "Llevar el talón a la nalga tomándose el tobillo, de pie y apoyado", dosis: "15 s por pierna" },
        { hacer: "Sentado, estirar una pierna y llevar la punta del pie hacia usted", dosis: "15 s por pierna" },
      ],
    },
    {
      zona: "Ojos",
      ejercicios: [
        { hacer: "Mirar un punto lejano por la ventana o el pasillo", dosis: "20 s" },
        { hacer: "Parpadear despacio, cerrando bien los ojos", dosis: "10 veces" },
        { hacer: "Mover la mirada arriba y abajo, y a un lado y al otro, sin mover la cabeza", dosis: "5 por lado" },
      ],
    },
  ] as ZonaPausa[],
  reglas: [
    "Movimientos lentos, sin rebotes y sin llegar al dolor; respirar normal, sin aguantar el aire.",
    "Terminar con 3 respiraciones profundas: inhalar por la nariz y botar el aire lento por la boca.",
    "Si un ejercicio duele, no lo haga y avise al servicio médico. Con lesión, hernia o cirugía reciente, haga solo los que le indique el médico.",
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
