import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CODIGO_PSICOSOCIAL, normalizarCodigo } from "@/lib/psicosocial";

export const metadata: Metadata = { title: "Cuestionario de condiciones de trabajo", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function abrir(form: FormData) {
  "use server";
  const c = normalizarCodigo(String(form.get("codigo") ?? ""));
  redirect(CODIGO_PSICOSOCIAL.test(c) ? `/c/${c}` : "/c?mal=1");
}

// Para quien escribe la dirección a mano desde el papelito: aquí escribe su código de 8 letras y números.
export default async function EscribirCodigo({ searchParams }: { searchParams: Promise<{ mal?: string }> }) {
  const { mal } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 px-4 py-10">
      <form action={abrir} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <KeyRound className="size-8 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Escribe tu código</h1>
          <p className="mt-1 text-sm text-muted-foreground">Son 8 letras y números de tu papelito. Es anónimo: no te pedimos nombre ni cédula.</p>
        </div>
        <Input name="codigo" required autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="K7Q3-M9TX"
          className="h-12 text-center font-mono text-xl tracking-[0.2em] uppercase" aria-invalid={mal ? true : undefined} />
        {mal && <p role="alert" className="text-sm text-alerta-texto">Ese código no tiene 8 letras y números válidos (no lleva O, I ni L).</p>}
        <Button type="submit" className="h-11 w-full">Empezar</Button>
      </form>
    </main>
  );
}
