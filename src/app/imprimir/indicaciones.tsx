import { Fragment } from "react";
import type { DatosDocumento } from "@/lib/documentos";
import { CONTROL_TA, PLANES } from "@/lib/indicaciones-preventivas";
import { type Icono, dietaDe, sumables } from "@/lib/dietas";
import { IconoSalud } from "./iconos-salud";
import { GUIA_TA, guiaDeDieta } from "@/lib/guias-salud";
import { GuiaIlustrada } from "./guia-ilustrada";
import { primerNombre } from "./bienestar";
import { ListaEditable, TextoEditable } from "./lista-editable";
import { type Cambios, lista, texto } from "@/lib/cambios-hoja";
import { Bloque, DatosPaciente, Ficha, FirmaMedico, Firmas, Hoja, Membrete, Pie, Titulo, folio } from "./componentes";

// Hojas de indicaciones preventivas que el médico entrega al trabajador: control de tensión arterial en casa
// y plan de alimentación. Los textos se pueden tocar, quitar o agregar en pantalla antes de imprimir (no se guardan).
const editable = { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false } as const;

function Fuentes({ texto }: { texto: string }) {
  return <p className="mt-1.5 text-[7pt] leading-tight text-doc-tenue"><b>Fuentes:</b> {texto}</p>;
}

// Recuadro vacío para escribir la cifra a mano: «___ / ___»
const casillaTa = <span className="font-cifra text-[13px] text-[#c3ccca]">/</span>;

function TablaTa({ desde, hasta }: { desde: number; hasta: number }) {
  const th = "border border-doc-linea bg-doc-suave px-1 py-1 text-[8.5px] font-extrabold uppercase tracking-[.08em] text-doc-acento";
  const td = "border border-doc-linea text-center";
  const turno = (nombre: string) => <th colSpan={4} className={th}>{nombre}</th>;
  const sub = () => (["Hora", "1.ª toma", "2.ª toma", "Pulso"] as const).map((k) => <th key={k} className={`${th} bg-white text-[8px] text-doc-tenue`}>{k}</th>);
  return (
    <table data-prueba="tabla-ta" className="w-full border-collapse text-[10px]">
      <thead>
        <tr>
          <th rowSpan={2} className={`${th} w-[6%]`}>Día</th>
          <th rowSpan={2} className={`${th} w-[11%]`}>Fecha</th>
          {turno("Mañana")}
          {turno("Noche")}
          <th rowSpan={2} className={`${th} w-[17%]`}>Síntomas o medicinas</th>
        </tr>
        <tr>{sub()}{sub()}</tr>
      </thead>
      <tbody>
        {Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).map((dia) => (
          <tr key={dia} className="h-[8mm]">
            <td className={`${td} font-cifra font-semibold`}>{dia}</td>
            <td className={`${td} font-cifra text-[#c3ccca]`}>/ /</td>
            {[0, 1].map((t) => (
              <Fragment key={t}>
                <td className={`${td} w-[7%] font-cifra text-[#c3ccca]`}>:</td>
                <td className={`${td} w-[9%]`}>{casillaTa}</td>
                <td className={`${td} w-[9%]`}>{casillaTa}</td>
                <td className={`${td} w-[5.5%]`} />
              </Fragment>
            ))}
            <td className={td} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Hoja de control de tensión arterial: 7 días por hoja (14 días = dos hojas, cada una con firma y sello)
export function ControlTension({ d, dias = 7 }: { d: DatosDocumento; dias?: number }) {
  const hojas = Math.ceil(dias / 7);
  const ta = d.datos.signos?.ta?.trim();
  return (
    <>
      {Array.from({ length: hojas }, (_, h) => (
        <Hoja key={h}>
          <Membrete d={d} compacto />
          <Titulo d={d} prefijo="TA" compacto sub={`Automedición en casa · ${dias} días${hojas > 1 ? ` · hoja ${h + 1} de ${hojas}` : ""}`}>
            Control de tensión arterial
          </Titulo>
          <DatosPaciente d={d} completo={false} />
          {h === 0 && (
            <div className="mb-3 grid grid-cols-[1fr_auto] gap-3">
              <Bloque titulo="Cómo medirse">
                <ol className="list-decimal columns-2 gap-6 pl-4 text-[10px] leading-snug [&>li]:mb-0.5 [&>li]:break-inside-avoid">
                  {CONTROL_TA.pasos.map((p) => <li key={p} {...editable}>{p}</li>)}
                </ol>
              </Bloque>
              <div className="w-[44mm] self-start rounded-lg border border-doc-linea px-3 py-2 text-center">
                <div className="text-[8.5px] font-bold uppercase tracking-[.1em] text-doc-tenue">TA en la consulta</div>
                <div className="font-cifra text-[18px] font-medium">{ta ? `${ta}` : "—"}</div>
                <div className="text-[9px] text-doc-tenue">mmHg</div>
              </div>
            </div>
          )}
          <TablaTa desde={h * 7 + 1} hasta={Math.min(dias, h * 7 + 7)} />
          {h === hojas - 1 && (
            <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-doc-linea px-3 py-1.5 text-[10px]">
              <span className="text-doc-tenue">Lo llena el médico · <span {...editable}>{CONTROL_TA.referencia}</span></span>
              <span className="font-semibold">Promedio: <span className="inline-block w-24 border-b border-[#15201e]" /> mmHg</span>
            </div>
          )}
          <p data-prueba="alarma-ta" className="mt-2 rounded-lg border-2 border-[#b42318] bg-[#fdecea] px-3 py-1.5 text-[10.5px] font-semibold leading-snug text-[#b42318]" {...editable}>
            {CONTROL_TA.alarma}
          </p>
          <p className="mt-2 text-[10.5px] italic leading-snug" {...editable}>{CONTROL_TA.leyenda} Traiga esta hoja llena a su próxima consulta.</p>
          <Fuentes texto={CONTROL_TA.fuentes} />
          <Firmas compacto>
            <span />
            <FirmaMedico d={d} compacto />
          </Firmas>
          <Pie d={d} derecha={`Folio ${folio("TA", d.datos.id)}`} />
        </Hoja>
      ))}
      {/* Al dorso: cómo tomarse la tensión (con dibujos) y qué la baja */}
      <Hoja>
        <Membrete d={d} compacto />
        <Titulo d={d} prefijo="TA" compacto sub="Al dorso de su control · guárdela y léala con calma">
          {primerNombre(d.trabajador.nombre) ? `${primerNombre(d.trabajador.nombre)}, así cuida su tensión` : "Así cuida su tensión"}
        </Titulo>
        <GuiaIlustrada g={GUIA_TA} />
        <Pie d={d} derecha={`Folio ${folio("TA", d.datos.id)}`} />
      </Hoja>
    </>
  );
}

// El plato saludable dibujado: medio plato de vegetales, un cuarto de proteína y un cuarto de carbohidrato
function Plato() {
  const r = 34;
  return (
    <svg viewBox="0 0 80 80" className="size-[20mm] shrink-0" aria-hidden>
      <circle cx="40" cy="40" r={r + 4} fill="#f7faf9" stroke="#d5dedc" />
      <path d={`M40 40 L40 ${40 - r} A${r} ${r} 0 0 0 40 ${40 + r} Z`} fill="#cfe7d6" stroke="#fff" strokeWidth="1.2" />
      <path d={`M40 40 L40 ${40 - r} A${r} ${r} 0 0 1 ${40 + r} 40 Z`} fill="#f6dcc9" stroke="#fff" strokeWidth="1.2" />
      <path d={`M40 40 L${40 + r} 40 A${r} ${r} 0 0 1 40 ${40 + r} Z`} fill="#f3e7b5" stroke="#fff" strokeWidth="1.2" />
      <text x="22" y="43" textAnchor="middle" fontSize="10" fontWeight="800" fill="#1d5a33">1/2</text>
      <text x="55" y="31" textAnchor="middle" fontSize="9" fontWeight="800" fill="#7a3e14">1/4</text>
      <text x="55" y="55" textAnchor="middle" fontSize="9" fontWeight="800" fill="#6b5600">1/4</text>
    </svg>
  );
}

function Columna({ id, titulo, items, tono }: { id: string; titulo: string; items: string[]; tono: "ok" | "aviso" | "alerta" }) {
  const color = { ok: "border-[#1d7a46] text-[#1d7a46]", aviso: "border-[#9a6a00] text-[#7a5300]", alerta: "border-[#b42318] text-[#b42318]" }[tono];
  return (
    <div className={`rounded-lg border-t-[3px] bg-[#f7faf9] px-2.5 py-1.5 ${color}`}>
      <div className="mb-0.5 text-[10.5px] font-extrabold uppercase tracking-[.12em]">{titulo}</div>
      <ListaEditable id={id} items={items} className="text-[12px] leading-[1.3] text-[#15201e]" />
    </div>
  );
}

// Dibujo de cada indicación sumada al plan (se ve de un vistazo de qué trata)
const ICONO_PLAN: Record<string, Icono> = {
  hta: "sal", diabetes: "azucar", insulina: "caminar", renal: "rinon", lipidos: "corazon", peso: "balanza",
  gastrico: "estomago", colon: "intestino", "acido-urico": "gota", higado: "higado", turnos: "reloj", calor: "sol",
};

// Plan de alimentación: la dieta completa del caso que eligió el médico (?dieta=) y, abajo, las indicaciones cortas
// de otras condiciones que quiera sumar (?plan=). Cada renglón se cambia, se quita o se agrega antes de imprimir.
export function PlanAlimentacion({ d, dieta, planes = [], cambios }: { d: DatosDocumento; dieta?: string; planes?: string[]; cambios?: Cambios }) {
  const b = dietaDe(dieta);
  const extras = PLANES.filter((p) => planes.includes(p.clave) && sumables(b, p.clave));
  const guia = guiaDeDieta(b.clave);
  // Letra de 9 pt como mínimo: fluye en dos hojas; con 0 o 1 indicación sumada, el «Día de ejemplo» abre la segunda
  // hoja para que la firma no quede sola arriba de una hoja en blanco
  return (
    <>
    <Hoja className="print:block">
      <Membrete d={d} compacto />
      <Titulo d={d} prefijo="PA" compacto sub={extras.length ? `${b.boton} · con ${extras.map((p) => p.boton.toLowerCase()).join(", ")}` : b.boton}>
        {b.titulo}
      </Titulo>
      <Ficha celdas={[
        { k: "Trabajador", v: d.trabajador.nombre, destacada: true, ancho: 2 },
        { k: "Cédula", v: d.trabajador.cedula },
        { k: "Edad", v: d.trabajador.edad !== null ? `${d.trabajador.edad} años` : "" },
      ]} />

      {/* Lo más importante de esta dieta, en dibujos */}
      <div data-prueba="destacados" className="mb-2 grid grid-cols-4 gap-2 break-inside-avoid">
        {b.destacados.map((x, i) => (
          <div key={x.texto} className="flex items-center gap-2 rounded-lg border border-doc-linea px-2 py-1">
            <IconoSalud icono={x.icono} no={x.no} className="size-[11mm]" />
            <TextoEditable id={`destacado${i}`} valor={texto(cambios, `destacado${i}`, x.texto)} className="text-[11px] font-semibold leading-tight" />
          </div>
        ))}
      </div>

      <div className="mb-2 flex items-center gap-4 break-inside-avoid rounded-lg border border-doc-linea px-3 py-1.5">
        <Plato />
        <div className="flex-1">
          <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[.13em] text-doc-acento">El plato de cada comida</div>
          <TextoEditable id="intro" bloque valor={texto(cambios, "intro", b.intro)} className="mb-1 text-[12px] leading-snug text-doc-tenue" />
          {b.plato.map((p, i) => (
            <div key={p.texto} className="flex gap-2 text-[12px] leading-snug">
              <span aria-hidden className="mt-[3px] size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color }} />
              <b className="w-7 shrink-0">{p.parte}</b>
              <span><b>{p.texto}:</b> <TextoEditable id={`plato${i}`} valor={texto(cambios, `plato${i}`, p.ejemplo)} /></span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-[1.15fr_1fr_1fr] gap-2.5 break-inside-avoid">
        <Columna id="preferir" titulo="✓ Preferir" items={lista(cambios, "preferir", b.preferir)} tono="ok" />
        <Columna id="moderar" titulo="≈ Con moderación" items={lista(cambios, "moderar", b.moderar)} tono="aviso" />
        <Columna id="evitar" titulo="✕ Evitar" items={lista(cambios, "evitar", b.evitar)} tono="alerta" />
      </div>

      {extras.map((p) => (
        <div key={p.clave} data-prueba={`plan-${p.clave}`} className="mb-2 flex break-inside-avoid gap-2.5 rounded-lg border-l-[3px] border-doc-acento bg-doc-suave/60 px-3 py-1.5">
          {ICONO_PLAN[p.clave] && <IconoSalud icono={ICONO_PLAN[p.clave]!} className="mt-0.5 size-[10mm]" />}
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{p.titulo}</div>
            <ListaEditable id={`extra-${p.clave}`} items={lista(cambios, `extra-${p.clave}`, p.items)} columnas className="text-[12px] leading-[1.3]" />
            <p className="mt-0.5 text-[7pt] leading-tight text-doc-tenue">Fuente: {p.fuente}</p>
          </div>
        </div>
      ))}

      <div className={`mb-1 grid grid-cols-2 gap-4 break-inside-avoid ${extras.length <= 1 ? "print:break-before-page print:pt-[4mm]" : ""}`}>
        <Bloque titulo="Un día de ejemplo">
          <div className="space-y-0.5 text-[12px] leading-[1.3]">
            {b.ejemplo.map((e, i) => <p key={i}><b>{e.comida}:</b> <TextoEditable id={`ejemplo${i}`} valor={texto(cambios, `ejemplo${i}`, e.texto)} /></p>)}
          </div>
        </Bloque>
        <Bloque titulo="Hábitos">
          <ListaEditable id="habitos" items={lista(cambios, "habitos", b.habitos)} className="text-[12px] leading-[1.3]" />
        </Bloque>
      </div>

      {/* Indicaciones a mano y firma en la misma franja, al pie de la hoja */}
      <Firmas compacto>
        <div className="min-w-0 flex-1 self-stretch">
          <Bloque titulo="Indicaciones del médico">
            {/* Vacío: en pantalla invita a escribir; al imprimir quedan 2 líneas para escribir a mano */}
            <TextoEditable id="indicaciones" bloque valor={texto(cambios, "indicaciones", "")} className="min-h-[9mm] whitespace-pre-line rounded border border-dashed border-doc-linea px-2 py-1 text-[12px] print:rounded-none print:border-0 print:bg-[linear-gradient(transparent_calc(4.5mm-1px),#9aa7a4_calc(4.5mm-1px),#9aa7a4_4.5mm,transparent_4.5mm)] print:bg-[length:100%_4.5mm] print:px-0" />
          </Bloque>
          <Fuentes texto={`${b.fuentes} Este plan no reemplaza la evaluación por nutricionista cuando el médico la indique.`} />
        </div>
        <FirmaMedico d={d} compacto />
      </Firmas>
      <Pie d={d} derecha={`Folio ${folio("PA", d.datos.id)}`} />
    </Hoja>
    {/* Guía ilustrada de la dieta: hoja propia al final, con el nombre del trabajador */}
    {guia && (
      <Hoja>
        <Membrete d={d} compacto />
        <Titulo d={d} prefijo="PA" compacto sub="Guía para el día a día · guárdela y léala con calma">
          {primerNombre(d.trabajador.nombre) ? `${primerNombre(d.trabajador.nombre)}, ${guia.para ?? "su guía"}` : (guia.para ?? "Su guía").replace(/^./, (c) => c.toUpperCase())}
        </Titulo>
        <GuiaIlustrada g={guia} cambios={cambios} />
        <Pie d={d} derecha={`Folio ${folio("PA", d.datos.id)}`} />
      </Hoja>
    )}
    </>
  );
}
