import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Confirmador } from "@/components/app/confirmar";
import { RegistroSW } from "@/components/app/registro-sw";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NOMBRE } from "@/lib/config";
import { SCRIPT_TEMA } from "@/lib/tema";
import { HoraEscritorio } from "@/components/app/hora-escritorio";
import { desfaseParaLaVentana } from "@/lib/hora-escritorio";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: APP_NOMBRE, template: `%s · ${APP_NOMBRE}` },
  description: "Salud ocupacional multiempresa: pacientes, consultas, aptitud y cumplimiento LOPCYMAT.",
  applicationName: APP_NOMBRE,
  appleWebApp: { capable: true, title: APP_NOMBRE, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1514" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const desfase = await desfaseParaLaVentana(); // solo en el escritorio (null en la web)
  return (
    <html lang="es-VE" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {desfase !== null ? <script dangerouslySetInnerHTML={{ __html: `globalThis.__zamorappDesfase=${Math.round(desfase)};` }} /> : null}
      </head>
      <body className={`${inter.variable} antialiased`}>
        {/* Guarda el aviso de instalación aunque llegue antes de que cargue React (lo usa InstalarApp). */}
        <script dangerouslySetInnerHTML={{ __html: "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__eventoInstalar=e});" }} />
        <TooltipProvider>{children}</TooltipProvider>
        <Confirmador />
        <RegistroSW />
        {desfase !== null ? <HoraEscritorio /> : null}
        {/* Speed Insights (gratis en Vercel): tiempos reales de cada pantalla desde el navegador de Cesar. Solo en la web publicada. */}
        {process.env.VERCEL ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
