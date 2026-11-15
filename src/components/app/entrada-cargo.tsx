"use client";

import { useId, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cargoParecido } from "@/lib/cargos";

type Props = Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "list"> & {
  cargos: string[];
  value?: string;
  defaultValue?: string;
  onValor?: (v: string) => void;
};

// Cargo con la lista de la empresa: lo que no existe se agrega al guardar; si se parece a uno que ya está
// (mayúsculas, acentos, abreviatura o tipeo) lo sugiere antes, para no crear repetidos.
export function EntradaCargo({ cargos, value, defaultValue, onValor, ...props }: Props) {
  const lista = useId();
  const [propio, setPropio] = useState(defaultValue ?? "");
  const texto = value ?? propio;
  const poner = (v: string) => { if (value === undefined) setPropio(v); onValor?.(v); };
  const t = texto.trim();
  const parecido = t ? cargoParecido(t, cargos) : null;
  const nuevo = t.length >= 3 && !parecido && !cargos.some((c) => c.trim() === t);

  return (
    <>
      <Input {...props} list={lista} value={texto} onChange={(e) => poner(e.target.value)} autoComplete="off" />
      <datalist id={lista}>{[...new Set(cargos)].map((c) => <option key={c} value={c} />)}</datalist>
      {parecido ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-aviso-texto">
          <Sparkles className="size-3.5 shrink-0" />
          {parecido.tipo === "igual" ? "Ya existe como" : "¿Es"} «{parecido.nombre}»{parecido.tipo === "igual" ? "." : "?"}
          <button type="button" onClick={() => poner(parecido.nombre)} className="font-medium underline underline-offset-2 hover:text-foreground">
            Usar ese
          </button>
        </p>
      ) : nuevo ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Plus className="size-3.5 shrink-0" /> Cargo nuevo: se agrega a la lista al guardar.
        </p>
      ) : null}
    </>
  );
}
