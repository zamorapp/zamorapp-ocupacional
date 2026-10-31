import { notFound } from "next/navigation";
import { documentoDePrueba, historiaDePrueba } from "@/lib/documentos-prueba";
import { armarVigilancia } from "@/lib/vigilancia";
import { vigilanciaDePrueba } from "@/lib/vigilancia-prueba";
import { EditorInforme } from "@/app/(app)/reportes/editor-informe";
import { HistoriaClinica } from "../../historia/hoja-historia";
import { TIPOS } from "../../tipos";
import { InformeVigilancia } from "../../vigilancia/informe";

// Solo para la prueba automática de impresión (scripts/pruebas/impresion.mjs): sin la variable no existe
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ tipo: string }>; searchParams: Promise<{ caso?: string }> };

export default async function PruebaImpresion({ params, searchParams }: Props) {
  // ZAMORAPP_PRUEBA_IMPRESION solo se pone en el CI (impresion.yml) o en el banco local: NUNCA en Vercel ni en el
  // escritorio, porque esta página arma documentos con datos de ejemplo sin pedir sesión
  if (process.env.ZAMORAPP_PRUEBA_IMPRESION !== "1") notFound();
  const [{ tipo }, { caso }] = await Promise.all([params, searchParams]);
  // El editor de Reportes con los mismos datos: prueba que «Otra redacción» y «Regenerar todo» cambien algo visible
  if (tipo === "vigilancia-editor") {
    const v = armarVigilancia(vigilanciaDePrueba());
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EditorInforme empresaId={null} desde={v.periodo.desde} hasta={v.periodo.hasta} inicial={null} sugeridos={v.sugeridos!} datos={v.datosAnalisis} firmantesBase={v.firmantesBase} editable enlaceImprimir="/imprimir/prueba/vigilancia" hoy="2026-10-31" />
      </div>
    );
  }
  if (tipo === "vigilancia") {
    // ?caso=empresa: la versión que va a la empresa (cifras <3 tapadas, diagnósticos no nombrables agrupados)
    const paraEmpresa = caso === "empresa";
    const v = armarVigilancia(vigilanciaDePrueba(caso === "vacio" ? "vacio" : "normal"), { paraEmpresa });
    const org = { nombre: "Servicio de prueba", rif: "J-00000000-0", direccion: "Dirección de ejemplo", telefono: null, correo: null, logo: null, ajustes: {} };
    return <InformeVigilancia v={v} org={org} logoEmpresa={null} paraEmpresa={paraEmpresa} puedeEnviar={false} />;
  }
  const largo = caso === "largo" ? "largo" : "normal";
  if (tipo === "historia") {
    const h = historiaDePrueba(largo);
    return <HistoriaClinica {...h} empleos={[]} emite="Usuario de prueba" total={h.consultas.length} />;
  }
  const t = TIPOS[tipo as keyof typeof TIPOS];
  if (!t) notFound();
  return <t.Componente d={documentoDePrueba(caso === "largo" || caso === "same" ? caso : "normal")} />;
}
