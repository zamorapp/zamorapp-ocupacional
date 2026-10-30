import localFont from "next/font/local";

// Fuentes dentro del repo (sin Google Fonts al compilar). Tipografía propia de los documentos impresos: Public Sans (texto) e IBM Plex Mono (folios, fechas y cifras)
const publicSans = localFont({ variable: "--font-public-sans", src: "../../fuentes/public-sans.woff2", weight: "100 900" });
const plexMono = localFont({
  variable: "--font-plex-mono",
  src: [
    { path: "../../fuentes/ibm-plex-mono-400.woff2", weight: "400" },
    { path: "../../fuentes/ibm-plex-mono-500.woff2", weight: "500" },
  ],
});

export default function LayoutImprimir({ children }: { children: React.ReactNode }) {
  return <div className={`${publicSans.variable} ${plexMono.variable}`}>{children}</div>;
}
