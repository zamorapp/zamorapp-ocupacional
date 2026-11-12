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
