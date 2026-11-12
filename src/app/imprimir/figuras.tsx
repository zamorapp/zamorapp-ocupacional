// Figuras de los ejercicios (pausas activas y equilibrio): dibujos de línea propios, sin imágenes externas, para que
// salgan iguales en la web, en el escritorio sin internet y en el PDF. Trazo oscuro = cuerpo, naranja = movimiento,
// verde = objetos y miradas. Cada figura se nombra en lib/bienestar.ts (campo «figura»).

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
  "palma-arriba": <><Traza d="M4 26 L32 26 L32 16" /><Traza d="M28 36 L35 22" /><Flecha d="M40 14 Q44 20 40 26" /><text x={14} y={42} fontSize={7} fontWeight={700} fill={V}>palma ↑</text></>,
  "palma-abajo": <><Traza d="M4 22 L32 22 L32 33" /><Traza d="M28 12 L35 28" /><Flecha d="M40 22 Q44 28 40 34" /><text x={14} y={42} fontSize={7} fontWeight={700} fill={V}>palma ↓</text></>,
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
      <text x={167} y={92} textAnchor="middle" fontSize={11} fontWeight={800} fill={V}>cada 3 pasos</text>
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
      <text x={100} y={28} fontSize={13} fontWeight={800} fill={N}>1 minuto</text>
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
const Rotulo = ({ x, y, t }: { x: number; y: number; t: string }) => <text x={x} y={y} fontSize={15} fontWeight={800} fill={N}>{t}</text>;
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
  "rotacion-externa": (<><Piso x1={60} x2={150} /><Cab x={100} y={18} /><L d="M100 30 L100 76 L94 114 M100 76 L106 114" /><L d="M100 40 L84 62 L82 86" /><L d="M100 40 L114 66 L156 62" /><path d="M128 92 Q160 92 168 72" stroke={N} strokeWidth={4} fill="none" strokeLinecap="round" markerEnd="url(#fig-flecha)" /><Rotulo x={120} y={30} t="codo pegado" /></>),
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
  // Un tema puede usar también las figuras de equilibrio (p. ej. «sentarse-pararse» en la rodilla)
  const f = DOLOR[nombre] ?? EQUILIBRIO[nombre];
  if (!f) return null;
  return <svg viewBox={DOLOR[nombre] ? CAJAS_DOLOR(nombre) : CAJAS[nombre] ?? "0 0 200 120"} className={`overflow-visible ${className}`} aria-hidden>{f}</svg>;
}
