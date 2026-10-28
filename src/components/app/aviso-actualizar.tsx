"use client";

// Aviso «Hay una versión nueva de zamorApp» en el programa de escritorio: aparece arriba, sin bloquear, cuando
// la nube ya cambió y esta versión no la entiende (la pantalla puede seguir cargando a medias). Se puede
// ignorar hasta la próxima apertura; la pantalla de error (error.tsx) lo repite si algo se cae del todo.
import { Download, Globe, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { abrirWeb, buscarActualizacion, ESCRITORIO, nubeAdelantada } from "@/lib/escritorio-actualizar";

export function AvisoActualizar() {
  const [mostrar, setMostrar] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!ESCRITORIO) return;
    let vivo = true;
    const mirar = async () => {
      if (!vivo || sessionStorage.getItem("zamorapp-aviso-actualizar") === "ignorado") return;
      if (await nubeAdelantada()) setMostrar(true);
    };
    mirar();
    const t = setInterval(mirar, 10e3);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  if (!mostrar) return null;
  return (
    <div role="status" data-aviso="actualizar" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-primary/10 px-4 py-2 text-sm sm:px-6">
      <span className="flex items-center gap-2 font-medium"><Download className="size-4 text-primary" aria-hidden /> Hay una versión nueva de zamorApp</span>
      <span className="text-muted-foreground">Esta PC necesita instalarla para seguir al día. Tus datos están a salvo.</span>
      <span className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={async () => setAviso(await buscarActualizacion())}><Download aria-hidden /> Buscar actualización</Button>
        <Button size="sm" variant="outline" onClick={async () => setAviso(await abrirWeb())}><Globe aria-hidden /> Trabajar en la web</Button>
        <Button size="sm" variant="ghost" aria-label="Ignorar por ahora" onClick={() => { sessionStorage.setItem("zamorapp-aviso-actualizar", "ignorado"); setMostrar(false); }}><X aria-hidden /> Ignorar</Button>
      </span>
      {aviso && <span className="basis-full text-muted-foreground">{aviso}</span>}
    </div>
  );
}
