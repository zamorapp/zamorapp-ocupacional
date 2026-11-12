import type { DatosDocumento } from "@/lib/documentos";
import { EQUILIBRIO, PAUSAS, REGISTRO_PAUSAS, TEMAS, temasBienestar } from "@/lib/bienestar";
import { DefsFiguras, FiguraEquilibrio, FiguraPausa, FiguraTema } from "./figuras";
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
      {/* Por qué: la parte teórica, en palabras sencillas */}
      <div className="mb-2 break-inside-avoid rounded-lg border-l-[3px] border-doc-acento bg-doc-suave/60 px-3 py-1.5">
        <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">¿Por qué hacer pausas activas?</div>
        <ListaEditable id="porque" items={lista(cambios, "porque", p.porque)} className="text-[12px] leading-[1.3]" />
      </div>
      {/* Cuándo: tres reglas de frecuencia en franja */}
      <div className="mb-2 grid grid-cols-3 gap-2 break-inside-avoid">
        {p.frecuencia.map((f, i) => (
          <div key={f.cifra} className="rounded-lg border border-doc-linea bg-doc-suave/60 px-2.5 py-1.5">
            <div className="font-cifra text-[15px] font-bold leading-none text-doc-acento">{f.cifra}</div>
            <TextoEditable id={`frec${i}`} bloque valor={texto(cambios, `frec${i}`, f.texto)} className="mt-0.5 text-[12px] leading-[1.3]" />
          </div>
        ))}
      </div>
      {/* Rutina: una tarjeta por zona del cuerpo; cada ejercicio con su figura y su dosis. El registro ocupa el noveno hueco */}
      <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">Rutina por zona del cuerpo</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {p.zonas.map((z, i) => (
          <div key={z.zona} className="break-inside-avoid rounded-lg border border-doc-linea px-2 py-1">
            <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[.1em]">
              <span className="inline-flex size-4 items-center justify-center rounded-full bg-doc-acento text-[8.5px] text-white">{i + 1}</span>
              {z.zona}
            </div>
            <ol className="space-y-1 text-[12px] leading-[1.25]">
              {z.ejercicios.map((e, j) => (
                <li key={e.hacer} className="flex items-center gap-1.5">
                  <span className="rounded-md bg-doc-suave/70 p-0.5"><FiguraPausa nombre={e.figura} /></span>
                  <span className="min-w-0 flex-1">
                    <TextoEditable id={`z${i}e${j}`} valor={texto(cambios, `z${i}e${j}`, e.hacer)} />
                    <b className="block text-doc-acento"><TextoEditable id={`z${i}d${j}`} valor={texto(cambios, `z${i}d${j}`, e.dosis)} /></b>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {/* Registro: el trabajador marca cada pausa hecha y trae la hoja al control */}
        <div className="break-inside-avoid rounded-lg border border-doc-linea px-2 py-1">
          <div className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[.1em] text-doc-acento">Mi registro semanal</div>
          <table className="w-full border-collapse text-[9px]" aria-label="Registro semanal de pausas">
            <thead>
              <tr>
                <th className="pr-1 text-left font-bold uppercase tracking-[.06em] text-doc-tenue">Pausa</th>
                {r.dias.map((dia) => <th key={dia} className="font-bold text-doc-tenue">{dia}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: r.pausas }, (_, i) => (
                <tr key={i}>
                  <td className="pr-1 font-cifra font-semibold">{i + 1}.ª</td>
                  {r.dias.map((dia) => <td key={dia} className="h-[6mm] border border-doc-linea" />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ListaEditable id="reglas" items={lista(cambios, "reglas", p.reglas)} className="break-inside-avoid text-[12px] leading-[1.3]" />
      <p className="mt-1 text-[7pt] leading-tight text-doc-tenue">Fuente: {p.fuente}</p>
    </div>
  );
}

// Ejercicios de equilibrio (rehabilitación vestibular): instructivo ilustrado de dos hojas, con registro de 14 días
function Equilibrio({ cambios }: { cambios?: Cambios }) {
  const q = EQUILIBRIO;
  const k = (x: string) => `equilibrio-${x}`;
  const alarma = lista(cambios, k("alarma"), q.alarma);
  return (
    <div data-prueba="tema-equilibrio" className="mb-2">
      <div className="mb-1 text-[13px] font-extrabold uppercase tracking-[.12em] text-doc-acento">Ejercicios para recuperar el equilibrio</div>
      <TextoEditable id={k("intro")} bloque valor={texto(cambios, k("intro"), q.intro)} className="mb-1.5 text-[12px] leading-snug text-doc-tenue" />
      <div className="mb-2 grid grid-cols-3 gap-2 break-inside-avoid">
        {q.frecuencia.map((f, i) => (
          <div key={f.cifra} className="flex items-center gap-2 rounded-lg bg-doc-suave px-2.5 py-1.5">
            <div className="font-cifra text-[15px] font-bold leading-none whitespace-nowrap text-doc-acento">{f.cifra}</div>
            <TextoEditable id={k(`f${i}`)} bloque valor={texto(cambios, k(`f${i}`), f.texto)} className="text-[12px] leading-[1.25]" />
          </div>
        ))}
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {q.ejercicios.map((e, i) => (
          <div key={e.figura} className="flex break-inside-avoid flex-col overflow-hidden rounded-xl border border-doc-linea">
            <div className="relative flex h-[30mm] items-center justify-center bg-gradient-to-b from-[#f3faf9] to-doc-suave">
              <span className="absolute top-1.5 left-2 inline-flex size-5 items-center justify-center rounded-full bg-doc-acento text-[10.5px] font-extrabold text-white">{i + 1}</span>
              <span className={`absolute top-1.5 right-2 rounded-full border border-doc-linea bg-white px-2 py-px text-[8.5px] font-extrabold uppercase tracking-[.1em] ${e.nivel === "Medio" ? "text-[#c2410c]" : "text-doc-acento"}`}>{e.nivel}</span>
              <FiguraEquilibrio nombre={e.figura} className="h-[26mm] w-auto" />
            </div>
            <div className="flex flex-1 flex-col gap-0.5 px-2.5 py-1.5">
              <TextoEditable id={k(`e${i}t`)} bloque valor={texto(cambios, k(`e${i}t`), e.titulo)} className="text-[13px] font-extrabold leading-tight" />
              <ListaEditable id={k(`e${i}p`)} items={lista(cambios, k(`e${i}p`), e.pasos)} className="text-[12px] leading-[1.28]" />
              <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
                {e.dosis.map((x, j) => (
                  <span key={x} className={`rounded-full px-2 py-px text-[9.5px] font-bold ${j === 0 ? "bg-[#fdf0e5] text-[#9a4a12]" : "bg-doc-suave text-doc-acento"}`}>
                    <TextoEditable id={k(`e${i}d${j}`)} valor={texto(cambios, k(`e${i}d${j}`), x)} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">Levantarse en tres tiempos</div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        {(["acostado", "sentado-borde", "de-pie-apoyado"] as const).map((f, i) => (
          <div key={f} className="break-inside-avoid overflow-hidden rounded-xl border border-doc-linea">
            <div className="flex h-[22mm] items-center justify-center bg-gradient-to-b from-[#f3faf9] to-doc-suave"><FiguraEquilibrio nombre={f} className="h-[19mm] w-auto" /></div>
            <p className="px-2.5 py-1 text-[12px] leading-[1.28]"><b className="text-doc-acento">{i + 1}.</b> <TextoEditable id={k(`l${i}`)} valor={texto(cambios, k(`l${i}`), q.levantarse[i])} /></p>
          </div>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className="break-inside-avoid">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">Si siente que se va a desmayar</div>
          <div className="overflow-hidden rounded-xl border border-doc-linea">
            <div className="flex h-[22mm] items-center justify-center bg-gradient-to-b from-[#f3faf9] to-doc-suave"><FiguraEquilibrio nombre="contra-desmayo" className="h-[19mm] w-auto" /></div>
            <TextoEditable id={k("d")} bloque valor={texto(cambios, k("d"), q.desmayo)} className="px-2.5 py-1 text-[12px] leading-[1.28]" />
          </div>
          <div className="mt-2 mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">En el trabajo, mientras se recupera</div>
          <ListaEditable id={k("trabajo")} items={lista(cambios, k("trabajo"), q.trabajo)} className="text-[12px] leading-[1.28]" />
        </div>
        <div className="break-inside-avoid">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">Registro de 14 días · marque cada sesión</div>
          <table className="w-full border-collapse overflow-hidden rounded-lg text-[9.5px]" aria-label="Registro de ejercicios de equilibrio">
            <thead>
              <tr className="bg-doc-suave text-doc-acento">
                <th className="border border-doc-linea py-0.5 pl-1.5 text-left">Semana</th>
                {["L", "M", "M", "J", "V", "S", "D"].map((x, i) => <th key={i} className="border border-doc-linea">{x}</th>)}
              </tr>
            </thead>
            <tbody>
              {["1 · mañana", "1 · tarde", "1 · noche", "2 · mañana", "2 · tarde", "2 · noche", "Mareo de 0 a 10"].map((f) => (
                <tr key={f}>
                  <td className="border border-doc-linea pl-1.5 font-semibold whitespace-nowrap">{f}</td>
                  {Array.from({ length: 7 }, (_, i) => <td key={i} className="h-[6.2mm] border border-doc-linea" />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex break-inside-avoid items-start gap-2.5 rounded-xl border border-[#b42318]/40 bg-[#fff4ef] px-3 py-1.5">
        <svg viewBox="0 0 34 34" className="mt-0.5 size-6 shrink-0" aria-hidden><path d="M17 3 L32 30 L2 30 Z" fill="#b42318" /><rect x="15.5" y="12" width="3" height="10" rx="1.5" fill="#fff" /><circle cx="17" cy="25.5" r="1.8" fill="#fff" /></svg>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-extrabold text-[#b42318]">Acuda a emergencia si aparece</div>
          <ListaEditable id={k("alarma")} items={alarma} columnas fija className="text-[12px] leading-[1.28] font-semibold" />
          {!alarma.length && <p role="alert" className="mt-1 rounded bg-amber-100 px-2 py-1 text-[12px] font-medium text-amber-900 print:hidden">Esta hoja quedó sin señales de alarma</p>}
        </div>
      </div>
      <p className="mt-1 text-[7pt] leading-tight text-doc-tenue">Fuente: {q.fuente}</p>
    </div>
  );
}

// Texto de una regla CSS a partir de datos del paciente: todo lo que no sea letra simple, número o espacio va como
// escape CSS (\HHHH), así ningún nombre puede cerrar la cadena ni la etiqueta <style>
const textoCss = (t: string) => Array.from(t).map((c) => (/[A-Za-z0-9 ]/.test(c) ? c : `\\${c.codePointAt(0)!.toString(16)} `)).join("");

// Desde la 2.ª hoja: arriba «Nombre · C.I. · Folio» y «Hoja N de M», como pide Diseño para los impresos de varias hojas.
// La 1.ª ya lleva membrete y ficha. Esta página imprime una sola hoja de bienestar (nunca va en lote ni en paquete).
function IdentificacionHojas({ d }: { d: DatosDocumento }) {
  const id = textoCss(`${d.trabajador.nombre} · C.I. ${d.trabajador.cedula} · Recomendaciones de bienestar · Folio ${folio("BI", d.datos.id)}`);
  const css = `@page { @top-left { content: "${id}"; width: 75%; font: 7.5pt ui-monospace, Consolas, monospace; color: #55625f; } @top-right { content: "Hoja " counter(page) " de " counter(pages); font: 7.5pt ui-monospace, Consolas, monospace; color: #55625f; } } @page :first { @top-left { content: ""; } @top-right { content: ""; } }`;
  return <style>{css}</style>;
}

// «MARÍA ALEJANDRA FERNÁNDEZ» → «María»: el saludo usa solo el primer nombre
const primerNombre = (nombre: string) => {
  const p = nombre.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toLocaleUpperCase("es") + p.slice(1).toLocaleLowerCase("es") : "";
};

export function Bienestar({ d, temas, cambios }: { d: DatosDocumento; temas?: string[]; cambios?: Cambios }) {
  const elegidos = temas?.length ? temas : temasBienestar(undefined);
  const otros = TEMAS.filter((t) => elegidos.includes(t.clave));
  const conPausas = elegidos.includes("pausas");
  const conEquilibrio = elegidos.includes("equilibrio");
  const nombres = [conPausas && "pausas activas", conEquilibrio && "ejercicios de equilibrio", ...otros.map((t) => t.boton.toLowerCase())].filter(Boolean).join(", ");
  // Pausas ilustradas y equilibrio ocupan dos hojas; con más temas la hoja fluye a las que hagan falta
  const fluye = conPausas || conEquilibrio || otros.length > 2;
  const nombre = primerNombre(d.trabajador.nombre);
  const saludo = `${nombre ? `${nombre}, p` : "P"}reparamos estas recomendaciones para usted, para cuidar su salud en el trabajo y en casa. Léalas con calma y tráigalas a su próximo control.`;
  return (
    <Hoja className={fluye ? "print:block" : ""}>
      <DefsFiguras />
      {fluye && <IdentificacionHojas d={d} />}
      <Membrete d={d} compacto />
      <Titulo d={d} prefijo="BI" compacto sub={nombres}>
        Recomendaciones de bienestar
      </Titulo>
      <Ficha celdas={[
        { k: "Trabajador", v: d.trabajador.nombre, destacada: true, ancho: 2 },
        { k: "Cédula", v: d.trabajador.cedula },
        { k: "Cargo", v: d.trabajador.cargo },
      ]} />
      {/* Saludo con el primer nombre: cálido y editable (es de este paciente, no entra en la versión del servicio) */}
      <TextoEditable id="saludo" bloque valor={texto(cambios, "saludo", saludo)} className="-mt-2 mb-2 rounded-lg border-l-[3px] border-[#e8833a] bg-[#fdf6ef] px-3 py-1 text-[12px] leading-snug italic" />

      {conPausas && <PausasActivas cambios={cambios} />}
      {conEquilibrio && <Equilibrio cambios={cambios} />}

      {otros.map((t) => {
        const listas = t.grupos.map((g, i) => lista(cambios, `${t.clave}-${i}`, g.items));
        // Si al editar todas las señales de alarma quedaron vacías, se avisa (solo en pantalla)
        const sinAlarma = t.grupos.some((g) => g.alarma) && t.grupos.every((g, i) => !g.alarma || !listas[i].length);
        return (
        <div key={t.clave} data-prueba={`tema-${t.clave}`} className="mb-2 break-inside-avoid rounded-lg border-l-[3px] border-doc-acento bg-doc-suave/60 px-3 py-1.5">
          <div className="mb-1 flex items-center gap-3">
            <FiguraTema clave={t.clave} />
            <div className="text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{t.titulo}</div>
          </div>
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

      <div className="break-inside-avoid [break-before:avoid]">
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
      </div>
      <Pie d={d} derecha={`Folio ${folio("BI", d.datos.id)}`} />
    </Hoja>
  );
}
