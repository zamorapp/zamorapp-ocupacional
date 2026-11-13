// Guías ilustradas que acompañan a las hojas de indicaciones: el dorso del control de tensión arterial y la guía de
// diabetes que se suma al plan de alimentación. Teoría («qué le pasa y por qué»), práctica con dibujos y consejos, con
// fuentes de organismos y sociedades médicas al pie. Las figuras se dibujan en imprimir/figuras.tsx (FiguraSalud).
import type { ComparaTema, EjercicioTema } from "@/lib/bienestar";
import type { Icono } from "@/lib/dietas";

export type Porcion = { figura: string; titulo: string; texto: string };
export type Consejo = { icono: Icono; no?: boolean; titulo: string; texto: string };
export type AlarmaGuia = { titulo: string; figura: string; pasos: string[]; cierre: string };

export type Guia = {
  clave: string;
  titulo: string;
  // Título de la hoja con el nombre del trabajador: «María, así cuida su diabetes»
  para?: string;
  porque?: string[];
  comparar?: ComparaTema[];
  tituloPasos?: string;
  pasos?: EjercicioTema[];
  porciones?: Porcion[];
  tituloConsejos?: string;
  consejos?: Consejo[];
  alarma?: AlarmaGuia;
  nota?: string;
  fuente: string;
};

// Porciones con la mano (Diabetes Canada): sirven para todas las dietas menos la renal (la proteína la fija el médico)
export const PORCIONES: Porcion[] = [
    { figura: "mano-palma", titulo: "Proteína", texto: "Carne, pollo, pescado o queso: el tamaño de su palma y el grueso de su dedo meñique." },
    { figura: "mano-puno", titulo: "Arepa, arroz, pasta o fruta", texto: "Lo que cabe en su puño cerrado." },
    { figura: "mano-dos", titulo: "Verduras", texto: "Lo que quepa en sus dos manos abiertas." },
    { figura: "mano-pulgar", titulo: "Grasa", texto: "Aceite, mantequilla o margarina: la punta de su pulgar." },
];
const F_PORCIONES = "Diabetes Canada, Guía de porciones con la mano";

// Dorso de la hoja de control de tensión arterial
export const GUIA_TA: Guia = {
  clave: "ta",
  titulo: "Cómo tomarse la tensión y cómo bajarla",
  porque: [
    "La tensión es la fuerza de la sangre en las arterias: el primer número (sistólica) es cuando el corazón late; el segundo (diastólica), cuando descansa.",
    "La tensión alta casi nunca avisa: por eso la llaman «el asesino silencioso». Con los años daña el corazón, el cerebro, los riñones y la vista.",
    "En el consultorio puede subir por los nervios; en casa, bien medida, se ve la real. Es alta si el promedio de todas las tomas es de 135/85 mmHg o más.",
  ],
  comparar: [
    { figura: "ta-mal", bien: false, texto: "Piernas cruzadas, sin respaldo, brazo colgando y hablando: sale más alta." },
    { figura: "ta-postura", bien: true, texto: "Espalda apoyada, pies en el piso y brazo en la mesa, a la altura del corazón." },
    { figura: "ta-ropa", bien: false, texto: "Manguito sobre la ropa o con la manga apretando el brazo." },
    { figura: "ta-manguito", bien: true, texto: "Sobre la piel, con su borde 2 a 3 cm arriba del pliegue del codo." },
  ],
  tituloPasos: "Paso a paso, cada vez que se mida",
  pasos: [
    { figura: "ta-reposo", titulo: "Descanse antes", pasos: ["Orine primero.", "Siéntese tranquilo, en silencio, 5 minutos."], dosis: ["5 minutos"] },
    { figura: "ta-sin-cafe", titulo: "Nada de café ni cigarro", pasos: ["Sin café, cigarro ni ejercicio en la media hora antes de medirse."], dosis: ["30 minutos antes"] },
    { figura: "ta-callado", titulo: "Quieto y callado", pasos: ["No hable, no use el celular y no se mueva mientras el aparato mide."], dosis: ["en silencio"] },
    { figura: "ta-dos-tomas", titulo: "Dos tomas y anótelas", pasos: ["2 tomas con 1 minuto de diferencia; anote las dos, con la hora."], dosis: ["mañana y noche"] },
  ],
  tituloConsejos: "Si su tensión es alta: lo que sí la baja",
  consejos: [
    { icono: "sal", titulo: "Menos de 5 g de sal al día", texto: "Una cucharadita rasa en todo el día; sin salero en la mesa." },
    { icono: "verduras", titulo: "Verduras y frutas a diario", texto: "Con granos y pescado; poca fritura y poco dulce (plan DASH)." },
    { icono: "caminar", titulo: "Muévase 150 minutos a la semana", texto: "Por ejemplo, 30 minutos de caminata rápida 5 días." },
    { icono: "balanza", titulo: "Cuide su peso", texto: "Bajar aunque sea unos kilos ya baja la tensión." },
    { icono: "alcohol", no: true, titulo: "Mejor sin alcohol", texto: "Sube la tensión; si toma, poco y no todos los días." },
    { icono: "cigarro", no: true, titulo: "Deje de fumar", texto: "Sube la tensión y daña las arterias: pida ayuda." },
    { icono: "pastilla", titulo: "Sus medicinas, todos los días", texto: "A la misma hora, aunque se sienta bien; no las suspenda." },
    { icono: "cama", titulo: "Duerma bien y baje el estrés", texto: "De 7 a 9 horas; haga pausas en los días de presión." },
  ],
  nota: "En el trabajo: comida de casa o sin sal agregada, agua a la mano y sus medicinas también en los turnos largos o de noche.",
  fuente:
    "OMS, Hipertensión (nota descriptiva) y Reducir el consumo de sal; Muntner P y cols., Medición de la presión arterial en humanos, declaración científica de la AHA, Hypertension 2019;73:e35; Mancia G y cols., Guía ESH 2023, J Hypertens 2023;41:1874; McEvoy JW y cols., Guía ESC 2024, Eur Heart J 2024;45:3912; NHLBI, plan de alimentación DASH; AHA, Life's Essential 8 (sueño).",
};

// Guía de diabetes: hoja propia al final del plan de alimentación para diabetes
export const GUIA_DIABETES: Guia = {
  clave: "dm",
  para: "así cuida su diabetes",
  titulo: "Diabetes: porciones, pies y azúcar baja",
  porque: [
    "En la diabetes el azúcar (glucosa) se queda en la sangre porque la insulina falta o no trabaja bien.",
    "Con los años, el azúcar alta daña los ojos, los riñones, los nervios de los pies, el corazón y el cerebro. Mantenerla controlada evita esas complicaciones.",
    "Los pies pierden sensibilidad: una herida puede pasar sin dolor y complicarse. Por eso se revisan todos los días.",
    "Tres pilares la controlan: lo que come (y cuánto), cuánto se mueve y tomar bien sus medicinas.",
  ],
  porciones: PORCIONES,
  tituloPasos: "Cuide sus pies · todos los días",
  pasos: [
    { figura: "dm-pies", titulo: "Revíselos", pasos: ["Con buena luz; use un espejo para la planta.", "Busque heridas, ampollas, grietas, callos o cambios de color."], dosis: ["cada día"] },
    { figura: "dm-zapato", titulo: "Nunca descalzo", pasos: ["Ni en la casa ni en la playa.", "Revise por dentro el zapato antes de ponérselo.", "Medias sin costuras; botas de seguridad de su talla."], dosis: ["siempre"] },
    { figura: "dm-unas", titulo: "Uñas y piel", pasos: ["Lave y seque bien entre los dedos.", "Uñas cortadas rectas.", "Crema, pero no entre los dedos. No se quite los callos usted mismo."], dosis: ["cada día"] },
  ],
  alarma: {
    titulo: "Azúcar baja (hipoglucemia): la regla 15-15",
    figura: "dm-15",
    pasos: [
      "Si siente temblor, sudor frío, hambre, mareo, palpitaciones o confusión, mídase: menos de 70 mg/dL es azúcar baja.",
      "Tome 15 g de azúcar rápida: medio vaso (120 ml) de jugo o refresco normal (no «light»), o 1 cucharada de azúcar disuelta en agua.",
      "Espere 15 minutos y mídase otra vez. Si sigue por debajo de 70, repita.",
      "Cuando se normalice, coma algo si falta más de una hora para su próxima comida.",
    ],
    cierre: "Si se desmaya o no puede tragar: emergencia de inmediato. No le den nada por la boca.",
  },
  nota: "En el trabajo: avise a su supervisor y a un compañero de confianza que tiene diabetes y qué hacer si le baja el azúcar. No se salte comidas en turnos largos o de noche y lleve siempre una merienda y algo dulce. Muévase 150 minutos a la semana y no pase más de 30 minutos sentado sin levantarse.",
  fuente:
    "ADA, Standards of Care in Diabetes—2025, Diabetes Care 2025;48(Supl 1); ADA, Azúcar baja en sangre (regla 15-15); FID, Atlas de la Diabetes; Schaper NC y cols., Guías prácticas IWGDF 2023 para prevenir y tratar el pie diabético, Diabetes Metab Res Rev 2024;40:e3657; Diabetes Canada, Guía de porciones con la mano.",
};



const CAMBIA_REFRESCO = [
  { figura: "i:refresco!", bien: false, texto: "Refrescos, jugos y maltas: mucha azúcar que no llena." },
  { figura: "i:agua", bien: true, texto: "Agua, siempre a la mano; café o té sin azúcar." },
];

export const GUIA_GENERAL: Guia = {
  clave: "general",
  para: "así come sano",
  titulo: "Comer sano, cada día y en el trabajo",
  porque: [
    "Comer sano protege de la diabetes, la tensión alta, las enfermedades del corazón y algunos cánceres.",
    "La OMS recomienda al menos 400 g de frutas y verduras al día (unas 5 porciones), menos de 5 g de sal y poco azúcar añadido.",
    "Lo que se bebe también cuenta: los refrescos y jugos azucarados suman mucha azúcar sin quitar el hambre.",
    "No hace falta pesar la comida: su mano sirve de medida en cada comida.",
  ],
  porciones: PORCIONES,
  comparar: [
    ...CAMBIA_REFRESCO,
    { figura: "i:frito!", bien: false, texto: "Frituras, empanadas y comida rápida todos los días." },
    { figura: "i:plancha", bien: true, texto: "A la plancha, al horno, guisado o al vapor." },
  ],
  tituloPasos: "Tres hábitos para cada día",
  pasos: [
    { figura: "i:fruta", titulo: "Cinco al día", pasos: ["3 frutas enteras y 2 platos de verduras.", "Frutas enteras mejor que en jugo."], dosis: ["400 g al día"] },
    { figura: "i:agua", titulo: "Agua", pasos: ["Lleve su botella al trabajo y beba a sorbos durante la jornada.", "Más si hace calor o hace esfuerzo."], dosis: ["cada día"] },
    { figura: "lonchera", titulo: "Lonchera de casa", pasos: ["Medio envase de verduras, un cuarto de proteína y un cuarto de arepa, arroz o víveres."], dosis: ["cada jornada"] },
  ],
  nota: "Coma sentado y sin apuro, también en el trabajo. Si trabaja de noche, haga su comida principal antes del turno y una merienda ligera durante la noche.",
  fuente: `OMS, Alimentación sana (nota descriptiva); OMS, Reducir el consumo de sal; ${F_PORCIONES}; Lowden A y cols., Eating and shift work, Scand J Work Environ Health 2010;36:150.`,
};

export const GUIA_HTA: Guia = {
  clave: "hta",
  para: "así baja la sal",
  titulo: "La sal: dónde se esconde y cómo bajarla",
  porque: [
    "El exceso de sal (sodio) hace que el cuerpo retenga agua y sube la tensión arterial.",
    "La mayor parte de la sal no viene del salero: viene escondida en embutidos, enlatados, cubitos, salsas, pan y comida de la calle.",
    "La OMS recomienda menos de 5 g de sal al día: una cucharadita rasa, contando toda la comida.",
    "Comer con menos sal y más frutas y verduras (plan DASH) baja la tensión en pocas semanas.",
  ],
  porciones: PORCIONES,
  comparar: [
    { figura: "i:embutido!", bien: false, texto: "Embutidos, enlatados, cubitos y salsas: mucha sal escondida." },
    { figura: "i:pescado", bien: true, texto: "Pollo, pescado o huevo frescos, cocinados en casa." },
    { figura: "i:sal!", bien: false, texto: "Salero en la mesa y sal «para probar» antes de comer." },
    { figura: "i:hierbas", bien: true, texto: "Ajo, cebolla, ají dulce, cilantro, orégano y limón para dar sabor." },
  ],
  tituloPasos: "Cómo bajar la sal",
  pasos: [
    { figura: "sal-5g", titulo: "Mida su sal del día", pasos: ["Como máximo 1 cucharadita rasa al día, sumando todo.", "Cocine con poca sal y no agregue en la mesa."], dosis: ["menos de 5 g"] },
    { figura: "etiqueta", titulo: "Lea la etiqueta", pasos: ["Busque «sal» o «sodio» por cada 100 g.", "Más de 1,5 g de sal (600 mg de sodio): es mucha sal.", "0,3 g de sal o menos: es poca."], dosis: ["por 100 g"] },
    { figura: "lonchera", titulo: "En el trabajo", pasos: ["Lleve comida de casa con poca sal.", "En el comedor, pida sin sal agregada y sin salsas.", "Merienda: fruta en vez de pasapalos salados."], dosis: ["cada jornada"] },
  ],
  nota: "La sal «light» y los sustitutos de sal tienen potasio: úselos solo si su médico lo autoriza, y nunca si tiene enfermedad de los riñones.",
  fuente: `OMS, Reducir el consumo de sal (nota descriptiva); Sacks FM y cols., ensayo DASH-Sodio, N Engl J Med 2001;344:3; NHS (Reino Unido), Cómo leer las etiquetas de los alimentos; Mancia G y cols., Guía ESH 2023, J Hypertens 2023;41:1874; ${F_PORCIONES}.`,
};

export const GUIA_CARDIO: Guia = {
  clave: "cardio",
  para: "así cuida su corazón",
  titulo: "Grasas y corazón: cuáles sí y cuáles no",
  porque: [
    "El colesterol LDL («malo») se pega en las paredes de las arterias y las va cerrando: así llegan el infarto y el ACV.",
    "Las grasas saturadas (manteca, piel del pollo, embutidos, frituras) y las grasas trans (margarinas duras, galletas, comida rápida) suben el LDL.",
    "Las grasas buenas (aceite de oliva, aguacate, pescado, maní y nueces) protegen el corazón cuando reemplazan a las malas.",
    "La fibra de la avena, los granos y las frutas ayuda a bajar el colesterol.",
  ],
  porciones: PORCIONES,
  comparar: [
    { figura: "i:frito!", bien: false, texto: "Frituras, empanadas y tequeños." },
    { figura: "i:plancha", bien: true, texto: "A la plancha, al horno, guisado o al vapor." },
    { figura: "i:manteca!", bien: false, texto: "Manteca, mantequilla y margarina dura." },
    { figura: "i:aceite", bien: true, texto: "Aceite de oliva o vegetal, medido con cucharita; aguacate." },
  ],
  tituloPasos: "Tres hábitos para su corazón",
  pasos: [
    { figura: "i:pescado", titulo: "Pescado dos veces por semana", pasos: ["Sardina, atún, jurel o salmón, al horno o a la plancha, nunca frito."], dosis: ["2 veces por semana"] },
    { figura: "i:granos", titulo: "Fibra cada día", pasos: ["Avena en el desayuno, granos 3 veces por semana y frutas enteras."], dosis: ["cada día"] },
    { figura: "i:caminar", titulo: "Muévase", pasos: ["La actividad que le indique su médico; si se lo permite, 150 minutos a la semana."], dosis: ["150 min por semana"] },
  ],
  nota: "En el trabajo: cambie las empanadas y los fritos del desayuno por arepa asada con huevo, queso blanco o pollo. Si siente dolor en el pecho o falta de aire, pare y avise de inmediato.",
  fuente: `Lichtenstein AH y cols., Guía alimentaria AHA 2021, Circulation 2021;144:e472; Rimm EB y cols., Pescado y enfermedad cardiovascular, aviso científico AHA, Circulation 2018;138:e35; Mach F y cols., Guía ESC/EAS 2019 de dislipidemias, Eur Heart J 2020;41:111; ${F_PORCIONES}.`,
};

export const GUIA_INSULINA: Guia = {
  clave: "insulina",
  para: "así frena la prediabetes",
  titulo: "Frenar la prediabetes sí se puede",
  porque: [
    "En la resistencia a la insulina el cuerpo necesita cada vez más insulina para bajar el azúcar. Si sigue así, puede llegar la diabetes.",
    "La grasa de la barriga (cintura alta) empeora la resistencia a la insulina.",
    "En el estudio DPP, bajar 7 % del peso y caminar 150 minutos a la semana redujo en 58 % la llegada de la diabetes.",
    "Está a tiempo: los cambios de hoy pueden devolver el azúcar a lo normal.",
  ],
  porciones: PORCIONES,
  comparar: [
    ...CAMBIA_REFRESCO,
    { figura: "i:azucar!", bien: false, texto: "Dulces, galletas, pan dulce y cereales de caja." },
    { figura: "i:fruta", bien: true, texto: "Una fruta entera, con queso o un puñito de maní." },
  ],
  tituloPasos: "Tres hábitos que la frenan",
  pasos: [
    { figura: "i:verduras", titulo: "Primero los vegetales", pasos: ["Empiece por la ensalada, siga con la proteína y deje el carbohidrato de último."], dosis: ["en cada comida"] },
    { figura: "i:caminar", titulo: "Camine después de comer", pasos: ["15 minutos de caminata tras el almuerzo y la cena.", "Sume 150 minutos a la semana."], dosis: ["15 minutos"] },
    { figura: "i:balanza", titulo: "Baje de peso poco a poco", pasos: ["Meta: 5 % a 7 % de su peso.", "Mida su cintura una vez al mes."], dosis: ["5 a 7 %"] },
  ],
  nota: "En el trabajo: lleve merienda de casa (fruta, yogur natural, maní) y no se salte comidas en los turnos largos. Use las pausas para caminar.",
  fuente: `Knowler WC y cols., Programa de Prevención de la Diabetes (DPP), N Engl J Med 2002;346:393; ADA, Standards of Care in Diabetes—2025, secciones 3 y 5; Shukla AP y cols., El orden de los alimentos y la glucosa, Diabetes Care 2015;38:e98; ${F_PORCIONES}.`,
};

export const GUIA_RENAL: Guia = {
  clave: "renal",
  para: "así cuida sus riñones",
  titulo: "Cuidar los riñones desde la cocina",
  porque: [
    "Cuando los riñones fallan no eliminan bien la sal, el potasio, el fósforo ni el agua, y estos se acumulan en la sangre.",
    "El potasio alto puede alterar el ritmo del corazón; el fósforo alto debilita los huesos.",
    "La tensión y el azúcar altos son las causas más comunes de daño renal: controlarlos frena el daño.",
    "Se recomienda menos de 2 g de sodio al día (menos de 5 g de sal) y no comer más proteína de la necesaria. Cuánta proteína, potasio y líquidos le tocan lo decide su médico con sus exámenes.",
  ],
  comparar: [
    { figura: "i:sal!", bien: false, texto: "Sal, cubitos, sal «light» y sustitutos de sal (tienen potasio)." },
    { figura: "i:hierbas", bien: true, texto: "Ajo, cebolla, ají dulce, orégano y limón para dar sabor." },
    { figura: "i:refresco!", bien: false, texto: "Refrescos oscuros (colas): tienen fósforo." },
    { figura: "i:agua", bien: true, texto: "Agua, en la cantidad que le indique su médico." },
  ],
  tituloPasos: "En la cocina y con las medicinas",
  pasos: [
    { figura: "remojo", titulo: "Remoje y hierva", pasos: ["Pele y pique víveres, papa y granos; remójelos varias horas y bote el agua.", "Hiérvalos en agua abundante y bote el agua otra vez."], dosis: ["baja el potasio"] },
    { figura: "etiqueta-fosfato", titulo: "Lea la etiqueta", pasos: ["Evite productos con «fosfato» o «fosfórico» en los ingredientes: colas, embutidos, quesos fundidos.", "Y los altos en sal."], dosis: ["siempre"] },
    { figura: "i:pastilla!", titulo: "Sin antiinflamatorios", pasos: ["No tome ibuprofeno, diclofenac ni naproxeno sin indicación.", "Avise que tiene enfermedad renal antes de una medicina o un examen con contraste."], dosis: ["siempre"] },
  ],
  nota: "En el trabajo: lleve su comida de casa. Si su médico le limita los líquidos, mida lo que bebe; si trabaja con calor, pregúntele cuánta agua puede tomar.",
  fuente: "KDIGO 2024, Guía de práctica clínica para la evaluación y el manejo de la enfermedad renal crónica, Kidney Int 2024;105(4S):S117; Ikizler TA y cols., Guía KDOQI 2020 de nutrición en la enfermedad renal crónica, Am J Kidney Dis 2020;76(3 Supl 1):S1; National Kidney Foundation, guías para pacientes sobre potasio y fósforo.",
};

export const GUIA_PESO: Guia = {
  clave: "peso",
  para: "así baja de peso",
  titulo: "Bajar de peso sin pasar hambre",
  porque: [
    "Se sube de peso cuando entra más energía (calorías) de la que se gasta: el sobrante se guarda como grasa.",
    "El sobrepeso aumenta el riesgo de diabetes, tensión alta, dolor de rodillas y espalda y apnea del sueño.",
    "Bajar aunque sea 5 % del peso ya mejora el azúcar, la tensión y el colesterol.",
    "La meta segura es medio kilo a un kilo por semana: lo que se baja despacio no se recupera tan fácil.",
  ],
  porciones: PORCIONES,
  comparar: [
    ...CAMBIA_REFRESCO,
    { figura: "i:frito!", bien: false, texto: "Frituras, empanadas y comida rápida." },
    { figura: "i:plancha", bien: true, texto: "A la plancha, al horno, guisado o al vapor." },
  ],
  tituloPasos: "Tres hábitos que ayudan",
  pasos: [
    { figura: "i:reloj", titulo: "Coma sentado y sin apuro", pasos: ["Sin pantallas y sin repetir el plato.", "Empiece cada comida con vegetales."], dosis: ["en cada comida"] },
    { figura: "i:balanza", titulo: "Pésese una vez por semana", pasos: ["El mismo día, en ayunas, y anótelo."], dosis: ["1 vez por semana"] },
    { figura: "i:caminar", titulo: "Muévase más", pasos: ["150 a 300 minutos a la semana.", "Suba escaleras y camine en las pausas del trabajo."], dosis: ["150 a 300 min por semana"] },
  ],
  nota: "En el trabajo: lleve su lonchera y su merienda; evite las tortas y los refrescos de los cumpleaños y las reuniones. Si trabaja de noche, no coma pesado de madrugada.",
  fuente: `OMS, Obesidad y sobrepeso (nota descriptiva); Jensen MD y cols., Guía AHA/ACC/TOS 2013 para el manejo del sobrepeso y la obesidad, Circulation 2014;129:S102; OMS, Directrices sobre actividad física (2020); ${F_PORCIONES}.`,
};

const GUIAS_DIETA: Record<string, Guia> = {
  general: GUIA_GENERAL, hta: GUIA_HTA, cardio: GUIA_CARDIO, diabetes: GUIA_DIABETES, insulina: GUIA_INSULINA, renal: GUIA_RENAL, peso: GUIA_PESO,
};
export const guiaDeDieta = (clave: string) => GUIAS_DIETA[clave] ?? null;
