"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileClock, Inbox, PenLine, Send, WifiOff } from "lucide-react";
import { ESCRITORIO, escritorioEnLinea } from "@/lib/escritorio-actualizar";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { href: "/envios/por-enviar", t: "Por enviar", Icono: Inbox },
  { href: "/envios", t: "Enviar", Icono: Send },
  { href: "/envios/bitacora", t: "Bitácora", Icono: FileClock },
  { href: "/envios/plantillas", t: "Plantillas", Icono: PenLine },
] as const;

// Por enviar · Enviar · Bitácora · Plantillas. «pendientes» = correos fallidos o sin confirmar por reintentar;
// «porEnviar» = constancias firmadas que aún no salieron. Los dos salen de contar_envios() en una sola consulta.
export function PestanasEnvios({ pendientes = 0, porEnviar = 0 }: { pendientes?: number; porEnviar?: number }) {
  const ruta = usePathname();
  return (
    <>
      <SinInternet />
      <nav aria-label="Envíos" className="flex gap-1 overflow-x-auto border-b">
        {PESTANAS.map(({ href, t, Icono }) => {
          const activa = ruta === href;
          return (
            <Link key={href} href={href} aria-current={activa ? "page" : undefined}
              className={cn("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium", activa ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icono className="size-4" /> {t}
              {href === "/envios/bitacora" && pendientes > 0 && <span className="rounded-full bg-destructive px-1.5 text-[11px] leading-5 text-white">{pendientes}</span>}
              {href === "/envios/por-enviar" && porEnviar > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground">{porEnviar}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

// zamorApp Escritorio sin internet: los envíos no salen y los números vienen de la copia local (sin la bitácora).
// Se avisa antes de que el médico intente enviar; se revisa cada 30 s.
function SinInternet() {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    if (!ESCRITORIO) return;
    let vivo = true;
    const revisar = () => escritorioEnLinea().then((v) => vivo && setEnLinea(v));
    revisar();
    const t = setInterval(revisar, 30_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  if (enLinea) return null;
  return (
    <p role="status" className="flex gap-2 rounded-md bg-aviso/15 px-3 py-2 text-sm text-aviso-texto">
      <WifiOff className="mt-0.5 size-4 shrink-0" /> Sin internet: los envíos por correo o WhatsApp necesitan conexión y lo que ves puede estar desactualizado. Vuelve cuando regrese el internet.
    </p>
  );
}
