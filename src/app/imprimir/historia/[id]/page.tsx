import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerConsulta, listarConsultas, type ConsultaCompleta } from "@/lib/consultas";
import { obtenerDocumento, opcionesDeUrl } from "@/lib/documentos";
import type { OpcionImpresion } from "@/lib/documentos-opciones";
import type { EmpleoAnterior } from "@/lib/historia-laboral";
import { obtenerTrabajador } from "@/lib/pacientes-datos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { OpcionesImpresion } from "../../opciones";
import { HistoriaClinica } from "../hoja-historia";

export const metadata: Metadata = { title: "Historia clínica" };
export const dynamic = "force-dynamic";

// Tope de consultas completas por impresión (cada una ocupa una o dos hojas); si hay más, salen las más recientes y se dice
const MAX_CONSULTAS = 60;
const OPCIONES: OpcionImpresion[] = ["membrete", "riesgos", "examen", "limitaciones", "conclusiones"];

// Historia clínica ocupacional: todas las consultas completas en orden cronológico y el resumen al final
export default async function Historia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sin?: string }> }) {
  const [{ id }, { sin }] = await Promise.all([params, searchParams]);
  const sesion = await obtenerSesion();
  // Solo personal de salud: la historia contiene datos clínicos
  if (sesion.demo || !sesion.clinico) notFound();
  const t = await obtenerTrabajador(id);
  if (!t) notFound();
  const supabase = await crearClienteServidor();
  const [lista, { count }, { data: empleos }] = await Promise.all([
    listarConsultas({ trabajadorId: id, limite: MAX_CONSULTAS }),
    supabase.from("consultas").select("id", { count: "exact", head: true }).eq("trabajador_id", id),
    supabase.from("historia_laboral").select("*").eq("trabajador_id", id).order("creado_en"),
    // Auditoría: queda registrado quién abrió la historia
    supabase.rpc("registrar_acceso", { p_trabajador: id }),
  ]);
  // De la más antigua a la más reciente; de 10 en 10 para no abrir cientos de pedidos a la vez
  const orden = [...lista].reverse();
  const completas: (ConsultaCompleta | null)[] = [];
  for (let i = 0; i < orden.length; i += 10) completas.push(...(await Promise.all(orden.slice(i, i + 10).map((c) => obtenerConsulta(c.id)))));
  const base = lista[0] ? await obtenerDocumento(lista[0].id) : null;
  const volver = `/pacientes/${id}`;
  const titulo = `Historia clínica · ${t.nombres} ${t.apellidos}`;

  if (!base) {
    return (
      <div className="min-h-dvh bg-neutral-100 print:bg-white">
        <BarraImpresion volver={volver} titulo={titulo} bloqueado />
        <p className="mx-auto max-w-2xl rounded-lg bg-white p-6 text-center text-sm">Este trabajador aún no tiene consultas registradas.</p>
      </div>
    );
  }
  const consultas = orden.flatMap((r, i) => (completas[i] ? [{ datos: completas[i]!.datos, motivo: r.motivo, medico: completas[i]!.medico }] : []));

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={volver} titulo={titulo} />
      <OpcionesImpresion disponibles={consultas.length > 1 ? OPCIONES : OPCIONES.filter((o) => o !== "riesgos")} />
      <HistoriaClinica
        d={{ ...base, sin: opcionesDeUrl(sin) }}
        consultas={consultas}
        ficha={{ fechaNacimiento: t.fechaNacimiento, grupoSanguineo: t.grupoSanguineo, lateralidad: t.lateralidad, telefono: t.telefono, riesgos: t.riesgos }}
        empleos={(empleos ?? []) as EmpleoAnterior[]}
        emite={sesion.nombre}
        total={count ?? consultas.length}
      />
    </div>
  );
}
