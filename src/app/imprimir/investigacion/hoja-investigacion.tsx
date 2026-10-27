import { type Evento, fechaHoraVE } from "@/lib/eventos-tipos";
import { ETIQUETA_INSTANCIA, type Investigacion, SECCIONES } from "@/lib/investigacion-tipos";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { DocumentoBase } from "../base";
import { Bloque, fechaCorta, Ficha, Firmas, folio, Hoja, Lista, Membrete, Pie } from "../componentes";

// Hoja del informe: se usa sola y dentro del paquete de inspección
export async function HojaInvestigacion({ e, inv, base }: { e: Evento; inv: Investigacion & { id: string }; base: Omit<DocumentoBase, "empresa"> }) {
  const supabase = await crearClienteServidor();
  const { data: emp } = await supabase.from("empresas").select("razon_social, rif, nil, direccion, actividad_economica, logo").eq("id", e.empresaId).single();
  const doc = { ...base, empresa: { razon_social: emp?.razon_social ?? e.empresa, rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null } };
  return (
    <Hoja className="print:block">
      <Membrete d={doc} />
      <div className="mt-5 mb-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">Informe de investigación de enfermedad ocupacional</h1>
          <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
            NT-02-2008 · {inv.estado === "terminado" ? `terminado el ${fechaCorta(inv.terminadoEn)}` : "borrador"}
          </span>
        </div>
        <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
          <div>Evento Nº <b className="font-medium text-[#15201e]">{String(e.numero).padStart(5, "0")}</b></div>
          <div>Folio <b className="font-medium text-[#15201e]">{folio("II", inv.id)}</b></div>
          {e.fechaDiagnostico && <div>Diagnóstico <b className="font-medium text-[#15201e]">{fechaHoraVE(e.fechaDiagnostico)}</b></div>}
        </div>
      </div>
      <Bloque titulo="Empresa">
        <Ficha celdas={[
          { k: "Razón social", v: doc.empresa.razon_social, ancho: 2 },
          { k: "RIF", v: emp?.rif },
          { k: "NIL", v: emp?.nil },
          { k: "Actividad económica", v: emp?.actividad_economica, ancho: 2 },
          { k: "Dirección", v: emp?.direccion, ancho: 2 },
        ]} />
      </Bloque>
      <Bloque titulo="Caso">
        <Ficha celdas={[
          { k: "Trabajador", v: e.trabajador, ancho: 2, destacada: true },
          { k: "Cédula", v: e.cedula },
          { k: "Anexo 1", v: e.enAnexo1 ? "Sí (15 días)" : "No (30 días)" },
          { k: "Diagnóstico", v: [e.cie10, e.diagnostico].filter(Boolean).join(" "), ancho: 4 },
        ]} />
      </Bloque>
      {inv.participantes.length > 0 && (
        <Bloque titulo="Participantes del estudio">
          <table className="w-full text-[11px]">
            <thead className="text-left text-doc-tenue"><tr><th className="font-medium">Nombre</th><th className="font-medium">Cédula</th><th className="font-medium">Cargo</th><th className="font-medium">Instancia</th></tr></thead>
            <tbody>{inv.participantes.map((p, i) => <tr key={i} className="border-t border-doc-linea"><td>{p.nombre}</td><td>{p.cedula}</td><td>{p.cargo}</td><td>{ETIQUETA_INSTANCIA[p.instancia]}</td></tr>)}</tbody>
          </table>
        </Bloque>
      )}
      {SECCIONES.map(({ clave, titulo }) => (
        <Bloque key={clave} titulo={titulo}>{inv.secciones[clave]?.trim() || "—"}</Bloque>
      ))}
      {e.acciones.length > 0 && (
        <Bloque titulo="Plan de acción">
          <Lista columnas={1} texto={e.acciones.map((a) => [a.descripcion, a.responsable && `Responsable: ${a.responsable}`, a.fecha && `Fecha: ${fechaCorta(a.fecha)}`, a.estado.replace(/_/g, " ")].filter(Boolean).join(" · ")).join("\n")} />
        </Bloque>
      )}
      <Firmas>
        {(inv.participantes.length ? inv.participantes : [{ nombre: "", instancia: "servicio" as const }, { nombre: "", instancia: "delegado" as const }]).map((p, i) => (
          <div key={i} className="w-52 text-center text-[10.5px]">
            <div className="mb-1 h-14 border-b border-[#15201e]" />
            {p.nombre && <div className="text-[11.5px] font-bold">{p.nombre}</div>}
            <div className="text-doc-tenue">{ETIQUETA_INSTANCIA[p.instancia]}</div>
          </div>
        ))}
      </Firmas>
      <Pie d={doc} />
    </Hoja>
  );
}
