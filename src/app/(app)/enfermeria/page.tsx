import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CalendarDays, ClipboardList, HeartPulse, Printer, Settings2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ajustesEnfermeria, indicadoresEnfermeria, listarAtenciones, ordenesPendientes } from "@/lib/enfermeria";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas, soloEmpresas } from "@/lib/empresas";
import { hoyCaracas } from "@/lib/fecha";
import { opciones } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
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

export default async function Enfermeria({ searchParams }: { searchParams: Promise<{ empresa?: string; fecha?: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const { empresa: pedida, fecha: f } = await searchParams;
  const hoy = hoyCaracas();
  const fecha = f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f <= hoy ? f : hoy;
  const desdeMes = `${fecha.slice(0, 7)}-01`;
  const [empresas, activa, ajustes, listas] = await Promise.all([
    listarEmpresas().then(soloEmpresas), empresaActivaId(), ajustesEnfermeria(), opciones(sesion.orgId, ["motivo_enfermeria"]),
  ]);
  // Una sola empresa (la enfermera de esa empresa): siempre esa. Varias: la de la URL, «todas» o la activa
  const empresa = empresas.length === 1 ? empresas[0] : pedida !== undefined ? empresas.find((e) => e.id === pedida) ?? null : empresas.find((e) => e.id === activa) ?? null;
  const [atenciones, indicadores, ordenes] = await Promise.all([
    listarAtenciones(empresa?.id ?? null, fecha),
    indicadoresEnfermeria(empresa?.id ?? null, desdeMes, fecha),
    ordenesPendientes(empresa?.id ?? null),
  ]);
  const periodo = `?p=rango&desde=${desdeMes}&hasta=${fecha}${empresa ? `&empresa=${empresa.id}` : ""}`;
  const motivos = listas.motivo_enfermeria.filter((m) => m.activo).map((m) => ({ nombre: m.nombre, codigo: m.codigo }));
  const decide = sesion.rol === "administrador" || sesion.rol === "gerente_medico" || sesion.rol === "medico";

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <NuevaAtencion fecha={fecha} hoy={hoy} motivos={motivos} empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} empresa={empresa?.id ?? null} />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Órdenes del médico por cumplir</CardTitle>
              <CardDescription>Tratamientos que el médico indicó a enfermería. Márcalos al aplicarlos.</CardDescription>
            </CardHeader>
            <CardContent><OrdenesPendientes ordenes={ordenes} /></CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atenciones del {fecha.split("-").reverse().join("/")}{fecha === hoy ? " (hoy)" : ""}</CardTitle>
              <CardDescription>{atenciones.length} {atenciones.length === 1 ? "atención" : "atenciones"}{empresa ? ` en ${empresa.razonSocial.replace(/\.$/, "")}` : ""}. Tensión de 140/90 o más, en rojo.</CardDescription>
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
            <VerReporte href={`/reportes/enfermeria${periodo}`}>Registro de atenciones (imprimible)</VerReporte>
            <VerReporte href={`/reportes/morbilidad-enfermeria${periodo}`}>Morbilidad de enfermería</VerReporte>
            <VerReporte href={`/reportes/tension${periodo}`}>Control de tensión arterial</VerReporte>
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
              <Decisiones editable={sesion.rol === "administrador"}
                valores={{ enfermeria_unida: ajustes.enfermeria_unida === true, enfermeria_vigilancia: ajustes.enfermeria_vigilancia === true }} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
