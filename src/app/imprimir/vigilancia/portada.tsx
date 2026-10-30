import { Fragment } from "react";
import { AUTORIDAD, conNombre, CUSTODIO, datosPortada, representantesDe, type Firmantes, type Persona } from "@/lib/firmantes";
import { fechaCorta as corta, type Periodo } from "@/lib/periodos";
import { Hoja, Marca } from "../componentes";

type FichaEmpresa = Parameters<typeof datosPortada>[0];
const num = (n: number) => n.toLocaleString("es-VE");
// Dato faltante: aviso en pantalla, raya en el papel
const Falta = () => <><span className="font-semibold text-red-700 print:hidden">Falta</span><span className="hidden print:inline">—</span></>;

// Fecha de emisión: la elegida en Reportes o el día (en Caracas) en que se guardó el informe
const emision = (fecha?: string, guardado?: string | null) => {
  const d = fecha ? new Date(`${fecha}T12:00:00-04:00`) : guardado ? new Date(guardado) : null;
  return d ? d.toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "numeric", month: "long", year: "numeric" }) : null;
};

// Una fila por persona en el cuadro de elaboración y aprobación; el rol ocupa todas las filas de su grupo
function FilasFirma({ rol, personas }: { rol: string; personas: Persona[] }) {
  const filas = personas.length ? personas : [undefined];
  const td = "border border-doc-linea px-2.5 align-top";
  return filas.map((p, i) => (
    <tr key={i} className="break-inside-avoid">
      {i === 0 && <th rowSpan={filas.length} scope="row" className={`${td} w-[27%] bg-doc-suave py-2 text-left text-[10px] font-bold uppercase leading-snug tracking-[.06em] text-doc-acento`}>{rol}</th>}
      <td className={`${td} py-1.5`}>
        {p?.nombre ? (
          <>
            <div className="text-[11.5px] font-semibold leading-tight">{p.nombre}</div>
            <div className="text-[10px] leading-snug text-doc-tenue">{[p.cedula && `C.I. ${p.cedula}`, p.cargo, p.registro && `Reg. ${p.registro}`].filter(Boolean).map((x, j) => <span key={j} className="whitespace-nowrap">{j > 0 && " · "}{x}</span>)}</div>
          </>
        ) : <span className="text-[10px] italic text-doc-tenue"><span className="print:hidden">Sin datos: complétalo en Reportes › Redacción del informe › Portada y firmantes</span></span>}
      </td>
      <td className={`${td} h-[18mm] w-[30%]`} />
      <td className={`${td} w-[11%]`} />
    </tr>
  ));
}

type Dato = [string, string | null];
// Razón social, actividad, dirección y centro de trabajo a lo ancho; RIF con NIL y teléfonos con trabajadores, en pareja
function filasFicha(ficha: Dato[], centro: string | null): Dato[][] {
  const d = Object.fromEntries(ficha) as Record<string, string | null>;
  const par = (k: string): Dato => [k, d[k] ?? null];
  return [[par("Razón social")], [par("RIF"), par("NIL")], [par("Actividad económica")], [par("Dirección")], [["Centro de trabajo", centro]], [par("Teléfonos"), par("N.º de trabajadores")]];
}

// Portada del informe de vigilancia: identificación de la empresa (de su ficha) y control del documento (de Reportes)
export function Portada({ logoEmpresa, orgLogo, empresa, firmantes, guardadoEn, titulo, subtitulo, periodo, poblacion, org }: {
  logoEmpresa: string | null;
  orgLogo: string | null;
  empresa: FichaEmpresa | null;
  firmantes: Firmantes;
  guardadoEn: string | null;
  titulo: string;
  subtitulo: string | null;
  periodo: Pick<Periodo, "desde" | "hasta">;
  poblacion: { total: number; femenino: number; masculino: number };
  org: string | null;
}) {
  const fechaEmision = emision(firmantes.fecha_emision, guardadoEn);
  const ficha = empresa ? datosPortada(empresa, poblacion) : null;
  const pob = poblacion.total;
  return (
    <Hoja>
      <header className="flex items-center justify-between gap-6">
        {/* Logo de la empresa; sin él, el de la organización que emite (o sus iniciales) */}
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoEmpresa ? <img src={logoEmpresa} alt="" className="h-16 max-w-44 object-contain" /> : <Marca logo={orgLogo} nombre={org ?? ""} />}
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-[.16em] text-doc-tenue">Fecha de emisión</div>
          <div className="text-[13px] font-semibold first-letter:uppercase">{fechaEmision ?? <Falta />}</div>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-doc-linea bg-doc-linea text-[11px]">
        {([["Autoridad que aprueba", firmantes.autoridad || AUTORIDAD], ["Custodio del documento", firmantes.custodio || CUSTODIO]] as const).map(([k, x]) => (
          <div key={k} className="bg-white px-3.5 py-2"><span className="mr-2 text-[9px] font-bold uppercase tracking-[.14em] text-doc-tenue">{k}</span><span className="font-semibold">{x}</span></div>
        ))}
      </div>

      {/* Sin fondos sólidos: rinde el tóner y se lee igual en blanco y negro */}
      <div className="mt-4 rounded-b-[12px] border-t-4 border-doc-acento bg-doc-suave/45 px-6 py-4 text-doc-acento">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.22em] text-doc-tenue">Sistema de vigilancia epidemiológica ocupacional</div>
          <h1 className="mt-2 max-w-[80%] text-[25px] font-extrabold leading-[1.12] tracking-tight">Salud de los trabajadores</h1>
          <div className="mt-2.5 flex flex-wrap items-end gap-x-6 gap-y-1">
            <div className="text-[19px] font-extrabold first-letter:uppercase">{titulo}</div>
            {subtitulo && <div className="text-[12px] font-semibold uppercase tracking-[.08em]">{subtitulo}</div>}
            <div className="text-[11px] tabular-nums text-doc-tenue">{corta(periodo.desde)} – {corta(periodo.hasta)}</div>
          </div>
          <div className="mt-1.5 text-[9.5px] text-doc-tenue">
            Informe trimestral según el artículo 34 del Reglamento Parcial de la LOPCYMAT{org ? ` · ${org}` : ""}
          </div>
        </div>
      </div>

      <h2 className="mt-4 mb-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-doc-acento">Identificación de la empresa</h2>
      {ficha ? (
        <table className="w-full overflow-hidden rounded-[10px] text-[11px] [border-collapse:separate] [border-spacing:0] border border-doc-linea">
          <tbody>
            {/* Pares cortos en la misma fila: con firmas de 18 mm la portada tiene que caber en Carta y en A4 */}
            {filasFicha(ficha, firmantes.centro_trabajo || empresa?.direccion || null).map((fila, i) => (
              <tr key={i} className={i % 2 ? "bg-doc-suave/50" : ""}>
                {fila.map(([k, x], j) => (
                  <Fragment key={k}>
                    <th scope="row" className={`w-[19%] px-3 py-1 text-left align-top text-[9px] font-bold uppercase tracking-[.1em] text-doc-tenue ${i ? "border-t border-doc-linea" : ""} ${j ? "border-l border-doc-linea" : ""}`}>{k}</th>
                    <td colSpan={fila.length === 1 ? 3 : 1} className={`px-3 py-1 tabular-nums ${i ? "border-t border-doc-linea font-medium" : "font-bold"}`}>{x || <Falta />}</td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="rounded-[10px] border border-doc-linea px-3 py-2 text-[11px]">Consolidado de todas las empresas clientes · {num(pob)} trabajadores (mujeres {num(poblacion.femenino)} · hombres {num(poblacion.masculino)})</p>
      )}

      <h2 className="mt-4 mb-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-doc-acento">Elaboración y aprobación</h2>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-[.12em] text-doc-tenue">
            <th className="px-2.5 pb-1 font-bold" />
            <th className="px-2.5 pb-1 font-bold">Nombre y apellido · cargo</th>
            <th className="px-2.5 pb-1 font-bold">Firma</th>
            <th className="px-2.5 pb-1 font-bold">Fecha</th>
          </tr>
        </thead>
        <tbody>
          <FilasFirma rol="Elaborado por" personas={conNombre([firmantes.medico!])} />
          <FilasFirma rol="Servicio de Seguridad y Salud en el Trabajo" personas={conNombre([firmantes.sst!])} />
          <FilasFirma rol="Representantes del patrono" personas={conNombre(representantesDe(firmantes))} />
          <FilasFirma rol="Delegados de prevención" personas={conNombre(firmantes.delegados)} />
        </tbody>
      </table>

    </Hoja>
  );
}
