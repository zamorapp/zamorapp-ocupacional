import { IBM_Plex_Mono, Public_Sans } from "next/font/google";

// Tipografía propia de los documentos impresos: Public Sans (texto) e IBM Plex Mono (folios, fechas y cifras)
const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export default function LayoutImprimir({ children }: { children: React.ReactNode }) {
  return <div className={`${publicSans.variable} ${plexMono.variable}`}>{children}</div>;
}
