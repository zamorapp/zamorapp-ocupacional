"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlertaClinica } from "@/lib/alertas-tipos";
import { CorregirAlerta } from "../../atencion/[id]/alertas";

const fechaCorta = (iso: string) => iso.split("-").reverse().join("/");

// Alertas pendientes en la ficha del paciente: se corrigen (texto y fecha) o el médico las descarta sin abrir una consulta
export function AlertasPaciente({ alertas, puedeDescartar }: { alertas: AlertaClinica[]; puedeDescartar: boolean }) {
  const router = useRouter();
  const [lista, setLista] = useState(alertas);
  const [corrigiendo, setCorrigiendo] = useState<AlertaClinica | null>(null);
  const pendientes = lista.filter((a) => a.estado === "pendiente");
  if (!pendientes.length) return null;
  return (
    <section aria-label="Alertas para la próxima evaluación" className="space-y-1.5 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
      {pendientes.map((a) => (
        <div key={a.id} className="flex items-start gap-2">
          <BellRing className="mt-0.5 size-4 shrink-0 text-aviso-texto" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium text-aviso-texto">Para la próxima evaluación · nota del {fechaCorta(a.creadaEl)}{a.autor && ` · ${a.autor}`}:</span>{" "}
            {[a.texto, a.paraclinicos.length ? `pedir ${a.paraclinicos.map((x) => x.nombre).join(", ")}` : ""].filter(Boolean).join(" · ")}
            {a.revisarAntes && <span className="text-muted-foreground"> · antes del {fechaCorta(a.revisarAntes)}</span>}
          </p>
          <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 text-aviso-texto hover:bg-aviso/20 hover:text-aviso-texto" onClick={() => setCorrigiendo(a)}>
            <Pencil /> Corregir
          </Button>
        </div>
      ))}
      {corrigiendo && (
        <CorregirAlerta alerta={corrigiendo} onCerrar={() => setCorrigiendo(null)} puedeDescartar={puedeDescartar}
          onGuardada={(n) => { setLista((x) => x.map((y) => (y.id === n.id ? n : y))); router.refresh(); }} />
      )}
    </section>
  );
}
