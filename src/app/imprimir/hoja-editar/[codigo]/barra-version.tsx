"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Loader2, PencilLine, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmar } from "@/components/app/confirmar";
import { borrarVersionHoja, guardarVersionHoja } from "@/app/(app)/atencion/hojas/acciones";

// Barra de «Editar hoja»: guardar como versión del servicio o volver al texto original de la app
export function BarraVersion({ codigo, nombre, guardada, puedeGuardar }: { codigo: string; nombre: string; guardada: string | null; puedeGuardar: boolean }) {
  const router = useRouter();
  const c = useSearchParams().get("c");
  const [ocupado, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const sinGuardar = (c ?? null) !== guardada;

  const guardar = () => iniciar(async () => {
    const r = await guardarVersionHoja(codigo, new URLSearchParams(window.location.search).get("c"));
    setMensaje(r.ok ? { ok: true, texto: "Guardada: así saldrá en las consultas y en los enlaces al paciente." } : { ok: false, texto: r.mensaje });
    // Sin ?c= la página vuelve a abrir con lo guardado: el botón queda en «Guardada»
    if (r.ok) router.replace(`/imprimir/hoja-editar/${codigo}`);
  });
  // Con cambios sin guardar, salir pide confirmar
  const salir = async (e: React.MouseEvent) => {
    if (!puedeGuardar || !sinGuardar) return;
    e.preventDefault();
    if (await confirmar({ titulo: "Tienes cambios sin guardar. ¿Salir sin guardar?", accion: "Salir sin guardar", cancelar: "Seguir editando" })) router.push("/atencion/hojas");
  };
  const original = async () => {
    if (!(await confirmar({ titulo: "¿Volver al original?", texto: "Se borran tus cambios de esta hoja y vuelve el texto de zamorApp.", accion: "Volver al original" }))) return;
    iniciar(async () => {
      const r = await borrarVersionHoja(codigo);
      setMensaje(r.ok ? { ok: true, texto: "Volvió al texto original." } : { ok: false, texto: r.mensaje });
      if (r.ok) router.replace(`/imprimir/hoja-editar/${codigo}`);
    });
  };

  return (
    <div className="sticky top-0 z-10 mb-6 border-b bg-background/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[216mm] flex-wrap items-center gap-2">
        <Button variant="ghost" asChild><Link href="/atencion/hojas" onClick={salir}><ArrowLeft /> Hojas para el paciente</Link></Button>
        <span className="flex min-w-0 flex-1 items-center gap-2 font-medium"><PencilLine className="size-4 text-primary" /> {nombre}{guardada && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Tu versión</span>}</span>
        {puedeGuardar && (
          <>
            {(guardada || c) && <Button variant="outline" onClick={original} disabled={ocupado}><RotateCcw /> Volver al original</Button>}
            <Button onClick={guardar} disabled={ocupado || !sinGuardar}>{ocupado ? <Loader2 className="animate-spin" /> : sinGuardar ? <Save /> : <Check />} {sinGuardar ? "Guardar como mi versión" : "Guardada"}</Button>
          </>
        )}
      </div>
      <p className="mx-auto mt-1 max-w-[216mm] text-xs text-muted-foreground">
        {puedeGuardar
          ? "Toca un renglón para cambiarlo, la ✕ para quitarlo o «Agregar» para sumar uno. Las señales de alarma no se quitan. Al guardar, sale así en todas las consultas y en los enlaces al paciente. En cada consulta aún puedes ajustarla para ese paciente."
          : "Puedes leerla y probar cambios. Solo el administrador o el gerente médico guardan la versión del servicio."}
      </p>
      {mensaje && <p role="status" className={mensaje.ok ? "mx-auto mt-1 max-w-[216mm] text-xs font-medium text-ok" : "mx-auto mt-1 max-w-[216mm] rounded-md bg-alerta/10 px-2 py-1 text-xs text-alerta-texto"}>{mensaje.texto}</p>}
    </div>
  );
}
