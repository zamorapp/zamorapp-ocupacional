import { Fragment } from "react";
import type { DatosDocumento } from "@/lib/documentos";
import { CONTROL_TA, PLAN_BASE, PLANES } from "@/lib/indicaciones-preventivas";
import { Bloque, DatosPaciente, FirmaMedico, Firmas, Hoja, Membrete, Pie, Titulo, folio } from "./componentes";

// Hojas de indicaciones preventivas que el médico entrega al trabajador: control de tensión arterial en casa
// y plan de alimentación. Los textos se pueden tocar y cambiar en pantalla antes de imprimir (no se guardan).
const editable = { contentEditable: true, suppressContentEditableWarning: true, spellCheck: false } as const;

function Fuentes({ texto }: { texto: string }) {
  return <p className="mt-2 text-[8.5px] leading-snug text-doc-tenue"><b>Fuentes:</b> {texto}</p>;
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
    <svg viewBox="0 0 80 80" className="size-[30mm] shrink-0" aria-hidden>
      <circle cx="40" cy="40" r={r + 4} fill="#f7faf9" stroke="#d5dedc" />
      <path d={`M40 40 L40 ${40 - r} A${r} ${r} 0 0 0 40 ${40 + r} Z`} fill="#cfe7d6" stroke="#fff" strokeWidth="1.2" />
      <path d={`M40 40 L40 ${40 - r} A${r} ${r} 0 0 1 ${40 + r} 40 Z`} fill="#f6dcc9" stroke="#fff" strokeWidth="1.2" />
      <path d={`M40 40 L${40 + r} 40 A${r} ${r} 0 0 1 40 ${40 + r} Z`} fill="#f3e7b5" stroke="#fff" strokeWidth="1.2" />
      <text x="22" y="43" textAnchor="middle" fontSize="11" fontWeight="800" fill="#1d5a33">½</text>
      <text x="55" y="31" textAnchor="middle" fontSize="9" fontWeight="800" fill="#7a3e14">¼</text>
      <text x="55" y="55" textAnchor="middle" fontSize="9" fontWeight="800" fill="#6b5600">¼</text>
    </svg>
  );
}

function Columna({ titulo, items, tono }: { titulo: string; items: string[]; tono: "ok" | "aviso" | "alerta" }) {
  const color = { ok: "border-[#1d7a46] text-[#1d7a46]", aviso: "border-[#9a6a00] text-[#7a5300]", alerta: "border-[#b42318] text-[#b42318]" }[tono];
  return (
    <div className={`rounded-lg border-t-[3px] bg-[#f7faf9] px-2.5 py-2 ${color}`}>
      <div className="mb-1 text-[9.5px] font-extrabold uppercase tracking-[.12em]">{titulo}</div>
      <ul className="space-y-1 text-[10px] leading-snug text-[#15201e]">
        {items.map((x) => <li key={x} className="break-inside-avoid pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
      </ul>
    </div>
  );
}

// Plan de alimentación tipo mediterráneo; planes: esquemas por condición que el médico agregó con los botones
export function PlanAlimentacion({ d, planes = [] }: { d: DatosDocumento; planes?: string[] }) {
  const elegidos = PLANES.filter((p) => planes.includes(p.clave));
  const b = PLAN_BASE;
  return (
    <Hoja className="print:block">
      <Membrete d={d} compacto />
      <Titulo d={d} prefijo="PA" compacto sub={elegidos.length ? `Tipo mediterráneo · ${elegidos.map((p) => p.boton.toLowerCase()).join(", ")}` : "Tipo mediterráneo"}>
        Plan de alimentación saludable
      </Titulo>
      <DatosPaciente d={d} completo={false} />
      <p className="mb-3 text-[11px] leading-snug" {...editable}>{b.intro}</p>

      <div className="mb-3 flex items-center gap-4 break-inside-avoid rounded-lg border border-doc-linea px-3 py-2">
        <Plato />
        <div className="flex-1">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.13em] text-doc-acento">El plato de cada comida</div>
          {b.plato.map((p) => (
            <div key={p.texto} className="flex gap-2 text-[10.5px] leading-snug">
              <b className="w-5 font-cifra">{p.parte}</b>
              <span><b>{p.texto}:</b> <span {...editable}>{p.ejemplo}</span></span>
            </div>
          ))}
          <div className="mt-0.5 pl-7 text-[10px] text-doc-tenue">Para beber: agua. Grasa para cocinar y aliñar: aceite de oliva.</div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2.5 break-inside-avoid">
        <Columna titulo="Preferir" items={b.preferir} tono="ok" />
        <Columna titulo="Con moderación" items={b.moderar} tono="aviso" />
        <Columna titulo="Evitar" items={b.evitar} tono="alerta" />
      </div>

      {elegidos.map((p) => (
        <div key={p.clave} data-prueba={`plan-${p.clave}`} className="mb-3 break-inside-avoid rounded-lg border-l-[3px] border-doc-acento bg-doc-suave/60 px-3 py-2">
          <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{p.titulo}</div>
          <ul className="space-y-0.5 text-[10.5px] leading-snug">
            {p.items.map((x) => <li key={x} className="pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
          </ul>
          <p className="mt-1 text-[8.5px] text-doc-tenue">Fuente: {p.fuente}</p>
        </div>
      ))}

      <div className="mb-3 grid grid-cols-2 gap-4 break-inside-avoid">
        <Bloque titulo="Un día de ejemplo">
          <div className="space-y-0.5 text-[10px] leading-snug">
            {b.ejemplo.map((e, i) => <p key={i}><b>{e.comida}:</b> <span {...editable}>{e.texto}</span></p>)}
          </div>
        </Bloque>
        <Bloque titulo="Hábitos">
          <ul className="space-y-0.5 text-[10px] leading-snug">
            {b.habitos.map((x) => <li key={x} className="pl-2.5 -indent-2.5" {...editable}>• {x}</li>)}
          </ul>
        </Bloque>
      </div>

      <div className="break-inside-avoid">
        <Bloque titulo="Indicaciones del médico">
          <p className="min-h-[12mm] rounded border border-dashed border-doc-linea px-2 py-1 text-[10.5px] print:border-transparent" {...editable} />
        </Bloque>
        <Fuentes texto={b.fuentes} />
      </div>
      <Firmas compacto>
        <span className="text-[10px] text-doc-tenue">Este plan no reemplaza la evaluación por nutricionista cuando el médico la indique.</span>
        <FirmaMedico d={d} compacto />
      </Firmas>
      <Pie d={d} derecha={`Folio ${folio("PA", d.datos.id)}`} />
    </Hoja>
  );
}
