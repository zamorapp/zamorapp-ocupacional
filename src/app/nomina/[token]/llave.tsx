"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abrir } from "./acciones";

// La llave del enlace: el teléfono de la persona de RR. HH. a quien se le envió. Este teléfono queda amarrado.
export function LlaveTelefono({ token, nombre }: { token: string; nombre: string }) {
  const router = useRouter();
  const [tel, setTel] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (tel.replace(/\D/g, "").length < 10) { setError("Escriba su número completo, por ejemplo 0414-1234567."); return; }
        iniciar(async () => {
          const r = await abrir(token, tel);
          if (r.ok) router.refresh();
          else setError(r.mensaje);
        });
      }}
    >
      <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Lock className="size-5" /></span>
      <div>
        <h1 className="text-xl font-semibold">{nombre ? `Hola, ${nombre}` : "Hola"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Por seguridad, escriba su número de teléfono: el mismo al que le enviamos este enlace. Solo se abre en este teléfono.
        </p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Su teléfono</span>
        <Input value={tel} onChange={(e) => setTel(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="0414-1234567" maxLength={20} className="h-12 text-lg" />
      </label>
      {error && <p className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto" role="alert">{error}</p>}
      <Button type="submit" className="h-12 w-full text-base" disabled={pendiente}>{pendiente && <Loader2 className="animate-spin" />} Entrar</Button>
    </form>
  );
}
