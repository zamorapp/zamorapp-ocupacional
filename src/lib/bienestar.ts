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
  // ===== Biblioteca 06-nov (Cesar): más afecciones musculoesqueléticas, heridas y piel, salud mental y estilo de vida
  {
    clave: "escoliosis",
    boton: "Escoliosis",
    titulo: "Escoliosis: espalda fuerte y sin dolor",
    grupos: [
      {
        items: [
          "Con escoliosis se puede trabajar y hacer ejercicio: mantenerse activo protege la espalda.",
          "Hacer a diario los ejercicios que le indiquen para fortalecer abdomen, espalda y glúteos; nadar y caminar ayudan.",
          "Sentado: espalda apoyada, pies en el piso y la pantalla al frente, sin girar el tronco.",
          "Repartir el peso: bolso o morral en ambos hombros; las cargas, cerca del cuerpo y con las dos manos.",
          "Cambiar de postura cada 30 a 60 minutos y hacer las pausas activas de espalda.",
          "Control con su médico según le indique; más seguido si el dolor aumenta o nota que la curva cambia.",
          "Consultar pronto si aparece dolor que no cede con reposo, hormigueo o pérdida de fuerza en las piernas, o falta de aire.",
        ],
      },
    ],
    fuente: "SOSORT, Guías de manejo conservador de la escoliosis (Negrini S y cols., Scoliosis Spinal Disord 2018;13:3). NICE NG59, Low back pain and sciatica (2020).",
  },
  {
    clave: "rodilla",
    boton: "Dolor de rodilla",
    titulo: "Dolor de rodilla (gonalgia): cuidar la articulación",
    grupos: [
      {
        titulo: "Cuidados",
        items: [
          "Mantenerse activo con ejercicios suaves: caminar en terreno plano, bicicleta fija o natación.",
          "Fortalecer los muslos (cuádriceps) con los ejercicios que le indiquen: es lo que más protege la rodilla.",
          "Bajar de peso si hay sobrepeso: cada kilo menos alivia la rodilla al caminar.",
          "Hielo 15 minutos, envuelto en un paño, si la rodilla está inflamada; calor si está rígida.",
          "Calzado cómodo, con buena suela y sin tacón alto.",
        ],
      },
      {
        titulo: "En el trabajo",
        items: [
          "Evitar arrodillarse o ponerse en cuclillas por mucho tiempo; si hace falta, usar rodilleras o un cojín.",
          "Subir y bajar escaleras despacio, con apoyo en el pasamanos.",
          "Alternar estar de pie y sentado; no cargar peso subiendo escaleras.",
          "Consultar pronto si la rodilla se hincha mucho, se traba, falla al apoyar o está caliente y roja.",
        ],
      },
    ],
    fuente: "OARSI, Guidelines for the non-surgical management of knee osteoarthritis (Bannuru RR y cols., Osteoarthritis Cartilage 2019;27:1578). NICE NG226, Osteoarthritis in over 16s (2022).",
  },
  {
    clave: "hombro",
    boton: "Dolor de hombro",
    titulo: "Dolor de hombro (manguito rotador): mover sin lastimar",
    grupos: [
      {
        items: [
          "No inmovilizar el hombro: moverlo suave dentro de lo que no duele evita que se ponga rígido.",
          "Evitar trabajar con los brazos por encima de los hombros: usar escalera o plataforma y acercar el trabajo.",
          "Cargar pegado al cuerpo y con los codos doblados; no levantar peso con el brazo estirado.",
          "Ejercicios de péndulo: inclinado, dejar colgar el brazo y hacer círculos pequeños, 1 minuto, 3 veces al día.",
          "Hielo 15 minutos después de un esfuerzo si duele.",
          "Dormir boca arriba o del lado sano, con una almohada bajo el brazo que duele.",
          "Consultar si no puede levantar el brazo, si el dolor no deja dormir o si dura más de 4 semanas.",
        ],
      },
    ],
    fuente: "Hopman K y cols., Clinical practice guidelines for the management of rotator cuff syndrome in the workplace, Univ. de Nueva Gales del Sur (2013). Diercks R y cols., Guía del síndrome de dolor subacromial, Acta Orthop 2014;85:314.",
  },
  {
    clave: "muneca",
    boton: "Muñeca y túnel carpiano",
    titulo: "Muñeca y túnel carpiano: manos sin hormigueo",
    grupos: [
      {
        items: [
          "Muñeca recta al trabajar: ni doblada hacia arriba ni hacia abajo; teclado bajo y ratón cerca.",
          "Agarrar con toda la mano, no en pinza; usar herramientas con mango grueso y que no vibren.",
          "Repartir las tareas repetitivas y hacer micro-pausas cada hora: abrir y cerrar la mano, estirar los dedos.",
          "Evitar apoyar la muñeca sobre bordes duros.",
          "Si le indicaron férula, usarla de noche con la muñeca recta.",
          "Sacudir las manos alivia el hormigueo; consultar si se adormecen los dedos pulgar, índice y medio, o si se le caen las cosas.",
        ],
      },
    ],
    fuente: "AAOS, Management of Carpal Tunnel Syndrome: Evidence-Based Clinical Practice Guideline (2016). INSST (España), Guía técnica de manipulación manual y movimientos repetitivos.",
  },
  {
    clave: "codo",
    boton: "Codo (epicondilitis)",
    titulo: "Dolor de codo (epicondilitis o «codo de tenista»)",
    grupos: [
      {
        items: [
          "Bajar las tareas que más duelen por unas semanas, sin dejar de usar el brazo.",
          "Agarrar con la palma hacia arriba cuando sea posible; evitar torcer o apretar con fuerza.",
          "Herramientas más livianas y con mango más grueso; evitar las que vibran.",
          "Estirar: brazo al frente, palma abajo, con la otra mano bajar los dedos 20 segundos, 3 veces al día.",
          "Hielo 15 minutos después del trabajo si duele.",
          "Si le indicaron una banda o codera, ponerla 2 dedos debajo del codo.",
          "Suele mejorar en semanas o meses; consultar si empeora o hay hormigueo en la mano.",
        ],
      },
    ],
    fuente: "NICE CKS, Tennis elbow. Lucado AM y cols., Lateral elbow pain CPG, JOSPT 2022;52:CPG1.",
  },
  {
    clave: "pie",
    boton: "Dolor de talón (fascitis)",
    titulo: "Dolor de talón (fascitis plantar)",
    grupos: [
      {
        items: [
          "Calzado con buen soporte del arco y talón acolchado; no andar descalzo en piso duro.",
          "Estirar la pantorrilla contra la pared, 30 segundos por lado, 3 veces al día.",
          "Antes de levantarse de la cama: doblar los dedos hacia usted con la mano, 10 veces.",
          "Rodar una botella fría bajo la planta del pie 10 minutos al final del día.",
          "Si trabaja de pie: usar plantillas o alfombra antifatiga y alternar con ratos sentado.",
          "Bajar de peso si hay sobrepeso.",
          "Suele mejorar en semanas; consultar si hay hinchazón, moretón o el dolor no deja apoyar.",
        ],
      },
    ],
    fuente: "Koc TA y cols., Heel Pain – Plantar Fasciitis CPG, JOSPT 2023;53:CPG1. NICE CKS, Plantar fasciitis.",
  },
  {
    clave: "heridas",
    boton: "Cuidado de heridas",
    titulo: "Cuidado de una herida",
    grupos: [
      {
        titulo: "Cuidados diarios",
        items: [
          "Lavarse bien las manos antes y después de tocar la herida.",
          "Limpiar la herida con agua potable y jabón neutro o con solución fisiológica; secar con gasa a toques, sin frotar.",
          "No usar alcohol, yodo, café, hierbas ni polvos sobre la herida: dañan la piel nueva.",
          "Cubrirla con gasa limpia o apósito y cambiarlo una vez al día, o antes si se moja o se ensucia.",
          "No quitarse las costras ni los puntos; los puntos se retiran el día que le indiquen.",
          "Comer proteínas (huevo, pollo, pescado, granos), frutas y verduras: ayudan a cicatrizar.",
          "Proteger la cicatriz del sol por 6 meses para que no se oscurezca.",
        ],
      },
      {
        titulo: "Consulte pronto si",
        items: [
          "La herida se pone más roja, caliente, hinchada o duele más cada día.",
          "Sale pus o mal olor, o tiene fiebre.",
          "Se abre o sangra sin parar al presionar 10 minutos.",
          "La herida fue con un objeto oxidado o sucio y no tiene la vacuna antitetánica al día.",
          "Es diabético: revisar la herida a diario y no esperar.",
        ],
      },
    ],
    fuente: "OMS, Directrices mundiales para la prevención de la infección del sitio quirúrgico (2018). NICE NG125, Surgical site infections (2020). CDC, Tetanus: wound management.",
  },
  {
    clave: "quemaduras",
    boton: "Quemaduras leves",
    titulo: "Quemaduras leves: primeros cuidados",
    grupos: [
      {
        items: [
          "Enfriar de inmediato con agua corriente fresca (no helada) por 20 minutos.",
          "Quitar anillos, reloj o ropa cerca de la quemadura antes de que se hinche, si no está pegada a la piel.",
          "No poner hielo, pasta dental, aceite, mantequilla, café ni clara de huevo.",
          "No reventar las ampollas; cubrir con una gasa limpia, suelta, sin apretar.",
          "Para el dolor, el analgésico que le indique su médico.",
          "Acudir de inmediato si la quemadura es más grande que la palma de la mano, es en cara, manos, pies, genitales o articulaciones, es por electricidad o químicos, o la piel se ve blanca o negra.",
        ],
      },
    ],
    fuente: "OMS, Quemaduras: nota descriptiva (2023). Cruz Roja / IFRC, Guías internacionales de primeros auxilios (2020). Directrices europeas de primeros auxilios ERC 2021.",
  },
  {
    clave: "ansiedad",
    boton: "Ansiedad",
    titulo: "Cuando la ansiedad aprieta",
    grupos: [
      {
        titulo: "Lo que ayuda",
        items: [
          "Sentir miedo o preocupación es humano; cuando se vuelve muy fuerte o constante, también tiene tratamiento.",
          "Respiración lenta: inhalar en 4 segundos y botar el aire en 6, por 3 a 5 minutos.",
          "Volver al presente: nombrar 5 cosas que ve, 4 que toca, 3 que oye, 2 que huele y 1 que saborea.",
          "Escribir lo que le preocupa y, al lado, un pequeño paso posible para cada cosa.",
          "Moverse a diario: caminar 30 minutos baja la tensión del cuerpo.",
          "Bajar el café, las bebidas energéticas y el alcohol; dormir en horario fijo.",
          "Hablarlo con alguien de confianza: no tiene que cargarlo solo.",
        ],
      },
      {
        titulo: "Busque ayuda",
        items: [
          "Si la ansiedad no le deja trabajar, dormir o estar con los suyos por más de 2 semanas, consulte: hay tratamiento eficaz.",
          "Si tiene dolor en el pecho, falta de aire o palpitaciones fuertes, acuda a emergencia para descartar otras causas.",
          "Si piensa en hacerse daño, busque ayuda hoy mismo: acuda a emergencia o llame a su médico.",
        ],
      },
    ],
    fuente: "OMS, En tiempos de estrés, haz lo que importa (2020). OMS, Guía mhGAP de intervenciones para trastornos mentales (2.ª ed., 2016; actualización 2023). NICE CG113, Generalised anxiety disorder and panic disorder (2019).",
  },
  {
    clave: "animo",
    boton: "Ánimo bajo y depresión",
    titulo: "Cuando el ánimo está bajo",
    grupos: [
      {
        titulo: "Pasos que ayudan",
        items: [
          "Lo que siente es real y tiene tratamiento; pedir ayuda es un paso de fuerza, no de debilidad.",
          "Mantener una rutina sencilla: levantarse, asearse y comer a horas fijas, aunque cueste.",
          "Planear cada día una actividad pequeña que antes le gustaba y hacerla, aunque no tenga ganas.",
          "Salir a la luz del sol y caminar un rato cada día.",
          "Estar en contacto con alguien de confianza; contar cómo se siente.",
          "Evitar el alcohol y otras drogas: empeoran el ánimo.",
          "Si le indicaron tratamiento, tomarlo como se lo indicaron y no dejarlo sin hablar con su médico.",
        ],
      },
      {
        titulo: "Busque ayuda",
        items: [
          "Si la tristeza, el desgano o el no disfrutar las cosas duran más de 2 semanas, consulte al servicio médico.",
          "Si piensa que no vale la pena vivir o en hacerse daño, busque ayuda hoy mismo: acuda a emergencia, llame a su médico o a alguien de confianza que lo acompañe.",
        ],
      },
    ],
    fuente: "OMS, Guía mhGAP de intervenciones para trastornos mentales (2.ª ed., 2016; actualización 2023). NICE NG222, Depression in adults (2022). OMS y OIT, Directrices sobre salud mental en el trabajo (2022).",
  },
  {
    clave: "sueno",
    boton: "Dormir mejor",
    titulo: "Dormir mejor",
    grupos: [
      {
        items: [
          "Acostarse y levantarse a la misma hora todos los días, incluso el fin de semana.",
          "Dormir 7 a 8 horas; si trabaja de noche, oscurecer el cuarto y proteger esas horas de sueño.",
          "Dejar el teléfono y las pantallas una hora antes de dormir.",
          "Cuarto oscuro, fresco y silencioso; la cama, solo para dormir.",
          "Nada de café, té negro ni bebidas energéticas después de las 2 de la tarde; cenar liviano.",
          "No usar el alcohol para dormir: corta el sueño profundo.",
          "Si no se duerme en 20 minutos, levantarse a algo tranquilo con luz baja y volver cuando tenga sueño.",
          "Consultar si ronca fuerte, deja de respirar dormido o tiene sueño de día que lo hace cabecear: puede ser peligroso al manejar u operar equipos.",
        ],
      },
    ],
    fuente: "Academia Americana de Medicina del Sueño, Healthy sleep habits. Edinger JD y cols., Behavioral treatments for chronic insomnia, J Clin Sleep Med 2021;17:255. NIOSH, Work schedules: shift work and long hours (2020).",
  },
  {
    clave: "vida-sana",
    boton: "Estilo de vida saludable",
    titulo: "Estilo de vida saludable",
    grupos: [
      {
        titulo: "Cada día",
        items: [
          "Moverse 150 minutos a la semana (30 minutos, 5 días): caminar rápido cuenta.",
          "Medio plato de vegetales y frutas, un cuarto de proteína y un cuarto de granos o tubérculos.",
          "Tomar agua; bajar los refrescos, jugos azucarados y la comida frita o empaquetada.",
          "Menos sal: no agregarla en la mesa y evitar embutidos y cubitos.",
          "Dormir 7 a 8 horas y cuidar los ratos con la familia y los amigos.",
        ],
      },
      {
        titulo: "Para prevenir",
        items: [
          "No fumar; si fuma, el servicio médico le ayuda a dejarlo.",
          "Si toma alcohol, poco y no todos los días; nunca antes de manejar o trabajar.",
          "Medirse la tensión, el azúcar, el colesterol y la cintura al menos una vez al año.",
          "Vacunas al día (tétanos, hepatitis B, influenza, según su edad y trabajo).",
          "Protegerse del sol con gorra, manga larga y protector solar.",
        ],
      },
    ],
    fuente: "OMS, Directrices sobre actividad física y comportamientos sedentarios (2020). OMS, Alimentación sana: nota descriptiva (2020). OMS, HEARTS: paquete técnico para las enfermedades cardiovasculares (2018).",
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
