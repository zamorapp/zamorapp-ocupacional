"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { CONTRATO_VIGILANCIA, CUBETA_VIGILANCIA_PROYECTOS, MAX_PDF_PROYECTO } from "@/lib/vigilancia-proyectos";

export function SubirBorrador({ carpeta, anioActual }: { carpeta: string; anioActual: number }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [estado, setEstado] = useState<{ mensaje: string; error: boolean } | null>(null);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ocupado) return;
    const form = event.currentTarget;
    const datos = new FormData(form);
    const contrato = String(datos.get("contrato") ?? "").trim().toUpperCase();
    const anio = String(datos.get("anio") ?? "");
    const trimestre = String(datos.get("trimestre") ?? "");
    const pdf = datos.get("archivo");
    setEstado(null);
    if (!CONTRATO_VIGILANCIA.test(contrato) || !/^20[0-9]{2}$/.test(anio) || !/^[1-4]$/.test(trimestre)) {
      setEstado({ mensaje: "Revisa el contrato, el año y el trimestre.", error: true });
      return;
    }
    if (!(pdf instanceof File) || !pdf.size || pdf.size > MAX_PDF_PROYECTO) {
      setEstado({ mensaje: "Elige un PDF de hasta 10 MB.", error: true });
      return;
    }
    setOcupado(true);
    try {
      if (await pdf.slice(0, 5).text() !== "%PDF-") {
        setEstado({ mensaje: "El archivo seleccionado no es un PDF válido.", error: true });
        return;
      }
      const { error } = await crearClienteNavegador().storage.from(CUBETA_VIGILANCIA_PROYECTOS)
        .upload(`${carpeta}/${contrato}--${anio}-T${trimestre}.pdf`, pdf, { contentType: "application/pdf", upsert: false });
      if (error) {
        const duplicado = /already exists|duplicate/i.test(error.message);
        setEstado({ mensaje: duplicado ? "Ya hay un borrador de ese contrato y trimestre." : "No se pudo guardar el PDF. Revisa la conexión y vuelve a intentar.", error: true });
        return;
      }
      form.reset();
      setEstado({ mensaje: "Borrador guardado.", error: false });
      router.refresh();
    } catch {
      setEstado({ mensaje: "No se pudo guardar el PDF. Revisa la conexión y vuelve a intentar.", error: true });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <fieldset disabled={ocupado} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="space-y-1.5 text-sm font-medium">
            <span>Número de contrato</span>
            <Input name="contrato" maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9\\-]{0,39}" required />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>Año</span>
            <Input name="anio" type="number" min={2000} max={2099} defaultValue={anioActual} required />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span>Trimestre</span>
            <select name="trimestre" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" required defaultValue="">
              <option value="" disabled>Elige un trimestre</option>
              {["I", "II", "III", "IV"].map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>Informe PDF (hasta 10 MB)</span>
          <Input type="file" name="archivo" accept=".pdf,application/pdf" required />
        </label>
        <Button type="submit">{ocupado ? "Guardando…" : "Guardar borrador"}</Button>
      </fieldset>
      {estado && <p role={estado.error ? "alert" : "status"} className={estado.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{estado.mensaje}</p>}
    </form>
  );
}
