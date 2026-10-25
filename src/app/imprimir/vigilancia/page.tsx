import type { Metadata } from "next";
import { ETIQUETA_ORIGEN, type Origen } from "@/lib/consultas-tipos";
import { datosLegalesFaltantes, listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { indicadoresAusentismo, obtenerReporte, resolverPeriodo, resumenEjecutivo } from "@/lib/reportes";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { BarraImpresion } from "../barra";
import { Bloque, fechaCorta, Hoja } from "../componentes";

export const metadata: Metadata = { title: "Informe de vigilancia epidemiológica" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ p?: string; desde?: string; hasta?: string; empresa?: string }> };

function Tabla({ columnas, filas, vacio = "Sin registros en el periodo." }: { columnas: string[]; filas: (string | number)[][]; vacio?: string }) {
  if (!filas.length) return <p className="text-neutral-500">{vacio}</p>;
  const total = filas.reduce((s, f) => s + (typeof f[f.length - 1] === "number" ? (f[f.length - 1] as number) : 0), 0);
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr className="bg-teal-50">{columnas.map((c) => <th key={c} className="border border-neutral-300 px-2 py-1 text-left font-semibold">{c}</th>)}<th className="w-14 border border-neutral-300 px-2 py-1 text-right">%</th></tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i}>
            {f.map((v, j) => <td key={j} className={`border border-neutral-300 px-2 py-0.5 ${typeof v === "number" ? "text-right tabular-nums" : ""}`}>{v}</td>)}
            <td className="border border-neutral-300 px-2 py-0.5 text-right tabular-nums">
              {total ? `${Math.round(((f[f.length - 1] as number) / total) * 1000) / 10}` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const Firma = ({ rol }: { rol: string }) => (
  <div className="text-center text-[11px]"><div className="mb-1 h-12 border-b border-neutral-800" />{rol}</div>
);

export default async function Vigilancia({ searchParams }: Props) {
  const q = await searchParams;
  const sesion = await obtenerSesion();
  const periodo = resolverPeriodo(q.p, q.desde, q.hasta);
  const empresaId = q.empresa || null;
  const [r, empresas, listas, org] = await Promise.all([
    obtenerReporte(empresaId, periodo),
    listarEmpresas(),
    opciones(sesion.orgId, ["causa_reposo", "ente_emisor_reposo", "clasificacion_aptitud"]),
    (async () => {
      if (!sesion.orgId) return null;
      const s = await crearClienteServidor();
      return (await s.from("organizaciones").select("nombre, rif, direccion, telefono").eq("id", sesion.orgId).single()).data;
    })(),
  ]);
  const nombre = (l: string) => Object.fromEntries(listas[l].map((i) => [i.codigo ?? i.nombre, i.nombre]));
  const causas = nombre("causa_reposo");
  const entes = nombre("ente_emisor_reposo");
  const aptitudes = nombre("clasificacion_aptitud");
  const empresa = empresas.find((e) => e.id === empresaId) ?? null;
  const faltan = empresa ? datosLegalesFaltantes(empresa) : [];

  if (!r) return <p className="p-10">No hay datos.</p>;
  const { pad, pct } = indicadoresAusentismo(r);

  return (
    <div className="min-h-dvh bg-neutral-100 print:bg-white">
      <BarraImpresion volver="/reportes" titulo="Informe trimestral de vigilancia epidemiológica" />
      <Hoja>
        <header className="mb-4 flex items-start justify-between border-b-2 border-teal-700 pb-3">
          <div>
            <div className="text-lg font-bold uppercase text-teal-800">{org?.nombre}</div>
            <div className="text-[11px] text-neutral-600">{[org?.rif && `RIF ${org.rif}`, org?.direccion, org?.telefono].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-right text-[11px] text-neutral-600">Reglamento Parcial LOPCYMAT, art. 34</div>
        </header>
        <div className="mb-4 text-center">
          <h1 className="text-base font-bold uppercase tracking-wider">Informe de vigilancia epidemiológica</h1>
          <div className="text-xs uppercase text-neutral-600">{periodo.etiqueta} · del {fechaCorta(periodo.desde)} al {fechaCorta(periodo.hasta)}</div>
        </div>

        <Bloque titulo="Resumen ejecutivo">
          <ul className="list-disc space-y-0.5 pl-5">{resumenEjecutivo(r, causas).map((f) => <li key={f}>{f}</li>)}</ul>
        </Bloque>

        <Bloque titulo="1. Identificación">
          {empresa ? (
            <div className="grid grid-cols-2 gap-x-6">
              <div><b>Empresa:</b> {empresa.razonSocial}</div>
              <div><b>RIF:</b> {empresa.rif}</div>
              <div><b>NIL:</b> {empresa.nil ?? <span className="font-semibold text-red-600">Falta</span>}</div>
              <div><b>Actividad:</b> {empresa.actividad ?? <span className="font-semibold text-red-600">Falta</span>}</div>
              <div><b>Registro Servicio SST:</b> {empresa.servicioSstRegistro ? fechaCorta(empresa.servicioSstRegistro) : <span className="font-semibold text-red-600">Falta</span>}</div>
              <div><b>Registro PSST:</b> {empresa.psstRegistro ? fechaCorta(empresa.psstRegistro) : <span className="font-semibold text-red-600">Falta</span>}</div>
              <div><b>Trabajadores efectivos:</b> {r.poblacion.total} ({r.poblacion.femenino} F · {r.poblacion.masculino} M)</div>
            </div>
          ) : (
            <div>Consolidado de todas las empresas clientes · {r.poblacion.total} trabajadores efectivos.</div>
          )}
          {faltan.length > 0 && <p className="mt-1 font-semibold text-red-600 print:text-red-700">Datos legales incompletos: {faltan.join(", ")}. Complétalos en Empresas antes de consignar el informe.</p>}
          {r.poblacion.total > 0 && r.poblacion.total < 10 && <p className="mt-1 italic">Población menor a 10 trabajadores: índices de baja comparabilidad.</p>}
        </Bloque>

        <Bloque titulo="2. Actividad asistencial">
          <p className="mb-1">{r.consultas.total} consultas · {r.consultas.pacientes} pacientes · {r.consultas.preventivas} preventivas · {r.consultas.no_preventivas} no preventivas · Primera {r.consultas.por_tipo.primera ?? 0} · Sucesiva {r.consultas.por_tipo.sucesiva ?? 0} · Derivada {r.consultas.por_tipo.derivada ?? 0}</p>
          <Tabla columnas={["Motivo de consulta", "Tipo", "Casos"]} filas={r.consultas.por_motivo.map((m) => [m.nombre, m.grupo === "preventivo" ? "Preventivo" : "No preventivo", m.n])} />
          <div className="mt-2 grid grid-cols-2 gap-4">
            <Tabla columnas={["Grupo etario", "Casos"]} filas={r.consultas.por_edad.map((e) => [e.grupo, e.n])} />
            <Tabla columnas={["Sexo", "Casos"]} filas={[["Femenino", r.consultas.por_sexo.F], ["Masculino", r.consultas.por_sexo.M]].filter((f) => (f[1] as number) > 0)} />
          </div>
        </Bloque>

        <Bloque titulo="3. Morbilidad">
          <div className="grid grid-cols-2 gap-4">
            <Tabla columnas={["Aparato o sistema", "Casos"]} filas={r.morbilidad.por_sistema.map((s) => [s.nombre, s.n])} />
            <Tabla columnas={["Origen", "Casos"]} filas={Object.entries(r.morbilidad.por_origen).map(([k, n]) => [ETIQUETA_ORIGEN[k as Origen] ?? k, n])} />
          </div>
          <div className="mt-2">
            <Tabla columnas={["CIE-10", "Diez primeras causas", "Casos"]} filas={r.morbilidad.primeras_causas.map((c) => [c.cie10, c.descripcion, c.n])} />
          </div>
        </Bloque>

        <Bloque titulo="4. Ausentismo">
          <p className="mb-1">
            {r.ausentismo.reposos} reposos · {r.ausentismo.dias_perdidos} días perdidos · Promedio de ausentismo diario {pad.toLocaleString("es-VE")} · <b>% de ausentismo {pct.toLocaleString("es-VE")} %</b> (meta &lt; 2,5 %; pre y postnatal excluidos)
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Tabla columnas={["Causa", "Reposos", "Días"]} filas={r.ausentismo.por_causa.map((c) => [causas[c.nombre] ?? c.nombre, c.n, c.dias])} />
            <Tabla columnas={["Ente emisor", "Reposos"]} filas={r.ausentismo.por_ente.map((c) => [entes[c.nombre] ?? c.nombre, c.n])} />
          </div>
        </Bloque>

        <Bloque titulo="5. Exámenes y aptitud">
          <Tabla columnas={["Clasificación", "Casos"]} filas={Object.entries(r.aptitud).map(([k, n]) => [aptitudes[k] ?? k, n])} />
          {r.consultas.sanos > 0 && <p className="mt-1">{r.consultas.sanos} trabajadores evaluados sin patología según protocolo.</p>}
        </Bloque>

        <div className="mt-10 grid grid-cols-4 gap-6 break-inside-avoid">
          <Firma rol="Médico ocupacional" />
          <Firma rol="Servicio de SST" />
          <Firma rol="Delegado de prevención" />
          <Firma rol="Representante del empleador" />
        </div>
      </Hoja>
    </div>
  );
}
