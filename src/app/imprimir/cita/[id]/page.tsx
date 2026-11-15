import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { fechaCorta, Ficha, Firmas, folio, Hoja, hora12, Membrete, Pie } from "../../componentes";
import { docEmpresa } from "../../orden/doc-empresa";

export const metadata: Metadata = { title: "Comprobante de cita" };
export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = {
  solicitada: "Por confirmar", citado: "Confirmada", en_espera: "En el servicio", en_consulta: "En consulta",
  atendido: "Atendida", no_asistio: "No asistió", cancelada: "Cancelada",
};
const DIA = new Intl.DateTimeFormat("es-VE", { weekday: "long", timeZone: "UTC" });
const diaSemana = (iso: string) => DIA.format(new Date(iso + "T00:00:00Z"));

type CitaComprobante = {
  id: string; fecha: string; hora: string | null; estado: string; observacion: string | null; empresaId: string; porConfirmar: boolean;
  paciente: string; cedula: string; telefono: string | null; cargo: string | null; motivo: string | null;
};

async function leerCita(id: string, demo: boolean): Promise<CitaComprobante | null> {
  if (!supabaseConfigurado || demo) {
    return { id: "00000000-0000-4000-8000-000000000000", fecha: "2026-11-16", hora: "09:00", estado: "citado", porConfirmar: false, empresaId: "", paciente: "José Pérez",
      cedula: "V-12345678", telefono: null, cargo: "Vendedor", motivo: "Pre-empleo",
      observacion: "Laboratorio 7:30 a. m. en ayunas de 12 horas, con la primera orina de la mañana.\nRayos X 8:00 a. m." };
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await crearClienteServidor();
  // Solo datos administrativos de la cita (RLS de citas: cada rol ve las de sus empresas). Nunca datos médicos.
  const { data } = await supabase.from("citas")
    .select("id, fecha, hora, estado, observacion, por_confirmar, empresa_id, trabajadores(nombres, apellidos, cedula, telefono, puestos(nombre)), motivo:lista_items(nombre)")
    .eq("id", id).maybeSingle();
  if (!data) return null;
  const t = data.trabajadores as unknown as { nombres: string; apellidos: string; cedula: string; telefono: string | null; puestos: { nombre: string } | null } | null;
  const m = data.motivo as unknown as { nombre: string } | null;
  return {
    id: data.id, fecha: data.fecha, hora: data.hora?.slice(0, 5) ?? null, estado: data.estado, observacion: data.observacion, porConfirmar: data.por_confirmar === true, empresaId: data.empresa_id,
    paciente: t ? `${t.nombres} ${t.apellidos}`.trim() : "", cedula: t?.cedula ?? "", telefono: t?.telefono ?? null, cargo: t?.puestos?.nombre ?? null, motivo: m?.nombre ?? null,
  };
}

// Comprobante de cita para el trabajador (y su empresa): quién, cuándo, dónde y qué traer. Sale desde «Citados» en
// Atención. El lugar es la dirección del servicio; si la atención es en otro consultorio, se cambia en la casilla
// «Lugar de la cita» de esta misma pantalla (?lugar=…) sin tocar el membrete. Las indicaciones son la observación de la cita.
export default async function ImprimirCita({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lugar?: string }> }) {
  const [{ id }, { lugar: lugarPedido }] = await Promise.all([params, searchParams]);
  const sesion = await obtenerSesion();
  const c = await leerCita(id, sesion.demo);
  if (!c) notFound();
  const d = await docEmpresa(sesion, c.empresaId);
  const lugar = lugarPedido?.trim().slice(0, 300) || d.org.direccion || "";
  const telefonoServicio = d.org.telefono;
  const indicaciones = (c.observacion ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const titular = d.org.ajustes?.membrete_titular?.trim();
  const numero = folio("CITA", c.id);
  // «Provisional» sale de la marca «Por confirmar» de la cita (20261030940000), nunca de adivinar por el texto
  const estado = c.estado === "citado" && c.porConfirmar ? "Provisional" : ESTADO[c.estado] ?? c.estado;

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={esRolEmpresa(sesion.rol) ? "/portal" : `/atencion?dia=${c.fecha}`} titulo={`Comprobante de cita · ${c.paciente}`} />
      {/* Lugar de la cita: casilla visible solo en pantalla; al pulsar «Usar» el comprobante se vuelve a armar con ese lugar */}
      <form className="mx-auto mb-4 flex max-w-[216mm] flex-wrap items-end gap-2 px-4 print:hidden" method="get">
        <label className="min-w-0 flex-1 text-sm font-medium">
          Lugar de la cita
          <input name="lugar" defaultValue={lugar} maxLength={300} className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm font-normal" />
        </label>
        <button type="submit" className="h-10 rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted">Usar</button>
      </form>
      <Hoja>
        <Membrete d={d} direccionCompleta />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">Comprobante de cita</h1>
            {c.motivo && <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">{c.motivo}</span>}
            <span data-prueba="cita-estado" className="mt-1.5 ml-2 inline-block rounded border border-doc-acento px-2 py-[1px] text-[10px] font-extrabold uppercase tracking-[.12em] text-doc-acento">{estado}</span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
            <div>Folio <b className="font-medium text-[#15201e]">{numero}</b></div>
            <div>Emitido <b className="font-medium text-[#15201e]">{d.impreso.el}</b></div>
          </div>
        </div>

        <Ficha celdas={[
          { k: "Trabajador", v: c.paciente, ancho: 2, destacada: true },
          { k: "Cédula", v: c.cedula },
          { k: "Cargo", v: c.cargo },
          { k: "Empresa", v: d.empresa.razon_social, ancho: 2 },
          { k: "RIF", v: d.empresa.rif },
          { k: "Teléfono", v: c.telefono },
        ]} />

        {/* Cuándo y dónde, grande: es lo que el trabajador busca en la hoja */}
        <div className="mb-4 grid grid-cols-[auto_1fr] overflow-hidden rounded-lg border border-doc-linea" data-prueba="cita-cuando">
          <div className="flex flex-col items-center justify-center bg-doc-suave px-5 py-3 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-doc-tenue">{diaSemana(c.fecha)}</div>
            <div className="font-cifra text-2xl font-medium leading-tight text-doc-acento">{fechaCorta(c.fecha)}</div>
            <div className="font-cifra text-base font-medium text-doc-acento">{hora12(c.hora) ?? "Hora por confirmar"}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[9px] font-semibold uppercase tracking-[.12em] text-doc-tenue">Lugar de la cita</div>
            <div className="text-[13px] font-semibold leading-snug">{lugar || "Lo indica el servicio médico"}</div>
          </div>
        </div>

        {indicaciones.length > 0 && (
          <div className="mb-4 break-inside-avoid">
            <h2 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.12em] text-doc-acento">Indicaciones</h2>
            <ul className="space-y-1 text-[12px] leading-snug" data-prueba="cita-indicaciones">
              {indicaciones.map((l, k) => <li key={k} className="border-l-[3px] border-doc-acento pl-2">{l}</li>)}
            </ul>
          </div>
        )}

        <div className="rounded-md border border-doc-linea px-3 py-2 text-[12px] leading-snug">
          <b>Traiga</b> su cédula de identidad y las órdenes de exámenes, si se las entregaron.
          {" "}<b>Si no puede asistir</b>, avise con 24 horas de anticipación para darle otra fecha{telefonoServicio ? ` (Tel. ${telefonoServicio})` : ""}.
        </div>

        <Firmas>
          <div className="ml-auto w-[46%] text-center text-[10.5px]">
            <div className="h-[18mm]" />
            <div className="border-t border-[#15201e] pt-1 font-semibold">{titular || d.org.nombre}</div>
            <div className="text-doc-tenue">{d.org.nombre}</div>
          </div>
        </Firmas>
        <p className="mt-3 text-center text-[9.5px] italic text-doc-tenue">Documento administrativo: no contiene datos médicos del trabajador.</p>
        <Pie d={d} derecha={`Cita ${numero}`} />
      </Hoja>
    </div>
  );
}
