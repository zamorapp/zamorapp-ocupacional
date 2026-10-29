import { notFound } from "next/navigation";
import { documentoDePrueba } from "@/lib/documentos-prueba";
import { TIPOS } from "../../tipos";

// Solo para la prueba automática de impresión (scripts/pruebas/impresion.mjs): sin la variable no existe
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tipo: string }>; searchParams: Promise<{ caso?: string }> };

export default async function PruebaImpresion({ params, searchParams }: Props) {
  if (process.env.ZAMORAPP_PRUEBA_IMPRESION !== "1") notFound();
  const [{ tipo }, { caso }] = await Promise.all([params, searchParams]);
  const t = TIPOS[tipo as keyof typeof TIPOS];
  if (!t) notFound();
  return <t.Componente d={documentoDePrueba(caso === "largo" ? "largo" : "normal")} />;
}
