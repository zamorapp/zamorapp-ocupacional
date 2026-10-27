import type { AjustesDocumentos } from "@/lib/documentos";
import { claveRiesgo, ESCALA_P, ESCALA_S, GRUPOS, nivelRiesgo, type GrupoRiesgo, type Valoracion } from "@/lib/puestos-tipos";
import { Bloque, CasillaSello, fechaCorta, Ficha, Firmas, folio, Hoja, Lista, Membrete, Pie } from "../componentes";

// Colores de papel por nivel (legibles también en blanco y negro por el texto)
const NIVEL: Record<string, string> = {
  Bajo: "bg-[#e7f4ec] text-[#1d7a46]",
  Medio: "bg-[#fdf4dc] text-[#7a5300]",
  Alto: "bg-[#fdecea] text-[#b42318]",
  Crítico: "bg-[#b42318] text-white",
};
const celdaMapa = (n: number) => (n <= 4 ? "bg-[#e7f4ec]" : n <= 9 ? "bg-[#fdf4dc]" : n <= 16 ? "bg-[#fbd9d5]" : "bg-[#f1a59c]");

const Linea = ({ rol, nombre, detalle }: { rol: string; nombre?: string | null; detalle?: string | null }) => (
  <div className="w-36 text-center text-[10px] leading-[1.35]">
    <div className="mb-1 h-14 border-b border-[#15201e]" />
    {nombre && <div className="text-[11px] font-bold">{nombre}</div>}
    {detalle && <div className="text-doc-tenue">{detalle}</div>}
    <div className="text-doc-tenue">{rol}</div>
  </div>
);

export type DatosPuesto = {
  id: string; codigo: string | null; nombre: string; descripcion: string | null; tareas: string | null; herramientas: string | null; turno: string | null;
  riesgos: unknown; evaluacion: unknown; epp: string | null; recomendaciones: string | null; evaluado_en: string | null; dependencia: string | null;
};
export type Evaluador = {
  nombre_completo: string; especialidad: string | null; mpps: string | null; registro_inpsasel: string | null;
  mostrar_firma: boolean; mostrar_sello: boolean; firma_url: string | null; sello_url: string | null;
} | null;
type Doc = {
  org: { nombre: string; rif: string | null; direccion: string | null; telefono: string | null; correo: string | null; logo: string | null; ajustes: AjustesDocumentos };
  empresa: { razon_social: string; rif: string; logo: string | null };
  impreso: { por: string; el: string };
};

// Informe de evaluación del puesto de trabajo: descripción, matriz de riesgos 5×5, mapa de calor, EPP,
// recomendaciones y trabajadores expuestos, con firma de quien evaluó, de la empresa y del delegado de prevención.
export function InformePuesto({ doc, p, expuestos, ev }: { doc: Doc; p: DatosPuesto; expuestos: { nombres: string; apellidos: string; cedula: string; fecha_ingreso: string | null }[]; ev: Evaluador }) {
  const riesgos = (p.riesgos ?? {}) as Partial<Record<GrupoRiesgo, string[]>>;
  const evaluacion = (p.evaluacion ?? {}) as Record<string, Valoracion>;
  const filas = GRUPOS.flatMap(([g, grupo]) =>
    (riesgos[g] ?? []).map((agente) => {
      const v = evaluacion[claveRiesgo(g, agente)];
      return { grupo, agente, v, nivel: nivelRiesgo(v) };
    }),
  ).sort((a, b) => (b.nivel?.n ?? -1) - (a.nivel?.n ?? -1));
  const conteo = ["Crítico", "Alto", "Medio", "Bajo"].map((t) => [t, filas.filter((f) => f.nivel?.texto === t).length] as const);
  const sinValorar = filas.filter((f) => !f.nivel).length;
  const max = filas.find((f) => f.nivel)?.nivel ?? null;
  // Mapa de calor: cuántos agentes caen en cada celda probabilidad × severidad
  const mapa = new Map<string, number>();
  for (const f of filas) if (f.nivel) mapa.set(`${f.v!.p}-${f.v!.s}`, (mapa.get(`${f.v!.p}-${f.v!.s}`) ?? 0) + 1);
  // Si no se escribieron recomendaciones, se proponen a partir de los riesgos altos y críticos
  const prioritarios = filas.filter((f) => f.nivel && f.nivel.n >= 10);
  const recomendaciones =
    p.recomendaciones?.trim() ||
    (prioritarios.length
      ? prioritarios.map((f) => `${f.agente} (${f.nivel!.texto.toLowerCase()}): ${f.v?.control?.trim() || "aplicar medidas de control de ingeniería o administrativas y vigilar la salud de los expuestos"}.`).join("\n")
      : "");
  const dependencia = p.dependencia;
  const firma = ev && ev.mostrar_firma !== false ? ev.firma_url : null;
  const sello = ev && ev.mostrar_sello !== false ? ev.sello_url : null;

  return (
    <Hoja className="print:block">
      <Membrete d={doc} />
      <div className="mt-5 mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">Evaluación del puesto de trabajo</h1>
          <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">Matriz de riesgos · LOPCYMAT</span>
        </div>
        <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
          <div>Folio <b className="font-medium text-[#15201e]">{folio("EP", p.id)}</b></div>
          <div>Evaluado <b className="font-medium text-[#15201e]">{fechaCorta(p.evaluado_en)}</b></div>
        </div>
      </div>
      <Ficha
        celdas={[
          { k: "Puesto", v: p.nombre, ancho: 2, destacada: true },
          { k: "Código", v: p.codigo },
          { k: "Turno", v: p.turno },
          { k: "Dependencia", v: dependencia, ancho: 2 },
          { k: "Trabajadores expuestos", v: String(expuestos.length) },
          { k: "Riesgo máximo", v: max ? `${max.texto} (${max.n})` : "Sin valorar" },
        ]}
      />
      {(p.descripcion || p.tareas) && <Bloque titulo="Descripción y tareas">{[p.descripcion, p.tareas].filter(Boolean).join("\n")}</Bloque>}
      {p.herramientas && <Bloque titulo="Herramientas y equipos">{p.herramientas}</Bloque>}

      <Bloque titulo="Resumen de la valoración">
        <div className="grid grid-cols-[1fr_auto] items-start gap-5">
          <div className="grid grid-cols-5 gap-2">
            {conteo.map(([t, n]) => (
              <div key={t} className={`rounded-lg px-2.5 py-1.5 ${n ? NIVEL[t] : "border border-doc-linea text-doc-tenue"}`}>
                <div className="text-[8.5px] font-bold uppercase tracking-[.1em]">{t}</div>
                <div className="font-cifra text-[18px] font-medium">{n}</div>
              </div>
            ))}
            <div className="rounded-lg border border-doc-linea px-2.5 py-1.5 text-doc-tenue">
              <div className="text-[8.5px] font-bold uppercase tracking-[.1em]">Sin valorar</div>
              <div className="font-cifra text-[18px] font-medium">{sinValorar}</div>
            </div>
            <p className="col-span-5 text-[9.5px] text-doc-tenue">Nivel = probabilidad × severidad (1 a 5). Bajo 1–4 · Medio 5–9 · Alto 10–16 · Crítico 20–25.</p>
          </div>
          <table className="border-collapse font-cifra text-[9px]" aria-label="Mapa de calor">
              <caption className="caption-bottom pt-0.5 text-[8.5px] text-doc-tenue">P probabilidad · S severidad</caption>
            <tbody>
              {[5, 4, 3, 2, 1].map((pr) => (
                <tr key={pr}>
                  <th className="pr-1 text-right font-normal text-doc-tenue" title={ESCALA_P[pr]}>P{pr}</th>
                  {[1, 2, 3, 4, 5].map((se) => (
                    <td key={se} className={`size-[22px] border border-white text-center font-bold ${celdaMapa(pr * se)}`}>{mapa.get(`${pr}-${se}`) || ""}</td>
                  ))}
                </tr>
              ))}
              <tr><td />{[1, 2, 3, 4, 5].map((se) => <th key={se} className="pt-0.5 font-normal text-doc-tenue" title={ESCALA_S[se]}>S{se}</th>)}</tr>
            </tbody>
          </table>
        </div>
      </Bloque>

      <Bloque titulo="Matriz de riesgos">
        {filas.length === 0 ? (
          <p>No hay agentes de riesgo marcados para este puesto.</p>
        ) : (
          <table className="w-full border-collapse text-[10.5px]">
            <thead>
              <tr className="border-b border-doc-linea text-left text-[8.5px] uppercase tracking-[.1em] text-doc-tenue">
                <th className="py-1 pr-2 font-semibold">Tipo</th>
                <th className="py-1 pr-2 font-semibold">Agente</th>
                <th className="py-1 pr-2 font-semibold">Probabilidad</th>
                <th className="py-1 pr-2 font-semibold">Severidad</th>
                <th className="py-1 pr-2 font-semibold">Nivel</th>
                <th className="py-1 font-semibold">Medida de control</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.grupo}-${f.agente}`} className="break-inside-avoid border-b border-doc-linea/70 align-top">
                  <td className="py-1 pr-2 text-doc-tenue">{f.grupo}</td>
                  <td className="py-1 pr-2 font-semibold">{f.agente}</td>
                  <td className="py-1 pr-2">{f.v?.p ? `${f.v.p} · ${ESCALA_P[f.v.p]}` : "—"}</td>
                  <td className="py-1 pr-2">{f.v?.s ? `${f.v.s} · ${ESCALA_S[f.v.s]}` : "—"}</td>
                  <td className="py-1 pr-2">
                    {f.nivel ? <span className={`whitespace-nowrap rounded px-1.5 py-[1px] font-bold ${NIVEL[f.nivel.texto]}`}>{f.nivel.texto} {f.nivel.n}</span> : <span className="text-doc-tenue">Sin valorar</span>}
                  </td>
                  <td className="py-1">{f.v?.control || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloque>

      {p.epp && <Bloque titulo="Equipos de protección personal requeridos"><Lista texto={p.epp} /></Bloque>}
      {recomendaciones && <Bloque titulo="Recomendaciones"><Lista texto={recomendaciones} /></Bloque>}

      {expuestos.length > 0 && (
        <Bloque titulo={`Trabajadores expuestos (${expuestos.length})`}>
          <ol className={`list-decimal pl-5 text-[10.5px] ${expuestos.length > 8 ? "columns-2 gap-7" : ""}`}>
            {expuestos.map((t) => (
              <li key={t.cedula} className="break-inside-avoid">
                {t.apellidos} {t.nombres} · C.I. {t.cedula}{t.fecha_ingreso ? ` · ingreso ${fechaCorta(t.fecha_ingreso)}` : ""}
              </li>
            ))}
          </ol>
        </Bloque>
      )}

      <Firmas>
        <div className="flex items-end gap-3">
          <div className="w-48 text-center text-[10px] leading-[1.35]">
            <div className="relative mb-1 h-14 border-b border-[#15201e]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {firma && <img src={firma} alt="" className="absolute inset-x-0 -bottom-2 mx-auto max-h-20 max-w-[90%] object-contain" />}
            </div>
            <div className="text-[11px] font-bold">{ev?.nombre_completo ?? "—"}</div>
            <div className="text-doc-tenue">{[ev?.especialidad || "Evaluador", ev?.mpps && `MPPS ${ev.mpps}`, ev?.registro_inpsasel && `INPSASEL ${ev.registro_inpsasel}`].filter(Boolean).join(" · ")}</div>
          </div>
          <CasillaSello imagen={sello} className="h-[64px] w-[104px]" />
        </div>
        <Linea rol="Representante de la empresa" />
        <Linea rol="Delegado(a) de prevención" />
      </Firmas>
      <Pie d={doc} derecha={`Folio ${folio("EP", p.id)}`} />
    </Hoja>
  );
}
