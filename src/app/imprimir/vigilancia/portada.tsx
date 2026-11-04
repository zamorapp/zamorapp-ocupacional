import { CUSTODIO, centroPorDefecto, conNombre, datosPortada, DOCUMENTO, representantesDe, servicioDe, type Firmantes, type Persona } from "@/lib/firmantes";
import { fechaCorta as corta, type Periodo } from "@/lib/periodos";
import { Hoja, Marca } from "../componentes";

type FichaEmpresa = Parameters<typeof datosPortada>[0];
const num = (n: number) => n.toLocaleString("es-VE");
// Dato faltante: aviso en pantalla, raya en el papel
const Falta = () => <><span className="font-semibold text-red-700 print:hidden">Falta</span><span className="hidden print:inline">—</span></>;

// Fecha de emisión (AAAA-MM-DD, ya resuelta con fechaEmisionDe) en letras
const emision = (fecha: string) =>
  new Date(`${fecha}T12:00:00-04:00`).toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "numeric", month: "long", year: "numeric" });

// Encabezado de sección: número, título y filete; sobrio, se lee igual en blanco y negro
function Seccion({ n, titulo }: { n: string; titulo: string }) {
  return (
    <div className="mt-4 mb-2 flex items-center gap-2.5">
      <span className="text-[10px] font-extrabold tabular-nums text-doc-acento">{n}</span>
      <h2 className="text-[10.5px] font-extrabold uppercase tracking-[.16em] text-[#15201e]">{titulo}</h2>
      <span className="h-px flex-1 bg-doc-linea" />
    </div>
  );
}

// Un dato de la empresa: etiqueta pequeña arriba, valor abajo (ficha corporativa, no formulario)
function Dato({ k, v, col = 1, fuerte, borde }: { k: string; v: string | null; col?: 1 | 2 | 3; fuerte?: boolean; borde?: boolean }) {
  return (
    <div className={`border-t border-doc-linea px-3 py-1.5 ${col === 3 ? "col-span-3" : col === 2 ? "col-span-2" : ""} ${borde ? "border-l" : ""}`}>
      <div className="text-[8.5px] font-bold uppercase tracking-[.14em] text-doc-tenue">{k}</div>
      <div className={`mt-0.5 leading-snug ${fuerte ? "text-[13px] font-extrabold tracking-tight" : "text-[11.5px] font-medium"}`}>{v || <Falta />}</div>
    </div>
  );
}

// Una fila por persona; el rol encabeza su grupo y ocupa todas sus filas
function FilasFirma({ rol, personas, compacta }: { rol: string; personas: Persona[]; compacta: boolean }) {
  const filas = personas.length ? personas : [undefined];
  const td = "border-b border-doc-linea px-2.5 align-middle";
  return filas.map((p, i) => (
    <tr key={i} className="break-inside-avoid">
      {i === 0 && (
        <th rowSpan={filas.length} scope="row" className={`${td} w-[24%] border-r bg-doc-suave/60 py-1.5 text-left align-top text-[9px] font-bold uppercase leading-snug tracking-[.08em] text-doc-acento`}>
          {rol}
        </th>
      )}
      <td className={`${td} py-1`}>
        {p?.nombre ? (
          // Compacta (más de 8 firmantes): nombre y cargo en una línea
          <div className={compacta ? "leading-tight" : ""}>
            <span className={`${compacta ? "" : "block"} text-[11.5px] font-semibold leading-tight`}>{p.nombre}</span>
            {(p.cargo || p.registro) && (
              <span className={`${compacta ? "ml-1.5 text-[9px]" : "block text-[9.5px] leading-snug"} text-doc-tenue`}>
                {compacta && "· "}{[p.cargo, p.registro && `Reg. ${p.registro}`].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        ) : <span className="text-[10px] italic text-doc-tenue"><span className="print:hidden">Sin datos: complétalo en Reportes › Redacción del informe › Portada y firmantes</span></span>}
      </td>
      <td className={`${td} w-[15%] whitespace-nowrap text-[10.5px] tabular-nums`}>{p?.cedula ? `C.I. ${p.cedula}` : ""}</td>
      {/* Espacio de firma: 11,6 mm (44 px); con más de 8 firmantes, 7,5 mm para que todo quepa en una hoja */}
      <td className={`${td} ${compacta ? "h-[7.5mm]" : "h-[11.6mm]"} w-[25%] border-l`} />
    </tr>
  ));
}

// Portada del informe de vigilancia: control del documento, identificación de la empresa (de su ficha) y
// responsables del sistema (de Reportes › Portada y firmantes). Cabe en una hoja Carta con hasta 11 firmantes (con más de 8, filas compactas).
export function Portada({ logoEmpresa, orgLogo, empresa, firmantes, fechaEmision, titulo, subtitulo, periodo, poblacion, org }: {
  logoEmpresa: string | null;
  orgLogo: string | null;
  empresa: FichaEmpresa | null;
  firmantes: Firmantes;
  /** AAAA-MM-DD: nunca vacía (fechaEmisionDe) */
  fechaEmision: string;
  titulo: string;
  subtitulo: string | null;
  periodo: Pick<Periodo, "desde" | "hasta">;
  poblacion: { total: number; femenino: number; masculino: number };
  org: string | null;
}) {
  const ficha = empresa ? Object.fromEntries(datosPortada(empresa, poblacion, firmantes.trabajadores)) as Record<string, string | null> : null;
  const centro = firmantes.centro_trabajo || centroPorDefecto(empresa?.direccion) || null;
  const firmas = { medico: conNombre([firmantes.medico!]), servicio: conNombre(servicioDe(firmantes)), representantes: conNombre(representantesDe(firmantes)), delegados: conNombre(firmantes.delegados) };
  const compacta = Object.values(firmas).reduce((n, l) => n + Math.max(l.length, 1), 0) > 8;
  const control: [string, string][] = [
    ["Documento", DOCUMENTO],
    ["Custodio", firmantes.custodio || CUSTODIO],
    ...(firmantes.autoridad ? ([["Aprobado por", firmantes.autoridad]] as [string, string][]) : []),
    ["Fecha de emisión", emision(fechaEmision)],
  ];
  return (
    <Hoja>
      {/* Logos: la empresa a la izquierda; a la derecha, el servicio que elabora */}
      <header className="flex items-center justify-between gap-6 border-b border-doc-linea pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoEmpresa ? <img src={logoEmpresa} alt="" className="h-14 max-w-44 object-contain" /> : <Marca logo={orgLogo} nombre={org ?? ""} />}
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-[8.5px] font-bold uppercase tracking-[.16em] text-doc-tenue">Elaborado por el servicio médico</div>
            <div className="text-[11px] font-semibold">{org}</div>
          </div>
          {logoEmpresa && <Marca logo={orgLogo} nombre={org ?? ""} />}
        </div>
      </header>

      {/* Título: sin fondo sólido (rinde el tóner), filete de acento a la izquierda */}
      <div className="mt-5 border-l-[5px] border-doc-acento pl-5">
        <div className="text-[9.5px] font-bold uppercase tracking-[.24em] text-doc-acento">Sistema de vigilancia epidemiológica ocupacional</div>
        <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.08] tracking-tight text-[#15201e]">Informe de vigilancia de la salud de los trabajadores</h1>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[16px] font-extrabold text-doc-acento first-letter:uppercase">{titulo}</span>
          {subtitulo && <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-doc-tenue">{subtitulo}</span>}
          <span className="text-[11px] tabular-nums text-doc-tenue">Del {corta(periodo.desde)} al {corta(periodo.hasta)}</span>
        </div>
        <div className="mt-1 text-[9.5px] text-doc-tenue">Artículo 34 del Reglamento Parcial de la LOPCYMAT · Documento confidencial de salud ocupacional</div>
      </div>

      {/* Control del documento */}
      <dl className={`mt-4 grid overflow-hidden rounded-[8px] border border-doc-linea ${control.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {control.map(([k, v], i) => (
          <div key={k} className={`px-3 py-2 ${i ? "border-l border-doc-linea" : ""}`}>
            <dt className="text-[8.5px] font-bold uppercase tracking-[.14em] text-doc-tenue">{k}</dt>
            <dd className="mt-0.5 text-[11px] font-semibold leading-snug first-letter:uppercase">{v}</dd>
          </div>
        ))}
      </dl>

      <Seccion n="01" titulo="Datos de la empresa" />
      {ficha ? (
        <div className="grid grid-cols-3 overflow-hidden rounded-[8px] border border-doc-linea [&>*:first-child]:border-t-0">
          <Dato k="Razón social" v={ficha["Razón social"]} col={3} fuerte />
          <Dato k="RIF" v={ficha["RIF"]} />
          <Dato k="Teléfono" v={ficha["Teléfonos"]} borde />
          {ficha["NIL"] ? <Dato k="NIL" v={ficha["NIL"]} borde /> : <Dato k="N.º de trabajadores" v={ficha["N.º de trabajadores"]} borde />}
          <Dato k="Dirección" v={ficha["Dirección"]} col={3} />
          <Dato k="Centro de trabajo" v={centro} col={3} />
          <Dato k="Actividad económica" v={ficha["Actividad económica"]} col={ficha["NIL"] ? 2 : 3} />
          {ficha["NIL"] && <Dato k="N.º de trabajadores" v={ficha["N.º de trabajadores"]} borde />}
        </div>
      ) : (
        <p className="rounded-[8px] border border-doc-linea px-3 py-2 text-[11px]">Consolidado de todas las empresas clientes · {num(poblacion.total)} trabajadores (mujeres {num(poblacion.femenino)} · hombres {num(poblacion.masculino)})</p>
      )}

      <Seccion n="02" titulo="Responsables del sistema · elaboración y aprobación" />
      <table className="w-full border-separate overflow-hidden rounded-[8px] border border-doc-linea text-[11px] [border-spacing:0]">
        <thead>
          <tr className="text-left text-[8.5px] uppercase tracking-[.14em] text-doc-tenue">
            <th className="border-b border-r border-doc-linea bg-doc-suave/60 px-2.5 py-1 font-bold">Rol</th>
            <th className="border-b border-doc-linea px-2.5 py-1 font-bold">Nombre y apellido · cargo</th>
            <th className="border-b border-doc-linea px-2.5 py-1 font-bold">Cédula</th>
            <th className="border-b border-l border-doc-linea px-2.5 py-1 font-bold">Firma</th>
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>*]:border-b-0">
          <FilasFirma rol="Elaborado por · médico ocupacional" personas={firmas.medico} compacta={compacta} />
          <FilasFirma rol="Servicio de Seguridad y Salud en el Trabajo" personas={firmas.servicio} compacta={compacta} />
          <FilasFirma rol="Representantes del patrono" personas={firmas.representantes} compacta={compacta} />
          <FilasFirma rol="Delegados de prevención" personas={firmas.delegados} compacta={compacta} />
        </tbody>
      </table>
    </Hoja>
  );
}
