import type { DatosDocumento } from "@/lib/documentos";
import { PAUSAS, REGISTRO_PAUSAS, TEMAS, temasBienestar } from "@/lib/bienestar";
import { ListaEditable, TextoEditable } from "./lista-editable";
import { type Cambios, lista, texto } from "@/lib/cambios-hoja";
import { Bloque, FirmaMedico, Firmas, Ficha, Hoja, Membrete, Pie, Titulo, folio } from "./componentes";

// Hoja de recomendaciones de bienestar para el trabajador: pausas activas (rutina por zona, frecuencia y registro
// semanal) y los temas que el médico agregue. Los textos se pueden tocar, quitar o agregar en pantalla antes de imprimir (no se guardan).

function PausasActivas({ cambios }: { cambios?: Cambios }) {
  const p = PAUSAS;
  const r = REGISTRO_PAUSAS;
  return (
    <div data-prueba="tema-pausas" className="mb-2">
      <TextoEditable id="intro" bloque valor={texto(cambios, "intro", p.intro)} className="mb-1.5 text-[12px] leading-snug text-doc-tenue" />
      {/* Cuándo: tres reglas de frecuencia en franja */}
      <div className="mb-2 grid grid-cols-3 gap-2 break-inside-avoid">
        {p.frecuencia.map((f, i) => (
          <div key={f.cifra} className="rounded-lg border border-doc-linea bg-doc-suave/60 px-2.5 py-1.5">
            <div className="font-cifra text-[15px] font-bold leading-none text-doc-acento">{f.cifra}</div>
            <TextoEditable id={`frec${i}`} bloque valor={texto(cambios, `frec${i}`, f.texto)} className="mt-0.5 text-[12px] leading-[1.3]" />
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
              {z.ejercicios.map((e, j) => (
                <li key={e.hacer} className="flex gap-2">
                  <TextoEditable id={`z${i}e${j}`} valor={texto(cambios, `z${i}e${j}`, e.hacer)} className="flex-1" />
                  <b className="shrink-0 whitespace-nowrap text-doc-acento"><TextoEditable id={`z${i}d${j}`} valor={texto(cambios, `z${i}d${j}`, e.dosis)} /></b>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3 break-inside-avoid">
        <ListaEditable id="reglas" items={lista(cambios, "reglas", p.reglas)} className="text-[12px] leading-[1.3]" />
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

export function Bienestar({ d, temas, cambios }: { d: DatosDocumento; temas?: string[]; cambios?: Cambios }) {
  const elegidos = temas?.length ? temas : temasBienestar(undefined);
  const otros = TEMAS.filter((t) => elegidos.includes(t.clave));
  const conPausas = elegidos.includes("pausas");
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

      {conPausas && <PausasActivas cambios={cambios} />}

      {otros.map((t) => {
        const listas = t.grupos.map((g, i) => lista(cambios, `${t.clave}-${i}`, g.items));
        // Si al editar todas las señales de alarma quedaron vacías, se avisa (solo en pantalla)
        const sinAlarma = t.grupos.some((g) => g.alarma) && t.grupos.every((g, i) => !g.alarma || !listas[i].length);
        return (
        <div key={t.clave} data-prueba={`tema-${t.clave}`} className="mb-2 break-inside-avoid rounded-lg border-l-[3px] border-doc-acento bg-doc-suave/60 px-3 py-1.5">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{t.titulo}</div>
          <div className={t.grupos.length > 1 ? "grid grid-cols-2 gap-4" : ""}>
            {t.grupos.map((g, i) => (
              // Señales de alarma: recuadro con borde y en negrita, para que se vean de un vistazo
              <div key={g.titulo ?? i} className={g.alarma ? "break-inside-avoid rounded-md border border-[#b42318]/50 bg-white/70 px-2 py-1 font-semibold" : ""}>
                {g.titulo && <div className={`mb-0.5 text-[9px] font-bold uppercase tracking-[.1em] ${g.alarma ? "text-[#b42318]" : "text-doc-tenue"}`}>{g.titulo}</div>}
                <ListaEditable id={`${t.clave}-${i}`} items={listas[i]} columnas={t.grupos.length === 1} fija={g.alarma} className="text-[12px] leading-[1.3]" />
              </div>
            ))}
          </div>
          {sinAlarma && <p role="alert" className="mt-1 rounded bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-900 print:hidden">Esta hoja quedó sin señales de alarma</p>}
          <p className="mt-0.5 text-[7pt] leading-tight text-doc-tenue">Fuente: {t.fuente}</p>
        </div>
        );
      })}

      <Firmas compacto>
        <div className="min-w-0 flex-1 self-stretch">
          <Bloque titulo="Indicaciones del médico">
            {/* Vacío: en pantalla invita a escribir; al imprimir quedan 2 líneas para escribir a mano */}
            <TextoEditable id="indicaciones" bloque valor={texto(cambios, "indicaciones", "")} className="min-h-[9mm] whitespace-pre-line rounded border border-dashed border-doc-linea px-2 py-1 text-[12px] print:rounded-none print:border-0 print:bg-[linear-gradient(transparent_calc(4.5mm-1px),#9aa7a4_calc(4.5mm-1px),#9aa7a4_4.5mm,transparent_4.5mm)] print:bg-[length:100%_4.5mm] print:px-0" />
          </Bloque>
          <p className="text-[7pt] leading-tight text-doc-tenue">Indicado con fines preventivos. Estas recomendaciones no reemplazan la evaluación por el especialista cuando el médico la indique.</p>
        </div>
        <FirmaMedico d={d} compacto />
      </Firmas>
      <Pie d={d} derecha={`Folio ${folio("BI", d.datos.id)}`} />
    </Hoja>
  );
}
