"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { pasarAEmpresa } from "@/app/(app)/atencion/acciones";

type Props = {
  trabajadorId: string;
  empresaActual: string;
  empresas: { id: string; nombre: string }[]; // solo activas
  textoBoton?: string;
  alPasar?: () => void; // p. ej. el buscador abre la consulta enseguida
};

// Franja para un trabajador de una empresa inactiva: si vuelve como candidato a otra empresa, se pasa con un toque.
// Su historia (consultas, reposos, documentos) sigue completa y a nombre de la empresa de entonces.
export function PasarAEmpresa({ trabajadorId, empresaActual, empresas, textoBoton = "Pasar", alPasar }: Props) {
  const router = useRouter();
  const [destino, setDestino] = useState(empresas[0]?.id ?? "");
  const [ocupado, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const pasar = () => iniciar(async () => {
    setMensaje(null);
    const r = await pasarAEmpresa(trabajadorId, destino);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (!r.ok) return;
    if (alPasar) alPasar();
    else router.refresh();
  });
  return (
    <div className="space-y-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-sm">
      <p>
        <span className="font-medium">{empresaActual} está inactiva.</span>{" "}
        <span className="text-muted-foreground">¿Viene como candidato a otra empresa? Pásalo y conserva toda su historia.</span>
      </p>
      {empresas.length === 0 ? (
        <p className="text-xs text-muted-foreground">No hay empresas activas a las que pasarlo.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Empresa a la que pasa"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          >
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <button
            type="button"
            onClick={pasar}
            disabled={ocupado || !destino}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />} {textoBoton}
          </button>
        </div>
      )}
      {mensaje && <p role="status" className={mensaje.ok ? "text-xs text-ok-texto" : "text-xs text-alerta-texto"}>{mensaje.texto}</p>}
    </div>
  );
}
