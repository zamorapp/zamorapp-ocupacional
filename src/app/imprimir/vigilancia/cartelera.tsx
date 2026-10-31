import { Marca } from "../componentes";

// Hoja para cartelera: el resumen del art. 34 del Reglamento Parcial de la LOPCYMAT, legible a 2-3 metros.
// Cifras grandes en tres bloques (accidentes, enfermedades y atención, reposos), todo en el color de la marca:
// es información para los trabajadores, no una alarma. Sin fondos sólidos (rinde el tóner, se lee en blanco y negro).
// Solo cifras agregadas: nada identifica a nadie. Logo: el de la organización (Configuración), o sus iniciales.
// minimo: en la versión que va a la empresa, las cifras de 1 a minimo-1 salen como «<minimo», igual que en el cuadro
export function Cartelera({ id, filas, empresa, rif, titulo, subtitulo, desde, hasta, poblacion, org, logo, minimo = 0 }: {
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
  minimo?: number;
}) {
  // filasArt34: 0-1 accidentes, 2-3 enfermedades, 4 referencias, 5-8 reposos
  const bloques: [string, [string, number][]][] = [
    ["Accidentes", filas.slice(0, 2)],
    ["Enfermedades y atención", filas.slice(2, 5)],
    ["Reposos médicos", filas.slice(5)],
  ];
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
          <div className="mt-1 text-[12px] text-doc-tenue">{desde} – {hasta}</div>
        </div>
      </header>

      <div className="mt-6 text-center">
        <div className="text-[12px] font-bold uppercase tracking-[.24em] text-doc-tenue">Información para los trabajadores y las trabajadoras</div>
        <h1 className="mt-2 text-[38px] font-extrabold leading-[1.06] tracking-tight text-doc-acento">Indicadores de seguridad<br />y salud en el trabajo</h1>
        <div className="mt-2 text-[13px] font-semibold">Artículo 34 del Reglamento Parcial de la LOPCYMAT</div>
      </div>

      <div className="mt-6 space-y-4">
        {bloques.map(([nombre, lista]) => (
          <section key={nombre} className="rounded-[14px] border-2 border-doc-acento/70 px-4 pt-2.5 pb-3.5">
            <h2 className="mb-2 text-[12px] font-extrabold uppercase tracking-[.18em] text-doc-acento">{nombre}</h2>
            <div className={`grid gap-3 ${lista.length === 4 ? "grid-cols-4" : lista.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {lista.map(([concepto, n]) => (
                <div key={concepto} className="flex flex-col items-center justify-center rounded-[10px] border border-doc-linea px-2 py-3 text-center">
                  <div className={`font-cifra text-[50px] font-semibold leading-none tabular-nums ${n ? "text-doc-acento" : "text-doc-tenue"}`}>{minimo && n > 0 && n < minimo ? `<${minimo}` : n.toLocaleString("es-VE")}</div>
                  <div className="mt-2 text-[13px] font-bold leading-tight">{concepto.replace(/^Reposos por /, "Por ")}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-auto space-y-3 pt-5">
        <div className="rounded-[12px] border-2 border-dashed border-doc-acento px-5 py-3 text-center">
          <div className="text-[17px] font-extrabold text-doc-acento">¿Sufriste un accidente o un casi accidente?</div>
          <div className="mt-0.5 text-[13px] font-semibold">Avisa de inmediato a tu supervisor y al servicio médico, aunque no tengas lesión.</div>
        </div>
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <span className="whitespace-nowrap"><b className="font-cifra text-[16px] tabular-nums">{poblacion.toLocaleString("es-VE")}</b> trabajadores en el período</span>
          <span className="text-right text-[10px] text-doc-tenue">Publicado por el Servicio de Seguridad y Salud en el Trabajo{org ? ` · ${org}` : ""}. Cifras del período, sin datos personales.</span>
        </div>
      </div>
    </div>
  );
}
