import { Orden } from "@/app/imprimir/documentos";
import { ControlTension, PlanAlimentacion } from "@/app/imprimir/indicaciones";
import { Bienestar } from "@/app/imprimir/bienestar";
import { documentoDeRegistro, partesOrden, PARTES_ORDEN, type DocRegistro, type ParteOrden, type VistaRegistro } from "@/lib/registro-documentos";

// Las hojas de un enlace de registro, iguales para el paciente (/registro/<token>/documento) y para la vista previa del
// servicio. La orden sale una por clase de estudio; con «parte», solo esa.
export function HojasRegistro({ v, tipo, parte, hoy }: { v: VistaRegistro; tipo: DocRegistro; parte?: ParteOrden; hoy: string }) {
  const docs = v.documentos;
  if (tipo === "orden") {
    const partes = partesOrden(docs.orden?.examenes ?? []).filter((x) => !parte || x.parte === parte);
    return <>{partes.map((x) => <Orden key={x.parte} d={documentoDeRegistro(v, hoy, x.parte)} parte={PARTES_ORDEN[x.parte]} />)}</>;
  }
  const d = documentoDeRegistro(v, hoy);
  return tipo === "control-ta" ? <ControlTension d={d} dias={docs.control_ta?.dias ?? 7} />
    : tipo === "dieta" ? <PlanAlimentacion d={d} dieta={docs.dieta?.dieta} planes={docs.dieta?.plan ?? []} />
    : <Bienestar d={d} temas={docs.bienestar?.tema?.length ? docs.bienestar.tema : undefined} />;
}
