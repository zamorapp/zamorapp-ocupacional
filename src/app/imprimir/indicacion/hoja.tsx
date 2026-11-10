import { lineaOrden, type IndicacionSuelta } from "@/lib/indicaciones-sueltas";
import { nombreConConcentracion } from "@/lib/recipe";
import { Hoja, Pie, folio } from "../componentes";
import { MitadRecipe, type DatosHojaRecipe } from "../documentos";

const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));

// Hoja de la indicación o récipe sin consulta: el récipe como el de la consulta (dos mitades, Res. MPPS 028/031);
// la orden a enfermería en media carta, con la casilla de cumplimiento (se llena sola si ya está cumplida)
export function HojaIndicacion({ d, x }: { d: DatosHojaRecipe & { impreso: { por: string; el: string } }; x: IndicacionSuelta }) {
  const meds = x.tratamiento.filter((m) => m.medicina?.trim());
  return x.tipo === "recipe" ? (
    <Hoja horizontal>
      <div className="grid flex-1 grid-cols-2 gap-5">
        <MitadRecipe d={d} titulo="Récipe">
          {meds.map((m, i) => `${i + 1}. ${nombreConConcentracion(m)} · ${m.presentacion}${m.notaFarmacia ? `\n   Farmacia: ${m.notaFarmacia}` : ""}`).join("\n")}
        </MitadRecipe>
        <MitadRecipe d={d} titulo="Indicaciones">
          {meds.map((m, i) => `${i + 1}. ${m.medicina}: ${m.dosis} vía ${m.via.toLowerCase()} ${m.frecuencia.toLowerCase()} por ${m.duracion.toLowerCase()}${m.observacion ? `. ${m.observacion}` : ""}`).join("\n")}
          {x.indicaciones && `\n\n${x.indicaciones}`}
        </MitadRecipe>
      </div>
      <Pie d={d} derecha={`Folio ${folio("RS", x.id)}`} />
    </Hoja>
  ) : (
    <Hoja media>
      <MitadRecipe d={d} titulo="Orden de enfermería" vence={false}>
        {meds.map((m, i) => `${i + 1}. ${lineaOrden(m)}`).join("\n")}
        {x.indicaciones && `${meds.length ? "\n\n" : ""}${x.indicaciones}`}
        {x.indicadoPor && `\n\nIndicado por: ${x.indicadoPor}`}
        <div className="mt-4 grid grid-cols-[auto_1fr_auto_1fr] items-end gap-x-2 gap-y-3 text-[12px]">
          <span className="font-semibold">Cumplido por</span>
          <span className="h-5 border-b border-[#15201e] text-center">{x.estado === "cumplida" ? x.cumplidaPor ?? "" : ""}</span>
          <span className="font-semibold">Fecha y hora</span>
          <span className="h-5 border-b border-[#15201e] text-center">
            {x.estado === "cumplida" && x.cumplidaEn ? fechaHora(x.cumplidaEn) : ""}
          </span>
          <span className="font-semibold">Observación</span>
          <span className="col-span-3 h-5 border-b border-[#15201e]">{x.estado === "cumplida" ? x.notaCumplimiento ?? "" : ""}</span>
        </div>
      </MitadRecipe>
      <Pie d={d} derecha={`Folio ${folio("OE", x.id)}`} />
    </Hoja>
  );
}
