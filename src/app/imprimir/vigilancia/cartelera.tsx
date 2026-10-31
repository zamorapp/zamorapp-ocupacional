import { Marca } from "../componentes";

// Hoja para cartelera: el resumen del art. 34 del Reglamento Parcial de la LOPCYMAT, legible a 2-3 metros.
// Cifras grandes, una por concepto; los de origen laboral se marcan en rojo cuando hay casos.
// Sin fondos sólidos (rinde el tóner y se lee igual en blanco y negro). Solo cifras agregadas: nada identifica a nadie.
export function Cartelera({ id, filas, empresa, rif, titulo, subtitulo, desde, hasta, poblacion, org, logo }: {
  id: string;
  filas: [string, number][];
  empresa: string;
  rif: string | null;
  titulo: string;
  subtitulo: string | null;
  desde: string;
  hasta: string;
  poblacion: number;
  org: string | null;
  logo: string | null;
}) {
  const laboral = (concepto: string) => /laboral|ocupacional/i.test(concepto);
  return (
    <div id={id} data-indice="Hoja para cartelera (art. 34)" data-indice-nivel={1} className="flex min-h-[240mm] flex-col">
      <header className="flex items-center justify-between gap-6 border-b-4 border-doc-acento pb-4">
        <div className="flex min-w-0 items-center gap-4">
          <Marca logo={logo} nombre={org ?? empresa} />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-extrabold uppercase tracking-wide">{empresa}</div>
            {rif && <div className="text-[12px] text-doc-tenue">RIF {rif}</div>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[24px] font-extrabold leading-none first-letter:uppercase">{titulo}</div>
          {subtitulo && <div className="mt-1 text-[12px] font-semibold uppercase tracking-[.08em] text-doc-tenue">{subtitulo}</div>}
          <div className="mt-1 font-cifra text-[12px] tabular-nums text-doc-tenue">{desde} – {hasta}</div>
        </div>
      </header>

      <div className="mt-6 text-center">
        <div className="text-[12px] font-bold uppercase tracking-[.24em] text-doc-tenue">Información para los trabajadores y las trabajadoras</div>
        <h1 className="mt-2 text-[34px] font-extrabold leading-[1.08] tracking-tight text-doc-acento">Indicadores de seguridad<br />y salud en el trabajo</h1>
        <div className="mt-2 text-[13px] font-semibold">Artículo 34 del Reglamento Parcial de la LOPCYMAT</div>
      </div>

      <div className="mt-7 grid grid-cols-3 gap-3.5">
        {filas.map(([concepto, n]) => {
          const alerta = laboral(concepto) && n > 0;
          return (
            <div key={concepto} className={`flex flex-col items-center justify-center rounded-[14px] border-2 px-3 py-5 text-center ${alerta ? "border-[#b42318]" : "border-doc-linea"}`}>
              <div className={`font-cifra text-[54px] font-semibold leading-none tabular-nums ${alerta ? "text-[#b42318]" : n ? "text-doc-acento" : "text-doc-tenue"}`}>{n.toLocaleString("es-VE")}</div>
              <div className="mt-2.5 text-[13.5px] font-bold leading-tight">{concepto}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-6">
        <div className="flex items-center justify-between gap-4 rounded-[12px] border-2 border-doc-acento px-5 py-3 text-[13px]">
          <span><b className="font-cifra text-[18px] tabular-nums">{poblacion.toLocaleString("es-VE")}</b> trabajadores en el período</span>
          <span className="text-right font-semibold text-doc-acento">Tu salud y tu seguridad son lo primero: reporta todo accidente o incidente.</span>
        </div>
        <p className="mt-2 text-center text-[10px] text-doc-tenue">
          Publicado por el Servicio de Seguridad y Salud en el Trabajo{org ? ` · ${org}` : ""}. Cifras del período, sin datos personales.
        </p>
      </div>
    </div>
  );
}
