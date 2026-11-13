// Figuras de los ejercicios (pausas activas y equilibrio): dibujos de línea propios, sin imágenes externas, para que
// salgan iguales en la web, en el escritorio sin internet y en el PDF. Trazo oscuro = cuerpo, naranja = movimiento,
// verde = objetos y miradas. Cada figura se nombra en lib/bienestar.ts (campo «figura»).

import type { Icono } from "@/lib/dietas";
import { IconoSalud } from "./iconos-salud";

const T = "#16302d"; // cuerpo
const N = "#e8833a"; // movimiento
const V = "#0f6f68"; // objetos y miradas
const G = "#b9cfcb"; // muebles y piso

// Un solo juego de puntas de flecha por hoja (se dibuja una vez arriba de la hoja)
export function DefsFiguras() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <marker id="fig-flecha" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={N} />
        </marker>
      </defs>
    </svg>
  );
}

const cuerpo = { stroke: T, strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
const Cabeza = ({ x, y, r = 5.5 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} fill="#fff" stroke={T} strokeWidth={2.6} />;
const Traza = ({ d }: { d: string }) => <path d={d} {...cuerpo} />;
const Flecha = ({ d, doble }: { d: string; doble?: boolean }) => (
  <path d={d} stroke={N} strokeWidth={2.6} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" markerStart={doble ? "url(#fig-flecha)" : undefined} />
);
const Mira = ({ d }: { d: string }) => <path d={d} stroke={V} strokeWidth={1.4} strokeDasharray="2.5 2.5" fill="none" />;
const Ojos = ({ x, y, dx = 0 }: { x: number; y: number; dx?: number }) => (
  <>
    <circle cx={x - 2.2 + dx} cy={y - 0.5} r={0.9} fill={T} />
    <circle cx={x + 2.2 + dx} cy={y - 0.5} r={0.9} fill={T} />
  </>
);
const Letra = ({ x, y, t, s = 9 }: { x: number; y: number; t: string; s?: number }) => (
  <>
    <rect x={x - s * 0.75} y={y - s * 0.9} width={s * 1.5} height={s * 1.7} rx={1.6} fill="#fff" stroke={V} strokeWidth={1.4} />
    <text x={x} y={y + s * 0.35} textAnchor="middle" fontSize={s} fontWeight={800} fill={V}>{t}</text>
  </>
);
const Silla = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x} ${y - 16} L${x} ${y + 12} M${x} ${y} L${x + 12} ${y} L${x + 12} ${y + 12}`} stroke={G} strokeWidth={3} strokeLinecap="round" fill="none" />
);
// Busto de frente: tronco relleno (se lee como persona aun en tamaño chico), cuello y cabeza
const Busto = ({ hx = 24, hy = 12, hombros = 26 }: { hx?: number; hy?: number; hombros?: number }) => (
  <>
    <path d={`M9 47 Q9 ${hombros} 24 ${hombros - 2} Q39 ${hombros} 39 47 Z`} fill="#cfe5e1" stroke={T} strokeWidth={2.4} strokeLinejoin="round" />
    <Traza d={`M24 ${hombros - 2} L${hx} ${hy + 5}`} />
    <Cabeza x={hx} y={hy} r={7} />
  </>
);

// 48 × 48: figuras chicas de las pausas activas
const PAUSAS: Record<string, React.ReactNode> = {
  // Cuello
  "oreja-hombro": <><Busto hx={29} hy={13} /><Flecha d="M16 8 Q22 0 31 3" /></>,
  "menton-pecho": <><Busto hy={15} /><Ojos x={24} y={17} /><Flecha d="M38 6 L38 20" doble /></>,
  "mirar-hombro": <><Busto /><Ojos x={24} y={12} dx={2} /><Flecha d="M12 3 Q24 -3 36 3" doble /></>,
  // Hombros
  "subir-hombros": <><Busto hombros={22} /><Flecha d="M5 30 L5 17" /><Flecha d="M43 30 L43 17" /></>,
  "circulos-hombros": <><Busto /><path d="M38 17 a7 7 0 1 1 -7 7" stroke={N} strokeWidth={2.4} fill="none" markerEnd="url(#fig-flecha)" /></>,
  "brazo-cruzado": <><Busto /><Traza d="M36 29 L13 33 M12 30 L20 38 L26 35" /><Flecha d="M44 40 L33 40" /></>,
  // Brazos y muñecas
  "palma-arriba": <><Traza d="M4 26 L32 26 L32 16" /><Traza d="M28 36 L35 22" /><Flecha d="M40 14 Q44 20 40 26" /><text x={14} y={42} fontSize={8.5} fontWeight={700} fill={V}>palma ↑</text></>,
  "palma-abajo": <><Traza d="M4 22 L32 22 L32 33" /><Traza d="M28 12 L35 28" /><Flecha d="M40 22 Q44 28 40 34" /><text x={14} y={42} fontSize={8.5} fontWeight={700} fill={V}>palma ↓</text></>,
  "circulos-munecas": <><Traza d="M18 44 L22 22 M30 44 L26 22" /><circle cx={22} cy={18} r={3.4} fill="#fff" stroke={T} strokeWidth={2.4} /><circle cx={26} cy={18} r={3.4} fill="#fff" stroke={T} strokeWidth={2.4} /><path d="M14 10 a10 6 0 1 1 6 6" stroke={N} strokeWidth={2.3} fill="none" markerEnd="url(#fig-flecha)" /></>,
  // Manos y dedos
  "abrir-cerrar": <><Traza d="M8 40 L10 24 M8 40 L5 27 M8 40 L14 26 M8 40 L16 31 M8 40 L2 34" /><circle cx={38} cy={33} r={6} fill="#fff" stroke={T} strokeWidth={2.6} /><Flecha d="M19 32 L29 32" doble /></>,
  "pulgar-dedos": <><Traza d="M20 44 L20 28 M20 28 L14 14 M20 28 L21 10 M20 28 L27 12 M20 28 L32 16 M20 34 L30 26" /><circle cx={30} cy={24} r={3} fill="none" stroke={N} strokeWidth={2} /></>,
  "sacudir-manos": <><Traza d="M16 44 L18 26 L14 16 M18 26 L20 14 M18 26 L24 16 M30 44 L32 26" /><path d="M6 14 l3 -3 l3 3 l3 -3 M34 20 l3 -3 l3 3 l3 -3 M8 24 l3 -3 l3 3" stroke={N} strokeWidth={2} fill="none" strokeLinecap="round" /></>,
  // Espalda alta y pecho (de lado)
  "abrir-pecho": <><Cabeza x={22} y={8} /><Traza d="M22 14 L20 30 L22 46 M21 18 L14 28 L12 32" /><Flecha d="M30 20 L40 20" /></>,
  "redondear-espalda": <><Cabeza x={26} y={10} /><Traza d="M24 16 Q16 24 20 34 L20 46 M24 18 L38 22" /><Flecha d="M14 18 Q8 24 12 32" /></>,
  "juntar-omoplatos": <><Cabeza x={24} y={9} /><Traza d="M24 15 L24 46 M24 20 L13 22 L9 13 M24 20 L35 22 L39 13" /><Flecha d="M6 30 L16 30" /><Flecha d="M42 30 L32 30" /></>,
  // Cintura y espalda baja
  "inclinarse-atras": <><Cabeza x={18} y={9} /><Traza d="M19 15 L24 30 L24 46 M20 20 L28 27 L24 30" /><Flecha d="M30 10 Q20 2 12 6" /></>,
  "inclinarse-lado": <><Cabeza x={17} y={11} /><Traza d="M19 17 L24 30 L20 46 M24 30 L28 46 M19 19 L10 6 M21 21 L30 28" /><Flecha d="M30 6 Q22 0 14 4" /></>,
  "girar-tronco": <><Silla x={10} y={30} /><Cabeza x={22} y={8} /><Traza d="M22 14 L22 30 L34 30 L34 44 M22 18 L32 22" /><path d="M14 22 a9 4 0 1 0 18 0" stroke={N} strokeWidth={2.4} fill="none" markerEnd="url(#fig-flecha)" /></>,
  // Piernas
  "puntas-pie": <><path d="M36 16 L36 46 M36 28 L46 28 L46 46" stroke={G} strokeWidth={3} strokeLinecap="round" fill="none" /><Cabeza x={20} y={8} /><Traza d="M20 14 L20 32 L19 43 L22 44 M20 32 L22 43 M20 20 L34 26" /><Flecha d="M10 40 L10 28" /><path d="M6 46 L30 46" stroke={G} strokeWidth={2} /></>,
  "talon-nalga": <><Cabeza x={22} y={7} /><Traza d="M22 13 L22 30 L22 46 M22 30 L28 38 L24 28 M22 18 L30 22 L26 28" /><Flecha d="M36 40 Q38 30 30 26" /></>,
  "estirar-pierna": <><Silla x={6} y={28} /><Cabeza x={14} y={8} /><Traza d="M14 14 L14 28 L40 28 L42 22 M14 18 L24 24" /><Flecha d="M44 34 L44 18" /></>,
  // Ojos
  "mirar-lejos": <><path d="M4 24 Q12 15 20 24 Q12 33 4 24 z" fill="#fff" stroke={T} strokeWidth={2.4} /><circle cx={12} cy={24} r={2.6} fill={T} /><Mira d="M21 24 L38 24" /><path d="M34 34 L40 22 L46 34 z" fill={G} /></>,
  "parpadear": <><path d="M4 22 Q12 13 20 22 Q12 31 4 22 z" fill="#fff" stroke={T} strokeWidth={2.4} /><circle cx={12} cy={22} r={2.6} fill={T} /><path d="M28 24 Q36 30 44 24" stroke={T} strokeWidth={2.6} fill="none" strokeLinecap="round" /><Flecha d="M20 36 L30 36" doble /></>,
  "mirar-lados": <><path d="M14 24 Q24 14 34 24 Q24 34 14 24 z" fill="#fff" stroke={T} strokeWidth={2.4} /><circle cx={24} cy={24} r={3} fill={T} /><Flecha d="M24 12 L24 4" /><Flecha d="M24 36 L24 44" /><Flecha d="M10 24 L3 24" /><Flecha d="M38 24 L45 24" /></>,
};

export function FiguraPausa({ nombre }: { nombre: string }) {
  const f = PAUSAS[nombre];
  if (!f) return null;
  return <svg viewBox="0 0 48 48" className="size-[15mm] shrink-0 overflow-visible" aria-hidden>{f}</svg>;
}

// 200 × 120: figuras grandes de los ejercicios de equilibrio
const EQUILIBRIO: Record<string, React.ReactNode> = {
  "cabeza-no": (
    <>
      <Letra x={165} y={56} t="A" s={20} />
      <circle cx={80} cy={62} r={30} fill="#fff" stroke={T} strokeWidth={4} />
      <circle cx={70} cy={57} r={4} fill={T} /><circle cx={90} cy={57} r={4} fill={T} />
      <path d="M70 74 Q80 80 90 74" stroke={T} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Mira d="M94 57 L148 55" />
      <path d="M46 22 Q80 6 114 22" stroke={N} strokeWidth={5} fill="none" strokeLinecap="round" markerStart="url(#fig-flecha)" markerEnd="url(#fig-flecha)" />
      <rect x={62} y={92} width={36} height={22} rx={10} fill={T} />
    </>
  ),
  "cabeza-si": (
    <>
      <Letra x={165} y={56} t="A" s={20} />
      <circle cx={88} cy={60} r={30} fill="#fff" stroke={T} strokeWidth={4} />
      <circle cx={78} cy={55} r={4} fill={T} /><circle cx={98} cy={55} r={4} fill={T} />
      <path d="M78 72 Q88 78 98 72" stroke={T} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Mira d="M102 55 L148 55" />
      <path d="M40 30 Q28 60 40 90" stroke={N} strokeWidth={5} fill="none" strokeLinecap="round" markerStart="url(#fig-flecha)" markerEnd="url(#fig-flecha)" />
      <rect x={70} y={90} width={36} height={24} rx={10} fill={T} />
    </>
  ),
  "ojos-ab": (
    <>
      <Letra x={24} y={36} t="A" s={16} />
      <Letra x={176} y={36} t="B" s={16} />
      <circle cx={100} cy={66} r={30} fill="#fff" stroke={T} strokeWidth={4} />
      <circle cx={90} cy={61} r={4} fill={T} /><circle cx={110} cy={61} r={4} fill={T} />
      <path d="M90 78 Q100 84 110 78" stroke={T} strokeWidth={3} fill="none" strokeLinecap="round" />
      <Mira d="M86 58 L38 40" /><Mira d="M114 58 L162 40" />
      <path d="M68 14 L132 14" stroke={N} strokeWidth={5} strokeLinecap="round" markerStart="url(#fig-flecha)" markerEnd="url(#fig-flecha)" />
      <rect x={82} y={96} width={36} height={20} rx={10} fill={T} />
    </>
  ),
  "pies-juntos": (
    <>
      <rect x={48} y={6} width={9} height={112} rx={3} fill={G} />
      <circle cx={100} cy={22} r={13} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M100 35 L100 78 M100 46 L78 62 M100 46 L122 62 M100 78 L97 114 M100 78 L103 114" stroke={T} strokeWidth={5} strokeLinecap="round" fill="none" />
      <Mira d="M78 62 L60 62" />
      <path d="M88 116 L112 116" stroke={T} strokeWidth={5} strokeLinecap="round" />
      <g transform="translate(150 32)"><circle r={16} fill="#fff" stroke={V} strokeWidth={2} /><path d="M-9 0 Q0 -8 9 0 Q0 8 -9 0z" fill="none" stroke={V} strokeWidth={2} /><circle r={3} fill={V} /></g>
      <path d="M150 54 L150 68" stroke={N} strokeWidth={4} strokeLinecap="round" markerEnd="url(#fig-flecha)" />
      <g transform="translate(150 90)"><circle r={16} fill="#fff" stroke={V} strokeWidth={2} /><path d="M-9 0 Q0 7 9 0" fill="none" stroke={V} strokeWidth={2.4} strokeLinecap="round" /></g>
    </>
  ),
  "caminar-girando": (
    <>
      <path d="M8 116 L192 116" stroke={V} strokeWidth={2.5} strokeDasharray="8 6" />
      <ellipse cx={40} cy={110} rx={9} ry={4} fill={G} /><ellipse cx={64} cy={114} rx={9} ry={4} fill={G} />
      <circle cx={110} cy={22} r={13} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M110 35 L108 76 M109 46 L90 64 M109 46 L130 60 M108 76 L94 112 M108 76 L124 110" stroke={T} strokeWidth={5} strokeLinecap="round" fill="none" />
      <path d="M84 12 Q110 -4 136 12" stroke={N} strokeWidth={4.5} fill="none" strokeLinecap="round" markerStart="url(#fig-flecha)" markerEnd="url(#fig-flecha)" />
      <path d="M146 70 L188 70" stroke={V} strokeWidth={4} strokeLinecap="round" />
      <text x={167} y={92} textAnchor="middle" fontSize={13} fontWeight={800} fill={V}>cada 3 pasos</text>
    </>
  ),
  "sentarse-pararse": (
    <>
      <path d="M18 64 L58 64 M22 64 L22 116 M54 64 L54 116 M18 64 L18 18" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" />
      <circle cx={44} cy={22} r={12} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M42 34 L38 62 L66 64 L66 112 M40 44 L60 54" stroke={T} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M84 66 L118 66" stroke={N} strokeWidth={4.5} strokeLinecap="round" markerEnd="url(#fig-flecha)" />
      <path d="M84 82 L118 82" stroke={N} strokeWidth={4.5} strokeLinecap="round" markerStart="url(#fig-flecha)" />
      <circle cx={160} cy={18} r={12} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M160 30 L160 72 M160 42 L144 58 M160 42 L176 58 M160 72 L154 114 M160 72 L166 114" stroke={T} strokeWidth={5} strokeLinecap="round" fill="none" />
    </>
  ),
  // Levantarse en tres tiempos y maniobra contra el desmayo (170 × 100)
  "acostado": (
    <>
      <path d="M14 69 L156 69 M17 76 L17 96 M153 76 L153 96" stroke={G} strokeWidth={7} strokeLinecap="round" fill="none" />
      <circle cx={40} cy={50} r={11} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M52 54 L120 58 L146 62 M68 56 L90 46" stroke={T} strokeWidth={5} strokeLinecap="round" fill="none" />
      <text x={100} y={28} fontSize={15} fontWeight={800} fill={N}>1 minuto</text>
    </>
  ),
  "sentado-borde": (
    <>
      <path d="M14 69 L156 69 M17 76 L17 96 M153 76 L153 96" stroke={G} strokeWidth={7} strokeLinecap="round" fill="none" />
      <circle cx={120} cy={14} r={11} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M120 25 L118 62 L142 62 L142 96 M119 36 L136 48" stroke={T} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x={24} y={38} fontSize={20} fontWeight={800} fill={N}>30 s</text>
    </>
  ),
  "de-pie-apoyado": (
    <>
      <path d="M14 69 L84 69 M17 76 L17 96" stroke={G} strokeWidth={7} strokeLinecap="round" fill="none" />
      <circle cx={122} cy={14} r={10} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M122 24 L122 62 M122 34 L104 46 L90 64 M122 34 L138 48 M122 62 L117 98 M122 62 L127 98" stroke={T} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={88} cy={66} r={4} fill={N} />
    </>
  ),
  "contra-desmayo": (
    <>
      <circle cx={52} cy={14} r={10} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M52 24 L52 58 M52 34 L38 50 M52 34 L66 50 M47 58 L60 98 M57 58 L44 98" stroke={T} strokeWidth={5} strokeLinecap="round" fill="none" />
      <circle cx={37} cy={52} r={4} fill={T} /><circle cx={67} cy={52} r={4} fill={T} />
      <path d="M28 72 Q52 62 76 72" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerStart="url(#fig-flecha)" markerEnd="url(#fig-flecha)" />
      <path d="M118 74 L232 74" stroke={G} strokeWidth={10} strokeLinecap="round" />
      <circle cx={136} cy={60} r={10} fill="#fff" stroke={T} strokeWidth={4} />
      <path d="M146 64 L188 66 L204 40 L226 34" stroke={T} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M214 22 L214 6" stroke={N} strokeWidth={4} strokeLinecap="round" markerEnd="url(#fig-flecha)" />
    </>
  ),
};

const CAJAS: Record<string, string> = { "acostado": "0 0 170 100", "sentado-borde": "0 0 170 100", "de-pie-apoyado": "0 0 170 100", "contra-desmayo": "0 0 250 104" };

export function FiguraEquilibrio({ nombre, className = "" }: { nombre: string; className?: string }) {
  const f = EQUILIBRIO[nombre];
  if (!f) return null;
  return <svg viewBox={CAJAS[nombre] ?? "0 0 200 120"} className={`overflow-visible ${className}`} aria-hidden>{f}</svg>;
}

// 120 × 80: una figura por tema (encabezado de cada tema)
const TEMAS_FIG: Record<string, React.ReactNode> = {
  // Acostado girando la cabeza: el giro aparece con el cambio de posición
  vppb: (
    <>
      <path d="M8 62 L112 62" stroke={G} strokeWidth={7} strokeLinecap="round" />
      <circle cx={28} cy={48} r={9} fill="#fff" stroke={T} strokeWidth={3} />
      <path d="M38 52 L92 54 L108 56" stroke={T} strokeWidth={4} strokeLinecap="round" fill="none" />
      <path d="M22 30 a8 8 0 1 1 8 8 a5 5 0 1 1 -4 -5" stroke={N} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <path d="M60 22 Q74 10 88 22" stroke={N} strokeWidth={3} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" />
    </>
  ),
  // Oído con gotas y zumbido
  meniere: (
    <>
      <path d="M46 14 Q74 10 76 38 Q77 54 64 58 Q58 60 58 68 Q57 76 48 74" stroke={T} strokeWidth={4} fill="#fff" strokeLinecap="round" />
      <path d="M54 30 Q64 26 66 38 Q66 46 58 46" stroke={T} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M90 22 q6 8 0 16 M98 16 q10 14 0 28 M106 10 q14 20 0 40" stroke={N} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <path d="M22 40 q5 -9 10 0 a5 5 0 1 1 -10 0z M30 58 q4 -7 8 0 a4 4 0 1 1 -8 0z" fill={V} />
    </>
  ),
  // Cabeza que recibe señal fuerte de un oído y débil del otro
  neuritis: (
    <>
      <circle cx={60} cy={42} r={22} fill="#fff" stroke={T} strokeWidth={3.5} />
      <circle cx={53} cy={38} r={2.6} fill={T} /><circle cx={67} cy={38} r={2.6} fill={T} />
      <path d="M53 50 Q60 54 67 50" stroke={T} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <path d="M30 30 q-8 12 0 24 M22 24 q-12 18 0 36" stroke={V} strokeWidth={3} fill="none" strokeLinecap="round" />
      <path d="M90 38 q3 4 0 8" stroke={N} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeDasharray="2 3" />
      <path d="M44 10 Q60 0 76 10" stroke={N} strokeWidth={3} fill="none" strokeLinecap="round" markerStart="url(#fig-flecha)" markerEnd="url(#fig-flecha)" />
    </>
  ),
  // Acostado con las piernas en alto
  desmayo: (
    <>
      <path d="M8 64 L112 64" stroke={G} strokeWidth={7} strokeLinecap="round" />
      <circle cx={22} cy={50} r={9} fill="#fff" stroke={T} strokeWidth={3} />
      <path d="M32 54 L70 56 L86 34 L104 30" stroke={T} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M96 22 L96 8" stroke={N} strokeWidth={3} strokeLinecap="round" markerEnd="url(#fig-flecha)" />
      <path d="M40 30 q4 -6 8 0 a4 4 0 1 1 -8 0z" fill={V} />
    </>
  ),
  // De pie, con el movimiento del alrededor
  mppp: (
    <>
      <circle cx={60} cy={16} r={8} fill="#fff" stroke={T} strokeWidth={3} />
      <path d="M60 24 L60 50 M60 32 L48 44 M60 32 L72 44 M60 50 L54 74 M60 50 L66 74" stroke={T} strokeWidth={4} strokeLinecap="round" fill="none" />
      <path d="M22 26 q-8 14 0 28 M98 26 q8 14 0 28 M14 20 q-12 20 0 40 M106 20 q12 20 0 40" stroke={N} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <path d="M36 76 L84 76" stroke={V} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  // Mirar el horizonte desde el vehículo
  cinetosis: (
    <>
      <path d="M4 30 L116 30" stroke={V} strokeWidth={2} strokeDasharray="5 4" />
      <path d="M14 58 L18 44 Q22 38 32 38 L70 38 Q78 38 84 46 L100 48 Q106 50 106 56 L106 62 L14 62 Z" fill="#fff" stroke={T} strokeWidth={3} strokeLinejoin="round" />
      <path d="M34 40 L38 30 L64 30 L70 40" stroke={T} strokeWidth={2.4} fill="#e6f2f0" />
      <circle cx={32} cy={64} r={7} fill={T} /><circle cx={88} cy={64} r={7} fill={T} />
      <path d="M50 22 Q56 16 62 22 Q56 28 50 22 z" fill="#fff" stroke={T} strokeWidth={2} /><circle cx={56} cy={22} r={2} fill={T} />
    </>
  ),
  // Espalda baja de lado, con la zona del dolor
  lumbalgia: (
    <>
      <circle cx={62} cy={12} r={8} fill="#fff" stroke={T} strokeWidth={3} />
      <circle cx={56} cy={48} r={11} fill={N} opacity={0.3} />
      <path d="M62 20 Q52 44 58 58 L54 76 M58 58 L66 76 M60 28 L74 42" stroke={T} strokeWidth={4} strokeLinecap="round" fill="none" />
      <path d="M86 70 L86 40 M80 70 L112 70 M106 70 L106 50" stroke={G} strokeWidth={3.4} strokeLinecap="round" />
      <rect x={90} y={50} width={20} height={14} rx={2} fill="#e6f2f0" stroke={V} strokeWidth={2.4} />
    </>
  ),
  // Cuello y hombros, con la zona del dolor
  cuello: (
    <>
      <ellipse cx={60} cy={50} rx={16} ry={9} fill={N} opacity={0.3} />
      <path d="M26 78 Q28 56 60 52 Q92 56 94 78 Z" fill="#cfe5e1" stroke={T} strokeWidth={3} strokeLinejoin="round" />
      <path d="M60 52 L60 40" stroke={T} strokeWidth={4} strokeLinecap="round" />
      <circle cx={60} cy={24} r={15} fill="#fff" stroke={T} strokeWidth={3} />
      <path d="M96 20 L112 20 L112 40 L96 40 Z" fill="#e6f2f0" stroke={V} strokeWidth={2.4} />
    </>
  ),
  // Piernas con la vena y la sangre que sube
  venas: (
    <>
      <rect x={36} y={4} width={16} height={72} rx={8} fill="#cfe5e1" stroke={T} strokeWidth={3} />
      <rect x={62} y={4} width={16} height={72} rx={8} fill="#cfe5e1" stroke={T} strokeWidth={3} />
      <path d="M44 14 q5 7 0 14 q-5 7 0 14 q5 7 0 14" stroke={V} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <path d="M96 70 L96 16" stroke={N} strokeWidth={3} strokeLinecap="round" markerEnd="url(#fig-flecha)" />
      <circle cx={86} cy={66} r={3} fill={N} /><circle cx={86} cy={46} r={3} fill={N} /><circle cx={86} cy={26} r={3} fill={N} />
    </>
  ),
  // Espalda vista de atrás con la columna curva
  escoliosis: (
    <>
      <rect x={36} y={8} width={48} height={68} rx={18} fill="#cfe5e1" stroke={T} strokeWidth={3} />
      <path d="M60 12 q-12 15 0 30 q12 15 0 30" stroke={N} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeDasharray="1 6" />
      <path d="M60 12 q-12 15 0 30 q12 15 0 30" stroke={N} strokeWidth={1.6} fill="none" />
    </>
  ),
  rodilla: (
    <>
      <circle cx={60} cy={42} r={11} fill={N} opacity={0.3} />
      <path d="M40 6 L60 42 L48 76 M48 76 L66 76" stroke={T} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  hombro: (
    <>
      <path d="M22 78 Q24 46 60 42 Q96 46 98 78 Z" fill="#cfe5e1" stroke={T} strokeWidth={3} strokeLinejoin="round" />
      <path d="M60 42 L60 32" stroke={T} strokeWidth={4} strokeLinecap="round" />
      <circle cx={60} cy={18} r={13} fill="#fff" stroke={T} strokeWidth={3} />
      <circle cx={88} cy={52} r={11} fill={N} opacity={0.35} />
    </>
  ),
  muneca: (
    <>
      <circle cx={70} cy={46} r={10} fill={N} opacity={0.3} />
      <path d="M8 50 L70 46" stroke={T} strokeWidth={9} strokeLinecap="round" />
      <rect x={72} y={34} width={24} height={24} rx={8} fill="#fff" stroke={T} strokeWidth={3} />
      <path d="M96 38 L112 34 M96 44 L114 44 M96 50 L112 54 M80 34 L86 22" stroke={T} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  codo: (
    <>
      <circle cx={52} cy={58} r={11} fill={N} opacity={0.3} />
      <path d="M20 14 L52 58 L104 40" stroke={T} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  pie: (
    <>
      <path d="M20 66 Q18 50 34 48 L72 40 Q96 36 108 52 Q112 66 96 68 Z" fill="#fff" stroke={T} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={32} cy={60} r={10} fill={N} opacity={0.35} />
      <path d="M10 74 L114 74" stroke={G} strokeWidth={3} strokeLinecap="round" />
    </>
  ),
  hernias: (
    <>
      <path d="M30 6 Q24 40 34 76 L86 76 Q96 40 90 6" fill="#cfe5e1" stroke={T} strokeWidth={3} />
      <circle cx={60} cy={36} r={3} fill={T} />
      <circle cx={60} cy={36} r={10} fill={N} opacity={0.3} />
      <circle cx={42} cy={64} r={8} fill={N} opacity={0.3} />
    </>
  ),
  // Salud mental: cabeza con rayo (estrés), corazón agitado (ansiedad), luna y cama (sueño)
  estres: (
    <>
      <circle cx={52} cy={40} r={26} fill="#fff" stroke={T} strokeWidth={3} />
      <path d="M44 36 L50 36 M56 36 L62 36 M46 50 Q53 46 60 50" stroke={T} strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <path d="M92 6 L80 30 L92 30 L82 54" stroke={N} strokeWidth={4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M22 18 q-6 -6 0 -12 M84 66 q6 6 0 12" stroke={N} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </>
  ),
  ansiedad: (
    <>
      <path d="M60 70 C20 46 22 14 44 14 C54 14 60 22 60 28 C60 22 66 14 76 14 C98 14 100 46 60 70 Z" fill="#fdd9bd" stroke={T} strokeWidth={3} strokeLinejoin="round" />
      <path d="M30 40 L46 40 L52 28 L60 52 L66 40 L90 40" stroke={N} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M104 26 q6 8 0 16 M112 20 q10 14 0 28" stroke={V} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </>
  ),
  sueno: (
    <>
      <path d="M40 10 a18 18 0 1 0 18 26 a14 14 0 1 1 -18 -26z" fill={N} opacity={0.85} />
      <text x={70} y={26} fontSize={16} fontWeight={800} fill={V}>z z</text>
      <path d="M14 66 L108 66 M18 66 L18 78 M104 66 L104 78 M18 54 L18 66" stroke={G} strokeWidth={4} strokeLinecap="round" />
      <rect x={22} y={50} width={18} height={10} rx={4} fill="#e6f2f0" stroke={V} strokeWidth={2} />
      <path d="M40 58 L100 58" stroke={T} strokeWidth={8} strokeLinecap="round" />
    </>
  ),
  higiene: (<><circle cx={60} cy={40} r={28} fill="#fff" stroke={T} strokeWidth={3} /><path d="M60 22 C48 30 48 50 60 58 C72 50 72 30 60 22 Z" fill={V} opacity={0.7} /><path d="M100 14 L106 22 M110 34 L118 34 M100 54 L106 46" stroke={N} strokeWidth={3} strokeLinecap="round" /></>),
  meditacion: (<><circle cx={60} cy={18} r={10} fill="#fff" stroke={T} strokeWidth={3} /><path d="M60 28 L60 52 M60 36 L40 52 L56 58 M60 36 L80 52 L64 58 M28 68 Q60 52 92 68" stroke={T} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx={60} cy={34} r={30} fill="none" stroke={N} strokeWidth={2} strokeDasharray="3 5" /></>),
  sobrecarga: (<><rect x={36} y={52} width={48} height={14} rx={2} fill="#e6f2f0" stroke={V} strokeWidth={2} /><rect x={40} y={38} width={44} height={14} rx={2} fill="#e6f2f0" stroke={V} strokeWidth={2} /><rect x={34} y={24} width={46} height={14} rx={2} fill="#e6f2f0" stroke={V} strokeWidth={2} /><rect x={42} y={10} width={40} height={14} rx={2} fill="#fdd9bd" stroke={N} strokeWidth={2} /><path d="M20 70 L100 70" stroke={T} strokeWidth={4} strokeLinecap="round" /><path d="M96 14 L104 6 M100 26 L110 24" stroke={N} strokeWidth={3} strokeLinecap="round" /></>),
  acoso: (<><path d="M60 8 L94 20 L94 44 Q94 66 60 76 Q26 66 26 44 L26 20 Z" fill="#e6f2f0" stroke={V} strokeWidth={3} strokeLinejoin="round" /><path d="M46 42 L56 52 L76 32" stroke={V} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></>),
  emocional: (<><circle cx={42} cy={40} r={22} fill="#fff" stroke={T} strokeWidth={3} /><circle cx={35} cy={36} r={2.5} fill={T} /><circle cx={49} cy={36} r={2.5} fill={T} /><path d="M34 48 Q42 54 50 48" stroke={T} strokeWidth={2.6} fill="none" strokeLinecap="round" /><path d="M76 20 L108 20 Q112 20 112 24 L112 40 Q112 44 108 44 L88 44 L80 52 L82 44 L76 44 Q72 44 72 40 L72 24 Q72 20 76 20 Z" fill="#fff" stroke={V} strokeWidth={2.5} /><path d="M84 32 C80 26 92 24 92 32 C92 24 104 26 100 32 L92 40 Z" fill={N} /></>),
  gerentes: (<><circle cx={60} cy={20} r={10} fill="#fff" stroke={T} strokeWidth={3} /><path d="M44 50 Q44 34 60 32 Q76 34 76 50 Z" fill="#cfe5e1" stroke={T} strokeWidth={3} /><circle cx={24} cy={46} r={8} fill="#fff" stroke={T} strokeWidth={2.5} /><circle cx={96} cy={46} r={8} fill="#fff" stroke={T} strokeWidth={2.5} /><path d="M12 72 Q12 58 24 56 Q36 58 36 72 M84 72 Q84 58 96 56 Q108 58 108 72" stroke={T} strokeWidth={2.5} fill="#e6f2f0" /></>),
  animo: (<><path d="M30 64 Q30 44 50 40 Q54 22 74 24 Q94 24 96 44 Q110 46 108 62 Z" fill="#e6f2f0" stroke={G} strokeWidth={3} /><circle cx={92} cy={22} r={12} fill={N} /><path d="M92 4 L92 0 M108 12 L112 8 M110 26 L116 26" stroke={N} strokeWidth={3} strokeLinecap="round" /></>),
  // Escalera con señal de alto y volante
  "vertigo-trabajo": (
    <>
      <path d="M20 76 L34 6 M44 76 L58 6 M23 62 L47 62 M26 48 L50 48 M29 34 L53 34 M32 20 L56 20" stroke={T} strokeWidth={3.2} strokeLinecap="round" />
      <circle cx={52} cy={26} r={13} fill="#fff" stroke="#b42318" strokeWidth={3.5} /><path d="M43 35 L61 17" stroke="#b42318" strokeWidth={3.5} />
      <circle cx={92} cy={50} r={20} fill="none" stroke={T} strokeWidth={4} /><circle cx={92} cy={50} r={5} fill={T} />
      <path d="M72 50 L87 50 M97 50 L112 50 M92 55 L92 70" stroke={T} strokeWidth={3.5} />
    </>
  ),
};

export function FiguraTema({ clave }: { clave: string }) {
  const f = TEMAS_FIG[clave];
  if (!f) return null;
  return (
    <span className="flex h-[17mm] w-[26mm] shrink-0 items-center justify-center rounded-lg bg-white/80">
      <svg viewBox="0 0 120 80" className="h-[15mm] w-auto overflow-visible" aria-hidden>{f}</svg>
    </span>
  );
}

// ── Dolor y articulaciones (tanda 2): ejercicios 200 × 120 y comparaciones «así sí / así no» 160 × 110 ──
const L = ({ d }: { d: string }) => <path d={d} stroke={T} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
const Cab = ({ x, y, r = 11 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} fill="#fff" stroke={T} strokeWidth={4} />;
const F = ({ d, doble }: { d: string; doble?: boolean }) => (
  <path d={d} stroke={N} strokeWidth={4.5} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" markerStart={doble ? "url(#fig-flecha)" : undefined} />
);
const Colchoneta = () => <rect x={8} y={102} width={184} height={8} rx={4} fill={G} />;
const Piso = ({ x1 = 20, x2 = 180, y = 114 }: { x1?: number; x2?: number; y?: number }) => <path d={`M${x1} ${y} L${x2} ${y}`} stroke={G} strokeWidth={4} strokeLinecap="round" />;
const Rotulo = ({ x, y, t }: { x: number; y: number; t: string }) => <text x={x} y={y} fontSize={17} fontWeight={800} fill={N}>{t}</text>;
// Torso relleno de frente (cuello y hombros), para los ejercicios de cuello
const Torso = ({ y = 82 }: { y?: number }) => <path d={`M44 120 Q44 ${y + 4} 100 ${y} Q156 ${y + 4} 156 120 Z`} fill="#cfe5e1" stroke={T} strokeWidth={4} strokeLinejoin="round" />;
const SillaG = () => <path d="M34 22 L34 72 M34 72 L84 72 M38 72 L38 114 M80 72 L80 114" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" />;

const DOLOR: Record<string, React.ReactNode> = {
  // Lumbalgia
  "basculacion": (<><Colchoneta /><Cab x={30} y={88} /><L d="M42 92 L110 94 L138 62 L164 100" /><L d="M52 95 L92 98" /><F d="M84 62 L84 84" /><Rotulo x={96} y={52} t="5 s" /></>),
  "rodillas-pecho": (<><Colchoneta /><Cab x={30} y={88} /><L d="M42 92 L108 94 L86 58 L118 50" /><L d="M56 93 L84 64" /><F d="M150 74 Q146 42 116 36" /></>),
  "gato-camello": (<><Colchoneta /><Cab x={32} y={62} r={10} /><L d="M42 66 L58 68 Q98 28 138 68 L140 100 L178 100" /><L d="M60 68 L58 100" /><F d="M98 6 L98 32" doble /></>),
  "puente": (<><Colchoneta /><Cab x={24} y={92} r={10} /><L d="M36 96 L104 66 L140 62 L150 100" /><L d="M46 98 L90 99" /><F d="M104 98 L104 78" /></>),
  "brazo-pierna": (<><Colchoneta /><Cab x={36} y={74} r={10} /><L d="M46 70 L58 64 L130 64 L128 100 L160 100" /><L d="M58 64 L60 100" /><L d="M58 64 L14 46" /><L d="M130 64 L192 56" /><F d="M42 38 L16 28" /><F d="M156 44 L190 40" /></>),
  "extension-pie": (<><Piso x1={60} x2={150} /><Cab x={84} y={22} /><L d="M88 33 L100 72 L96 112 M100 72 L108 112" /><L d="M91 42 L114 54 L101 70" /><F d="M118 12 Q98 -4 70 8" /></>),
  // Cuello
  "retraer-menton": (<><Torso /><circle cx={118} cy={48} r={26} fill="none" stroke={G} strokeWidth={3} strokeDasharray="6 5" /><L d="M98 74 L96 84" /><Cab x={100} y={48} r={26} /><path d="M125 44 L133 55 L124 57" stroke={T} strokeWidth={3} fill="none" strokeLinejoin="round" /><circle cx={113} cy={42} r={3} fill={T} /><F d="M176 62 L148 62" /></>),
  "estirar-lado": (<><Torso /><L d="M100 82 L114 66" /><Cab x={124} y={48} r={22} /><circle cx={118} cy={46} r={2.6} fill={T} /><circle cx={132} cy={50} r={2.6} fill={T} /><F d="M82 34 Q94 8 126 10" /><F d="M30 78 L30 108" /></>),
  "girar-cabeza": (<><Torso /><L d="M100 82 L100 70" /><Cab x={100} y={48} r={24} /><circle cx={102} cy={44} r={3} fill={T} /><circle cx={116} cy={44} r={3} fill={T} /><Mira d="M124 44 L182 40" /><F d="M60 18 Q100 -4 140 18" doble /></>),
  "omoplatos": (<><Cab x={100} y={24} r={15} /><L d="M100 39 L100 116 M64 58 L136 58 M64 58 L46 90 L40 56 M136 58 L154 90 L160 56" /><F d="M70 84 L92 84" /><F d="M130 84 L108 84" /></>),
  "isometrico": (<><path d="M76 120 Q80 96 112 96 Q142 96 148 120 Z" fill="#cfe5e1" stroke={T} strokeWidth={4} strokeLinejoin="round" /><L d="M112 76 L114 96" /><Cab x={112} y={50} r={26} /><path d="M87 46 L79 56 L88 58" stroke={T} strokeWidth={3} fill="none" strokeLinejoin="round" /><circle cx={98} cy={42} r={3} fill={T} /><L d="M74 50 L56 86 L90 104" /><rect x={68} y={24} width={14} height={30} rx={6} fill="#fff" stroke={T} strokeWidth={3.5} /><F d="M24 38 L58 38" /><F d="M170 38 L142 38" /></>),
  "hombros-atras": (<><Torso y={76} /><L d="M100 76 L100 62" /><Cab x={100} y={40} r={20} /><circle cx={93} cy={38} r={2.6} fill={T} /><circle cx={107} cy={38} r={2.6} fill={T} /><path d="M30 64 a15 15 0 1 1 16 16" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /><path d="M170 64 a15 15 0 1 0 -16 16" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /></>),
  // Piernas
  "puntas-pie": (<><Piso /><path d="M44 36 L44 114 M44 36 L66 36" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><Cab x={106} y={18} /><L d="M106 29 L106 72 M106 72 L102 100 L114 110 M106 72 L110 100 L122 110" /><L d="M106 40 L80 52 L64 38" /><F d="M146 104 L146 74" /></>),
  "talon-punta": (<><SillaG /><Cab x={58} y={16} /><L d="M58 27 L60 68 L112 70 L114 104 L134 98" /><L d="M59 38 L84 56" /><F d="M150 112 Q164 96 146 82" doble /></>),
  "circulos-tobillo": (<><SillaG /><Cab x={58} y={16} /><L d="M58 27 L60 68 L112 70 L156 86 L162 74" /><L d="M59 38 L84 56" /><path d="M182 84 a13 13 0 1 1 -10 -16" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /></>),
  "marcha": (<><Piso x1={50} x2={160} /><Cab x={100} y={16} /><L d="M100 27 L100 68 L98 112 M100 68 L128 70 L126 102" /><L d="M100 38 L84 58 M100 38 L118 54" /><F d="M150 98 L150 66" /></>),
  "piernas-arriba": (<><Colchoneta /><rect x={136} y={68} width={54} height={34} rx={12} fill="#e6f2f0" stroke={G} strokeWidth={3} /><Cab x={28} y={86} /><L d="M40 90 L100 92 L138 64 L188 58" /><L d="M50 92 L88 96" /><F d="M168 50 L168 24" /><Rotulo x={40} y={46} t="15–20 min" /></>),
  "bicicleta": (<><Colchoneta /><Cab x={30} y={86} /><L d="M42 90 L104 92 L126 54 L154 62 M104 92 L140 70 L150 40" /><path d="M178 50 a16 16 0 1 1 -16 -16" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /></>),
  // Rodilla
  "cuadriceps-isometrico": (<><Colchoneta /><ellipse cx={142} cy={97} rx={10} ry={5} fill="#e6f2f0" stroke={V} strokeWidth={2.5} /><Cab x={30} y={86} /><L d="M42 90 L104 92 L182 92" /><L d="M52 92 L90 96" /><F d="M142 60 L142 82" /><Rotulo x={152} y={62} t="5 s" /></>),
  "elevar-pierna": (<><Colchoneta /><Cab x={30} y={86} /><L d="M42 90 L104 92 L130 62 L150 100 M104 92 L176 68" /><L d="M52 92 L90 96" /><F d="M192 92 L192 64" /></>),
  "extension-sentado": (<><SillaG /><Cab x={58} y={16} /><L d="M58 27 L60 68 L112 70 L162 68 L166 56" /><L d="M59 38 L84 56" /><F d="M150 108 Q172 100 172 76" /><Rotulo x={128} y={46} t="5 s" /></>),
  "escalon": (<><Piso /><rect x={112} y={84} width={62} height={30} rx={3} fill={G} /><Cab x={98} y={16} /><L d="M98 27 L98 66 L124 70 L128 84 M98 66 L90 112" /><L d="M98 38 L82 58 M98 38 L114 54" /><F d="M188 76 L188 48" /></>),
  "bicicleta-fija": (<><path d="M50 114 L170 114 M88 114 L96 70 M84 68 L108 68 M146 114 L138 44 M128 42 L148 42" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><circle cx={118} cy={96} r={11} fill="none" stroke={G} strokeWidth={4} /><Cab x={104} y={18} /><L d="M102 29 L96 66 L122 82 L112 104 M96 66 L114 78 L126 94" /><L d="M101 38 L134 44" /><path d="M136 104 a20 20 0 1 1 -2 -18" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /><Rotulo x={8} y={30} t="20–30 min" /></>),
  // Hombro
  "pendulo": (<><path d="M124 62 L188 62 M180 62 L180 114" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><Cab x={116} y={42} r={10} /><L d="M60 70 L104 50 M60 70 L54 112 M60 70 L70 112" /><L d="M104 50 L134 60" /><L d="M100 52 L98 94" /><path d="M82 104 a16 6 0 1 0 32 0" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /></>),
  "pared-dedos": (<><path d="M152 4 L152 116" stroke={G} strokeWidth={6} strokeLinecap="round" /><Piso x1={60} x2={150} /><Cab x={110} y={30} /><L d="M110 41 L110 80 L106 114 M110 80 L116 114" /><L d="M112 48 L136 30 L146 10" /><circle cx={146} cy={46} r={3} fill={N} /><circle cx={146} cy={32} r={3} fill={N} /><circle cx={146} cy={18} r={3} fill={N} /><F d="M172 70 L172 22" /></>),
  "rotacion-externa": (<><Piso x1={60} x2={150} /><Cab x={100} y={18} /><L d="M100 30 L100 76 L94 114 M100 76 L106 114" /><L d="M100 40 L84 62 L82 86" /><L d="M100 40 L114 66 L156 62" /><path d="M128 92 Q160 92 168 72" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /></>),
  "brazo-cruzado-g": (<><Torso /><L d="M100 82 L100 68" /><Cab x={100} y={46} r={22} /><circle cx={93} cy={44} r={2.6} fill={T} /><circle cx={107} cy={44} r={2.6} fill={T} /><L d="M150 96 L62 90" /><L d="M50 112 L66 94" /><F d="M184 92 L160 92" /></>),
  "baston": (<><Piso x1={60} x2={150} /><path d="M60 22 L140 22" stroke={V} strokeWidth={5} strokeLinecap="round" /><Cab x={100} y={44} r={10} /><L d="M100 55 L100 90 L94 114 M100 90 L106 114 M100 62 L74 22 M100 62 L126 22" /><F d="M166 72 L166 30" /></>),
  // Muñeca, codo y pie
  "mano-abrir": (<><rect x={40} y={44} width={40} height={38} rx={13} fill="#fff" stroke={T} strokeWidth={4} /><path d="M46 56 L74 56 M46 66 L74 66" stroke={T} strokeWidth={2.4} /><L d="M60 82 L60 114" /><rect x={120} y={56} width={34} height={30} rx={9} fill="#fff" stroke={T} strokeWidth={4} /><L d="M126 56 L122 24 M135 56 L135 18 M144 56 L148 20 M152 60 L162 30 M120 72 L102 56 M137 86 L137 114" /><F d="M86 66 L110 66" doble /></>),
  "estirar-flexores": (<><Cab x={36} y={28} /><L d="M36 39 L36 114" /><L d="M40 50 L128 56 L134 22" /><L d="M40 60 L98 72 L132 30" /><F d="M164 26 L144 26" /></>),
  "estirar-extensores": (<><Cab x={36} y={28} /><L d="M36 39 L36 114" /><L d="M40 50 L128 54 L134 90" /><L d="M40 62 L100 78 L132 92" /><F d="M164 96 L144 96" /></>),
  "peso-muneca": (<><path d="M20 72 L124 72 M116 72 L116 114" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><L d="M30 64 L112 64 L136 72" /><rect x={132} y={66} width={13} height={30} rx={4} fill="#e6f2f0" stroke={V} strokeWidth={3} /><F d="M166 52 L166 98" doble /></>),
  "apretar-pelota": (<><circle cx={104} cy={60} r={22} fill="#fdd9bd" stroke={N} strokeWidth={3} /><path d="M84 44 Q104 30 124 44 M82 56 Q104 44 126 56 M84 68 Q104 58 124 68" stroke={T} strokeWidth={4} fill="none" strokeLinecap="round" /><L d="M104 82 L104 116" /><F d="M50 60 L74 60" /><F d="M158 60 L134 60" /><Rotulo x={146} y={104} t="5 s" /></>),
  "estirar-pantorrilla": (<><path d="M172 4 L172 116" stroke={G} strokeWidth={6} strokeLinecap="round" /><Piso x1={30} x2={170} /><circle cx={84} cy={98} r={10} fill={N} opacity={0.3} /><Cab x={134} y={24} /><L d="M130 35 L112 76 L132 92 L134 112 M112 76 L68 110 L58 112" /><L d="M128 44 L168 40" /></>),
  "estirar-fascia": (<><SillaG /><Cab x={58} y={16} /><L d="M58 27 L60 68 L112 70 L160 76 L166 58" /><L d="M59 38 L92 50" /><path d="M92 50 L168 56" stroke={V} strokeWidth={3} strokeLinecap="round" /><F d="M186 72 Q188 50 172 44" /></>),
  "rodar-botella": (<><SillaG /><Piso x1={100} x2={180} /><rect x={114} y={100} width={40} height={13} rx={6.5} fill="#e6f2f0" stroke={V} strokeWidth={3} /><Cab x={58} y={16} /><L d="M58 27 L60 68 L112 70 L120 96 L146 98" /><L d="M59 38 L84 56" /><F d="M116 84 L158 84" doble /></>),
  // Hernias
  "exhalar-fuerza": (<><Piso /><rect x={108} y={82} width={34} height={32} rx={3} fill="#e6f2f0" stroke={V} strokeWidth={3} /><Cab x={78} y={22} /><L d="M76 33 L66 78 L104 80 L96 112 L110 112" /><L d="M72 44 L100 68 L112 84" /><path d="M94 16 q8 -5 16 0 M96 26 q10 -5 22 0" stroke={N} strokeWidth={3} fill="none" strokeLinecap="round" /><Rotulo x={126} y={30} t="sople" /></>),
  "levantarse-de-lado": (<><path d="M14 74 L186 74 M18 80 L18 114 M182 80 L182 114" stroke={G} strokeWidth={7} strokeLinecap="round" fill="none" /><Cab x={40} y={58} r={10} /><L d="M50 62 L110 64 L136 48 L160 64" /><L d="M66 64 L80 46 L92 60" /><F d="M150 32 Q118 6 76 22" /></>),
  "caminar": (<><Piso x1={50} x2={190} /><Cab x={100} y={16} /><L d="M100 27 L100 66 L84 112 M100 66 L118 110" /><L d="M100 38 L84 58 M100 38 L118 56" /><F d="M140 92 L184 92" /><Rotulo x={130} y={40} t="30 min" /></>),
  // Salud mental: herramientas (iconos grandes, 200 × 120)
  "respiracion-46": (<><path d="M14 96 L186 96" stroke={G} strokeWidth={3} /><path d="M20 92 Q50 20 76 24 Q120 30 180 92" stroke={V} strokeWidth={5} fill="none" strokeLinecap="round" /><text x={30} y={18} fontSize={17} fontWeight={800} fill={N}>inhale 4</text><text x={112} y={34} fontSize={17} fontWeight={800} fill={V}>exhale 6</text><F d="M30 72 L52 40" /><F d="M118 52 L160 84" /><text x={48} y={117} fontSize={16} fontWeight={800} fill={T}>3 a 5 minutos</text></>),
  "tres-prioridades": (<><rect x={50} y={8} width={100} height={106} rx={8} fill="#fff" stroke={T} strokeWidth={4} />{[34, 62, 90].map((y, i) => (<g key={y}><circle cx={70} cy={y} r={12} fill={i === 0 ? N : "#e6f2f0"} stroke={V} strokeWidth={2} /><text x={70} y={y + 6} textAnchor="middle" fontSize={16} fontWeight={800} fill={i === 0 ? "#fff" : V}>{i + 1}</text><path d={`M88 ${y} L136 ${y}`} stroke={T} strokeWidth={4} strokeLinecap="round" /></g>))}</>),
  "cambiar-o-no": (<><rect x={2} y={16} width={96} height={88} rx={12} fill="#e6f2f0" stroke={V} strokeWidth={3} /><text x={50} y={56} textAnchor="middle" fontSize={17} fontWeight={800} fill={V}>Puedo</text><text x={50} y={78} textAnchor="middle" fontSize={17} fontWeight={800} fill={V}>cambiarlo</text><rect x={102} y={16} width={96} height={88} rx={12} fill="#fff" stroke={G} strokeWidth={3} strokeDasharray="6 5" /><text x={150} y={56} textAnchor="middle" fontSize={16} fontWeight={800} fill={T}>No depende</text><text x={150} y={78} textAnchor="middle" fontSize={16} fontWeight={800} fill={T}>de mí</text><F d="M50 120 L50 110" /></>),
  "hablar": (<><Cab x={56} y={70} r={16} /><Cab x={146} y={70} r={16} /><path d="M40 112 Q40 92 56 90 Q72 92 72 112 M130 112 Q130 92 146 90 Q162 92 162 112" stroke={T} strokeWidth={4} fill="#cfe5e1" /><path d="M66 12 L120 12 Q128 12 128 20 L128 36 Q128 44 120 44 L84 44 L74 54 L76 44 L66 44 Q58 44 58 36 L58 20 Q58 12 66 12 Z" fill="#fff" stroke={V} strokeWidth={3} /><path d="M70 24 L116 24 M70 33 L104 33" stroke={V} strokeWidth={3} strokeLinecap="round" /></>),
  "desconectar": (<><rect x={64} y={10} width={56} height={100} rx={10} fill="#fff" stroke={T} strokeWidth={4} /><path d="M80 52 Q80 38 92 38 Q104 38 104 52 L104 64 L108 70 L76 70 L80 64 Z" fill="#e6f2f0" stroke={V} strokeWidth={3} /><path d="M72 30 L112 80" stroke="#b42318" strokeWidth={5} strokeLinecap="round" /><path d="M160 30 a20 20 0 1 0 20 28 a15 15 0 1 1 -20 -28z" fill={N} opacity={0.8} /></>),
  "cinco-sentidos": (<>{[["5", "ve", 18], ["4", "toca", 59], ["3", "oye", 100], ["2", "huele", 141], ["1", "sabe", 182]].map(([n, t, x], i) => (<g key={String(n)}><circle cx={Number(x)} cy={44} r={17} fill={n === "5" ? N : "#e6f2f0"} stroke={V} strokeWidth={2.5} /><text x={Number(x)} y={51} textAnchor="middle" fontSize={20} fontWeight={800} fill={n === "5" ? "#fff" : V}>{n}</text><text x={Number(x)} y={i % 2 ? 108 : 86} textAnchor="middle" fontSize={16} fontWeight={800} fill={T}>{t}</text></g>))}</>),
  "escribir-preocupacion": (<><rect x={20} y={10} width={160} height={102} rx={8} fill="#fff" stroke={T} strokeWidth={4} /><path d="M100 18 L100 104" stroke={G} strokeWidth={3} /><text x={60} y={34} textAnchor="middle" fontSize={17} fontWeight={800} fill={T}>Preocupa</text><text x={140} y={34} textAnchor="middle" fontSize={17} fontWeight={800} fill={V}>Mi paso</text>{[52, 72, 92].map((y) => (<g key={y}><path d={`M32 ${y} L88 ${y}`} stroke={T} strokeWidth={3} strokeLinecap="round" /><path d={`M112 ${y} L168 ${y}`} stroke={V} strokeWidth={3} strokeLinecap="round" /></g>))}</>),
  "sin-cafe": (<><path d="M40 40 L92 40 L86 100 L46 100 Z" fill="#fff" stroke={T} strokeWidth={4} strokeLinejoin="round" /><path d="M92 54 q16 0 14 16 q-2 12 -16 12" stroke={T} strokeWidth={4} fill="none" /><path d="M54 30 q-6 -8 0 -16 M70 30 q-6 -8 0 -16" stroke={G} strokeWidth={3} fill="none" /><path d="M30 26 L104 108" stroke="#b42318" strokeWidth={5} strokeLinecap="round" /><path d="M134 34 L176 34 L170 106 L140 106 Z" fill="#e6f2f0" stroke={V} strokeWidth={4} strokeLinejoin="round" /><path d="M137 60 L173 60" stroke={V} strokeWidth={2} /></>),
  "reloj-fijo": (<><circle cx={62} cy={58} r={42} fill="#fff" stroke={T} strokeWidth={4} /><path d="M62 58 L62 30 M62 58 L82 68" stroke={T} strokeWidth={4} strokeLinecap="round" /><circle cx={62} cy={58} r={3.5} fill={T} /><path d="M120 92 L190 92 M124 92 L124 110 M186 92 L186 110 M124 78 L124 92" stroke={G} strokeWidth={5} strokeLinecap="round" /><rect x={128} y={72} width={18} height={12} rx={5} fill="#e6f2f0" stroke={V} strokeWidth={2} /><path d="M146 82 L184 82" stroke={T} strokeWidth={8} strokeLinecap="round" /><text x={122} y={36} fontSize={17} fontWeight={800} fill={N}>siempre</text><text x={122} y={56} fontSize={17} fontWeight={800} fill={N}>igual</text></>),
  "pantallas-fuera": (<><rect x={36} y={14} width={50} height={92} rx={9} fill="#fff" stroke={T} strokeWidth={4} /><path d="M30 20 L92 100" stroke="#b42318" strokeWidth={5} strokeLinecap="round" /><path d="M140 28 a22 22 0 1 0 22 30 a17 17 0 1 1 -22 -30z" fill={N} opacity={0.85} /><text x={110} y={100} fontSize={16} fontWeight={800} fill={V}>1 h antes</text></>),
  "cuarto-oscuro": (<><rect x={10} y={8} width={180} height={104} rx={10} fill="#16302d" /><path d="M166 22 a14 14 0 1 0 14 20 a11 11 0 1 1 -14 -20z" fill="#f7d9a8" /><path d="M30 86 L170 86 M34 86 L34 104 M166 86 L166 104 M34 70 L34 86" stroke="#9fc3bd" strokeWidth={5} strokeLinecap="round" /><rect x={38} y={66} width={22} height={14} rx={6} fill="#cfe5e1" /><path d="M60 78 L162 78" stroke="#cfe5e1" strokeWidth={10} strokeLinecap="round" /><text x={20} y={32} fontSize={16} fontWeight={800} fill="#cfe5e1">oscuro · fresco</text><text x={20} y={52} fontSize={16} fontWeight={800} fill="#cfe5e1">silencio</text></>),
  "cafe-hora": (<><path d="M24 44 L72 44 L66 100 L30 100 Z" fill="#fff" stroke={T} strokeWidth={4} strokeLinejoin="round" /><path d="M72 56 q14 0 12 14 q-2 10 -14 10" stroke={T} strokeWidth={4} fill="none" /><circle cx={140} cy={62} r={38} fill="#fff" stroke={T} strokeWidth={4} /><path d="M140 62 L140 36 M140 62 L158 74" stroke={T} strokeWidth={4} strokeLinecap="round" /><text x={110} y={118} textAnchor="middle" fontSize={16} fontWeight={800} fill={N}>hasta las 2 p. m.</text></>),
  "levantarse-20": (<><circle cx={52} cy={56} r={36} fill="#fff" stroke={T} strokeWidth={4} /><path d="M52 56 L52 26 A30 30 0 0 1 78 71 Z" fill={N} opacity={0.35} /><text x={52} y={62} textAnchor="middle" fontSize={18} fontWeight={800} fill={T}>20</text><F d="M98 60 L124 60" /><path d="M136 104 L136 60 Q136 50 146 50 L176 50 Q186 50 186 60 L186 104 M130 80 L192 80" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><path d="M160 18 L160 44 M150 18 L170 18 L166 8 L154 8 Z" stroke={T} strokeWidth={3} fill="#f7d9a8" /></>),
  "luz-manana": (<><circle cx={100} cy={64} r={24} fill={N} /><path d="M100 22 L100 8 M100 106 L100 120 M58 64 L44 64 M142 64 L156 64 M70 34 L60 24 M130 34 L140 24 M70 94 L60 104 M130 94 L140 104" stroke={N} strokeWidth={4} strokeLinecap="round" /><text x={140} y={22} fontSize={16} fontWeight={800} fill={V}>mañana</text></>),
  "musica": (<><path d="M70 92 L70 26 L140 14 L140 80" stroke={T} strokeWidth={5} fill="none" strokeLinejoin="round" /><ellipse cx={58} cy={94} rx={14} ry={10} fill={N} /><ellipse cx={128} cy={82} rx={14} ry={10} fill={N} /><path d="M70 40 L140 28" stroke={T} strokeWidth={5} /></>),
  "gratitud": (<><rect x={14} y={2} width={172} height={116} rx={8} fill="#fff" stroke={T} strokeWidth={4} /><text x={100} y={26} textAnchor="middle" fontSize={17} fontWeight={800} fill={V}>3 cosas buenas</text>{[56, 82, 108].map((y, i) => (<g key={y}><text x={28} y={y} fontSize={19} fontWeight={800} fill={N}>{i + 1}.</text><path d={`M52 ${y} L172 ${y}`} stroke={T} strokeWidth={2} strokeLinecap="round" /></g>))}</>),
  "limites-no": (<><Cab x={56} y={70} r={16} /><path d="M40 112 Q40 92 56 90 Q72 92 72 112" stroke={T} strokeWidth={4} fill="#cfe5e1" /><path d="M90 14 L170 14 Q180 14 180 24 L180 56 Q180 66 170 66 L112 66 L98 80 L100 66 L90 66 Q80 66 80 56 L80 24 Q80 14 90 14 Z" fill="#fff" stroke={V} strokeWidth={3} /><text x={130} y={47} textAnchor="middle" fontSize={20} fontWeight={800} fill={V}>No, gracias</text></>),
  "metas-escalera": (<><path d="M20 108 L60 108 L60 84 L100 84 L100 60 L140 60 L140 36 L180 36" stroke={T} strokeWidth={5} fill="none" strokeLinejoin="round" /><path d="M164 36 L164 6 M164 6 L186 13 L164 20" stroke={N} strokeWidth={4} fill={N} strokeLinejoin="round" /><circle cx={40} cy={98} r={5} fill={N} /><circle cx={80} cy={74} r={5} fill={N} /><circle cx={120} cy={50} r={5} fill={N} /></>),
  "postura-meditar": (<><SillaG /><Cab x={58} y={16} /><L d="M58 27 L58 68 L106 70 L108 112" /><L d="M58 38 L76 56 L98 64" /><path d="M120 30 q10 -10 20 0 q10 10 20 0" stroke={V} strokeWidth={3} fill="none" strokeLinecap="round" /><path d="M120 50 q10 -10 20 0 q10 10 20 0" stroke={V} strokeWidth={3} fill="none" strokeLinecap="round" /><Rotulo x={116} y={88} t="5–20 min" /></>),
  "contar-10": (<>{Array.from({ length: 10 }, (_, i) => (<g key={i}><circle cx={22 + (i % 5) * 39} cy={i < 5 ? 38 : 84} r={15} fill={i === 0 ? N : "#e6f2f0"} stroke={V} strokeWidth={2.5} /><text x={22 + (i % 5) * 39} y={(i < 5 ? 38 : 84) + 6} textAnchor="middle" fontSize={16} fontWeight={800} fill={i === 0 ? "#fff" : V}>{i + 1}</text></g>))}</>),
  "recorrido-cuerpo": (<><Cab x={100} y={16} r={11} /><L d="M100 27 L100 70 L90 112 M100 70 L110 112 M100 38 L80 66 M100 38 L120 66" /><path d="M150 108 L150 14" stroke={N} strokeWidth={4} strokeLinecap="round" markerEnd="url(#fig-flecha)" /><path d="M64 20 L136 20 M60 50 L140 50 M64 84 L136 84" stroke={N} strokeWidth={1.6} strokeDasharray="3 4" /></>),
  "volver-respiracion": (<><path d="M30 46 q-14 -2 -12 -16 q2 -14 18 -12 q6 -14 22 -8 q16 -6 22 8 q16 0 14 16 q-2 12 -16 12 l-36 0 q-12 0 -12 0z" fill="#fff" stroke={G} strokeWidth={3} /><text x={56} y={37} textAnchor="middle" fontSize={16} fontWeight={800} fill={T}>pensamiento</text><F d="M96 40 Q130 40 140 64" /><path d="M120 88 q12 -16 24 0 q12 16 24 0" stroke={V} strokeWidth={5} fill="none" strokeLinecap="round" /><text x={144} y={117} textAnchor="middle" fontSize={16} fontWeight={800} fill={V}>respiración</text></>),
  "comer-atento": (<><circle cx={84} cy={64} r={38} fill="#fff" stroke={T} strokeWidth={4} /><circle cx={84} cy={64} r={24} fill="#e6f2f0" stroke={V} strokeWidth={2} /><path d="M140 26 L140 104 M134 26 L134 44 Q134 52 140 52 Q146 52 146 44 L146 26" stroke={T} strokeWidth={3.5} fill="none" strokeLinecap="round" /><rect x={160} y={30} width={26} height={44} rx={5} fill="#fff" stroke={T} strokeWidth={3} /><path d="M156 26 L190 80" stroke="#b42318" strokeWidth={4} strokeLinecap="round" /></>),
  "calendario-checks": (<><rect x={30} y={14} width={140} height={98} rx={8} fill="#fff" stroke={T} strokeWidth={4} /><path d="M30 36 L170 36" stroke={T} strokeWidth={4} />{Array.from({ length: 14 }, (_, i) => (<path key={i} d={`M${42 + (i % 7) * 19} ${58 + Math.floor(i / 7) * 28} l5 5 l9 -11`} stroke={i < 11 ? V : G} strokeWidth={3} fill="none" strokeLinecap="round" />))}</>),
  "matriz": (<><rect x={2} y={4} width={196} height={112} rx={6} fill="#fff" stroke={T} strokeWidth={3} /><path d="M100 4 L100 116 M2 60 L198 60" stroke={T} strokeWidth={3} /><rect x={4} y={6} width={94} height={52} fill="#fdd9bd" /><text x={51} y={38} textAnchor="middle" fontSize={17} fontWeight={800} fill={T}>Hacer ya</text><text x={149} y={38} textAnchor="middle" fontSize={17} fontWeight={800} fill={T}>Planificar</text><text x={51} y={94} textAnchor="middle" fontSize={17} fontWeight={800} fill={T}>Delegar</text><text x={149} y={94} textAnchor="middle" fontSize={17} fontWeight={800} fill={T}>Esperar</text></>),
  "pausa-reloj": (<><circle cx={78} cy={60} r={40} fill="#fff" stroke={T} strokeWidth={4} /><path d="M78 60 L78 32 A28 28 0 0 1 102 46 Z" fill={N} opacity={0.4} /><path d="M78 60 L78 32 M78 60 L96 70" stroke={T} strokeWidth={4} strokeLinecap="round" /><path d="M140 40 L172 40 L168 80 L144 80 Z" fill="#fff" stroke={T} strokeWidth={3.5} strokeLinejoin="round" /><path d="M150 32 q-4 -6 0 -12 M160 32 q-4 -6 0 -12" stroke={G} strokeWidth={2.5} fill="none" /></>),
  "cerrar-jornada": (<><rect x={24} y={14} width={76} height={96} rx={6} fill="#fff" stroke={T} strokeWidth={4} /><text x={62} y={36} textAnchor="middle" fontSize={16} fontWeight={800} fill={V}>Mañana</text>{[54, 72, 90].map((y) => <path key={y} d={`M36 ${y} L88 ${y}`} stroke={T} strokeWidth={3} strokeLinecap="round" />)}<rect x={124} y={10} width={56} height={100} rx={3} fill="#e6f2f0" stroke={T} strokeWidth={4} /><circle cx={168} cy={62} r={4} fill={T} /><F d="M104 62 L120 62" /></>),
  "bateria": (<><rect x={30} y={34} width={130} height={56} rx={8} fill="#fff" stroke={T} strokeWidth={5} /><rect x={160} y={50} width={12} height={24} rx={3} fill={T} /><rect x={38} y={42} width={24} height={40} rx={3} fill="#b42318" /><text x={110} y={70} textAnchor="middle" fontSize={16} fontWeight={800} fill="#b42318">baja</text></>),
  "anotar-hechos": (<><rect x={14} y={2} width={172} height={116} rx={8} fill="#fff" stroke={T} strokeWidth={4} />{[["Fecha", 76], ["Hora", 68], ["Qué pasó", 108], ["Testigos", 108]].map(([t, x], i) => (<g key={String(t)}><text x={24} y={30 + i * 26} fontSize={17} fontWeight={800} fill={V}>{t}</text><path d={`M${x} ${30 + i * 26} L176 ${30 + i * 26}`} stroke={T} strokeWidth={2} strokeLinecap="round" /></g>))}</>),
  "denunciar": (<><rect x={46} y={8} width={92} height={106} rx={6} fill="#fff" stroke={T} strokeWidth={4} />{[30, 46, 62].map((y) => <path key={y} d={`M58 ${y} L126 ${y}`} stroke={T} strokeWidth={3} strokeLinecap="round" />)}<circle cx={112} cy={88} r={26} fill="#fff" stroke={N} strokeWidth={4} /><text x={112} y={94} textAnchor="middle" fontSize={16} fontWeight={800} fill={N}>copia</text><F d="M150 60 L186 60" /></>),
  "nombrar-emocion": (<>{[[34, "M26 64 Q34 72 42 64", "rabia"], [100, "M92 70 Q100 62 108 70", "tristeza"], [166, "M158 66 L174 66", "miedo"]].map(([x, d, t]) => (<g key={String(t)}><circle cx={Number(x)} cy={56} r={26} fill="#fff" stroke={T} strokeWidth={3.5} /><circle cx={Number(x) - 8} cy={50} r={3} fill={T} /><circle cx={Number(x) + 8} cy={50} r={3} fill={T} /><path d={String(d)} stroke={T} strokeWidth={3} fill="none" strokeLinecap="round" /><text x={Number(x)} y={106} textAnchor="middle" fontSize={16} fontWeight={800} fill={V}>{t}</text></g>))}</>),
  "escuchar": (<><path d="M70 14 Q120 10 122 56 Q123 80 102 86 Q92 90 92 102 Q91 114 76 112" stroke={T} strokeWidth={5} fill="#fff" strokeLinecap="round" /><path d="M84 42 Q100 36 104 56 Q104 68 92 68" stroke={T} strokeWidth={4} fill="none" strokeLinecap="round" /><path d="M140 40 q8 10 0 20 M152 32 q14 18 0 36 M164 24 q20 26 0 52" stroke={N} strokeWidth={3} fill="none" strokeLinecap="round" /></>),
  "yo-mensaje": (<><path d="M12 4 L188 4 Q198 4 198 14 L198 96 Q198 106 188 106 L56 106 L38 120 L42 106 L12 106 Q2 106 2 96 L2 14 Q2 4 12 4 Z" fill="#fff" stroke={V} strokeWidth={3} />{[["Yo me siento", 34, 132], ["cuando", 64, 84], ["y necesito", 94, 112]].map(([t, y, x]) => (<g key={String(t)}><text x={12} y={Number(y)} fontSize={19} fontWeight={800} fill={t === "y necesito" ? N : T}>{t}</text><path d={`M${x} ${y} L188 ${y}`} stroke={T} strokeWidth={2} strokeLinecap="round" /></g>))}</>),
  "estrella": (<><path d="M100 8 L114 44 L152 46 L122 70 L134 108 L100 86 L66 108 L78 70 L48 46 L86 44 Z" fill={N} stroke={T} strokeWidth={3} strokeLinejoin="round" /><text x={2} y={22} fontSize={17} fontWeight={800} fill={V}>¡Bien!</text></>),
  "delegar": (<><Cab x={40} y={50} r={14} /><path d="M24 100 Q24 76 40 74 Q56 76 56 100" stroke={T} strokeWidth={4} fill="#cfe5e1" /><F d="M66 48 L120 22" /><F d="M66 58 L120 58" /><F d="M66 68 L120 94" />{[22, 58, 94].map((y) => <rect key={y} x={130} y={y - 12} width={44} height={24} rx={5} fill="#e6f2f0" stroke={V} strokeWidth={2.5} />)}</>),
  "reunion-corta": (<><rect x={20} y={14} width={86} height={96} rx={6} fill="#fff" stroke={T} strokeWidth={4} /><text x={63} y={36} textAnchor="middle" fontSize={16} fontWeight={800} fill={V}>Agenda</text>{[52, 70, 88].map((y) => <path key={y} d={`M32 ${y} L94 ${y}`} stroke={T} strokeWidth={3} strokeLinecap="round" />)}<circle cx={150} cy={60} r={34} fill="#fff" stroke={T} strokeWidth={4} /><path d="M150 60 L150 36 A24 24 0 0 1 171 72 Z" fill={N} opacity={0.4} /><text x={150} y={116} textAnchor="middle" fontSize={16} fontWeight={800} fill={N}>hora de fin</text></>),
  "control-anual": (<><path d="M100 104 C40 70 40 22 72 22 C88 22 100 34 100 44 C100 34 112 22 128 22 C160 22 160 70 100 104 Z" fill="#fdd9bd" stroke={T} strokeWidth={4} strokeLinejoin="round" /><path d="M58 60 L82 60 L90 44 L102 78 L110 60 L142 60" stroke={N} strokeWidth={4} fill="none" strokeLinejoin="round" strokeLinecap="round" /><text x={2} y={16} fontSize={16} fontWeight={800} fill={V}>1 vez al año</text></>),
  "pastillero": (<><rect x={20} y={40} width={160} height={50} rx={10} fill="#fff" stroke={T} strokeWidth={4} />{Array.from({ length: 7 }, (_, i) => (<g key={i}><path d={`M${20 + (i + 1) * 22.8} 40 L${20 + (i + 1) * 22.8} 90`} stroke={T} strokeWidth={i < 6 ? 2 : 0} /><text x={31 + i * 22.8} y={32} textAnchor="middle" fontSize={16} fontWeight={800} fill={V}>{"LMMJVSD"[i]}</text><circle cx={31 + i * 22.8} cy={65} r={6} fill={i < 4 ? G : N} /></g>))}</>),
  // Así no / así sí (160 × 110)
  "brazos-arriba-mal": (<><path d="M10 4 L150 4" stroke={G} strokeWidth={4} strokeLinecap="round" /><rect x={62} y={4} width={36} height={10} fill="#e6f2f0" stroke={V} strokeWidth={2.5} /><Piso x1={10} x2={150} y={108} /><Cab x={80} y={38} r={9} /><L d="M80 47 L80 80 L74 108 M80 80 L86 108 M80 54 L70 16 M80 54 L92 16" /></>),
  "plataforma-bien": (<><path d="M10 4 L150 4" stroke={G} strokeWidth={4} strokeLinecap="round" /><rect x={100} y={4} width={36} height={10} fill="#e6f2f0" stroke={V} strokeWidth={2.5} /><Piso x1={10} x2={150} y={108} /><rect x={48} y={76} width={64} height={32} rx={3} fill={G} /><Cab x={80} y={18} r={9} /><L d="M80 27 L80 54 L74 76 M80 54 L86 76 M80 34 L104 30 L114 16" /></>),
  "muneca-mal": (<><path d="M10 100 L150 100" stroke={G} strokeWidth={4} strokeLinecap="round" /><rect x={98} y={84} width={50} height={9} rx={2} fill="#e6f2f0" stroke={V} strokeWidth={2.5} /><L d="M14 96 L80 92 L100 70 L118 82" /><circle cx={80} cy={92} r={7} fill="none" stroke="#b42318" strokeWidth={2.5} /></>),
  "muneca-bien": (<><path d="M10 100 L150 100" stroke={G} strokeWidth={4} strokeLinecap="round" /><rect x={100} y={84} width={48} height={9} rx={2} fill="#e6f2f0" stroke={V} strokeWidth={2.5} /><L d="M14 80 L92 80 L124 80 L132 84" /></>),
  "morral-mal": (<><Piso x1={10} x2={150} y={108} /><Cab x={76} y={18} r={9} /><L d="M77 27 L84 70 L76 108 M84 70 L94 108 M78 36 L70 62" /><path d="M78 32 L102 46" stroke={V} strokeWidth={3} /><rect x={96} y={44} width={20} height={28} rx={4} fill="#e6f2f0" stroke={V} strokeWidth={3} /></>),
  "morral-bien": (<><Piso x1={10} x2={150} y={108} /><rect x={54} y={30} width={22} height={34} rx={6} fill="#e6f2f0" stroke={V} strokeWidth={3} /><Cab x={82} y={18} r={9} /><L d="M80 27 L80 70 L74 108 M80 70 L86 108 M80 36 L94 58" /><path d="M78 32 L70 40" stroke={V} strokeWidth={3} /></>),
  "levantar-mal": (<><Piso x1={10} x2={150} y={108} /><rect x={108} y={82} width={32} height={26} rx={3} fill="#e6f2f0" stroke={V} strokeWidth={3} /><L d="M46 108 L54 66 L62 108" /><L d="M54 66 Q76 38 102 58" /><Cab x={110} y={66} r={9} /><L d="M100 60 L116 84" /></>),
  "levantar-bien": (<><Piso x1={10} x2={150} y={108} /><rect x={86} y={80} width={30} height={28} rx={3} fill="#e6f2f0" stroke={V} strokeWidth={3} /><Cab x={62} y={20} r={9} /><L d="M60 29 L52 72 L84 70 L78 106 L90 106" /><L d="M58 38 L82 62 L90 82" /><F d="M136 100 L136 66" /></>),
  "sentado-mal": (<><path d="M26 38 L26 80 M26 80 L68 80 M30 80 L30 108 M66 80 L66 108" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><path d="M96 74 L152 74 M146 74 L146 108" stroke={G} strokeWidth={4} strokeLinecap="round" fill="none" /><path d="M110 74 L130 72 L136 60" stroke={V} strokeWidth={3} fill="none" strokeLinecap="round" /><Cab x={80} y={40} r={9} /><L d="M42 78 Q36 52 72 46" /><L d="M42 78 L92 80 L96 106" /><L d="M64 50 L100 66" /><Mira d="M84 44 L130 66" /></>),
  "sentado-bien": (<><path d="M26 22 L26 80 M26 80 L68 80 M30 80 L30 108 M66 80 L66 108" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><rect x={27} y={58} width={6} height={14} rx={3} fill={N} /><path d="M98 72 L154 72 M148 72 L148 108 M126 72 L126 38" stroke={G} strokeWidth={4} strokeLinecap="round" fill="none" /><rect x={110} y={14} width={34} height={24} rx={3} fill="#e6f2f0" stroke={V} strokeWidth={3} /><Cab x={44} y={20} r={9} /><L d="M42 29 L38 78 L88 80 L88 104 L100 104" /><L d="M41 40 L58 60 L84 62" /><Mira d="M52 20 L110 24" /></>),
  "pantalla-mal": (<><path d="M26 38 L26 80 M26 80 L68 80 M30 80 L30 108 M66 80 L66 108" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><path d="M92 70 L154 70 M148 70 L148 108" stroke={G} strokeWidth={4} strokeLinecap="round" fill="none" /><path d="M104 68 L132 68 L140 48" stroke={V} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /><L d="M40 78 L46 42 L64 34" /><Cab x={72} y={30} r={9} /><L d="M40 78 L90 80 L92 106" /><L d="M46 48 L96 62" /><Mira d="M78 34 L134 56" /></>),
  "celular-mal": (<><path d="M40 110 Q40 70 64 62 Q84 62 88 110 Z" fill="#cfe5e1" stroke={T} strokeWidth={4} strokeLinejoin="round" /><L d="M68 64 L84 46" /><Cab x={92} y={38} r={13} /><L d="M80 74 L102 88" /><rect x={100} y={78} width={9} height={16} rx={2} fill={V} /><Mira d="M100 46 L104 76" /></>),
  "celular-bien": (<><path d="M40 110 Q40 70 64 62 Q84 62 88 110 Z" fill="#cfe5e1" stroke={T} strokeWidth={4} strokeLinejoin="round" /><L d="M64 62 L66 46" /><Cab x={68} y={32} r={13} /><L d="M80 72 L112 66 L114 40" /><rect x={108} y={20} width={9} height={18} rx={2} fill={V} /><Mira d="M82 30 L106 30" /></>),
};

// Las manos sobre el teclado son bajitas: se recorta la caja para que se vean del mismo tamaño que las demás
const CAJAS_DOLOR = (nombre: string) => (nombre.startsWith("muneca-") ? "0 58 160 50" : /-(mal|bien)$/.test(nombre) ? "0 0 160 110" : "0 0 200 120");

export function FiguraDolor({ nombre, className = "" }: { nombre: string; className?: string }) {
  // Heridas, quemaduras y hábitos (tanda 5) y las guías de salud: 160 × 110; «i:…» usa un ícono de las dietas
  if (nombre.startsWith("i:") || HERIDAS[nombre] || SALUD[nombre]) return <FiguraSalud nombre={nombre} className={className} />;
  // Un tema puede usar también las figuras de equilibrio (p. ej. «sentarse-pararse» en la rodilla)
  const f = DOLOR[nombre] ?? EQUILIBRIO[nombre];
  if (!f) return null;
  return <svg viewBox={DOLOR[nombre] ? CAJAS_DOLOR(nombre) : CAJAS[nombre] ?? "0 0 200 120"} className={`overflow-visible ${className}`} aria-hidden>{f}</svg>;
}

// ── Guías de salud (tanda 4): tensión arterial y diabetes, 160 × 110 ──
const PIEL = "#f6e3d4";
const ROJO = "#c62828";
const Tachar = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <><circle cx={x} cy={y} r={r} fill="none" stroke={ROJO} strokeWidth={4} /><path d={`M${x - r * 0.7} ${y - r * 0.7} L${x + r * 0.7} ${y + r * 0.7}`} stroke={ROJO} strokeWidth={4} strokeLinecap="round" /></>
);
const SillaRespaldo = () => <path d="M24 20 L24 80 M24 80 L68 80 M28 80 L28 106 M64 80 L64 106" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" />;
const Mesa = () => <path d="M86 60 L156 60 M150 60 L150 106" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" />;
const Monitor = ({ x, y }: { x: number; y: number }) => (
  <><rect x={x} y={y} width={30} height={20} rx={3} fill="#e6f2f0" stroke={V} strokeWidth={3} /><rect x={x + 5} y={y + 4} width={20} height={8} rx={1.5} fill={V} /></>
);
// Brazo de cerca: del hombro (izquierda) al codo y el antebrazo (derecha)
const Brazo = ({ manga }: { manga?: boolean }) => (
  <>
    <rect x={98} y={42} width={58} height={28} rx={14} fill={PIEL} stroke={T} strokeWidth={3.5} />
    <rect x={4} y={36} width={104} height={38} rx={17} fill={manga ? "#9fb8d6" : PIEL} stroke={T} strokeWidth={3.5} />
    <path d="M100 46 Q104 56 100 66" stroke={T} strokeWidth={2.5} fill="none" strokeLinecap="round" />
  </>
);
const Manguito = ({ x = 34 }: { x?: number }) => (
  <><rect x={x} y={30} width={54} height={50} rx={6} fill="#cfe5e1" stroke={V} strokeWidth={4} /><path d={`M${x + 27} 30 L${x + 27} 8`} stroke={V} strokeWidth={3} /></>
);
const Mano = ({ children }: { children: React.ReactNode }) => <g stroke={T} strokeWidth={3.5} strokeLinejoin="round" fill={PIEL}>{children}</g>;

const SALUD: Record<string, React.ReactNode> = {
  // Tensión arterial
  "ta-postura": (<><SillaRespaldo /><Mesa /><Piso x1={8} x2={156} y={108} /><Cab x={42} y={18} r={10} /><L d="M40 29 L34 78 L80 80 L82 104 L96 104" /><L d="M38 38 L76 54 L114 54" /><path d="M48 42 L66 50" stroke={V} strokeWidth={12} /><path d="M70 56 Q92 74 120 56" stroke={V} strokeWidth={2.5} fill="none" /><Monitor x={118} y={34} /></>),
  "ta-mal": (<><path d="M24 80 L68 80 M28 80 L28 106 M64 80 L64 106" stroke={G} strokeWidth={5} strokeLinecap="round" fill="none" /><Piso x1={8} x2={156} y={108} /><Cab x={66} y={26} r={10} /><L d="M44 80 Q38 54 60 36" /><L d="M44 80 L90 78 L94 104" /><L d="M48 80 L92 70 L116 88" /><L d="M52 46 L50 84" /><path d="M51 54 L51 70" stroke={V} strokeWidth={12} /><path d="M84 8 h50 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-38 l-8 8 v-8 h-4 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6 z" fill="#fff" stroke={N} strokeWidth={3} /><text x={110} y={27} textAnchor="middle" fontSize={17} fontWeight={800} fill={N}>bla</text></>),
  "ta-manguito": (<><Brazo /><Manguito /><path d="M88 82 L88 92 M100 82 L100 92 M88 87 L100 87" stroke={N} strokeWidth={3} strokeLinecap="round" /><Rotulo x={56} y={110} t="2 a 3 cm" /></>),
  "ta-ropa": (<><Brazo manga /><path d="M14 36 L14 74 M24 36 L24 74" stroke="#7d9cc4" strokeWidth={3} /><Manguito /><Tachar x={130} y={22} r={14} /></>),
  "ta-reposo": (<><SillaRespaldo /><Piso x1={8} x2={156} y={108} /><Cab x={42} y={18} r={10} /><L d="M40 29 L34 78 L80 80 L82 104 L96 104" /><L d="M38 40 L56 64 L76 70" /><circle cx={124} cy={42} r={24} fill="#fff" stroke={V} strokeWidth={4} /><path d="M124 42 L124 26 M124 42 L136 48" stroke={V} strokeWidth={4} strokeLinecap="round" /><Rotulo x={100} y={92} t="5 min" /></>),
  "ta-sin-cafe": (<><path d="M14 40 L20 82 L50 82 L56 40 Z" fill="#fff" stroke={T} strokeWidth={3.5} strokeLinejoin="round" /><path d="M18 48 L52 48 L49 74 L21 74 Z" fill="#6b4423" /><path d="M56 50 Q70 52 62 68 L52 70" stroke={T} strokeWidth={3.5} fill="none" /><path d="M28 32 q-6 -8 0 -16 M40 32 q-6 -8 0 -16" stroke={G} strokeWidth={3} fill="none" strokeLinecap="round" /><Tachar x={36} y={56} r={30} /><rect x={92} y={52} width={52} height={10} rx={2} fill="#fff" stroke="#6b4423" strokeWidth={2.5} /><rect x={92} y={52} width={14} height={10} rx={2} fill="#e8a25a" /><rect x={142} y={52} width={8} height={10} rx={1} fill="#e0483e" /><Tachar x={120} y={57} r={30} /><Rotulo x={50} y={108} t="30 min antes" /></>),
  "ta-callado": (<><Cab x={56} y={56} r={34} /><circle cx={44} cy={48} r={3.5} fill={T} /><circle cx={68} cy={48} r={3.5} fill={T} /><path d="M44 72 L68 72" stroke={T} strokeWidth={4} strokeLinecap="round" /><path d="M104 16 h44 a6 6 0 0 1 6 6 v18 a6 6 0 0 1 -6 6 h-30 l-8 8 v-8 h-6 a6 6 0 0 1 -6 -6 v-18 a6 6 0 0 1 6 -6 z" fill="#fff" stroke={N} strokeWidth={3} /><text x={126} y={38} textAnchor="middle" fontSize={17} fontWeight={800} fill={N}>bla</text><Tachar x={126} y={32} r={26} /><rect x={110} y={70} width={22} height={36} rx={4} fill={V} /><Tachar x={121} y={88} r={20} /></>),
  "ta-dos-tomas": (<><rect x={6} y={20} width={50} height={56} rx={6} fill="#e6f2f0" stroke={V} strokeWidth={3.5} /><rect x={12} y={28} width={38} height={26} rx={3} fill="#fff" stroke={V} strokeWidth={2} /><text x={31} y={47} textAnchor="middle" fontSize={17} fontWeight={800} fill={V}>1.ª</text><rect x={104} y={20} width={50} height={56} rx={6} fill="#e6f2f0" stroke={V} strokeWidth={3.5} /><rect x={110} y={28} width={38} height={26} rx={3} fill="#fff" stroke={V} strokeWidth={2} /><text x={129} y={47} textAnchor="middle" fontSize={17} fontWeight={800} fill={V}>2.ª</text><F d="M62 48 L96 48" /><Rotulo x={56} y={102} t="1 minuto" /></>),
  // Porciones con la mano
  "mano-palma": (<Mano><rect x={54} y={10} width={12} height={44} rx={6} /><rect x={68} y={4} width={12} height={50} rx={6} /><rect x={82} y={8} width={12} height={46} rx={6} /><rect x={96} y={16} width={11} height={38} rx={5.5} /><rect x={22} y={62} width={40} height={14} rx={7} transform="rotate(-35 42 69)" /><rect x={50} y={42} width={60} height={62} rx={16} /><ellipse cx={80} cy={72} rx={22} ry={18} fill="#c98a5a" stroke="#7a4a24" strokeWidth={3} /></Mano>),
  "mano-puno": (<Mano><rect x={60} y={80} width={40} height={28} rx={6} /><rect x={42} y={22} width={76} height={64} rx={22} /><path d="M62 24 L62 48 M80 22 L80 48 M98 24 L98 48" fill="none" /><path d="M46 62 Q72 52 100 64" fill="none" /></Mano>),
  "mano-dos": (<><circle cx={52} cy={50} r={15} fill="#3f9d5a" /><circle cx={76} cy={40} r={17} fill="#4fb36a" /><circle cx={102} cy={46} r={16} fill="#3a8f52" /><circle cx={120} cy={58} r={12} fill="#4fb36a" /><circle cx={38} cy={60} r={11} fill="#4fb36a" /><Mano><path d="M14 58 Q18 104 80 104 Q142 104 146 58 Z" /><path d="M80 62 L80 104" fill="none" /></Mano></>),
  "mano-pulgar": (<><Mano><rect x={56} y={50} width={56} height={54} rx={16} /><rect x={58} y={8} width={22} height={52} rx={11} /><path d="M80 62 L108 62 M80 76 L108 76 M80 90 L108 90" fill="none" /></Mano><path d="M60.5 26 L60.5 19 A10 10 0 0 1 77.5 19 L77.5 26 Z" fill="#f2c94c" stroke="none" /><F d="M128 22 L92 22" /></>),
  // Pies
  "dm-pies": (<><Mano><path d="M58 104 Q36 100 38 72 Q40 44 58 34 Q78 26 86 44 Q92 64 84 84 Q80 104 58 104 Z" /><circle cx={50} cy={22} r={8} /><circle cx={64} cy={16} r={6} /><circle cx={76} cy={18} r={5.5} /><circle cx={86} cy={24} r={5} /><circle cx={93} cy={32} r={4.5} /></Mano><circle cx={116} cy={58} r={22} fill="#e6f2f0" fillOpacity={0.6} stroke={V} strokeWidth={5} /><path d="M132 74 L150 96" stroke={V} strokeWidth={8} strokeLinecap="round" /></>),
  "dm-zapato": (<><path d="M14 92 L14 60 Q14 48 28 48 L56 48 Q62 64 86 66 L128 72 Q146 76 146 92 Z" fill="#cfe5e1" stroke={T} strokeWidth={3.5} strokeLinejoin="round" /><rect x={12} y={92} width={136} height={9} rx={3} fill={T} /><path d="M66 64 L72 56 M78 66 L84 58 M90 68 L96 60" stroke={V} strokeWidth={3} strokeLinecap="round" /><F d="M40 6 L40 38" /></>),
  "dm-unas": (<><Mano><rect x={46} y={18} width={64} height={90} rx={30} /></Mano><rect x={60} y={26} width={36} height={30} rx={7} fill="#fff" stroke={T} strokeWidth={3} /><path d="M54 24 L102 24" stroke={N} strokeWidth={4} strokeDasharray="6 4" /><Rotulo x={108} y={20} t="recto" /></>),
  // Azúcar baja: 15 g y 15 minutos
  "dm-15": (<><path d="M20 22 L28 86 L60 86 L68 22 Z" fill="#fff" stroke={T} strokeWidth={3.5} strokeLinejoin="round" /><path d="M23.5 46 L64.5 46 L60.5 82 L27.5 82 Z" fill="#f6b24a" /><Rotulo x={22} y={106} t="15 g" /><F d="M76 54 L94 54" /><circle cx={124} cy={52} r={26} fill="#fff" stroke={V} strokeWidth={4} /><path d="M124 52 L124 34 M124 52 L140 52" stroke={V} strokeWidth={4} strokeLinecap="round" /><path d="M124 26 A26 26 0 0 1 150 52 L124 52 Z" fill={V} fillOpacity={0.25} /><Rotulo x={96} y={106} t="15 min" /></>),
  // Dietas: sal, etiqueta, lonchera y remojo de víveres
  "sal-5g": (<><path d="M70 56 L156 44" stroke={T} strokeWidth={8} strokeLinecap="round" /><path d="M6 52 Q8 86 40 86 Q72 86 74 52 Z" fill="#e6f2f0" stroke={T} strokeWidth={4} strokeLinejoin="round" /><path d="M10 52 Q40 22 70 52 Z" fill="#fff" stroke={G} strokeWidth={2.5} /><circle cx={28} cy={46} r={2.5} fill={G} /><circle cx={42} cy={38} r={2.5} fill={G} /><circle cx={54} cy={46} r={2.5} fill={G} /><Rotulo x={90} y={84} t="5 g" /><Rotulo x={8} y={108} t="1 cucharadita rasa" /></>),
  "etiqueta": (<><rect x={30} y={4} width={100} height={102} rx={6} fill="#fff" stroke={T} strokeWidth={3.5} /><text x={80} y={24} textAnchor="middle" fontSize={17} fontWeight={800} fill={T}>por 100 g</text><path d="M40 32 L120 32" stroke={G} strokeWidth={2} /><text x={40} y={52} fontSize={17} fill={T}>Grasa</text><text x={120} y={52} textAnchor="end" fontSize={17} fill={T}>3 g</text><rect x={36} y={60} width={88} height={24} rx={4} fill="#fdecea" stroke={ROJO} strokeWidth={3} /><text x={42} y={78} fontSize={17} fontWeight={800} fill={ROJO}>Sal</text><text x={118} y={78} textAnchor="end" fontSize={17} fontWeight={800} fill={ROJO}>1,8 g</text><text x={40} y={100} fontSize={17} fill={T}>Azúcar</text><text x={120} y={100} textAnchor="end" fontSize={17} fill={T}>2 g</text></>),
  "lonchera": (<><path d="M58 26 Q58 10 80 10 Q102 10 102 26" stroke={V} strokeWidth={5} fill="none" /><rect x={14} y={26} width={132} height={78} rx={10} fill="#e6f2f0" stroke={V} strokeWidth={4} /><path d="M80 32 L80 98 M84 64 L140 64" stroke={V} strokeWidth={3} /><circle cx={38} cy={52} r={11} fill="#3f9d5a" /><circle cx={56} cy={48} r={12} fill="#4fb36a" /><circle cx={46} cy={72} r={12} fill="#3a8f52" /><circle cx={64} cy={78} r={10} fill="#4fb36a" /><ellipse cx={112} cy={46} rx={22} ry={12} fill="#d9b48a" stroke="#8a5a2a" strokeWidth={2} /><ellipse cx={112} cy={82} rx={20} ry={11} fill="#f3e7b5" stroke="#b39a3a" strokeWidth={2} /></>),
  "etiqueta-fosfato": (<><rect x={20} y={4} width={120} height={102} rx={6} fill="#fff" stroke={T} strokeWidth={3.5} /><text x={30} y={26} fontSize={17} fontWeight={800} fill={T}>Ingredientes:</text><path d="M30 40 L130 40 M30 54 L100 54" stroke={G} strokeWidth={5} strokeLinecap="round" /><rect x={26} y={64} width={108} height={24} rx={4} fill="#fdecea" stroke={ROJO} strokeWidth={3} /><text x={80} y={82} textAnchor="middle" fontSize={17} fontWeight={800} fill={ROJO}>…fosfato…</text><path d="M30 98 L118 98" stroke={G} strokeWidth={5} strokeLinecap="round" /></>),
  "remojo": (<><path d="M16 40 L24 104 L120 104 L128 40 Z" fill="#e6f2f0" stroke={T} strokeWidth={3.5} strokeLinejoin="round" /><path d="M20 54 L124 54" stroke="#5b9bd5" strokeWidth={3} /><path d="M21 56 L124 56 L119 102 L25 102 Z" fill="#cfe3f5" /><rect x={40} y={68} width={18} height={16} rx={3} fill="#f3e7b5" stroke="#b39a3a" strokeWidth={2} /><rect x={66} y={74} width={18} height={16} rx={3} fill="#f3e7b5" stroke="#b39a3a" strokeWidth={2} /><rect x={90} y={64} width={18} height={16} rx={3} fill="#f3e7b5" stroke="#b39a3a" strokeWidth={2} /><F d="M134 50 Q152 66 140 96" /><Rotulo x={98} y={24} t="bote el agua" /></>),
};

// «i:sal» usa el dibujo de un ícono de las dietas; «i:sal!» lo tacha (lo que debe evitar)
export function FiguraSalud({ nombre, className = "" }: { nombre: string; className?: string }) {
  if (nombre.startsWith("i:")) {
    const icono = nombre.slice(2).replace(/!$/, "") as Icono;
    return <IconoSalud icono={icono} no={nombre.endsWith("!")} className={className} />;
  }
  const f = SALUD[nombre] ?? HERIDAS[nombre];
  if (!f) return null;
  return <svg viewBox="0 0 160 110" className={`overflow-visible ${className}`} aria-hidden>{f}</svg>;
}

// ── Heridas, quemaduras y hábitos (tanda 5), 160 × 110 ──
const AGUA = "#5b9bd5";
const Antebrazo = () => <rect x={6} y={68} width={148} height={30} rx={15} fill={PIEL} stroke={T} strokeWidth={3.5} />;
const Herida = ({ x = 66 }: { x?: number }) => <path d={`M${x} 83 L${x + 28} 83`} stroke={ROJO} strokeWidth={4.5} strokeLinecap="round" />;
const Quemadura = () => <ellipse cx={80} cy={83} rx={26} ry={10} fill="#f19c8f" stroke={ROJO} strokeWidth={2.5} />;
const Grifo = ({ x = 80 }: { x?: number }) => (
  <><path d={`M${x - 52} 10 L${x - 8} 10 Q${x} 10 ${x} 18 L${x} 26`} stroke={T} strokeWidth={8} fill="none" strokeLinecap="round" /><path d={`M${x} 34 L${x} 62`} stroke={AGUA} strokeWidth={7} strokeDasharray="7 5" strokeLinecap="round" /></>
);
const Gasa = ({ x, y, w = 44, h = 30 }: { x: number; y: number; w?: number; h?: number }) => (
  <><rect x={x} y={y} width={w} height={h} rx={3} fill="#fff" stroke={V} strokeWidth={3} /><path d={`M${x + w / 3} ${y} L${x + w / 3} ${y + h} M${x + (2 * w) / 3} ${y} L${x + (2 * w) / 3} ${y + h} M${x} ${y + h / 2} L${x + w} ${y + h / 2}`} stroke={G} strokeWidth={2} /></>
);
const Reloj = ({ x, y, r = 22 }: { x: number; y: number; r?: number }) => (
  <><circle cx={x} cy={y} r={r} fill="#fff" stroke={V} strokeWidth={4} /><path d={`M${x} ${y} L${x} ${y - r * 0.65} M${x} ${y} L${x + r * 0.55} ${y + r * 0.25}`} stroke={V} strokeWidth={4} strokeLinecap="round" /></>
);

const HERIDAS: Record<string, React.ReactNode> = {
  // Heridas
  "lavar-manos": (<><Grifo x={78} /><Mano><rect x={44} y={58} width={36} height={46} rx={16} transform="rotate(-24 62 81)" /><rect x={76} y={58} width={36} height={46} rx={16} transform="rotate(24 94 81)" /></Mano>{[[40, 52, 7], [118, 54, 8], [128, 74, 5], [32, 72, 5]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} fill="#fff" stroke={AGUA} strokeWidth={2.5} />)}<Rotulo x={112} y={30} t="20 s" /></>),
  "herida-agua-bien": (<><Antebrazo /><Herida /><Grifo x={80} /><rect x={98} y={30} width={58} height={24} rx={10} fill="#fff" stroke={V} strokeWidth={3} /><text x={127} y={48} textAnchor="middle" fontSize={16} fontWeight={800} fill={V}>jabón</text></>),
  "herida-alcohol-mal": (<><Antebrazo /><Herida /><g transform="rotate(35 58 30)"><rect x={40} y={8} width={34} height={46} rx={5} fill="#fff" stroke={T} strokeWidth={3.5} /><rect x={50} y={0} width={14} height={9} rx={2} fill={T} /></g><path d="M80 50 L80 64" stroke="#8a5a2a" strokeWidth={5} strokeDasharray="5 4" /><Tachar x={80} y={46} r={36} /></>),
  "herida-costra-mal": (<><Antebrazo /><ellipse cx={80} cy={83} rx={16} ry={7} fill="#8a4b2a" /><Mano><rect x={84} y={34} width={14} height={40} rx={7} transform="rotate(-20 91 54)" /><rect x={100} y={36} width={14} height={40} rx={7} transform="rotate(-38 107 56)" /></Mano><F d="M118 24 L144 8" /><Tachar x={88} y={60} r={34} /></>),
  "herida-tapada-bien": (<><Antebrazo /><rect x={52} y={70} width={56} height={26} rx={4} fill="#fff" stroke={V} strokeWidth={3} /><rect x={66} y={75} width={28} height={16} rx={2} fill="#e6f2f0" /><path d="M48 34 L58 46 L80 22" stroke={V} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" /></>),
  "limpiar-herida": (<><Antebrazo /><Herida /><Gasa x={66} y={28} /><F d="M128 26 L128 62" doble /><Rotulo x={2} y={18} t="a toques" /></>),
  "cambiar-aposito": (<><Antebrazo /><rect x={52} y={70} width={56} height={26} rx={4} fill="#fff" stroke={V} strokeWidth={3} /><path d="M50 60 A22 22 0 1 1 94 60" stroke={N} strokeWidth={4.5} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /><Rotulo x={112} y={34} t="cada" /><Rotulo x={112} y={52} t="día" /></>),
  "revisar-herida": (<><Antebrazo /><ellipse cx={72} cy={83} rx={20} ry={9} fill="#f6b3a8" /><Herida x={58} /><path d="M58 60 q4 -6 0 -12 M72 58 q4 -6 0 -12 M86 60 q4 -6 0 -12" stroke={ROJO} strokeWidth={3} fill="none" strokeLinecap="round" /><circle cx={118} cy={40} r={22} fill="#e6f2f0" fillOpacity={0.6} stroke={V} strokeWidth={5} /><path d="M102 56 L88 72" stroke={V} strokeWidth={8} strokeLinecap="round" /></>),
  "vacuna-tetanos": (<><g transform="rotate(-30 80 56)"><rect x={34} y={46} width={76} height={20} rx={4} fill="#fff" stroke={T} strokeWidth={3.5} /><rect x={40} y={50} width={40} height={12} fill="#cfe5e1" /><path d="M110 56 L140 56" stroke={T} strokeWidth={3} /><path d="M34 56 L18 56 M18 46 L18 66" stroke={T} strokeWidth={5} strokeLinecap="round" /></g><Rotulo x={86} y={104} t="10 años" /></>),
  "sol-cicatriz": (<><circle cx={34} cy={30} r={16} fill="#f2c94c" /><path d="M34 4 L34 8 M10 30 L14 30 M16 12 L19 15 M52 12 L49 15 M58 30 L54 30" stroke="#f2a51a" strokeWidth={3.5} strokeLinecap="round" /><Antebrazo /><path d="M70 83 L94 83" stroke="#c98a8a" strokeWidth={3} strokeLinecap="round" /><rect x={98} y={12} width={30} height={46} rx={6} fill="#fff" stroke={V} strokeWidth={3.5} /><rect x={106} y={4} width={14} height={9} rx={2} fill={V} /><text x={113} y={42} textAnchor="middle" fontSize={16} fontWeight={800} fill={V}>FPS</text></>),
  // Quemaduras
  "quemadura-agua-bien": (<><Antebrazo /><Quemadura /><Grifo x={64} /><Reloj x={124} y={28} r={18} /><Rotulo x={100} y={62} t="20 min" /></>),
  "quemadura-hielo-mal": (<><Antebrazo /><Quemadura />{[[46, 30], [70, 22], [62, 46]].map(([x, y]) => <rect key={x} x={x} y={y} width={20} height={20} rx={4} fill="#dff1fb" stroke={AGUA} strokeWidth={3} />)}<rect x={100} y={28} width={46} height={16} rx={6} fill="#fff" stroke={T} strokeWidth={3} /><rect x={92} y={31} width={10} height={10} rx={2} fill={T} /><Tachar x={92} y={44} r={34} /></>),
  "ampolla-mal": (<><Antebrazo /><path d="M60 70 Q80 40 100 70 Z" fill="#fff6e6" stroke="#d9a35a" strokeWidth={3} /><path d="M140 14 L94 54" stroke={T} strokeWidth={3.5} strokeLinecap="round" /><circle cx={142} cy={12} r={4} fill={T} /><Tachar x={84} y={44} r={34} /></>),
  "quemadura-gasa-bien": (<><Antebrazo /><Quemadura /><path d="M30 58 Q55 48 80 58 Q105 68 130 58 L130 104 L30 104 Z" fill="#fff" fillOpacity={0.7} stroke={V} strokeWidth={3.5} strokeDasharray="7 5" /><Rotulo x={56} y={38} t="suelta" /></>),
  "enfriar-20": (<><Grifo x={56} /><Mano><rect x={26} y={62} width={60} height={30} rx={15} /></Mano><ellipse cx={56} cy={77} rx={14} ry={7} fill="#f19c8f" /><Reloj x={124} y={52} r={24} /><Rotulo x={98} y={104} t="20 min" /></>),
  "quitar-anillos": (<><Mano><rect x={40} y={48} width={64} height={56} rx={18} /><rect x={46} y={10} width={13} height={46} rx={6.5} /><rect x={62} y={4} width={13} height={50} rx={6.5} /><rect x={78} y={8} width={13} height={46} rx={6.5} /><rect x={94} y={18} width={12} height={38} rx={6} /></Mano><rect x={74} y={24} width={21} height={8} rx={3} fill="#f2c94c" stroke="#b38a1a" strokeWidth={2} /><F d="M100 26 L140 6" /><rect x={30} y={88} width={84} height={14} rx={4} fill="#9fb8d6" stroke={T} strokeWidth={3} /><F d="M120 96 L150 96" /></>),
  "medir-palma": (<><Mano><rect x={44} y={52} width={66} height={54} rx={18} /><rect x={48} y={12} width={13} height={46} rx={6.5} /><rect x={64} y={6} width={13} height={50} rx={6.5} /><rect x={80} y={10} width={13} height={46} rx={6.5} /><rect x={96} y={20} width={12} height={38} rx={6} /><rect x={14} y={62} width={36} height={14} rx={7} transform="rotate(-35 32 69)" /></Mano><Rotulo x={116} y={70} t="1 %" /></>),
  "quimico-lavar": (<><rect x={14} y={30} width={40} height={60} rx={6} fill="#fff" stroke={T} strokeWidth={3.5} /><rect x={24} y={20} width={20} height={11} rx={2} fill={T} /><path d="M34 46 L46 60 L34 74 L22 60 Z" fill="#fff" stroke={ROJO} strokeWidth={3} /><text x={34} y={66} textAnchor="middle" fontSize={16} fontWeight={900} fill={ROJO}>!</text><path d="M84 10 L150 10 M117 10 L117 22" stroke={T} strokeWidth={6} strokeLinecap="round" /><path d="M100 30 L92 70 M117 30 L117 74 M134 30 L142 70" stroke={AGUA} strokeWidth={5} strokeDasharray="7 5" strokeLinecap="round" /><Rotulo x={78} y={100} t="mucha agua" /></>),
  "electricidad-cortar": (<><rect x={12} y={20} width={56} height={74} rx={6} fill="#fff" stroke={T} strokeWidth={3.5} /><path d="M28 44 L52 44 M28 70 L52 70" stroke={G} strokeWidth={4} /><rect x={30} y={50} width={20} height={14} rx={3} fill={N} /><F d="M40 40 L40 26" /><path d="M118 8 L96 52 L114 52 L100 98 L138 42 L118 42 L132 8 Z" fill="#f2c94c" stroke="#b38a1a" strokeWidth={3} strokeLinejoin="round" /><Tachar x={118} y={52} r={36} /></>),
  // Estilo de vida
  "plato-sano": (<><circle cx={80} cy={56} r={50} fill="#fff" stroke={T} strokeWidth={4} /><path d="M80 10 A46 46 0 0 0 80 102 Z" fill="#7cc58f" /><path d="M80 10 A46 46 0 0 1 126 56 L80 56 Z" fill="#e8b27a" /><path d="M126 56 A46 46 0 0 1 80 102 L80 56 Z" fill="#f3e7b5" /><text x={56} y={62} textAnchor="middle" fontSize={16} fontWeight={800} fill="#16302d">½</text><text x={100} y={44} textAnchor="middle" fontSize={16} fontWeight={800} fill="#16302d">¼</text><text x={100} y={82} textAnchor="middle" fontSize={16} fontWeight={800} fill="#16302d">¼</text></>),
};

// Encabezados de tema de la tanda 5 (120 × 80), en el mismo registro que los demás
Object.assign(TEMAS_FIG, {
  heridas: (<><rect x={6} y={44} width={108} height={26} rx={13} fill={PIEL} stroke={T} strokeWidth={3} /><rect x={38} y={46} width={44} height={22} rx={4} fill="#fff" stroke={V} strokeWidth={3} /><rect x={50} y={50} width={20} height={14} rx={2} fill="#e6f2f0" /><path d="M60 6 L60 34 M46 20 L74 20" stroke={ROJO} strokeWidth={7} strokeLinecap="round" /></>),
  quemaduras: (<><path d="M40 72 Q14 60 22 36 Q28 50 36 46 Q30 22 50 6 Q50 28 62 34 Q70 48 58 72 Z" fill="#f6a04a" stroke="#c4561a" strokeWidth={3} strokeLinejoin="round" /><path d="M90 14 Q74 40 74 52 A16 16 0 0 0 106 52 Q106 40 90 14 Z" fill="#cfe3f5" stroke={AGUA} strokeWidth={3.5} /></>),
  "vida-sana": (<><path d="M50 74 C14 52 14 18 36 18 C46 18 50 26 50 32 C50 26 54 18 64 18 C86 18 86 52 50 74 Z" fill="#fdd9bd" stroke={T} strokeWidth={3.5} strokeLinejoin="round" /><path d="M86 70 Q84 34 112 14 Q116 50 86 70 Z M86 70 Q96 46 108 28" fill="#7cc58f" stroke="#2f7d4a" strokeWidth={3} strokeLinejoin="round" /></>),
});
