import type { ContenidoNotificacion } from "@/lib/notificacion-riesgos";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { DocumentoBase } from "../base";
import { Bloque, fechaCorta, Ficha, Firmas, folio, Hoja, Lista, Membrete, Pie } from "../componentes";

const NIVEL: Record<string, string> = {
  Bajo: "bg-[#e7f4ec] text-[#1d7a46]",
  Medio: "bg-[#fdf4dc] text-[#7a5300]",
  Alto: "bg-[#fdecea] text-[#b42318]",
  Crítico: "bg-[#b42318] text-white",
};

const Linea = ({ rol, nombre, detalle }: { rol: string; nombre?: string | null; detalle?: string | null }) => (
  <div className="w-48 text-center text-[10.5px]">
    <div className="mb-1 h-14 border-b border-[#15201e]" />
    {nombre && <div className="text-[11.5px] font-bold">{nombre}</div>}
    {detalle && <div className="text-doc-tenue">{detalle}</div>}
    <div className="text-doc-tenue">{rol}</div>
  </div>
);

type Fila = {
  id: string; empresa_id: string; puesto: string; entregada_en: string; contenido: ContenidoNotificacion; entregada_por: string | null;
  trabajadores: { nombres: string; apellidos: string; cedula: string; fecha_ingreso: string | null } | null;
};

// Hojas de las notificaciones pedidas (por apellido): se usan solas y dentro del paquete de inspección
export async function HojasNotificacion({ ids, base }: { ids: string[]; base: Omit<DocumentoBase, "empresa"> }) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("notificaciones_riesgo")
    .select("id, empresa_id, puesto, entregada_en, contenido, entregada_por, trabajadores(nombres, apellidos, cedula, fecha_ingreso)")
    .in("id", ids);
  const filas = ((data ?? []) as unknown as Fila[]).sort((a, b) => (a.trabajadores?.apellidos ?? "").localeCompare(b.trabajadores?.apellidos ?? ""));
  if (!filas.length) return null;
  const empresas = [...new Set(filas.map((f) => f.empresa_id))];
  const autores = [...new Set(filas.map((f) => f.entregada_por).filter(Boolean))] as string[];
  const [{ data: emps }, { data: perfiles }] = await Promise.all([
    supabase.from("empresas").select("id, razon_social, rif, logo").in("id", empresas),
    autores.length ? supabase.from("perfiles").select("id, nombre_completo").in("id", autores) : Promise.resolve({ data: [] as { id: string; nombre_completo: string }[] }),
  ]);
  return (
    <>
      {filas.map((f) => {
        const emp = emps?.find((x) => x.id === f.empresa_id);
        const doc = { ...base, empresa: { razon_social: emp?.razon_social ?? "", rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null } };
        const c = f.contenido;
        const t = f.trabajadores;
        const autor = perfiles?.find((p) => p.id === f.entregada_por)?.nombre_completo;
        return (
          <Hoja key={f.id}>
            <Membrete d={doc} />
            <div className="mt-5 mb-4 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">Notificación de riesgos del puesto de trabajo</h1>
                <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">LOPCYMAT arts. 53.1 y 56.3</span>
              </div>
              <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
                <div>Folio <b className="font-medium text-[#15201e]">{folio("NR", f.id)}</b></div>
                <div>Entregada <b className="font-medium text-[#15201e]">{fechaCorta(f.entregada_en)}</b></div>
              </div>
            </div>
            <Bloque titulo="Trabajador y puesto">
              <Ficha celdas={[
                { k: "Nombre", v: t ? `${t.nombres} ${t.apellidos}` : "", ancho: 2, destacada: true },
                { k: "Cédula", v: t?.cedula },
                { k: "Ingreso", v: fechaCorta(t?.fecha_ingreso) },
                { k: "Puesto", v: f.puesto, ancho: 2 },
                { k: "Dependencia", v: c.dependencia },
                { k: "Turno", v: c.turno },
              ]} />
            </Bloque>
            {c.tareas && <Bloque titulo="Tareas del puesto">{c.tareas}</Bloque>}
            {c.herramientas && <Bloque titulo="Máquinas, equipos y herramientas">{c.herramientas}</Bloque>}
            <Bloque titulo="Procesos peligrosos y medidas de control">
              {c.riesgos.length === 0 ? "Sin riesgos registrados en la evaluación del puesto." : (
                <table className="w-full border-collapse text-[11px]">
                  <thead><tr className="text-left text-doc-tenue"><th className="py-1 font-medium">Tipo</th><th className="py-1 font-medium">Peligro o agente</th><th className="py-1 font-medium">Nivel</th><th className="py-1 font-medium">Cómo se previene</th></tr></thead>
                  <tbody>
                    {c.riesgos.map((r, i) => (
                      <tr key={i} className="border-t border-doc-linea align-top">
                        <td className="py-1 pr-2">{r.grupo}</td>
                        <td className="py-1 pr-2">{r.agente}</td>
                        <td className="py-1 pr-2">{r.nivel ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${NIVEL[r.nivel] ?? ""}`}>{r.nivel}</span> : "—"}</td>
                        <td className="py-1">{r.control || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Bloque>
            {c.epp && <Bloque titulo="Equipos de protección personal que debe usar"><Lista texto={c.epp} /></Bloque>}
            {c.recomendaciones && <Bloque titulo="Recomendaciones de prevención"><Lista texto={c.recomendaciones} /></Bloque>}
            <Bloque titulo="Declaración del trabajador">
              Declaro que recibí por escrito la información sobre los procesos peligrosos y los riesgos de mi puesto de trabajo, las medidas de
              prevención y los equipos de protección que debo usar, que me fue explicada y que la entendí. Conozco mi derecho a ser informado
              (LOPCYMAT art. 53, numeral 1) y mi deber de cumplir las normas de seguridad y usar los equipos de protección (art. 54).
            </Bloque>
            <Firmas>
              <Linea rol="Trabajador(a): recibí conforme" nombre={t ? `${t.nombres} ${t.apellidos}` : null} detalle={t ? `C.I. ${t.cedula} · Fecha: ____/____/______` : null} />
              <Linea rol="Notificado por" nombre={autor} />
              <Linea rol="Delegado(a) de prevención" />
            </Firmas>
            <Pie d={doc} derecha={c.evaluadoEn ? `Evaluación del puesto: ${fechaCorta(c.evaluadoEn)}` : undefined} />
          </Hoja>
        );
      })}
    </>
  );
}
