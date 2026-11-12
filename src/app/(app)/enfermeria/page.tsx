import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CalendarDays, ClipboardList, FileText, HeartPulse, Printer, Settings2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ajustesEnfermeria, indicadoresEnfermeria, listarAtenciones, ordenesPendientes } from "@/lib/enfermeria";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas, soloEmpresas } from "@/lib/empresas";
import { hoyCaracas, sumarDias } from "@/lib/fecha";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { Decisiones } from "./decisiones";
import { Filtros } from "./filtros";
import { ListaAtenciones, OrdenesPendientes, VerReporte } from "./lista-atenciones";
import { NuevaAtencion } from "./nueva-atencion";

export const metadata: Metadata = { title: "Enfermería" };
export const dynamic = "force-dynamic";

function Cifra({ titulo, valor, detalle, icono: Icono }: { titulo: string; valor: number; detalle: string; icono: typeof Activity }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icono className="size-4" aria-hidden /> {titulo}</p>
      <p className="font-cifra text-2xl font-semibold tracking-tight">{valor.toLocaleString("es-VE")}</p>
      <p className="text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// «Escribir evolución» desde una consulta: llega con el trabajador (y la consulta) ya elegidos
async function pacienteInicial(trabajador?: string, consulta?: string) {
  if (!trabajador || !UUID.test(trabajador)) return null;
  const supabase = await crearClienteServidor();
  const { data: t } = await supabase.from("trabajadores").select("id, nombres, apellidos, cedula, empresas(razon_social)").eq("id", trabajador).maybeSingle();
  if (!t) return null;
  const e = t.empresas as unknown as { razon_social: string } | null;
  return { paciente: { id: t.id, nombre: `${t.nombres} ${t.apellidos}`, cedula: t.cedula, empresa: e?.razon_social ?? "" }, consultaId: consulta && UUID.test(consulta) ? consulta : null };
}

export default async function Enfermeria({ searchParams }: { searchParams: Promise<{ empresa?: string; fecha?: string; trabajador?: string; consulta?: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const { empresa: pedida, fecha: f, trabajador, consulta } = await searchParams;
  const hoy = hoyCaracas();
  const fecha = f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : hoy;
  const desdeMes = `${fecha.slice(0, 7)}-01`;
  const [empresas, activa, ajustes, listas, inicial] = await Promise.all([
    listarEmpresas().then(soloEmpresas), empresaActivaId(), ajustesEnfermeria(), opciones(sesion.orgId, ["motivo_enfermeria"]),
    sesion.demo ? null : pacienteInicial(trabajador, consulta),
  ]);
  // Una sola empresa (la enfermera de esa empresa): siempre esa. Varias: la de la URL, «todas» o la activa
  const empresa = empresas.length === 1 ? empresas[0] : pedida !== undefined ? empresas.find((e) => e.id === pedida) ?? null : empresas.find((e) => e.id === activa) ?? null;
  const [atenciones, indicadores, ordenes] = await Promise.all([
    listarAtenciones(empresa?.id ?? null, fecha),
    indicadoresEnfermeria(empresa?.id ?? null, desdeMes, fecha),
    ordenesPendientes(empresa?.id ?? null),
  ]);
  const conEmpresa = empresa ? `&empresa=${empresa.id}` : "";
  const periodo = `?p=rango&desde=${desdeMes}&hasta=${fecha}${conEmpresa}`;
  // Semana de lunes a domingo que contiene el día elegido
  const lunes = sumarDias(fecha, -((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7));
  const rangos = [
    { t: "Del día", q: `?p=rango&desde=${fecha}&hasta=${fecha}${conEmpresa}` },
    { t: "De la semana", q: `?p=rango&desde=${lunes}&hasta=${sumarDias(lunes, 6)}${conEmpresa}` },
    { t: "Del mes", q: `?p=rango&desde=${desdeMes}&hasta=${sumarDias(`${sumarDias(desdeMes, 40).slice(0, 7)}-01`, -1)}${conEmpresa}` },
  ];
  const motivos = listas.motivo_enfermeria.filter((m) => m.activo).map((m) => ({ nombre: m.nombre, codigo: m.codigo }));
  // Las decisiones las ven y cambian el administrador y el gerente médico (también en Configuración › Enfermería)
  const decide = sesion.rol === "administrador" || sesion.rol === "gerente_medico";
  const hojaTa = `/imprimir/enfermeria/control-ta${empresa ? `?empresa=${empresa.id}` : ""}`;
  const tarjetaOrdenes = (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Órdenes del médico por cumplir</CardTitle>
        <CardDescription>Tratamientos que el médico indicó a enfermería. Márcalos al aplicarlos.</CardDescription>
      </CardHeader>
      <CardContent><OrdenesPendientes ordenes={ordenes} /></CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><HeartPulse className="size-7 text-primary" aria-hidden /> Enfermería</h1>
          <p className="text-muted-foreground">Lo que hace enfermería cada día: tensión, tratamientos, procedimientos, curas e inspecciones. Va aparte de las consultas del médico.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/imprimir/reporte/enfermeria?p=rango&desde=${fecha}&hasta=${fecha}${empresa ? `&empresa=${empresa.id}` : ""}`}><Printer /> Imprimir el día</Link></Button>
          <Button asChild variant="outline"><Link href={`/reportes/tension${periodo}`}><Activity /> Control de tensión</Link></Button>
          <Button asChild variant="outline"><Link href={hojaTa} target="_blank"><FileText /> Hoja de tensión en blanco</Link></Button>
        </div>
      </div>

      <Filtros empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} empresa={empresa?.id ?? ""} fecha={fecha} hoy={hoy} />

      {indicadores && (
        <section aria-label="Este mes" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra icono={ClipboardList} titulo="Atenciones del mes" valor={indicadores.atenciones} detalle={`${indicadores.pacientes} trabajadores`} />
          <Cifra icono={CalendarDays} titulo="Días de enfermería" valor={indicadores.dias_enfermeria} detalle={`El médico atendió ${indicadores.dias_medico} días`} />
          <Cifra icono={Stethoscope} titulo="Referidos al médico" valor={indicadores.referidos} detalle="Este mes" />
          <Cifra icono={Activity} titulo="Inspecciones" valor={indicadores.inspecciones} detalle="Del lugar de trabajo, este mes" />
        </section>
      )}

      {/* En el celular, si hay órdenes pendientes, van antes del formulario (es lo primero que hay que hacer) */}
      {ordenes.length > 0 && <div className="lg:hidden">{tarjetaOrdenes}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div id="nueva" className="scroll-mt-20">
          <NuevaAtencion key={inicial ? `${inicial.paciente.id}-${inicial.consultaId ?? ""}` : "nueva"} fecha={fecha} hoy={hoy} motivos={motivos} empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} empresa={empresa?.id ?? null} inicial={inicial} />
        </div>

        <div className="space-y-6">
          <div className={ordenes.length > 0 ? "hidden lg:block" : ""}>{tarjetaOrdenes}</div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atenciones del {fecha.split("-").reverse().join("/")}{fecha === hoy ? " (hoy)" : ""}</CardTitle>
              <CardDescription>{atenciones.length} {atenciones.length === 1 ? "atención" : "atenciones"}{empresa ? ` en ${empresa.razonSocial.replace(/\.$/, "")}` : ""}. La tensión de 140/90 o más dice «alta».</CardDescription>
            </CardHeader>
            <CardContent><ListaAtenciones atenciones={atenciones} puedeBorrarTodo={sesion.rol === "administrador" || sesion.rol === "gerente_medico"} /></CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reportes de enfermería</CardTitle>
            <CardDescription>Se imprimen y se bajan en Excel desde cada reporte.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-2">
            <div className="w-full rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 text-sm font-medium">Pacientes atendidos y actividades realizadas</p>
              <div className="flex flex-wrap gap-2">
                {rangos.map((r) => (
                  <Button key={r.t} asChild size="sm" variant="outline"><Link href={`/reportes/enfermeria${r.q}`}>{r.t}</Link></Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Cada uno trae el resumen por tipo de actividad y por motivo; se imprime o baja en Excel desde ahí. Otro período: cámbialo dentro del reporte.</p>
            </div>
            <VerReporte href={`/reportes/enfermeria${periodo}`}>Registro de atenciones (imprimible)</VerReporte>
            <VerReporte href={`/reportes/morbilidad-enfermeria${periodo}`}>Morbilidad de enfermería</VerReporte>
            <VerReporte href={`/reportes/tension${periodo}`}>Control de tensión arterial (lo registrado)</VerReporte>
            <VerReporte href={hojaTa}>Hoja de tensión en blanco (para anotar a mano)</VerReporte>
            {ajustes.enfermeria_unida && <VerReporte href={`/reportes/morbilidad-unida${periodo}`}>Morbilidad unida: médico y enfermería</VerReporte>}
            {ajustes.enfermeria_unida && <VerReporte href={`/reportes/dias-atencion${periodo}`}>Días de atención: médico y enfermería</VerReporte>}
          </CardContent>
        </Card>
        {decide && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="size-4" /> Tus decisiones</CardTitle>
              <CardDescription>Cámbialas cuando quieras; no se pierde ningún dato.</CardDescription>
            </CardHeader>
            <CardContent>
              <Decisiones editable={!sesion.demo}
                valores={{ enfermeria_unida: ajustes.enfermeria_unida === true, enfermeria_vigilancia: ajustes.enfermeria_vigilancia === true, enfermeria_tasas: ajustes.enfermeria_tasas === true }} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
