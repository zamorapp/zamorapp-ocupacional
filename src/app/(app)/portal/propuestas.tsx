"use client";

import { useCallback, useState, useTransition } from "react";
import { CalendarClock, Check, Loader2, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { hora12, textoPropuesta, type Propuesta } from "@/lib/propuesta";
import { responderPropuesta } from "./acciones";
import { ElegirHora } from "./elegir-hora";

export type GrupoPropuesta = { ids: string[]; nombres: string[]; empresaId: string; motivo: string | null; propuesta: Propuesta };

function Item({ g, manana }: { g: GrupoPropuesta; manana: string }) {
  const p = g.propuesta;
  const [hora, setHora] = useState(p.desde);
  const [pidiendo, setPidiendo] = useState(false);
  const [otra, setOtra] = useState({ fecha: manana, hora: "" });
  const [nota, setNota] = useState("");
  const [ocupado, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const alCambiar = useCallback((v: { fecha: string; hora: string }) => setOtra(v), []);
  const responder = (aceptar: boolean) => iniciar(async () => {
    setResultado(await responderPropuesta(g.ids, aceptar ? { aceptar, hora } : { aceptar, fecha: otra.fecha, hora: otra.hora || null, nota }));
  });
  if (resultado?.ok) return <li className="px-6 py-3 text-sm text-ok-texto">{resultado.mensaje}</li>;
  return (
    <li className="space-y-2 px-6 py-3 text-sm">
      <div>
        <div className="font-medium">{g.nombres.length === 1 ? g.nombres[0] : `${g.nombres.length} trabajadores`}{g.motivo && <span className="font-normal text-muted-foreground"> · {g.motivo}</span>}</div>
        {g.nombres.length > 1 && <div className="text-xs text-muted-foreground">{g.nombres.join(" · ")}</div>}
      </div>
      <p className="rounded-lg bg-primary/10 px-3 py-2">
        El servicio médico propone <b>{textoPropuesta(p)}</b>{p.nota && <span className="block text-muted-foreground">«{p.nota}»</span>}
      </p>
      {!pidiendo && (
        <div className="flex flex-wrap items-center gap-2">
          {p.modo !== "exacta" && (
            <label className="flex items-center gap-2 text-sm">Hora de llegada
              <Input type="time" value={hora} min={p.desde} max={p.hasta ?? undefined} onChange={(e) => setHora(e.target.value)} className="h-9 w-32" />
            </label>
          )}
          <Button disabled={ocupado || !hora} onClick={() => responder(true)}>{ocupado ? <Loader2 className="animate-spin" /> : <Check />} Aceptar{p.modo !== "exacta" && hora ? ` a las ${hora12(hora)}` : ""}</Button>
          <Button variant="outline" disabled={ocupado} onClick={() => setPidiendo(true)}><RefreshCw /> Pedir otra</Button>
        </div>
      )}
      {pidiendo && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <ElegirHora empresaId={g.empresaId} min={manana} etiqueta="¿Qué día y hora le conviene?" personas={g.ids.length} alCambiar={alCambiar} />
          <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota para el servicio (opcional)" aria-label="Nota para el servicio médico" className="h-10 sm:col-span-2" />
          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => setPidiendo(false)}><X /> Volver</Button>
            <Button disabled={ocupado || !otra.fecha} onClick={() => responder(false)}>{ocupado ? <Loader2 className="animate-spin" /> : <Send />} Enviar al servicio</Button>
          </div>
        </div>
      )}
      {resultado && !resultado.ok && <p className="text-xs text-destructive">{resultado.mensaje}</p>}
    </li>
  );
}

/** Horas que el servicio médico le propone a RR. HH. en lugar de la pedida: Aceptar o Pedir otra. */
export function Propuestas({ grupos, manana, gestiona }: { grupos: GrupoPropuesta[]; manana: string; gestiona: boolean }) {
  if (!grupos.length) return null;
  return (
    <Card id="propuestas" className="scroll-mt-20 gap-0 border-primary/50 py-0">
      <CardHeader className="flex flex-row items-center gap-2 border-b bg-primary/10 py-3">
        <CalendarClock className="size-5 text-primary" />
        <CardTitle className="text-base">El servicio médico le propone otra hora ({grupos.reduce((s, g) => s + g.ids.length, 0)})</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {gestiona ? <ul className="divide-y">{grupos.map((g) => <Item key={g.ids[0]} g={g} manana={manana} />)}</ul>
          : <ul className="divide-y">{grupos.map((g) => <li key={g.ids[0]} className="px-6 py-3 text-sm">{g.nombres.join(", ")} · {textoPropuesta(g.propuesta)} <span className="text-muted-foreground">(responde RR. HH.)</span></li>)}</ul>}
      </CardContent>
    </Card>
  );
}
