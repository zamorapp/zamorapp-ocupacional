import { Orden } from "@/app/imprimir/documentos";
import { ControlTension, PlanAlimentacion } from "@/app/imprimir/indicaciones";
import { Bienestar } from "@/app/imprimir/bienestar";
import { conVersion, type Versiones } from "@/lib/hojas-version";
import { temasBienestar } from "@/lib/bienestar";
import { documentoDeRegistro, partesOrden, PARTES_ORDEN, type DocRegistro, type ParteOrden, type VistaRegistro } from "@/lib/registro-documentos";

// Las hojas de un enlace de registro, iguales para el paciente (/registro/<token>/documento) y para la vista previa del
// servicio. La orden sale una por clase de estudio; con «parte», solo esa.
// versiones: las hojas propias del servicio (dieta y temas de bienestar), si las tiene
export function HojasRegistro({ v, tipo, parte, hoy, versiones }: { v: VistaRegistro; tipo: DocRegistro; parte?: ParteOrden; hoy: string; versiones?: Versiones | null }) {
  const docs = v.documentos;
  if (tipo === "orden") {
    const partes = partesOrden(docs.orden?.examenes ?? []).filter((x) => !parte || x.parte === parte);
    return <>{partes.map((x) => <Orden key={x.parte} d={documentoDeRegistro(v, hoy, x.parte)} parte={PARTES_ORDEN[x.parte]} />)}</>;
  }
  const d = documentoDeRegistro(v, hoy);
  const temas = temasBienestar(docs.bienestar?.tema?.join(","));
  return tipo === "control-ta" ? <ControlTension d={d} dias={docs.control_ta?.dias ?? 7} />
    : tipo === "dieta" ? <PlanAlimentacion d={d} dieta={docs.dieta?.dieta} planes={docs.dieta?.plan ?? []} cambios={conVersion(versiones, { dieta: docs.dieta?.dieta })} />
    : <Bienestar d={d} temas={temas} cambios={conVersion(versiones, { temas })} />;
}
