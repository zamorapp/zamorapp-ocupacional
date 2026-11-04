// Contenido de las hojas de indicaciones preventivas: plan de alimentación (tipo mediterráneo, con alimentos de
// Venezuela) y control de tensión arterial en casa. Los textos se apoyan en guías internacionales: cada bloque
// lleva su fuente para que el médico la cite. Antes de imprimir, el médico puede tocar cualquier texto y cambiarlo.

export type BloquePlan = { clave: string; boton: string; titulo: string; items: string[]; fuente: string };

export const PLAN_BASE = {
  intro:
    "Plan de alimentación indicado con fines preventivos, para cuidar su salud y su rendimiento en el trabajo. Sigue el modelo de la dieta mediterránea, adaptado a los alimentos de Venezuela: comida natural, poca harina refinada y ningún ultraprocesado.",
  plato: [
    { parte: "½", texto: "Verduras y hortalizas", ejemplo: "ensalada, auyama, vainitas, brócoli, berenjena, calabacín" },
    { parte: "¼", texto: "Proteínas", ejemplo: "pescado, pollo sin piel, huevo, caraotas, lentejas" },
    { parte: "¼", texto: "Carbohidratos de calidad", ejemplo: "víveres, arroz o pasta integral, ½ arepa" },
  ],
  preferir: [
    "Verduras y hortalizas en almuerzo y cena: son el contorno principal del plato.",
    "Pescado 2 a 3 veces por semana (sardina, jurel, atún); pollo sin piel, huevos y granos (caraotas, lentejas, quinchonchos, frijoles).",
    "Aceite de oliva extra virgen como grasa principal, crudo o para cocinar.",
    "Fruta entera 2 a 3 veces al día (lechosa, guayaba, naranja, mango, patilla), mejor que en jugo.",
    "Un puñado de frutos secos o semillas al día: maní sin sal, merey, almendras, chía o linaza.",
    "Agua: 6 a 8 vasos al día, más si trabaja con calor o esfuerzo físico.",
    "Lácteos naturales: yogur sin azúcar, queso blanco bajo en sal.",
  ],
  moderar: [
    "Carbohidratos: solo ¼ del plato; preferir víveres (yuca, ñame, ocumo, batata, plátano) e integrales en porción pequeña.",
    "Carne roja magra: 1 a 2 veces por semana.",
    "Aceite de coco y mantequilla: en poca cantidad.",
    "Café: hasta 3 tazas al día, sin azúcar o con muy poca.",
    "Sal: menos de 5 g al día (una cucharadita rasa), contando la de los alimentos.",
  ],
  evitar: [
    "Ultraprocesados: embutidos (salchicha, jamón, mortadela), enlatados salados, snacks de paquete, galletas y comida rápida.",
    "Harinas refinadas en exceso: pan blanco, pasta y arroz blanco, empanadas y frituras.",
    "Bebidas azucaradas: refrescos, jugos de caja, maltas y bebidas energéticas.",
    "Azúcar añadida y dulces.",
    "Margarina, grasas trans y aceite de freír reutilizado.",
    "Alcohol: lo más saludable es no tomarlo.",
  ],
  habitos: [
    "Tres comidas y hasta dos meriendas a horas regulares; no saltarse el desayuno.",
    "Comer despacio y sentado; cocinar a la plancha, al horno, al vapor o guisado.",
    "Leer las etiquetas y preferir los productos sin sellos de «exceso» (azúcar, sodio, grasas).",
    "Actividad física: al menos 150 minutos por semana (30 minutos, 5 días), caminar cuenta.",
  ],
  ejemplo: [
    { comida: "Desayuno", texto: "2 huevos revueltos con tomate y cebolla, ½ aguacate, ½ arepa pequeña o 1 rebanada de pan integral; café sin azúcar." },
    { comida: "Merienda", texto: "1 fruta entera y un puñado de maní sin sal." },
    { comida: "Almuerzo", texto: "Medio plato de ensalada o vegetales salteados en aceite de oliva, pescado o pollo a la plancha (del tamaño de la palma de la mano) y ½ taza de caraotas o una porción pequeña de yuca." },
    { comida: "Merienda", texto: "Yogur natural sin azúcar con chía." },
    { comida: "Cena", texto: "Crema de auyama o vegetales, atún o queso blanco y ensalada. Cenar al menos 2 horas antes de acostarse." },
  ],
  fuentes:
    "OMS, «Alimentación sana», nota descriptiva (2020). Estruch R. y cols., PREDIMED, N Engl J Med 2018;378:e34. AHA, Dietary Guidance to Improve Cardiovascular Health, Circulation 2021;144:e472. OMS, Directrices sobre actividad física (2020). Instituto Nacional de Nutrición (INN), Trompo de los Alimentos.",
};

// Esquemas que el médico agrega con un botón, según la condición del trabajador
export const PLANES: BloquePlan[] = [
  {
    clave: "hta",
    boton: "Hipertensión",
    titulo: "Si tiene la tensión alta (patrón DASH)",
    items: [
      "Sal: menos de 5 g al día; no poner el salero en la mesa; condimentar con ajo, cebolla, cilantro, limón y hierbas.",
      "Evitar cubitos y sazonadores, salsa de soya, embutidos, enlatados, queso duro salado y snacks salados.",
      "Más potasio: cambur, aguacate, lechosa, auyama, tomate, caraotas y vegetales de hoja (salvo enfermedad renal).",
      "Lácteos descremados, granos y frutos secos sin sal todos los días.",
      "Bajar de peso si hay sobrepeso y no tomar alcohol.",
    ],
    fuente: "OMS, Directriz sobre la ingesta de sodio (2012, actualizada 2023). McEvoy JW y cols., Guía ESC 2024 de presión arterial elevada e hipertensión, Eur Heart J 2024. Patrón DASH, NHLBI.",
  },
  {
    clave: "diabetes",
    boton: "Diabetes",
    titulo: "Si tiene diabetes o prediabetes",
    items: [
      "Método del plato en cada comida: ½ vegetales, ¼ proteína, ¼ carbohidrato; la misma cantidad de carbohidrato a la misma hora cada día.",
      "Carbohidratos de absorción lenta: granos, víveres en porción pequeña e integrales; evitar pan blanco, arroz blanco y pasta en exceso.",
      "Nada de bebidas azucaradas ni jugos (aunque sean naturales): la fruta, entera y una porción por vez.",
      "Fibra todos los días: vegetales, granos, avena, chía o linaza.",
      "Si usa insulina o pastillas para el azúcar, no saltarse comidas y llevar algo dulce por si le baja el azúcar.",
    ],
    fuente: "American Diabetes Association, Standards of Care in Diabetes 2025, sección 5 (Diabetes Care 2025;48 Supl. 1).",
  },
  {
    clave: "lipidos",
    boton: "Colesterol o triglicéridos",
    titulo: "Si tiene el colesterol o los triglicéridos altos",
    items: [
      "Reducir la grasa saturada: no usar aceite de coco, manteca ni mantequilla; quitar la piel del pollo y la grasa visible de la carne.",
      "Pescado azul (sardina, atún, jurel) 2 a 3 veces por semana.",
      "Fibra soluble: avena, caraotas, lentejas, berenjena, guayaba y linaza.",
      "Triglicéridos: eliminar el alcohol, el azúcar, los dulces y los jugos; moderar harinas.",
      "Nada de frituras, margarina ni productos de panadería industrial.",
    ],
    fuente: "Mach F y cols., Guía ESC/EAS 2019 de dislipidemias, Eur Heart J 2020;41:111. AHA, Dietary Guidance 2021.",
  },
  {
    clave: "peso",
    boton: "Sobrepeso",
    titulo: "Si necesita bajar de peso",
    items: [
      "Meta: bajar entre 5 % y 10 % del peso en 6 meses (medio kilo a un kilo por semana).",
      "Reducir las porciones de carbohidrato a la mitad y llenar el plato con vegetales.",
      "Agua en lugar de refrescos y jugos; evitar picar entre comidas.",
      "Pesarse una vez por semana, el mismo día y a la misma hora.",
      "Sumar actividad física: subir hasta 300 minutos por semana.",
    ],
    fuente: "OMS, Obesidad y sobrepeso, nota descriptiva (2024). OMS, Directrices sobre actividad física (2020).",
  },
  {
    clave: "gastrico",
    boton: "Gastritis o reflujo",
    titulo: "Si tiene gastritis o reflujo",
    items: [
      "Comidas pequeñas y frecuentes; no acostarse hasta 3 horas después de comer.",
      "Elevar la cabecera de la cama si tiene acidez de noche.",
      "Evitar lo que le cae mal: café, alcohol, refrescos, picante, frituras, chocolate, menta y cítricos en ayunas.",
      "No fumar; evitar ropa ajustada en la cintura.",
      "No tomar antiinflamatorios (ibuprofeno, diclofenac, aspirina) sin indicación médica.",
    ],
    fuente: "Katz PO y cols., Guía ACG 2022 de enfermedad por reflujo gastroesofágico, Am J Gastroenterol 2022;117:27.",
  },
  {
    clave: "colon",
    boton: "Colon irritable",
    titulo: "Si tiene colon irritable o estreñimiento",
    items: [
      "Comer a horas regulares, despacio y sin saltarse comidas.",
      "Fibra soluble poco a poco (avena, psyllium, lechosa); moderar la fibra gruesa (salvado, concha de los granos) si le inflama.",
      "Limitar café, alcohol, refrescos con gas, comidas grasosas y picante.",
      "Si los gases o el dolor siguen: probar menos granos, cebolla, ajo, repollo y leche (dieta baja en FODMAP, guiada por el médico).",
      "Estreñimiento: 8 vasos de agua al día y caminar a diario.",
    ],
    fuente: "Lacy BE y cols., Guía ACG 2021 de síndrome de intestino irritable, Am J Gastroenterol 2021;116:17. NICE CG61 (actualizada 2017).",
  },
  {
    clave: "acido-urico",
    boton: "Ácido úrico",
    titulo: "Si tiene el ácido úrico alto o gota",
    items: [
      "Limitar vísceras (hígado, riñón, mondongo), carnes rojas y mariscos.",
      "Nada de cerveza ni licores; evitar refrescos y jugos endulzados (fructosa).",
      "Preferir lácteos descremados, huevos, vegetales y granos.",
      "Tomar 2 litros de agua al día.",
    ],
    fuente: "FitzGerald JD y cols., Guía ACR 2020 para el manejo de la gota, Arthritis Care Res 2020;72:744.",
  },
  {
    clave: "higado",
    boton: "Hígado graso",
    titulo: "Si tiene hígado graso",
    items: [
      "Dieta mediterránea completa, sin alcohol.",
      "Eliminar refrescos, jugos y dulces (la fructosa engorda el hígado).",
      "Bajar de 7 % a 10 % del peso mejora el hígado.",
      "Café sin azúcar: puede tomarlo.",
    ],
    fuente: "Guía EASL-EASD-EASO 2024 de enfermedad hepática esteatósica asociada a disfunción metabólica (MASLD), J Hepatol 2024;81:492.",
  },
  {
    clave: "turnos",
    boton: "Trabajo por turnos",
    titulo: "Si trabaja de noche o por turnos",
    items: [
      "Hacer la comida principal antes de entrar al turno; en la madrugada, solo algo ligero (fruta, yogur, frutos secos).",
      "Evitar comidas pesadas, frituras y dulces entre las 12 de la noche y las 6 de la mañana.",
      "Llevar su comida y agua al trabajo; no depender de máquinas expendedoras.",
      "Café solo en la primera mitad del turno, para poder dormir al salir.",
    ],
    fuente: "Lowden A y cols., Eating and shift work, Scand J Work Environ Health 2010;36:150.",
  },
  {
    clave: "calor",
    boton: "Calor o esfuerzo físico",
    titulo: "Si trabaja con calor o esfuerzo físico",
    items: [
      "Un vaso de agua (240 mL) cada 15 a 20 minutos, aunque no tenga sed.",
      "En jornadas de más de 2 horas con mucho sudor, alternar con bebidas con electrolitos o suero oral.",
      "No tomar alcohol ni bebidas energéticas antes ni durante el trabajo.",
      "Orina oscura o poca orina: señal de deshidratación; avisar al servicio médico si hay mareo, calambres o dolor de cabeza.",
    ],
    fuente: "NIOSH, Criterios para un estándar recomendado: exposición ocupacional al calor (publicación 2016-106).",
  },
];

export const clavesPlan = (texto: string | undefined) =>
  (texto ?? "").split(",").filter((c) => PLANES.some((p) => p.clave === c));

// Control de tensión arterial en casa (automedición): protocolo de la ESH 2023 y la ESC 2024
export const CONTROL_TA = {
  leyenda:
    "Control de tensión arterial indicado con fines preventivos, para la verificación y el estudio de una posible hipertensión arterial mediante la automedición en el domicilio. Los valores registrados serán evaluados por el médico. No inicie, cambie ni suspenda medicamentos sin indicación médica.",
  pasos: [
    "Use un tensiómetro automático de brazo (no de muñeca), con el manguito sobre la piel, a la altura del corazón.",
    "Siéntese 5 minutos antes, con la espalda apoyada, los pies en el piso y el brazo sobre la mesa. No hable durante la toma.",
    "No tome café, no fume ni haga ejercicio 30 minutos antes. Orine antes de medirse.",
    "Mañana (antes del desayuno y de los medicamentos) y noche (antes de cenar): dos tomas con 1 minuto de diferencia. Anote las dos.",
  ],
  alarma:
    "Acuda de inmediato a una emergencia si alguna toma es de 180/110 mmHg o más, o si tiene dolor en el pecho, dolor de cabeza intenso, visión borrosa, falta de aire, debilidad o adormecimiento de un lado del cuerpo o dificultad para hablar.",
  referencia: "Promedio en casa de 135/85 mmHg o más sugiere hipertensión arterial.",
  fuentes:
    "Mancia G y cols., Guía ESH 2023 para el manejo de la hipertensión arterial, J Hypertens 2023;41:1874. McEvoy JW y cols., Guía ESC 2024 de presión arterial elevada e hipertensión, Eur Heart J 2024;45:3912.",
};

export const DIAS_TA = [7, 14] as const;
export const diasTa = (texto: string | undefined) => (texto === "14" ? 14 : 7);
