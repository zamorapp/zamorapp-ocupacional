import type { Metadata } from "next";
import Link from "next/link";
import { FileText, PenLine, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_LOTE } from "@/lib/envios-tipos";
import { MenuImprimir } from "@/components/app/menu-imprimir";
import { Card } from "@/components/ui/card";
import { listarConsultas } from "@/lib/consultas";
import { fecha } from "@/lib/pacientes";
import { obtenerSesion } from "@/lib/sesion";
import { puedeFirmarRegistro } from "@/lib/registro-documentos-servidor";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { FiltrosDocumentos } from "./filtros";

export const metadata: Metadata = { title: "Documentos" };
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE = 1000;

export default async function Documentos({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; impreso?: string }> }) {
  const sesion = await obtenerSesion();
  const p = await searchParams;
  const puedeFirmar = !sesion.demo && puedeFirmarRegistro(sesion);
  const hoy = hoyCaracas();
  const porDefecto = sumarDias(hoy, -90);
  const desde = p.desde && ISO.test(p.desde) ? p.desde : porDefecto;
  const hasta = p.hasta && ISO.test(p.hasta) ? p.hasta : hoy;
  const impreso = p.impreso && ISO.test(p.impreso) ? p.impreso : hoy;
  // La hoja de lote lee ?impreso= (fecha-impresion.tsx): así informes y constancias salen con la misma fecha
  const conFecha = impreso !== hoy ? `&impreso=${impreso}` : "";
  const todas = sesion.demo ? [] : await listarConsultas({ desde, hasta, limite: LIMITE });
  const consultas = todas.filter((c) => c.estado !== "borrador");
  // Por día y empresa, con «Imprimir lote»: todas las constancias o informes de ese grupo en un solo documento
  const grupos: { clave: string; fecha: string; empresa: string; items: typeof consultas }[] = [];
  for (const c of consultas) {
    const clave = `${c.fecha}|${c.empresa}`;
    const g = grupos.at(-1)?.clave === clave ? grupos.at(-1)! : grupos.find((x) => x.clave === clave);
    if (g) g.items.push(c);
    else grupos.push({ clave, fecha: c.fecha, empresa: c.empresa, items: [c] });
  }
  // Botones de lote con su cantidad. Si un grupo pasa de MAX_LOTE se parte en tramos, nunca se corta sin aviso
  const botonesLote = (items: typeof consultas, total: number, nombre: string) => {
    if (items.length === 0) return [];
    const deTotal = items.length < total ? ` (de ${total})` : "";
    if (items.length <= MAX_LOTE) return [{ ids: items.map((c) => c.id).join(","), texto: `Imprimir ${items.length} ${items.length === 1 ? nombre.slice(0, -1) : nombre}${deTotal}` }];
    return Array.from({ length: Math.ceil(items.length / MAX_LOTE) }, (_, k) => ({
      ids: items.slice(k * MAX_LOTE, (k + 1) * MAX_LOTE).map((c) => c.id).join(","),
      texto: `Imprimir ${nombre} ${k * MAX_LOTE + 1}–${Math.min((k + 1) * MAX_LOTE, items.length)}${deTotal || ` (de ${items.length})`}`,
    }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Documentos</h1>
        <p className="text-muted-foreground">
          Constancias, reposos, informes y récipes de las consultas cerradas. Elige las fechas; con los botones de cada grupo sacas todas las de un día y una empresa en un solo documento.
        </p>
       </div>
        {puedeFirmar && <Button asChild variant="outline"><Link href="/documentos/firmar"><PenLine /> Firmar y sellar PDF</Link></Button>}
      </div>

      <FiltrosDocumentos desde={desde} hasta={hasta} impreso={impreso} hoy={hoy} porDefecto={porDefecto} />
      {todas.length === LIMITE && <p className="text-sm text-aviso-texto">Se muestran las {LIMITE} más recientes del rango. Acorta las fechas para ver las demás.</p>}

      <Card className="gap-0 overflow-hidden py-0">
        {consultas.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <FileText className="size-8" />
            No hay consultas cerradas entre esas fechas en esta empresa. Cambia «Desde» o la empresa de arriba.
          </div>
        ) : (
          <div className="divide-y">
            {grupos.map((g) => (
              <section key={g.clave}>
                <div data-prueba="grupo-lote" className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-muted/50 px-5 py-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-mono text-muted-foreground">{fecha(g.fecha)}</span>
                    <span className="font-semibold"> · {g.empresa || "Sin empresa"}</span>
                    <span className="text-muted-foreground"> · {g.items.length} {g.items.length === 1 ? "consulta" : "consultas"}</span>
                  </div>
                  {(
                    <div className="flex flex-wrap gap-2">
                      {botonesLote(g.items.filter((c) => c.aptitud), g.items.length, "constancias").map((t) => (
                        <Button key={`c${t.texto}`} size="sm" asChild><Link href={`/imprimir/lote?doc=constancia&ids=${t.ids}${conFecha}`} target="_blank"><Printer /> {t.texto}</Link></Button>
                      ))}
                      {botonesLote(g.items, g.items.length, "informes").map((t) => (
                        <Button key={`i${t.texto}`} variant="outline" size="sm" asChild><Link href={`/imprimir/lote?doc=consulta&ids=${t.ids}${conFecha}`} target="_blank"><Printer /> {t.texto}</Link></Button>
                      ))}
                    </div>
                  )}
                </div>
                <ul className="divide-y">
                  {g.items.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <div className="min-w-48 flex-1">
                        <Link href={`/atencion/${c.id}`} className="font-medium hover:text-primary">{c.paciente}</Link>
                        <div className="text-xs text-muted-foreground">{c.motivo ?? "Sin motivo"}</div>
                      </div>
                      <MenuImprimir consultaId={c.id} impreso={impreso !== hoy ? impreso : undefined} aptitud={Boolean(c.aptitud)} reposo={c.tieneReposo} tratamiento={c.tieneTratamiento} preoperatoria={/preoper/i.test(c.motivo ?? "")} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
