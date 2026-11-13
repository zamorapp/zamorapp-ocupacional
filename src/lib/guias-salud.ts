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

// Dorso de la hoja de control de tensión arterial
export const GUIA_TA: Guia = {
  clave: "ta",
  titulo: "Cómo tomarse la tensión y cómo bajarla",
  porque: [
    "La tensión arterial es la fuerza con que la sangre empuja las arterias. El primer número (sistólica) es cuando el corazón late; el segundo (diastólica), cuando descansa entre latidos.",
    "La tensión alta casi nunca avisa: no duele ni da síntomas. Por eso la llaman «el asesino silencioso». Con los años daña el corazón, el cerebro, los riñones y la vista.",
    "En el consultorio puede subir por los nervios. Medirse en casa, bien hecho, muestra su tensión real del día a día.",
    "En casa se considera alta si el promedio de todas las tomas es de 135/85 mmHg o más. Cuenta el promedio, no una sola cifra.",
  ],
  comparar: [
    { figura: "ta-mal", bien: false, texto: "Piernas cruzadas, espalda sin apoyo, brazo colgando y hablando: la cifra sale más alta de lo real." },
    { figura: "ta-postura", bien: true, texto: "Espalda apoyada, pies planos en el piso y brazo sobre la mesa, a la altura del corazón." },
    { figura: "ta-ropa", bien: false, texto: "Manguito sobre la ropa o con la manga enrollada apretando el brazo." },
    { figura: "ta-manguito", bien: true, texto: "Manguito sobre la piel, con su borde 2 a 3 cm por encima del pliegue del codo." },
  ],
  tituloPasos: "Paso a paso, cada vez que se mida",
  pasos: [
    { figura: "ta-reposo", titulo: "Descanse antes", pasos: ["Orine primero.", "Siéntese tranquilo, en silencio, 5 minutos."], dosis: ["5 minutos"] },
    { figura: "ta-sin-cafe", titulo: "Nada de café ni cigarro", pasos: ["Sin café, cigarro ni ejercicio en la media hora antes de medirse."], dosis: ["30 minutos antes"] },
    { figura: "ta-callado", titulo: "Quieto y callado", pasos: ["No hable, no use el celular y no se mueva mientras el aparato mide."], dosis: ["en silencio"] },
    { figura: "ta-dos-tomas", titulo: "Dos tomas y anótelas", pasos: ["Haga 2 tomas con 1 minuto de diferencia.", "Anote las dos, tal cual salen, con la hora."], dosis: ["mañana y noche"] },
  ],
  tituloConsejos: "Si su tensión es alta: lo que sí la baja",
  consejos: [
    { icono: "sal", titulo: "Menos de 5 g de sal al día", texto: "Es una cucharadita rasa, sumando toda la comida del día. Sin salero en la mesa; cuidado con embutidos, enlatados, cubitos y salsas." },
    { icono: "verduras", titulo: "Plato con verduras y frutas", texto: "Verduras y frutas a diario, granos, pescado y lácteos descremados; poca grasa, frituras y dulces (plan DASH)." },
    { icono: "caminar", titulo: "Muévase 150 minutos a la semana", texto: "Por ejemplo, 30 minutos de caminata rápida 5 días. En el trabajo, use las pausas para caminar." },
    { icono: "balanza", titulo: "Cuide su peso", texto: "Si le sobran kilos, bajar aunque sea un poco ya ayuda a bajar la tensión." },
    { icono: "alcohol", no: true, titulo: "Mejor sin alcohol", texto: "El alcohol sube la tensión. Si toma, que sea poco y no todos los días." },
    { icono: "cigarro", no: true, titulo: "Deje de fumar", texto: "Cada cigarro sube la tensión y daña las arterias. Pida ayuda a su médico para dejarlo." },
    { icono: "pastilla", titulo: "Sus medicinas, todos los días", texto: "A la misma hora, aunque se sienta bien. No las suspenda ni cambie la dosis sin hablar con su médico." },
    { icono: "cama", titulo: "Duerma bien y baje el estrés", texto: "Duerma de 7 a 9 horas. Haga pausas y respire con calma en los días de mucha presión." },
  ],
  nota: "Para la jornada: lleve su almuerzo o pida la comida sin sal agregada, tenga agua a la mano y no deje de tomar sus medicinas en los turnos largos o de noche.",
  fuente:
    "OMS, Hipertensión (nota descriptiva) y Reducir el consumo de sal; Muntner P y cols., Medición de la presión arterial en humanos, declaración científica de la AHA, Hypertension 2019;73:e35; Mancia G y cols., Guía ESH 2023, J Hypertens 2023;41:1874; McEvoy JW y cols., Guía ESC 2024, Eur Heart J 2024;45:3912; NHLBI, plan de alimentación DASH; AHA, Life's Essential 8 (sueño).",
};

// Guía de diabetes: hoja propia al final del plan de alimentación para diabetes
export const GUIA_DIABETES: Guia = {
  clave: "dm",
  titulo: "Diabetes: porciones, pies y azúcar baja",
  porque: [
    "En la diabetes el azúcar (glucosa) se queda en la sangre porque la insulina falta o no trabaja bien.",
    "Con los años, el azúcar alta daña los ojos, los riñones, los nervios de los pies, el corazón y el cerebro. Mantenerla controlada evita esas complicaciones.",
    "Los pies pierden sensibilidad: una herida puede pasar sin dolor y complicarse. Por eso se revisan todos los días.",
    "Tres pilares la controlan: lo que come (y cuánto), cuánto se mueve y tomar bien sus medicinas.",
  ],
  porciones: [
    { figura: "mano-palma", titulo: "Proteína", texto: "Carne, pollo, pescado o queso: el tamaño de su palma y el grueso de su dedo meñique." },
    { figura: "mano-puno", titulo: "Arepa, arroz, pasta o fruta", texto: "Lo que cabe en su puño cerrado." },
    { figura: "mano-dos", titulo: "Verduras", texto: "Lo que quepa en sus dos manos abiertas." },
    { figura: "mano-pulgar", titulo: "Grasa", texto: "Aceite, mantequilla o margarina: la punta de su pulgar." },
  ],
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

export const guiaDeDieta = (clave: string) => (clave === "diabetes" ? GUIA_DIABETES : null);
