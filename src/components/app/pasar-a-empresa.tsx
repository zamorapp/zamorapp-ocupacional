"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AntesDePasar, deshacerPaso, pasarAEmpresa } from "@/app/(app)/atencion/acciones";

type Props = {
  trabajadorId: string;
  empresaActual: string;
  empresas: { id: string; nombre: string }[]; // solo activas
  alPasar?: () => void; // el buscador abre la consulta enseguida: por eso pide confirmar con ambas empresas
};

// Franja para un trabajador de una empresa inactiva: si vuelve como candidato a otra empresa, se pasa con su historia.
// Sin destino por defecto (un toque apurado no lo deja en la empresa equivocada) y con «Deshacer» en la ficha.
export function PasarAEmpresa({ trabajadorId, empresaActual, empresas, alPasar }: Props) {
  const router = useRouter();
  const [destino, setDestino] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [hecho, setHecho] = useState<{ destino: string; antes: AntesDePasar } | null>(null);
  const nombreDestino = empresas.find((e) => e.id === destino)?.nombre ?? "";

  const pasar = () => iniciar(async () => {
    setMensaje(null);
    const r = await pasarAEmpresa(trabajadorId, destino);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    setConfirmar(false);
    if (!r.ok) return;
    if (alPasar) return alPasar();
    // La ficha se refresca al tocar «Listo»: refrescar ya quitaría esta franja y con ella el «Deshacer»
    if (r.antes) setHecho({ destino, antes: r.antes });
    else router.refresh();
  });
  const deshacer = () => iniciar(async () => {
    if (!hecho) return;
    const r = await deshacerPaso(trabajadorId, hecho.destino, hecho.antes);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) { setHecho(null); setDestino(""); router.refresh(); }
  });

  if (hecho && mensaje?.ok) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm">
        <span role="status" className="flex-1 text-ok-texto">{mensaje.texto}</span>
        <Button variant="outline" size="sm" onClick={deshacer} disabled={ocupado}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Undo2 />} Deshacer
        </Button>
        <Button size="sm" onClick={() => router.refresh()} disabled={ocupado}>Listo</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-sm">
      <p>
        <span className="font-medium">{empresaActual} está inactiva.</span>{" "}
        <span className="text-muted-foreground">¿Viene como candidato a otra empresa? Pásalo y conserva toda su historia.</span>
      </p>
      {empresas.length === 0 ? (
        <p className="text-xs text-muted-foreground">No hay empresas activas a las que pasarlo.</p>
      ) : confirmar ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1">¿Pasar de <strong>{empresaActual}</strong> a <strong>{nombreDestino}</strong> y abrir la consulta?</span>
          <Button size="sm" variant="outline" onClick={() => setConfirmar(false)} disabled={ocupado}>Cancelar</Button>
          <Button size="sm" onClick={pasar} disabled={ocupado}>{ocupado ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Sí, pasar y atender</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Empresa a la que pasa"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Elige la empresa…</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <Button onClick={alPasar ? () => setConfirmar(true) : pasar} disabled={ocupado || !destino}>
            {ocupado ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            {alPasar ? "Pasar y atender" : destino ? `Pasar a ${nombreDestino}` : "Pasar"}
          </Button>
        </div>
      )}
      {mensaje && !mensaje.ok && <p role="status" className="text-xs text-alerta-texto">{mensaje.texto}</p>}
    </div>
  );
}
