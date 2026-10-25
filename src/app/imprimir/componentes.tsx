import type { DatosDocumento } from "@/lib/documentos";

export const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
export const fechaCorta = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function Hoja({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`hoja mx-auto mb-8 w-full max-w-[216mm] bg-white p-[14mm] text-[12.5px] leading-relaxed text-neutral-900 shadow-sm print:mb-0 print:max-w-none print:p-0 print:shadow-none ${className}`}>
      {children}
    </section>
  );
}

export function Membrete({ d }: { d: DatosDocumento }) {
  return (
    <header className="mb-5 flex items-start justify-between border-b-2 border-teal-700 pb-3">
      <div>
        <div className="text-lg font-bold uppercase tracking-wide text-teal-800">{d.org.nombre}</div>
        <div className="text-[11px] text-neutral-600">
          {[d.org.rif && `RIF ${d.org.rif}`, d.org.direccion, d.org.telefono && `Tel. ${d.org.telefono}`, d.org.correo].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="text-right text-[11px] text-neutral-600">
        <div>Servicio de Salud Ocupacional</div>
        <div>Historia Nº {d.extra.numero_historia}</div>
      </div>
    </header>
  );
}

export function Titulo({ children, sub }: { children: React.ReactNode; sub?: string | null }) {
  return (
    <div className="mb-4 text-center">
      <h1 className="text-base font-bold uppercase tracking-wider">{children}</h1>
      {sub && <div className="text-xs uppercase text-neutral-600">{sub}</div>}
    </div>
  );
}

export function Datos({ filas, columnas = 2 }: { filas: [string, React.ReactNode][]; columnas?: 2 | 3 }) {
  return (
    <div className={`mb-4 grid gap-x-6 gap-y-1 rounded border border-neutral-300 p-3 ${columnas === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {filas.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <span className="shrink-0 font-semibold">{k}:</span>
          <span>{v || "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function DatosPaciente({ d }: { d: DatosDocumento }) {
  return (
    <Datos
      filas={[
        ["Trabajador", d.trabajador.nombre],
        ["Cédula", d.trabajador.cedula],
        ["Edad", d.trabajador.edad !== null ? `${d.trabajador.edad} años` : null],
        ["Sexo", d.trabajador.sexo === "F" ? "Femenino" : d.trabajador.sexo === "M" ? "Masculino" : null],
        ["Empresa", d.empresa.razon_social],
        ["RIF", d.empresa.rif],
        ["Cargo", d.trabajador.cargo],
        ["Dependencia", d.dependencia],
      ]}
    />
  );
}

export function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 break-inside-avoid">
      <div className="mb-1 border-b border-neutral-300 text-xs font-bold uppercase tracking-wide text-teal-800">{titulo}</div>
      <div className="whitespace-pre-line">{children}</div>
    </div>
  );
}

export function FirmaMedico({ d, etiqueta = "Médico evaluador" }: { d: DatosDocumento; etiqueta?: string }) {
  const m = d.medicoDatos;
  return (
    <div className="w-64 text-center text-[11px]">
      <div className="mb-1 h-14 border-b border-neutral-800" />
      <div className="font-semibold">{m?.nombre_completo ?? d.medico ?? "—"}</div>
      <div>{[m?.cedula && `C.I. ${m.cedula}`, m?.mpps && `MPPS ${m.mpps}`, m?.colegio_medicos && `C.M. ${m.colegio_medicos}`].filter(Boolean).join(" · ")}</div>
      {m?.registro_inpsasel && <div>Reg. INPSASEL {m.registro_inpsasel}</div>}
      <div className="text-neutral-500">{etiqueta} · Firma y sello</div>
    </div>
  );
}

export function FirmaTrabajador({ d }: { d: DatosDocumento }) {
  return (
    <div className="w-64 text-center text-[11px]">
      <div className="mb-1 h-14 border-b border-neutral-800" />
      <div className="font-semibold">{d.trabajador.nombre}</div>
      <div>C.I. {d.trabajador.cedula}</div>
      <div className="text-neutral-500">Firma del trabajador</div>
    </div>
  );
}
