import { Fragment } from "react";
import type { DatosDocumento } from "@/lib/documentos";
import { CONTROL_TA, PLAN_BASE, PLANES } from "@/lib/indicaciones-preventivas";
import { Bloque, DatosPaciente, Ficha, FirmaMedico, Firmas, Hoja, Membrete, Pie, Titulo, folio } from "./componentes";

// Hojas de indicaciones preventivas que el médico entrega al trabajador: control de tensión arterial en casa
// y plan de alimentación. Los textos se pueden tocar y cambiar en pantalla antes de imprimir (no se guardan).
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

function Columna({ titulo, items, tono }: { titulo: string; items: string[]; tono: "ok" | "aviso" | "alerta" }) {
  const color = { ok: "border-[#1d7a46] text-[#1d7a46]", aviso: "border-[#9a6a00] text-[#7a5300]", alerta: "border-[#b42318] text-[#b42318]" }[tono];
  return (
    <div className={`rounded-lg border-t-[3px] bg-[#f7faf9] px-2.5 py-1.5 ${color}`}>
      <div className="mb-0.5 text-[9.5px] font-extrabold uppercase tracking-[.12em]">{titulo}</div>
      <ul className="space-y-0.5 text-[9.5px] leading-[1.3] text-[#15201e]">
        {items.map((x) => <li key={x} className="break-inside-avoid pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
      </ul>
    </div>
  );
}

// Plan de alimentación tipo mediterráneo; planes: esquemas por condición que el médico agregó con los botones
export function PlanAlimentacion({ d, planes = [] }: { d: DatosDocumento; planes?: string[] }) {
  const elegidos = PLANES.filter((p) => planes.includes(p.clave));
  const b = PLAN_BASE;
  // Con un esquema cabe en una carta y la firma va al pie; con más, la hoja fluye a una segunda página
  return (
    <Hoja className={elegidos.length > 1 ? "print:block" : ""}>
      <Membrete d={d} compacto />
      <Titulo d={d} prefijo="PA" compacto sub={elegidos.length ? `Tipo mediterráneo · ${elegidos.map((p) => p.boton.toLowerCase()).join(", ")}` : "Tipo mediterráneo"}>
        Plan de alimentación saludable
      </Titulo>
      <Ficha celdas={[
        { k: "Trabajador", v: d.trabajador.nombre, destacada: true, ancho: 2 },
        { k: "Cédula", v: d.trabajador.cedula },
        { k: "Edad", v: d.trabajador.edad !== null ? `${d.trabajador.edad} años` : "" },
      ]} />

      <div className="mb-2 flex items-center gap-4 break-inside-avoid rounded-lg border border-doc-linea px-3 py-1.5">
        <Plato />
        <div className="flex-1">
          <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[.13em] text-doc-acento">El plato de cada comida</div>
          <p className="mb-1 text-[10px] leading-snug text-doc-tenue" {...editable}>{b.intro}</p>
          {b.plato.map((p) => (
            <div key={p.texto} className="flex gap-2 text-[10.5px] leading-snug">
              <span aria-hidden className="mt-[3px] size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color }} />
              <b className="w-7 shrink-0">{p.parte}</b>
              <span><b>{p.texto}:</b> <span {...editable}>{p.ejemplo}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-2 grid grid-cols-[1.15fr_1fr_1fr] gap-2.5 break-inside-avoid">
        <Columna titulo="✓ Preferir" items={b.preferir} tono="ok" />
        <Columna titulo="≈ Con moderación" items={b.moderar} tono="aviso" />
        <Columna titulo="✕ Evitar" items={b.evitar} tono="alerta" />
      </div>

      {elegidos.map((p) => (
        <div key={p.clave} data-prueba={`plan-${p.clave}`} className="mb-2 break-inside-avoid rounded-lg border-l-[3px] border-doc-acento bg-doc-suave/60 px-3 py-1.5">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{p.titulo}</div>
          <ul className="columns-2 gap-5 text-[9.5px] leading-[1.3]">
            {p.items.map((x) => <li key={x} className="mb-0.5 break-inside-avoid pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
          </ul>
          <p className="mt-0.5 text-[7pt] leading-tight text-doc-tenue">Fuente: {p.fuente}</p>
        </div>
      ))}

      <div className="mb-1 grid grid-cols-2 gap-4 break-inside-avoid">
        <Bloque titulo="Un día de ejemplo">
          <div className="space-y-0.5 text-[9.5px] leading-[1.3]">
            {b.ejemplo.map((e, i) => <p key={i}><b>{e.comida}:</b> <span {...editable}>{e.texto}</span></p>)}
          </div>
        </Bloque>
        <Bloque titulo="Hábitos">
          <ul className="space-y-0.5 text-[9.5px] leading-[1.3]">
            {b.habitos.map((x) => <li key={x} className="pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
          </ul>
        </Bloque>
      </div>

      {/* Indicaciones a mano y firma en la misma franja, al pie de la hoja */}
      <Firmas compacto>
        <div className="min-w-0 flex-1 self-stretch">
          <Bloque titulo="Indicaciones del médico">
            {/* Vacío: en pantalla invita a escribir; al imprimir quedan 2 líneas para escribir a mano */}
            <p className="min-h-[9mm] rounded border border-dashed border-doc-linea px-2 py-1 text-[10.5px] print:rounded-none print:border-0 print:bg-[linear-gradient(transparent_calc(4.5mm-1px),#9aa7a4_calc(4.5mm-1px),#9aa7a4_4.5mm,transparent_4.5mm)] print:bg-[length:100%_4.5mm] print:px-0" {...editable} />
          </Bloque>
          <Fuentes texto={`${b.fuentes} Este plan no reemplaza la evaluación por nutricionista cuando el médico la indique.`} />
        </div>
        <FirmaMedico d={d} compacto />
      </Firmas>
      <Pie d={d} derecha={`Folio ${folio("PA", d.datos.id)}`} />
    </Hoja>
  );
}
