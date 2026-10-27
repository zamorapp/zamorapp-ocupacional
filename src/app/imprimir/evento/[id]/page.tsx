import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { AjustesDocumentos } from "@/lib/documentos";
import { obtenerEvento } from "@/lib/eventos";
import { conCodigo, diasCargados, ETIQUETA_INCAPACIDAD } from "@/lib/covenin474";
import { ETIQUETA_TIPO, fechaHoraVE } from "@/lib/eventos-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../../barra";
import { Bloque, fechaCorta, Ficha, Firmas, folio, Hoja, Lista, Membrete, Pie } from "../../componentes";

export const metadata: Metadata = { title: "Declaración de accidente" };
export const dynamic = "force-dynamic";

const Linea = ({ rol, nombre }: { rol: string; nombre?: string | null }) => (
  <div className="w-52 text-center text-[10.5px]">
    <div className="mb-1 h-14 border-b border-[#15201e]" />
    {nombre && <div className="text-[11.5px] font-bold">{nombre}</div>}
    <div className="text-doc-tenue">{rol}</div>
  </div>
);

// Declaración de accidente, incidente o enfermedad ocupacional (LOPCYMAT art. 73; lesión según COVENIN 474)
export default async function DeclaracionEvento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const e = await obtenerEvento(id);
  if (!e || !sesion.orgId) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: emp }, { data: trab }, { data: items }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, rif, direccion, telefono, correo, ajustes, logo").eq("id", sesion.orgId).single(),
    supabase.from("empresas").select("razon_social, rif, nil, direccion, logo").eq("id", e.empresaId).single(),
    e.trabajadorId
      ? supabase.from("trabajadores").select("fecha_nacimiento, sexo, fecha_ingreso, puestos(nombre)").eq("id", e.trabajadorId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("lista_items").select("codigo, nombre").eq("org_id", sesion.orgId)
      .in("lista", ["parte_cuerpo", "naturaleza_lesion", "agente_lesion", "forma_accidente", "acto_inseguro", "condicion_insegura"]),
  ]);
  const catalogo = (items ?? []) as { codigo: string | null; nombre: string }[];
  const cod = (v: string) => (v ? conCodigo(v, catalogo) : "");
  const cargados = diasCargados(e.incapacidad, e.cargos);
  const t = trab as unknown as { fecha_nacimiento: string | null; sexo: string | null; fecha_ingreso: string | null; puestos: { nombre: string } | null } | null;
  const edad = t?.fecha_nacimiento ? Math.floor((Date.now() - Date.parse(t.fecha_nacimiento)) / (365.25 * 864e5)) : null;
  const doc = {
    org: { ...(org ?? { nombre: sesion.organizacion, rif: null, direccion: null, telefono: null, correo: null, logo: null }), ajustes: (org?.ajustes ?? {}) as AjustesDocumentos },
    empresa: { razon_social: emp?.razon_social ?? e.empresa, rif: emp?.rif ?? "", logo: (emp?.logo as string | null) ?? null },
    impreso: { por: sesion.nombre, el: new Intl.DateTimeFormat("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date()) },
  };
  const titulo = e.tipo === "enfermedad" ? "Declaración de enfermedad ocupacional" : e.tipo === "incidente" ? "Reporte de incidente" : "Declaración de accidente de trabajo";

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver={`/accidentes/${id}`} titulo={`${titulo} · Nº ${e.numero}`} />
      <Hoja className="print:block">
        <Membrete d={doc} />
        <div className="mt-5 mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-balance">{titulo}</h1>
            <span className="mt-1.5 inline-block rounded bg-doc-suave px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.08em] text-doc-acento">
              {[ETIQUETA_TIPO[e.tipo], e.subtipo?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="shrink-0 text-right font-cifra text-[10.5px] leading-relaxed text-doc-tenue">
            <div>Nº <b className="font-medium text-[#15201e]">{String(e.numero).padStart(5, "0")}</b></div>
            <div>Folio <b className="font-medium text-[#15201e]">{folio("DA", e.id)}</b></div>
            <div>Ocurrió <b className="font-medium text-[#15201e]">{fechaHoraVE(e.fechaHora)}</b></div>
          </div>
        </div>
        <Bloque titulo="Empresa">
          <Ficha celdas={[
            { k: "Razón social", v: doc.empresa.razon_social, ancho: 2 },
            { k: "RIF", v: emp?.rif },
            { k: "NIL", v: emp?.nil },
            { k: "Dirección", v: emp?.direccion, ancho: 4 },
          ]} />
        </Bloque>
        {e.trabajador && (
          <Bloque titulo="Trabajador">
            <Ficha celdas={[
              { k: "Nombre", v: e.trabajador, ancho: 2, destacada: true },
              { k: "Cédula", v: e.cedula },
              { k: "Edad · Sexo", v: [edad !== null && `${edad} años`, t?.sexo].filter(Boolean).join(" · ") },
              { k: "Cargo", v: t?.puestos?.nombre, ancho: 2 },
              { k: "Fecha de ingreso", v: fechaCorta(t?.fecha_ingreso) },
              { k: "Gravedad", v: e.gravedad },
            ]} />
          </Bloque>
        )}
        <Bloque titulo="Descripción del evento">
          <div className="mb-1"><span className="text-doc-tenue">Lugar: </span>{e.lugar || "—"}</div>
          {e.descripcion || "—"}
          {(e.turno || e.actividadMomento || e.motivoActividad) && (
            <div className="mt-1">
              {e.turno && <div><span className="text-doc-tenue">Turno: </span>{e.turno}</div>}
              {e.actividadMomento && <div><span className="text-doc-tenue">Actividad que realizaba: </span>{e.actividadMomento}</div>}
              {e.motivoActividad && <div><span className="text-doc-tenue">Motivo: </span>{e.motivoActividad}</div>}
            </div>
          )}
          {e.lesiones && <div className="mt-1"><span className="text-doc-tenue">Lesiones: </span>{e.lesiones}</div>}
          {e.testigosDetalle.length > 0
            ? <div className="mt-1"><span className="text-doc-tenue">Testigos: </span>{e.testigosDetalle.map((x) => [x.nombre, x.cedula && `C.I. ${x.cedula}`, x.tipo].filter(Boolean).join(", ")).join(" · ")}</div>
            : e.testigos && <div className="mt-1"><span className="text-doc-tenue">Testigos: </span>{e.testigos}</div>}
        </Bloque>
        {e.tipo !== "enfermedad" && e.trabajador && (
          <Bloque titulo="Lesión (COVENIN 474)">
            <Ficha celdas={[
              { k: "Parte del cuerpo (C.7)", v: cod(e.parteCuerpo), ancho: 2 },
              { k: "Naturaleza (C.8)", v: cod(e.naturalezaLesion), ancho: 2 },
              { k: "Agente (C.3)", v: cod(e.agente), ancho: 2 },
              { k: "Tipo de accidente (C.4)", v: cod(e.forma), ancho: 2 },
              { k: "Acto inseguro (C.5)", v: cod(e.actoInseguro), ancho: 2 },
              { k: "Condición insegura (C.6)", v: cod(e.condicionInsegura), ancho: 2 },
              { k: "Clasificación", v: e.incapacidad ? ETIQUETA_INCAPACIDAD[e.incapacidad] : e.conTiempoPerdido ? "Con tiempo perdido" : "Sin tiempo perdido", ancho: 2 },
              { k: "Días perdidos", v: String(e.diasPerdidos) },
              { k: "Días cargados", v: String(cargados ?? e.diasCargados) },
            ]} />
            {e.cargos.length > 0 && (
              <div className="mt-1 text-[10.5px]"><span className="text-doc-tenue">Tabla 1: </span>{e.cargos.map((c) => `${c.concepto} (${c.dias} días × ${c.porcentaje} %)`).join(" · ")}</div>
            )}
          </Bloque>
        )}
        {e.tipo === "enfermedad" && (
          <Bloque titulo="Diagnóstico">
            {[e.cie10, e.diagnostico].filter(Boolean).join(" ") || "—"}
            {e.fechaDiagnostico && <div className="text-doc-tenue">Diagnosticada el {fechaHoraVE(e.fechaDiagnostico)} · {e.enAnexo1 ? "En la lista del Anexo 1 (NT-02)" : "Fuera de la lista del Anexo 1"}</div>}
          </Bloque>
        )}
        <Bloque titulo="Declaración ante el INPSASEL">
          <Ficha celdas={[
            { k: "Aviso", v: fechaHoraVE(e.fechaAviso) },
            { k: "Declarado", v: fechaHoraVE(e.fechaDeclaracion) },
            { k: "Nº de declaración", v: e.numeroDeclaracion, ancho: 2 },
          ]} />
        </Bloque>
        {(e.causasInmediatas || e.causasBasicas) && (
          <Bloque titulo="Causas">
            {e.causasInmediatas && <div><span className="text-doc-tenue">Inmediatas: </span>{e.causasInmediatas}</div>}
            {e.causasBasicas && <div><span className="text-doc-tenue">Básicas: </span>{e.causasBasicas}</div>}
          </Bloque>
        )}
        {e.observaciones && <Bloque titulo="Observaciones">{e.observaciones}</Bloque>}
        {e.acciones.length > 0 && (
          <Bloque titulo="Acciones correctivas">
            <Lista columnas={1} texto={e.acciones.map((a) => [a.descripcion, a.responsable && `Responsable: ${a.responsable}`, a.fecha && `Fecha: ${fechaCorta(a.fecha)}`, a.estado.replace(/_/g, " ")].filter(Boolean).join(" · ")).join("\n")} />
          </Bloque>
        )}
        <Firmas>
          <Linea rol="Servicio de Seguridad y Salud en el Trabajo" />
          <Linea rol="Delegado(a) de prevención" />
          <Linea rol="Empleador o representante" />
        </Firmas>
        <Pie d={doc} />
      </Hoja>
    </div>
  );
}
