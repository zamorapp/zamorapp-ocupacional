// Dietas completas por caso: el médico elige UNA (hipertensión, diabetes, nefropatía…) y la hoja sale entera para
// ese caso, con su plato, lo que debe preferir, moderar y evitar, un día de ejemplo y hábitos. Las indicaciones
// cortas de otras condiciones (PLANES) se pueden sumar abajo. En pantalla, cada renglón se puede cambiar, quitar o
// agregar antes de imprimir.
import { PLAN_BASE } from "./indicaciones-preventivas";

export type Icono =
  | "verduras" | "pescado" | "fruta" | "agua" | "sal" | "refresco" | "arepa" | "huevo"
  | "rinon" | "reloj" | "balanza" | "aceite" | "granos" | "leche" | "caminar" | "azucar" | "corazon"
  | "pastilla" | "cigarro" | "alcohol" | "cama"
  | "embutido" | "hierbas" | "frito" | "plancha" | "manteca" | "estomago" | "intestino" | "gota" | "higado" | "sol";

export type Destacado = { icono: Icono; texto: string; no?: boolean };
export type ParteDelPlato = { parte: string; color: string; texto: string; ejemplo: string };
export type Comida = { comida: string; texto: string };

export type Dieta = {
  clave: string;
  boton: string;
  titulo: string;
  intro: string;
  plato: ParteDelPlato[];
  destacados: Destacado[];
  preferir: string[];
  moderar: string[];
  evitar: string[];
  ejemplo: Comida[];
  habitos: string[];
  fuentes: string;
  // Indicaciones sumables (PLANES) que esta dieta ya trae completas: no se ofrecen ni se imprimen dos veces
  incluye?: string[];
};

const VERDE = "#cfe7d6";
const NARANJA = "#f6dcc9";
const AMARILLO = "#f3e7b5";

export const DIETAS: Dieta[] = [
  {
    clave: "general",
    boton: "Saludable",
    titulo: "Plan de alimentación saludable (mediterráneo)",
    ...PLAN_BASE,
    destacados: [
      { icono: "verduras", texto: "Medio plato de vegetales" },
      { icono: "pescado", texto: "Pescado 2 a 3 veces por semana" },
      { icono: "agua", texto: "6 a 8 vasos de agua al día" },
      { icono: "refresco", texto: "Sin refrescos ni jugos de caja", no: true },
    ],
  },
  {
    clave: "hta",
    boton: "Hipertensión",
    titulo: "Dieta para la hipertensión arterial (DASH)",
    intro: "Plan tipo DASH con alimentos de Venezuela para bajar la tensión: poca sal, mucho potasio de frutas y vegetales y lácteos descremados.",
    plato: [
      { parte: "1/2", color: VERDE, texto: "Verduras y hortalizas", ejemplo: "tomate, espinaca, auyama, brócoli, vainitas, berenjena" },
      { parte: "1/4", color: NARANJA, texto: "Proteínas", ejemplo: "pescado fresco, pollo sin piel, huevo, caraotas, lentejas" },
      { parte: "1/4", color: AMARILLO, texto: "Carbohidratos integrales", ejemplo: "avena, arroz integral, víveres hervidos, media arepa" },
    ],
    destacados: [
      { icono: "sal", texto: "Menos de 5 g de sal al día", no: true },
      { icono: "fruta", texto: "4 a 5 frutas al día" },
      { icono: "leche", texto: "Lácteos descremados" },
      { icono: "caminar", texto: "Caminar 30 minutos diarios" },
    ],
    preferir: [
      "Frutas frescas, 4 a 5 porciones al día: cambur, lechosa, melón, naranja, guayaba.",
      "Vegetales en almuerzo y cena, crudos o al vapor.",
      "Lácteos descremados: leche, yogur natural, queso blanco sin sal.",
      "Pescado, pollo sin piel y granos (caraotas, lentejas, quinchonchos).",
      "Frutos secos sin sal: un puñado 4 a 5 veces por semana.",
      "Sazonar con ajo, cebolla, ají dulce, cilantro, orégano y limón.",
    ],
    moderar: [
      "Sal: una cucharadita rasa al día en total; cocinar con poca y no poner salero en la mesa.",
      "Café: hasta 2 tazas al día.",
      "Carne roja magra: una vez por semana.",
      "Pan y galletas: aun los integrales traen sal; leer la etiqueta.",
      "Queso: solo blanco bajo en sal y en porción pequeña.",
    ],
    evitar: [
      "Cubitos, sazonadores, salsa de soya, salsa inglesa y adobos.",
      "Embutidos (jamón, salchicha, mortadela, chorizo) y enlatados.",
      "Queso duro o amarillo y snacks salados de paquete.",
      "Comida rápida, sopas de sobre y pasapalos.",
      "Alcohol, refrescos y bebidas energéticas.",
    ],
    ejemplo: [
      { comida: "Desayuno", texto: "Avena cocida con leche descremada y cambur; 1 huevo; café sin azúcar." },
      { comida: "Merienda", texto: "1 naranja o una taza de lechosa con un puñado de maní sin sal." },
      { comida: "Almuerzo", texto: "Ensalada con limón y aceite de oliva, pescado al horno con ajo y cilantro, media taza de arroz integral y caraotas sin sal." },
      { comida: "Cena", texto: "Crema de auyama sin cubito, pollo a la plancha y vegetales al vapor." },
    ],
    habitos: [
      "Medirse la tensión en casa y anotar los valores.",
      "Bajar de peso si hay sobrepeso: cada kilo menos baja la tensión.",
      "No fumar y dormir 7 a 8 horas.",
      "No suspender los medicamentos aunque la tensión esté normal.",
    ],
    fuentes: "NHLBI, plan de alimentación DASH. McEvoy JW y cols., Guía ESC 2024 de presión arterial elevada e hipertensión, Eur Heart J 2024;45:3912. OMS, Directriz sobre la ingesta de sodio (2012, actualizada 2023).",
  },
  {
    clave: "cardio",
    boton: "Cardiopatía",
    incluye: ["lipidos"],
    titulo: "Dieta para el corazón (cardiopatías)",
    intro: "Plan para cuidar el corazón (enfermedad coronaria, insuficiencia cardíaca, arritmias): poca sal, grasas buenas en lugar de saturadas y líquidos medidos si el médico lo indica.",
    plato: [
      { parte: "1/2", color: VERDE, texto: "Verduras y hortalizas", ejemplo: "ensalada, brócoli, auyama, berenjena, vainitas, tomate" },
      { parte: "1/4", color: NARANJA, texto: "Proteínas", ejemplo: "pescado azul, pollo sin piel, clara de huevo, granos" },
      { parte: "1/4", color: AMARILLO, texto: "Carbohidratos integrales", ejemplo: "avena, arroz integral, granos, víveres hervidos" },
    ],
    destacados: [
      { icono: "sal", texto: "Menos de 5 g de sal al día", no: true },
      { icono: "pescado", texto: "Pescado azul 2 veces por semana" },
      { icono: "aceite", texto: "Aceite de oliva, no manteca" },
      { icono: "corazon", texto: "Medicinas todos los días" },
    ],
    preferir: [
      "Pescado azul (sardina, atún, jurel) al menos 2 veces por semana.",
      "Aceite de oliva, aguacate, maní y merey sin sal como grasa principal.",
      "Avena, granos y vegetales: su fibra ayuda a bajar el colesterol.",
      "Frutas y vegetales de todos los colores, 5 porciones al día.",
      "Pollo sin piel, clara de huevo y granos como proteína.",
      "Lácteos descremados.",
    ],
    moderar: [
      "Huevo entero: hasta uno al día.",
      "Carne roja magra: como máximo una vez por semana, sin grasa visible.",
      "Café: 1 a 2 tazas; menos si tiene palpitaciones o arritmia.",
      "Líquidos: si tiene insuficiencia cardíaca, la cantidad que indique el médico (por lo general 1,5 a 2 litros al día).",
      "Porciones pequeñas: las comidas grandes cansan el corazón.",
    ],
    evitar: [
      "Sal, cubitos, embutidos, enlatados y comida rápida.",
      "Manteca, mantequilla, aceite de coco, piel del pollo, chicharrón y frituras.",
      "Margarina, galletas y panadería industrial (grasas trans).",
      "Alcohol y bebidas energéticas.",
      "Azúcar y refrescos.",
      "Cigarrillo y vapeador.",
    ],
    ejemplo: [
      { comida: "Desayuno", texto: "Avena con leche descremada y fresas; 2 claras revueltas con tomate; café pequeño sin azúcar." },
      { comida: "Merienda", texto: "1 fruta y un puñado de merey sin sal." },
      { comida: "Almuerzo", texto: "Sardinas o jurel al horno, ensalada con aceite de oliva y media taza de lentejas." },
      { comida: "Cena", texto: "Pollo a la plancha con vegetales al vapor y un trozo pequeño de batata." },
    ],
    habitos: [
      "Tomar los medicamentos todos los días a la misma hora, aunque se sienta bien.",
      "Con insuficiencia cardíaca: pesarse cada mañana y avisar si sube 2 kg en 3 días o se le hinchan los pies.",
      "Actividad física que indique el cardiólogo; caminar a paso cómodo.",
      "Acudir de inmediato si tiene dolor de pecho, falta de aire en reposo o desmayo.",
    ],
    fuentes: "Visseren FLJ y cols., Guía ESC 2021 de prevención cardiovascular, Eur Heart J 2021;42:3227. McDonagh TA y cols., Guía ESC 2021 de insuficiencia cardíaca, Eur Heart J 2021;42:3599. AHA, Dietary Guidance, Circulation 2021.",
  },
  {
    clave: "diabetes",
    boton: "Diabetes",
    titulo: "Dieta para la diabetes",
    intro: "Plan para controlar el azúcar: la misma cantidad de carbohidrato a la misma hora, mucha fibra y nada de azúcares simples.",
    plato: [
      { parte: "1/2", color: VERDE, texto: "Vegetales sin almidón", ejemplo: "lechuga, tomate, pepino, brócoli, vainitas, calabacín" },
      { parte: "1/4", color: NARANJA, texto: "Proteínas", ejemplo: "pescado, pollo sin piel, huevo, queso blanco" },
      { parte: "1/4", color: AMARILLO, texto: "Carbohidrato contado", ejemplo: "media taza de granos, arroz integral o víveres, o media arepa" },
    ],
    destacados: [
      { icono: "azucar", texto: "Sin azúcar, dulces ni miel", no: true },
      { icono: "reloj", texto: "Comer a la misma hora" },
      { icono: "granos", texto: "Granos y fibra cada día" },
      { icono: "caminar", texto: "Caminar después de comer" },
    ],
    preferir: [
      "Vegetales sin almidón: la mitad del plato en almuerzo y cena.",
      "Granos (caraotas, lentejas, garbanzos): carbohidrato con fibra que sube poco el azúcar.",
      "Fruta entera, una porción por vez: guayaba, manzana, naranja, lechosa, fresas.",
      "Avena en hojuelas, pan integral de verdad y arroz integral.",
      "Proteína en cada comida: huevo, pescado, pollo o queso blanco.",
      "Grasas buenas: aguacate, aceite de oliva, maní y merey sin sal.",
    ],
    moderar: [
      "Víveres (yuca, ñame, ocumo, plátano, papa): del tamaño del puño y nunca dos en la misma comida.",
      "Arepa: pequeña y delgada, mejor integral o mezclada con vegetales.",
      "Frutas muy dulces (mango, cambur maduro, uvas): media porción.",
      "Edulcorantes: en poca cantidad.",
    ],
    evitar: [
      "Azúcar, papelón, miel, dulces, tortas y helados.",
      "Refrescos, jugos (aun naturales), maltas y bebidas deportivas.",
      "Pan blanco, galletas, cereales azucarados y pasta en exceso.",
      "Frituras y empanadas.",
      "Alcohol en ayunas o sin comer.",
    ],
    ejemplo: [
      { comida: "Desayuno", texto: "Media arepa pequeña con huevo revuelto con vegetales y queso blanco; café sin azúcar." },
      { comida: "Merienda", texto: "1 manzana o guayaba con 10 maníes sin sal." },
      { comida: "Almuerzo", texto: "Medio plato de ensalada, pollo al horno y media taza de lentejas." },
      { comida: "Cena", texto: "Pescado a la plancha con vegetales salteados y un trozo pequeño de batata." },
    ],
    habitos: [
      "No saltarse comidas; si usa insulina o pastillas, llevar algo dulce por si le baja el azúcar (sudor frío, temblor, mareo).",
      "Medirse la glucosa como le indique el médico y anotarla.",
      "Revisarse los pies todos los días.",
      "Actividad física: 150 minutos por semana como mínimo.",
    ],
    fuentes: "American Diabetes Association, Standards of Care in Diabetes 2025, sección 5 (Diabetes Care 2025;48 Supl. 1).",
  },
  {
    clave: "insulina",
    boton: "Resistencia a la insulina",
    titulo: "Dieta para la resistencia a la insulina y la prediabetes",
    intro: "Plan para que la insulina trabaje mejor y prevenir la diabetes: menos harinas y azúcares, más proteína, fibra y movimiento.",
    plato: [
      { parte: "1/2", color: VERDE, texto: "Vegetales", ejemplo: "ensalada, brócoli, vainitas, berenjena, calabacín, espinaca" },
      { parte: "1/4", color: NARANJA, texto: "Proteínas", ejemplo: "huevo, pescado, pollo, queso blanco, granos" },
      { parte: "1/4", color: AMARILLO, texto: "Carbohidrato lento", ejemplo: "avena, granos, víveres en porción pequeña" },
    ],
    destacados: [
      { icono: "verduras", texto: "Primero vegetales y proteína" },
      { icono: "refresco", texto: "Nada de azúcar en bebidas", no: true },
      { icono: "caminar", texto: "Caminar 15 min tras comer" },
      { icono: "balanza", texto: "Bajar 5 % a 7 % del peso" },
    ],
    preferir: [
      "Comer primero los vegetales y la proteína y de último el carbohidrato.",
      "Proteína en el desayuno: huevo, queso blanco o yogur natural.",
      "Fibra en cada comida: vegetales, granos, chía, linaza o avena.",
      "Grasas buenas: aguacate, aceite de oliva, sardina, maní sin sal.",
      "Agua, café o té sin endulzar.",
      "Vinagre o limón para aliñar las ensaladas.",
    ],
    moderar: [
      "Arepa, pan, arroz y pasta: media porción y nunca solos.",
      "Fruta: una porción entera por vez, con queso o frutos secos.",
      "Víveres: del tamaño del puño cerrado.",
      "Lácteos: sin azúcar añadida.",
    ],
    evitar: [
      "Refrescos, jugos, maltas, té frío y café endulzado.",
      "Dulces, galletas, cereales de caja y pan dulce.",
      "Ultraprocesados y comida rápida.",
      "Picar entre comidas.",
      "Alcohol, sobre todo cerveza.",
    ],
    ejemplo: [
      { comida: "Desayuno", texto: "2 huevos con vegetales, medio aguacate y una rebanada de pan integral; café sin azúcar." },
      { comida: "Merienda", texto: "Yogur natural sin azúcar con chía, o queso blanco con pepino." },
      { comida: "Almuerzo", texto: "Ensalada primero; luego pescado o pollo y media taza de caraotas." },
      { comida: "Cena", texto: "Vegetales salteados con pollo o huevo, sin harinas." },
    ],
    habitos: [
      "Ejercicios de fuerza 2 a 3 veces por semana (sentadillas, ligas, pesas).",
      "Dormir 7 a 8 horas: dormir poco empeora la resistencia a la insulina.",
      "Meta de cintura: menos de 90 cm en el hombre y de 80 cm en la mujer.",
      "Repetir glucosa en ayunas y hemoglobina glicosilada (HbA1c) cada año.",
    ],
    fuentes: "Knowler WC y cols., Programa de Prevención de la Diabetes (DPP), N Engl J Med 2002;346:393. American Diabetes Association, Standards of Care in Diabetes 2025, secciones 3 y 5. FID, definición mundial del síndrome metabólico (2006).",
  },
  {
    clave: "renal",
    boton: "Nefropatía",
    titulo: "Dieta para la enfermedad de los riñones (nefropatía)",
    intro: "Plan para cuidar los riñones: poca sal, proteína moderada y control del potasio y el fósforo según sus exámenes. Ajústelo con su médico o nefrólogo.",
    plato: [
      { parte: "1/2", color: VERDE, texto: "Vegetales bajos en potasio", ejemplo: "pepino, repollo, vainitas, calabacín, lechuga, pimentón" },
      { parte: "1/4", color: NARANJA, texto: "Proteína moderada", ejemplo: "huevo, pescado o pollo sin piel, del tamaño de la palma" },
      { parte: "1/4", color: AMARILLO, texto: "Carbohidratos", ejemplo: "arroz, pasta, arepa, víveres remojados y hervidos" },
    ],
    destacados: [
      { icono: "sal", texto: "Sin sal ni sustitutos de sal", no: true },
      { icono: "huevo", texto: "Proteína moderada" },
      { icono: "refresco", texto: "Sin refrescos de cola", no: true },
      { icono: "rinon", texto: "Exámenes en cada control" },
    ],
    preferir: [
      "Frutas bajas en potasio: manzana, pera, piña, fresas y lechosa en porción pequeña.",
      "Vegetales bajos en potasio: pepino, repollo, vainitas, calabacín, lechuga, pimentón.",
      "Huevo (sobre todo la clara), pescado y pollo sin piel.",
      "Aceite de oliva o vegetal para cocinar.",
      "Sazonar con ajo, cebolla, ají dulce, orégano y limón.",
    ],
    moderar: [
      "Proteína: del tamaño de la palma en almuerzo y cena; nada de batidos ni dietas altas en proteína.",
      "Lácteos: medio vaso de leche o un trozo pequeño de queso blanco al día (fósforo).",
      "Granos: media taza, remojados la noche antes y con el agua botada.",
      "Víveres y papa: pelados, picados, remojados y hervidos en agua abundante que se bota.",
      "Agua y líquidos: la cantidad que indique el médico.",
    ],
    evitar: [
      "Sal, cubitos, sazonadores, sal «light» y sustitutos de sal (tienen potasio).",
      "Embutidos, enlatados, comida rápida y snacks salados.",
      "Refrescos oscuros (colas) y productos con fosfatos en la etiqueta.",
      "Si su potasio está alto: cambur, aguacate, naranja, melón, parchita, coco y frutos secos.",
      "Carambola (es tóxica para el riñón).",
      "Antiinflamatorios (ibuprofeno, diclofenac), suplementos y remedios naturales sin consultar.",
    ],
    ejemplo: [
      { comida: "Desayuno", texto: "Arepa con claras de huevo revueltas con pimentón y cebolla; café pequeño." },
      { comida: "Merienda", texto: "1 manzana o una taza de piña." },
      { comida: "Almuerzo", texto: "Arroz, pollo a la plancha del tamaño de la palma y ensalada de repollo y pepino con limón." },
      { comida: "Cena", texto: "Pasta con calabacín salteado en aceite de oliva y una porción pequeña de pescado." },
    ],
    habitos: [
      "Mantener la tensión y el azúcar controlados.",
      "Llevar a cada control sus exámenes: creatinina, potasio, fósforo y orina.",
      "Avisar si se hincha (pies, párpados) o si orina poco.",
      "No fumar.",
    ],
    fuentes: "KDIGO 2024, Guía de práctica clínica para la evaluación y el manejo de la enfermedad renal crónica, Kidney Int 2024;105(4S):S117. Ikizler TA y cols., Guía KDOQI 2020 de nutrición en la enfermedad renal crónica, Am J Kidney Dis 2020;76(3 Supl 1):S1.",
  },
  {
    clave: "peso",
    boton: "Baja en calorías",
    titulo: "Dieta baja en calorías (para bajar de peso)",
    intro: "Plan de unas 1.200 a 1.500 calorías al día en la mujer y 1.500 a 1.800 en el hombre, según lo indique el médico, para bajar entre medio kilo y un kilo por semana.",
    plato: [
      { parte: "1/2", color: VERDE, texto: "Vegetales, lo que quiera", ejemplo: "ensalada, brócoli, vainitas, pepino, calabacín" },
      { parte: "1/4", color: NARANJA, texto: "Proteína magra", ejemplo: "pollo sin piel, pescado, huevo, atún en agua, granos" },
      { parte: "1/4", color: AMARILLO, texto: "Carbohidrato", ejemplo: "del tamaño del puño cerrado" },
    ],
    destacados: [
      { icono: "balanza", texto: "Pesarse una vez por semana" },
      { icono: "agua", texto: "Un vaso de agua antes de comer" },
      { icono: "aceite", texto: "Una cucharadita de aceite por comida" },
      { icono: "refresco", texto: "Sin refrescos, jugos ni alcohol", no: true },
    ],
    preferir: [
      "Vegetales en cantidad libre, crudos o al vapor; empezar cada comida con ellos.",
      "Proteína magra del tamaño de la palma en cada comida.",
      "Fruta entera 2 veces al día.",
      "Sopas y cremas de vegetales sin cubitos ni crema de leche.",
      "Lácteos descremados sin azúcar.",
    ],
    moderar: [
      "Carbohidrato: media arepa pequeña o media taza de arroz, pasta o víveres por comida.",
      "Aceite: medido con cucharita, nunca a chorro.",
      "Aguacate y frutos secos: del tamaño del pulgar.",
      "Café y té: sin azúcar.",
    ],
    evitar: [
      "Frituras, empanadas, tequeños y comida rápida.",
      "Dulces, galletas y pan dulce.",
      "Salsas cremosas: mayonesa, salsa rosada, queso fundido.",
      "Comer de pie, apurado o frente a pantallas.",
      "Repetir el plato.",
    ],
    ejemplo: [
      { comida: "Desayuno", texto: "Media arepa pequeña con 2 claras y 1 huevo revueltos con tomate y cebolla; café sin azúcar." },
      { comida: "Merienda", texto: "1 fruta o un yogur natural sin azúcar (menos de 150 calorías)." },
      { comida: "Almuerzo", texto: "Ensalada grande, pollo a la plancha y media taza de arroz o un trozo pequeño de yuca." },
      { comida: "Cena", texto: "Crema de vegetales, atún en agua y ensalada." },
    ],
    habitos: [
      "Meta: bajar entre 5 % y 10 % del peso en 6 meses.",
      "Usar plato pequeño y servirse una sola vez.",
      "Subir la actividad física hasta 300 minutos por semana para no recuperar el peso.",
      "Dormir 7 a 8 horas: dormir poco da más hambre.",
    ],
    fuentes: "Jensen MD y cols., Guía AHA/ACC/TOS 2013 para el manejo del sobrepeso y la obesidad, Circulation 2014;129:S102. OMS, Obesidad y sobrepeso (2024). OMS, Directrices sobre actividad física (2020).",
  },
];

export const sumables = (d: Dieta, clave: string) => clave !== d.clave && !d.incluye?.includes(clave);

export const dietaDe = (texto: string | undefined) => DIETAS.find((x) => x.clave === texto) ?? DIETAS[0];
