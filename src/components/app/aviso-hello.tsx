"use client";

// Oferta «Entrar con Windows Hello» dentro del panel del escritorio, una vez por apertura del programa, a quien
// aún no lo activó en esta PC. Respaldo de la oferta que sale tras la clave: el 30-oct, en la PC de Cesar, esa
// oferta nunca salió (la pantalla de ingreso no llegó a consultar la puerta) y él seguía escribiendo la clave
// creyendo que la huella estaba activa (era la llave de Chrome). Aquí la consulta es la misma que usa Mi perfil.
import { Fingerprint, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { ES_ESCRITORIO, activarHuella, noOfrecerHuella, puedeOfrecerHuella } from "@/lib/huella";

const VISTO = "zamorapp-aviso-hello";

export function AvisoHello() {
  const [mostrar, setMostrar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (!ES_ESCRITORIO) return;
    try {
      if (sessionStorage.getItem(VISTO)) return;
      sessionStorage.setItem(VISTO, "1");
    } catch { return; }
    puedeOfrecerHuella(crearClienteNavegador(), "panel").then(setMostrar).catch(() => {});
  }, []);

  if (!mostrar) return null;
  const activar = async () => {
    setOcupado(true);
    setAviso(null);
    const r = await activarHuella(crearClienteNavegador());
    setOcupado(false);
    setAviso(r.ok ? { ok: true, texto: "Listo: la próxima vez que abras zamorApp te pedirá el PIN o la huella de Windows, sin la clave." } : { ok: false, texto: r.mensaje });
    if (r.ok) setTimeout(() => setMostrar(false), 6000);
  };

  return (
    <div role="status" data-aviso="hello" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-primary/10 px-4 py-2 text-sm sm:px-6">
      <span className="flex items-center gap-2 font-medium"><Fingerprint className="size-4 text-primary" aria-hidden /> Entra sin escribir la clave</span>
      <span className="text-muted-foreground">Activa Windows Hello: al abrir zamorApp te pedirá tu PIN o tu huella de Windows.</span>
      {!aviso?.ok && (
        <span className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={activar} disabled={ocupado}>{ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <Fingerprint aria-hidden />} Activar Windows Hello</Button>
          <Button size="sm" variant="ghost" aria-label="Ahora no" onClick={() => { void noOfrecerHuella(); setMostrar(false); }} disabled={ocupado}><X aria-hidden /> Ahora no</Button>
        </span>
      )}
      {aviso && <span className={`basis-full ${aviso.ok ? "text-primary" : "text-destructive"}`}>{aviso.texto}</span>}
    </div>
  );
}
