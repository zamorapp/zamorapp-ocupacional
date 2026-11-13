import type { Guia } from "@/lib/guias-salud";
import { type Cambios, lista, texto } from "@/lib/cambios-hoja";
import { DefsFiguras, FiguraSalud } from "./figuras";
import { IconoSalud } from "./iconos-salud";
import { ListaEditable, TextoEditable } from "./lista-editable";

// Guía ilustrada (dorso de la tensión arterial, diabetes): mismo lenguaje visual que las hojas de Bienestar.
// Cada texto se puede tocar en pantalla; sus claves de ?c= empiezan por «g-<clave>-».
const Seccion = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-1.5 mb-1 break-after-avoid text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{children}</div>
);

export function GuiaIlustrada({ g, cambios, sinTitulo }: { g: Guia; cambios?: Cambios; sinTitulo?: boolean }) {
  const k = (s: string) => `g-${g.clave}-${s}`;
  const t = (s: string, v: string) => texto(cambios, k(s), v);
  return (
    <section data-prueba={`guia-${g.clave}`} className="mb-1">
      <DefsFiguras />
      <div className="break-inside-avoid">
        {!sinTitulo && <h2 className="mb-1 border-b-2 border-doc-acento pb-0.5 text-[14px] font-extrabold text-doc-acento">{g.titulo}</h2>}
        {g.porque && (
          <div className="rounded-lg bg-doc-suave/70 px-3 py-1.5">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-doc-tenue">Qué le pasa y por qué</div>
            <ListaEditable id={k("porque")} items={lista(cambios, k("porque"), g.porque)} columnas className="text-[12px] leading-[1.3]" />
          </div>
        )}
      </div>

      {g.porciones && (
        <>
          <Seccion>Porciones con su mano · en cada comida</Seccion>
          <div className="grid grid-cols-4 gap-2">
            {g.porciones.map((p, i) => (
              <div key={p.figura} className="break-inside-avoid overflow-hidden rounded-xl border border-doc-linea bg-white">
                <div className="flex h-[18mm] items-center justify-center bg-gradient-to-b from-[#f3faf9] to-doc-suave">
                  <FiguraSalud nombre={p.figura} className="h-[16mm] w-auto" />
                </div>
                <div className="px-2 py-1">
                  <TextoEditable id={k(`p${i}t`)} bloque valor={t(`p${i}t`, p.titulo)} className="text-[12.5px] font-extrabold leading-tight" />
                  <TextoEditable id={k(`p${i}`)} bloque valor={t(`p${i}`, p.texto)} className="text-[12px] leading-[1.25]" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {g.comparar && (
        <>
          <Seccion>Así no · así sí</Seccion>
          <div className="grid grid-cols-4 gap-2">
            {g.comparar.map((c, i) => (
              <div key={c.figura} className={`break-inside-avoid overflow-hidden rounded-xl border bg-white ${c.bien ? "border-doc-acento/60" : "border-[#b42318]/50"}`}>
                <div className="relative flex h-[23mm] items-center justify-center">
                  <span className={`absolute top-1 left-1.5 z-10 rounded-full px-1.5 text-[10px] font-extrabold text-white ${c.bien ? "bg-doc-acento" : "bg-[#b42318]"}`}>{c.bien ? "✓ Así sí" : "✗ Así no"}</span>
                  <FiguraSalud nombre={c.figura} className="mt-2 h-[18mm] w-auto" />
                </div>
                <TextoEditable id={k(`c${i}`)} bloque valor={t(`c${i}`, c.texto)} className="px-2 pb-1 text-[12px] leading-[1.25]" />
              </div>
            ))}
          </div>
        </>
      )}

      {g.pasos && (
        <>
          <Seccion>{g.tituloPasos ?? "Paso a paso"}</Seccion>
          <div className={`grid gap-2 ${g.pasos.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
            {g.pasos.map((e, i) => (
              <div key={e.figura} className="flex break-inside-avoid flex-col overflow-hidden rounded-xl border border-doc-linea bg-white">
                <div className="relative flex h-[20.5mm] items-center justify-center bg-gradient-to-b from-[#f3faf9] to-doc-suave">
                  <span className="absolute top-1.5 left-2 z-10 inline-flex size-5 items-center justify-center rounded-full bg-doc-acento text-[10.5px] font-extrabold text-white">{i + 1}</span>
                  <FiguraSalud nombre={e.figura} className="h-[18mm] w-auto" />
                </div>
                <div className="flex flex-1 flex-col gap-0.5 px-2 py-1">
                  <TextoEditable id={k(`e${i}t`)} bloque valor={t(`e${i}t`, e.titulo)} className="text-[12.5px] font-extrabold leading-tight" />
                  <ListaEditable id={k(`e${i}p`)} items={lista(cambios, k(`e${i}p`), e.pasos)} className="text-[12px] leading-[1.25]" />
                  <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
                    {e.dosis.map((x, j) => (
                      <span key={x} className={`rounded-full px-2 py-px text-[10px] font-bold ${j === 0 ? "bg-[#fdf0e5] text-[#9a4a12]" : "bg-doc-suave text-doc-acento"}`}>
                        <TextoEditable id={k(`e${i}d${j}`)} valor={t(`e${i}d${j}`, x)} />
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {g.consejos && (
        <>
          <Seccion>{g.tituloConsejos ?? "Consejos"}</Seccion>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {g.consejos.map((c, i) => (
              <div key={c.titulo} className="flex break-inside-avoid items-start gap-2 rounded-lg border border-doc-linea px-2 py-1">
                <IconoSalud icono={c.icono} no={c.no} className="mt-0.5 size-[10mm]" />
                <div className="min-w-0">
                  <TextoEditable id={k(`k${i}t`)} bloque valor={t(`k${i}t`, c.titulo)} className="text-[12px] font-extrabold leading-tight" />
                  <TextoEditable id={k(`k${i}`)} bloque valor={t(`k${i}`, c.texto)} className="text-[12px] leading-[1.25]" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {g.alarma && (
        // La regla de la azúcar baja no se puede quitar: es una señal de alarma (se puede cambiar su texto)
        <div data-prueba={`alarma-${g.clave}`} className="mt-2 flex break-inside-avoid items-center gap-3 rounded-lg border-2 border-[#b42318] bg-[#fdecea] px-3 py-1.5">
          <FiguraSalud nombre={g.alarma.figura} className="h-[22mm] w-auto shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[11px] font-extrabold uppercase tracking-[.08em] text-[#b42318]">{g.alarma.titulo}</div>
            <ol className="list-decimal pl-4 text-[12px] leading-[1.3] text-[#15201e]">
              {/* Un paso de alarma vacío vuelve al texto de la app: nunca se imprime en blanco (Analizar #358) */}
              {g.alarma.pasos.map((p, i) => <li key={i}><TextoEditable id={k(`a${i}`)} valor={t(`a${i}`, p).trim() || p} /></li>)}
            </ol>
            <p className="mt-0.5 text-[12px] font-bold leading-snug text-[#b42318]">{g.alarma.cierre}</p>
          </div>
        </div>
      )}

      {g.nota && <TextoEditable id={k("nota")} bloque valor={t("nota", g.nota)} className="mt-1.5 break-inside-avoid rounded-md border-l-[3px] border-[#e8833a] bg-[#fdf6ef] px-2.5 py-1 text-[12px] font-semibold leading-snug" />}
      <p className="mt-0.5 text-[7pt] leading-tight text-doc-tenue">Fuente: {g.fuente}</p>
    </section>
  );
}
