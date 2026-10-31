import { notFound } from "next/navigation";
import { documentoDePrueba, historiaDePrueba } from "@/lib/documentos-prueba";
import { HistoriaClinica } from "../../historia/hoja-historia";
import { TIPOS } from "../../tipos";

// Solo para la prueba automática de impresión (scripts/pruebas/impresion.mjs): sin la variable no existe
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tipo: string }>; searchParams: Promise<{ caso?: string }> };

export default async function PruebaImpresion({ params, searchParams }: Props) {
  // ZAMORAPP_PRUEBA_IMPRESION solo se pone en el CI (impresion.yml) o en el banco local: NUNCA en Vercel ni en el
  // escritorio, porque esta página arma documentos con datos de ejemplo sin pedir sesión
  if (process.env.ZAMORAPP_PRUEBA_IMPRESION !== "1") notFound();
  const [{ tipo }, { caso }] = await Promise.all([params, searchParams]);
  const largo = caso === "largo" ? "largo" : "normal";
  if (tipo === "historia") {
    const h = historiaDePrueba(largo);
    return <HistoriaClinica {...h} empleos={[]} emite="Usuario de prueba" total={h.consultas.length} />;
  }
  const t = TIPOS[tipo as keyof typeof TIPOS];
  if (!t) notFound();
  return <t.Componente d={documentoDePrueba(largo)} />;
}
