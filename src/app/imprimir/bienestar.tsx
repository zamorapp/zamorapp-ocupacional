import type { DatosDocumento } from "@/lib/documentos";
import { PAUSAS, REGISTRO_PAUSAS, TEMAS, temasBienestar } from "@/lib/bienestar";
import { Bloque, FirmaMedico, Firmas, Ficha, Hoja, Membrete, Pie, Titulo, folio } from "./componentes";

// Hoja de recomendaciones de bienestar para el trabajador: pausas activas (rutina por zona, frecuencia y registro
// semanal) y los temas que el médico agregue. Los textos se pueden tocar en pantalla antes de imprimir (no se guardan).
const editable = { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false } as const;

function PausasActivas() {
  const p = PAUSAS;
  const r = REGISTRO_PAUSAS;
  return (
    <div data-prueba="tema-pausas" className="mb-2">
      <p className="mb-1.5 text-[12px] leading-snug text-doc-tenue" {...editable}>{p.intro}</p>
      {/* Cuándo: tres reglas de frecuencia en franja */}
      <div className="mb-2 grid grid-cols-3 gap-2 break-inside-avoid">
        {p.frecuencia.map((f) => (
          <div key={f.cifra} className="rounded-lg border border-doc-linea bg-doc-suave/60 px-2.5 py-1.5">
            <div className="font-cifra text-[15px] font-bold leading-none text-doc-acento" {...editable}>{f.cifra}</div>
            <div className="mt-0.5 text-[12px] leading-[1.3]" {...editable}>{f.texto}</div>
          </div>
        ))}
      </div>
      {/* Rutina: una tarjeta por zona del cuerpo, ejercicios numerados con su dosis */}
      <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">Rutina por zona del cuerpo</div>
      <div className="mb-2 grid grid-cols-2 gap-x-2.5 gap-y-1.5">
        {p.zonas.map((z, i) => (
          <div key={z.zona} className="break-inside-avoid rounded-lg border border-doc-linea px-2.5 py-1">
            <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[.1em]">
              <span className="inline-flex size-4 items-center justify-center rounded-full bg-doc-acento text-[8.5px] text-white">{i + 1}</span>
              {z.zona}
            </div>
            <ol className="space-y-px text-[12px] leading-[1.3]">
              {z.ejercicios.map((e) => (
                <li key={e.hacer} className="flex gap-2">
                  <span className="flex-1" {...editable}>{e.hacer}</span>
                  <b className="shrink-0 whitespace-nowrap text-doc-acento" {...editable}>{e.dosis}</b>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3 break-inside-avoid">
        <ul className="space-y-0.5 text-[12px] leading-[1.3]">
          {p.reglas.map((x) => <li key={x} className="pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
        </ul>
        {/* Registro: el trabajador marca cada pausa hecha y trae la hoja al control */}
        <table className="border-collapse text-[8.5px]" aria-label="Registro semanal de pausas">
          <thead>
            <tr>
              <th className="pr-1 text-left font-bold uppercase tracking-[.08em] text-doc-tenue">Pausa</th>
              {r.dias.map((dia) => <th key={dia} className="w-[7mm] font-bold text-doc-tenue">{dia}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: r.pausas }, (_, i) => (
              <tr key={i}>
                <td className="pr-1 font-cifra font-semibold">{i + 1}.ª</td>
                {r.dias.map((dia) => <td key={dia} className="h-[5mm] border border-doc-linea" />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[7pt] leading-tight text-doc-tenue">Fuente: {p.fuente}</p>
    </div>
  );
}

export function Bienestar({ d, temas }: { d: DatosDocumento; temas?: string[] }) {
  const lista = temas?.length ? temas : temasBienestar(undefined);
  const otros = TEMAS.filter((t) => lista.includes(t.clave));
  const conPausas = lista.includes("pausas");
  const nombres = [conPausas && "pausas activas", ...otros.map((t) => t.boton.toLowerCase())].filter(Boolean).join(", ");
  // Las pausas solas caben en una carta; con más temas la hoja fluye a otra página
  const fluye = otros.length > (conPausas ? 0 : 2);
  return (
    <Hoja className={fluye ? "print:block" : ""}>
      <Membrete d={d} compacto />
      <Titulo d={d} prefijo="BI" compacto sub={nombres}>
        Recomendaciones de bienestar
      </Titulo>
      <Ficha celdas={[
        { k: "Trabajador", v: d.trabajador.nombre, destacada: true, ancho: 2 },
        { k: "Cédula", v: d.trabajador.cedula },
        { k: "Cargo", v: d.trabajador.cargo },
      ]} />

      {conPausas && <PausasActivas />}

      {otros.map((t) => (
        <div key={t.clave} data-prueba={`tema-${t.clave}`} className="mb-2 break-inside-avoid rounded-lg border-l-[3px] border-doc-acento bg-doc-suave/60 px-3 py-1.5">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{t.titulo}</div>
          <div className={t.grupos.length > 1 ? "grid grid-cols-2 gap-4" : ""}>
            {t.grupos.map((g, i) => (
              <div key={g.titulo ?? i}>
                {g.titulo && <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[.1em] text-doc-tenue">{g.titulo}</div>}
                <ul className={`${t.grupos.length > 1 ? "" : "columns-2 gap-5"} text-[12px] leading-[1.3]`}>
                  {g.items.map((x) => <li key={x} className="mb-0.5 break-inside-avoid pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-0.5 text-[7pt] leading-tight text-doc-tenue">Fuente: {t.fuente}</p>
        </div>
      ))}

      <Firmas compacto>
        <div className="min-w-0 flex-1 self-stretch">
          <Bloque titulo="Indicaciones del médico">
            {/* Vacío: en pantalla invita a escribir; al imprimir quedan 2 líneas para escribir a mano */}
            <p className="min-h-[9mm] rounded border border-dashed border-doc-linea px-2 py-1 text-[12px] print:rounded-none print:border-0 print:bg-[linear-gradient(transparent_calc(4.5mm-1px),#9aa7a4_calc(4.5mm-1px),#9aa7a4_4.5mm,transparent_4.5mm)] print:bg-[length:100%_4.5mm] print:px-0" {...editable} />
          </Bloque>
          <p className="text-[7pt] leading-tight text-doc-tenue">Indicado con fines preventivos. Estas recomendaciones no reemplazan la evaluación por el especialista cuando el médico la indique.</p>
        </div>
        <FirmaMedico d={d} compacto />
      </Firmas>
      <Pie d={d} derecha={`Folio ${folio("BI", d.datos.id)}`} />
    </Hoja>
  );
}
