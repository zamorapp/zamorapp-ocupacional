import { AlertTriangle, Check, Clock, X } from "lucide-react";
import type { DatosDocumento } from "@/lib/documentos";
import { antiguedad } from "@/lib/fecha";

// Diseño de los documentos impresos: hoja blanca, acento teal del sistema, Public Sans y cifras en Plex Mono.
// Los colores son fijos (papel), no siguen el tema oscuro de la app.

export const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
export const fechaCorta = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
// Acepta "HH:MM" o una fecha y hora completa (timestamptz de la consulta), que se muestra en hora de Venezuela
export const hora12 = (h: string | null | undefined) => {
  if (!h) return null;
  if (h.length > 8) {
    const f = new Date(h);
    if (Number.isNaN(f.getTime())) return null;
    h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Caracas" }).format(f);
  }
  const [hh, mm] = h.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
};
// Folio legible del documento: prefijo por tipo + primeros 8 caracteres de la consulta
export const folio = (prefijo: string, id: string) => `${prefijo}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

// corte=false: la hoja no fuerza salto de página (las dos mitades del reposo van en la misma carta)
// horizontal: carta apaisada (récipe del Integral), usa la página con nombre «apaisada» de globals.css
export function Hoja({ children, className = "", media, horizontal, corte = true }: { children: React.ReactNode; className?: string; media?: boolean; horizontal?: boolean; corte?: boolean }) {
  return (
    <section
      className={`${corte ? "hoja" : ""} mx-auto mb-8 flex w-full ${horizontal ? "max-w-[279mm] [page:apaisada]" : "max-w-[216mm]"} flex-col bg-white px-[13mm] pt-[12mm] pb-[8mm] font-doc text-[12px] leading-normal text-[#15201e] shadow-[0_1px_2px_rgba(0,0,0,.08),0_12px_40px_rgba(16,40,36,.14)] print:mb-0 print:max-w-none print:p-0 print:shadow-none ${horizontal ? "min-h-[216mm] print:min-h-[186mm]" : media ? "min-h-[130mm] print:min-h-[121mm]" : "min-h-[279mm] print:min-h-[247mm]"} ${className}`}
    >
      {children}
    </section>
  );
}

// Marca de una palabra con mayúsculas internas («OcupaVida» → «OV»); si no, primeras letras de dos palabras
function iniciales(nombre: string) {
  const primera = nombre.trim().split(/\s+/)[0] ?? "";
  const internas = /\p{Ll}/u.test(primera) ? (primera.match(/\p{Lu}/gu) ?? []) : [];
  if (internas.length >= 2) return internas.slice(0, 2).join("");
  return nombre.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "+";
}

export function Marca({ logo, nombre }: { logo: string | null | undefined; nombre: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (logo) return <img src={logo} alt="" className="h-12 max-w-32 object-contain" />;
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-[11px] bg-doc-acento text-lg font-extrabold text-white">
      {iniciales(nombre)}
    </span>
  );
}

// Membrete: servicio de salud a la izquierda, empresa del trabajador (con su logo) a la derecha
// Solo usa la organización y la empresa: sirve también para documentos que no salen de una consulta (p. ej. accidentes)
// sin membrete: deja el espacio en blanco para imprimir sobre hoja ya membretada
export function Membrete({ d, compacto }: { d: Pick<DatosDocumento, "org" | "empresa"> & { sin?: string[] }; compacto?: boolean }) {
  if (d.sin?.includes("membrete")) return <div aria-hidden className={compacto ? "h-[14mm]" : "h-[18mm]"} />;
  return (
    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-doc-linea pb-3">
      <Marca logo={d.org.logo} nombre={d.org.nombre} />
      <div className="min-w-0">
        <div className={`font-extrabold uppercase tracking-wide ${compacto ? "text-[13px] leading-tight" : "text-[15px]"}`}>{d.org.nombre}</div>
        {!compacto && d.org.ajustes.membrete_lema && <div className="text-[10.5px] text-doc-tenue">{d.org.ajustes.membrete_lema}</div>}
        {/* La dirección no pasa de dos líneas: un membrete alto empuja las firmas a otra hoja */}
        <div className="line-clamp-2 text-[10.5px] text-doc-tenue">
          {[d.org.rif && `RIF ${d.org.rif}`, d.org.direccion, !compacto && d.org.telefono && `Tel. ${d.org.telefono}`].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="flex items-center gap-3 text-right">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-doc-tenue">Empresa</div>
          {/* La razón social es dato legal: nunca se corta; en el compacto baja la letra para que no crezca el membrete */}
          <div className={`font-semibold leading-tight ${compacto ? "max-w-52 text-[10px]" : "max-w-44 text-[11px]"}`}>{d.empresa.razon_social}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {d.empresa.logo && <img src={d.empresa.logo} alt="" className="h-12 max-w-28 object-contain" />}
      </div>
    </header>
  );
}

// Título con etiqueta (motivo) y folio/fecha/historia a la derecha
export function Titulo({ d, children, sub, prefijo, compacto, copia }: { d: DatosDocumento; children: React.ReactNode; sub?: string | null; prefijo: string; compacto?: boolean; copia?: string }) {
  const h = hora12(d.hora);
  return (
    <div className={`flex items-end justify-between gap-4 ${compacto ? "mt-3 mb-2.5" : "mt-5 mb-4"}`}>
      <div>
        <h1 className={`font-extrabold leading-tight tracking-tight text-balance ${compacto ? "text-xl" : "text-2xl"}`}>{children}</h1>
        {sub && <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">{sub}</span>}
        {copia && <span className="mt-1.5 ml-2 inline-block rounded border border-doc-acento px-2 py-[1px] text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{copia}</span>}
      </div>
      <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
        <div>Folio <b className="font-medium text-[#15201e]">{folio(prefijo, d.datos.id)}</b></div>
        <div>Fecha <b className="font-medium text-[#15201e]">{fechaCorta(d.datos.fecha)}{h && !compacto ? ` · ${h}` : ""}</b></div>
        {!compacto && <div>Historia <b className="font-medium text-[#15201e]">{String(d.extra.numero_historia).padStart(9, "0")}</b></div>}
      </div>
    </div>
  );
}

// Celdas etiqueta/valor en una cuadrícula con bordes finos
export function Ficha({ celdas }: { celdas: { k: string; v: React.ReactNode; ancho?: 2 | 4; destacada?: boolean }[] }) {
  return (
    <div className="mb-4 grid grid-cols-4 overflow-hidden rounded-lg border border-doc-linea [&>div]:-mb-px [&>div]:-mr-px">
      {celdas.map(({ k, v, ancho, destacada }) => (
        <div key={k} className={`border-r border-b border-doc-linea px-3 py-1.5 ${ancho === 2 ? "col-span-2" : ancho === 4 ? "col-span-4" : ""} ${destacada ? "bg-doc-suave" : ""}`}>
          <div className="text-[8.5px] font-semibold uppercase tracking-[.11em] text-doc-tenue">{k}</div>
          <div className={destacada ? "text-sm font-extrabold uppercase" : "font-semibold"}>{v || "—"}</div>
        </div>
      ))}
    </div>
  );
}

// Se mantiene para informes que muestran pares sueltos (p. ej. reposo)
export function Datos({ filas, columnas = 2 }: { filas: [string, React.ReactNode][]; columnas?: 2 | 3 }) {
  return <Ficha celdas={filas.map(([k, v]) => ({ k, v, ancho: columnas === 2 ? 2 : undefined }))} />;
}

export function DatosPaciente({ d, completo = true }: { d: DatosDocumento; completo?: boolean }) {
  const t = d.trabajador;
  const sexo = t.sexo === "F" ? "F" : t.sexo === "M" ? "M" : null;
  const celdas: { k: string; v: React.ReactNode; ancho?: 2 | 4; destacada?: boolean }[] = [
    { k: "Trabajador", v: t.nombre, ancho: 2, destacada: true },
    { k: "Cédula", v: t.cedula },
    { k: "Edad · Sexo", v: [t.edad !== null && `${t.edad} años`, sexo].filter(Boolean).join(" · ") },
    { k: "Cargo · Dependencia", v: [t.cargo, d.dependencia].filter(Boolean).join(" · "), ancho: 2 },
  ];
  if (completo) {
    celdas.push(
      { k: "Ingreso · Turno", v: [d.extra.fecha_ingreso && fechaCorta(d.extra.fecha_ingreso), d.extra.turno].filter(Boolean).join(" · ") },
      // Antigüedad en el cargo a la fecha de la consulta (no a la de impresión), como en el SAME
      { k: "Antigüedad en el cargo", v: antiguedad(d.extra.fecha_ingreso_cargo, d.datos.fecha) ?? "" },
      { k: "Tipo · Ficha", v: [d.extra.tipo?.nombre, d.extra.ficha].filter(Boolean).join(" · ") },
    );
  } else celdas[3] = { ...celdas[3], ancho: 4 };
  return <Ficha celdas={celdas} />;
}

export function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5 break-inside-avoid">
      <div className="mb-1.5 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.13em] text-doc-acento after:h-px after:flex-1 after:bg-doc-linea">{titulo}</div>
      <div className="whitespace-pre-line">{children}</div>
    </div>
  );
}

// Texto con un punto por línea (o «1. … 2. …» corrido) → lista numerada en una o dos columnas
export function Lista({ texto, columnas }: { texto: string; columnas?: 1 | 2 }) {
  const items = texto
    .split(/\n|(?:^|\s)(?=\d{1,2}[.)]\s)/)
    .map((x) => x.replace(/^\s*(\d{1,2}[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
  if (items.length <= 1) return <p className="whitespace-pre-line">{texto.trim()}</p>;
  const cols = columnas ?? (items.length >= 5 ? 2 : 1);
  return (
    <ol className={`list-decimal space-y-0.5 pl-5 ${cols === 2 ? "columns-2 gap-7" : ""}`}>
      {items.map((x, i) => <li key={i} className="break-inside-avoid">{x}</li>)}
    </ol>
  );
}

// Resultado destacado (aptitud): recuadro con ícono; legible también en blanco y negro
export function Veredicto({ texto, detalle, tono }: { texto: string; detalle?: string | null; tono: "ok" | "aviso" | "alerta" | "neutro" }) {
  const color = { ok: "border-[#1d7a46] bg-[#e7f4ec] text-[#1d7a46]", aviso: "border-[#9a6a00] bg-[#fdf4dc] text-[#7a5300]", alerta: "border-[#b42318] bg-[#fdecea] text-[#b42318]", neutro: "border-doc-acento bg-doc-suave text-doc-acento" }[tono];
  const Icono = { ok: Check, aviso: AlertTriangle, alerta: X, neutro: Clock }[tono];
  return (
    <div className={`grid grid-cols-[auto_1fr] items-center gap-3.5 rounded-[10px] border-2 px-4 py-3 ${color}`}>
      <span className="grid size-9 place-items-center rounded-full bg-current">
        <Icono className="size-5 text-white" strokeWidth={3} />
      </span>
      <div>
        <div className="text-[17px] font-extrabold">{texto}</div>
        {detalle && <div className="text-[11px] text-doc-tenue">{detalle}</div>}
      </div>
    </div>
  );
}

// Casilla para el sello húmedo del médico
export function CasillaSello({ className = "h-[84px] w-[150px]", imagen }: { className?: string; imagen?: string | null }) {
  return (
    <div className={`relative grid shrink-0 place-items-end justify-center rounded-lg border border-dashed border-[#9aa7a4] pb-1 text-[9px] text-[#9aa7a4] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {imagen && <img src={imagen} alt="" className="absolute inset-1 m-auto max-h-[88%] max-w-[95%] object-contain" />}
      {!imagen && "Sello"}
    </div>
  );
}

// Imágenes de firma y sello del médico, si las cargó en «Mi perfil» y eligió imprimirlas
export function imagenesMedico(d: DatosDocumento) {
  const m = d.medicoDatos;
  if (d.sin.includes("firma")) return { firma: null, sello: null };
  return { firma: m?.mostrar_firma !== false ? m?.firma_url ?? null : null, sello: m?.mostrar_sello !== false ? m?.sello_url ?? null : null };
}

export function FirmaMedico({ d, etiqueta = "Médico evaluador", compacto }: { d: DatosDocumento; etiqueta?: string; compacto?: boolean }) {
  const m = d.medicoDatos;
  // Configuración › Organización: firma y sello en casillas separadas (por defecto) o en una sola línea
  const separados = d.org.ajustes.firma_sello_separados !== false;
  const img = imagenesMedico(d);
  return (
    <div data-prueba="firma-medico" className="flex items-end gap-3.5">
      <div className="w-64 text-center text-[10px] leading-[1.35]">
        <div className={`relative mb-1 border-b border-[#15201e] ${compacto ? "h-11" : "h-14"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {img.firma && <img src={img.firma} alt="" className="absolute inset-x-0 -bottom-2 mx-auto max-h-20 max-w-[90%] object-contain" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {!separados && img.sello && <img src={img.sello} alt="" className="absolute -right-16 bottom-0 max-h-20 max-w-40 object-contain opacity-90" />}
        </div>
        <div className="text-[11.5px] font-bold">{m?.nombre_completo ?? d.medico ?? "—"}</div>
        <div className="text-doc-tenue">{m?.especialidad || etiqueta}</div>
        <div className="text-doc-tenue">
          {[!compacto && m?.cedula && `C.I. ${m.cedula}`, m?.mpps && `MPPS ${m.mpps}`, m?.colegio_medicos && `CM ${m.colegio_medicos}`].filter(Boolean).join(" · ")}
        </div>
        {!compacto && m?.registro_inpsasel && <div className="text-doc-tenue">INPSASEL {m.registro_inpsasel}</div>}
        {!compacto && m?.correo && <div className="text-doc-tenue">{m.correo}</div>}
        {/* Importada del SAME: la firma y la emisión ocurrieron allá; esta hoja es una copia desde zamorApp */}
        {d.firmadaEnSame && (
          <div data-prueba="firmada-same" className="mt-1 font-medium text-doc-tenue">
            Firmada y emitida en el SAME el {new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Caracas" }).format(new Date(d.firmadaEnSame))}
          </div>
        )}
      </div>
      {separados && <CasillaSello imagen={img.sello} className={compacto ? "h-[70px] w-[124px]" : undefined} />}
    </div>
  );
}

export function FirmaTrabajador({ d }: { d: DatosDocumento }) {
  return (
    <div className="w-56 text-center text-[10.5px]">
      <div className="mb-1 h-14 border-b border-[#15201e]" />
      <div className="text-[11.5px] font-bold">{d.trabajador.nombre}</div>
      <div className="text-doc-tenue">C.I. {d.trabajador.cedula} · Trabajador</div>
    </div>
  );
}

// Zona de firmas: siempre al pie de la hoja
export function Firmas({ children, compacto }: { children: React.ReactNode; compacto?: boolean }) {
  return <div className={`mt-auto flex flex-wrap items-end justify-between gap-5 break-inside-avoid ${compacto ? "pt-2" : "pt-5"}`}>{children}</div>;
}

export function Pie({ d, derecha }: { d: { impreso: { por: string; el: string; revision?: number } }; derecha?: string }) {
  const revision = d.impreso.revision ?? 1;
  return (
    <footer className="mt-4 flex justify-between gap-3 border-t border-doc-linea pt-2 font-cifra text-[9px] text-doc-tenue">
      <span>
        Impreso por {d.impreso.por} · {d.impreso.el}
        {/* Una consulta corregida invalida los impresos de su revisión anterior */}
        {revision > 1 && <> · <b className="text-[#15201e]">Revisión {revision}: reemplaza los impresos anteriores</b></>}
      </span>
      {derecha && <span>{derecha}</span>}
    </footer>
  );
}
