import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { RegistroSW } from "@/components/app/registro-sw";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NOMBRE } from "@/lib/config";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-VE">
      <body className={`${inter.variable} antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
        <RegistroSW />
      </body>
    </html>
  );
}
