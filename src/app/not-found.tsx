// Página «no existe» de toda la app, en español (antes salía la de Next en inglés: «404 This page could not be found»).
// Sirve para direcciones mal escritas y enlaces viejos. «Volver al Inicio» lleva a /panel: si no hay sesión, el
// middleware manda a ingresar; cada rol cae en su propio Inicio.
import { Home, SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Página no encontrada" };

export default function NoEncontrada() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><SearchX className="size-5" aria-hidden /></span>
          <h1 className="text-lg font-semibold">Esta página no existe</h1>
        </div>
        <p className="text-sm text-muted-foreground">La dirección está mal escrita o el enlace es viejo. Tus datos están a salvo.</p>
        <Button asChild className="h-11 w-full text-base">
          <Link href="/panel"><Home aria-hidden /> Volver al Inicio</Link>
        </Button>
      </div>
    </main>
  );
}
