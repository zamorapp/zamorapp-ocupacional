import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Campo({ id, etiqueta, ayuda, className, ...props }: React.ComponentProps<"input"> & { etiqueta: string; ayuda?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      <Input id={id} name={props.name ?? id} className="h-10" {...props} />
      {ayuda && <p className="mt-1 text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function CampoTexto({ id, etiqueta, className, ...props }: React.ComponentProps<"textarea"> & { etiqueta: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      <Textarea id={id} name={props.name ?? id} {...props} />
    </div>
  );
}

export function CampoSelect({ id, etiqueta, className, children, ...props }: React.ComponentProps<"select"> & { etiqueta: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      <select id={id} name={props.name ?? id} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm" {...props}>
        {children}
      </select>
    </div>
  );
}

export function Aviso({ resultado }: { resultado: { ok: boolean; mensaje: string } | null }) {
  if (!resultado?.mensaje) return null;
  return (
    <p className={`rounded-md px-3 py-2 text-sm ${resultado.ok ? "bg-ok/10 text-ok-texto" : "bg-destructive/10 text-destructive"}`}>
      {resultado.mensaje}
    </p>
  );
}
