import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, Link2, Printer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Semaforo } from "@/components/app/semaforo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { estructuraEmpresa, horasEmpresa } from "@/lib/puestos";
import { claveRiesgo, GRUPOS, nivelRiesgo, riesgoMaximo } from "@/lib/puestos-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { FormEmpresa } from "../nueva-empresa";
import { Dependencias } from "./dependencias";
import { HorasTrabajadas } from "./horas-trabajadas";
import { EditorPuesto } from "./editor-puesto";
import { CargarLogo } from "@/components/app/cargar-logo";
import { BotonNotificarPuesto } from "@/components/app/notificacion-riesgos";
import { ROLES_NOTIFICAN } from "@/lib/notificacion-riesgos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { guardarLogoEmpresa } from "../acciones";
import { envioAutoEmpresa, ROLES_ENVIO_AUTO } from "@/lib/envio-auto";
import { listarContactos } from "@/lib/envios";
import { EnvioAutoConstancias } from "./envio-auto";

export const metadata: Metadata = { title: "Empresa" };
export const dynamic = "force-dynamic";

export default async function EmpresaDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sesion = await obtenerSesion();
  const [empresas, estructura, listas, horas] = await Promise.all([listarEmpresas(true), estructuraEmpresa(id), opciones(sesion.orgId, ["agente_riesgo", "turno"]), horasEmpresa(id)]);
  const empresa = empresas.find((e) => e.id === id);
  if (!empresa) notFound();
  // El logo se lee aparte para no cargar imágenes en las listas de empresas
  const logo = sesion.demo ? null : ((await (await crearClienteServidor()).from("empresas").select("logo").eq("id", id).maybeSingle()).data?.logo as string | null) ?? null;
  const { dependencias, puestos } = estructura;
  const editaPuestos = !sesion.demo && ["administrador", "coordinador_sst", "gerente_medico"].includes(sesion.rol ?? "");
  const esAdmin = !sesion.demo && sesion.rol === "administrador";
  // Constancias automáticas a RR. HH.: la ve el personal del servicio; la cambia quien firma con criterio médico
  const veEnvioAuto = !sesion.demo && Boolean(sesion.orgId) && ["administrador", "gerente_medico", "medico", "enfermeria", "recepcion"].includes(sesion.rol ?? "");
  const [envioAuto, contactos] = veEnvioAuto ? await Promise.all([envioAutoEmpresa(id, sesion.orgId!), listarContactos(id)]) : [null, []];
  const sinValorar = puestos.filter((p) => Object.values(p.riesgos).some((l) => (l ?? []).length) && !riesgoMaximo(p)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/empresas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Empresas
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{empresa.razonSocial}</h1>
          <p className="text-sm text-muted-foreground">
            {[empresa.rif, empresa.nil && `NIL ${empresa.nil}`, empresa.actividad, empresa.municipio].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm"><Users className="size-4" /> {empresa.trabajadores} trabajadores · {puestos.length} puestos · {dependencias.length} dependencias</p>
        </div>
        {esAdmin && (
          <Button variant="outline" asChild>
            <Link href={`/configuracion/usuarios?empresa=${id}#invitar`}><Link2 /> Invitar a RR. HH.</Link>
          </Button>
        )}
        {esAdmin && <FormEmpresa habilitado empresa={empresa} dependencias={dependencias.map((d) => d.nombre)} />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base">Logo para los informes</CardTitle></CardHeader>
            <CardContent>
              <CargarLogo
                inicial={logo}
                editable={esAdmin}
                guardar={guardarLogoEmpresa.bind(null, id)}
                ayuda="Sale a la derecha del membrete en constancias, reposos, informes y demás documentos de los trabajadores de esta empresa. PNG con fondo transparente se ve mejor."
              />
            </CardContent>
          </Card>
          {veEnvioAuto && (
            <Card className="h-fit">
              <CardHeader><CardTitle className="text-base">Constancias automáticas a RR. HH.</CardTitle></CardHeader>
              <CardContent>
                <EnvioAutoConstancias empresaId={id} inicial={envioAuto} editable={ROLES_ENVIO_AUTO.includes(sesion.rol ?? "")}
                  correos={[...new Set(contactos.map((c) => c.correo?.toLowerCase()).filter((c): c is string => Boolean(c)))]} />
              </CardContent>
            </Card>
          )}
          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base">Dependencias o departamentos</CardTitle></CardHeader>
            <CardContent><Dependencias empresaId={id} dependencias={dependencias} editable={esAdmin} /></CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base">Horas hombre trabajadas</CardTitle></CardHeader>
            <CardContent><HorasTrabajadas empresaId={id} inicial={horas} trabajadoresActuales={empresa.trabajadores} editable={editaPuestos} /></CardContent>
          </Card>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Puestos de trabajo y matriz de riesgos</h2>
            {sinValorar > 0 && <span className="rounded-full bg-aviso/20 px-2.5 py-0.5 text-xs font-medium text-aviso-texto">{sinValorar} sin valorar</span>}
            <div className="ml-auto">
              {editaPuestos && <EditorPuesto empresaId={id} dependencias={dependencias} agentes={listas.agente_riesgo} turnos={listas.turno} />}
            </div>
          </div>

          {puestos.length === 0 ? (
            <div className="grid place-items-center gap-2 rounded-2xl border border-dashed bg-card py-14 text-center text-muted-foreground">
              <Briefcase className="size-8" />
              Sin puestos. Se crean solos al importar la nómina o con Nuevo puesto.
            </div>
          ) : (
            <div className="space-y-3">
              {puestos.map((p) => {
                const max = riesgoMaximo(p);
                return (
                  <Card key={p.id} className="gap-3 py-4">
                    <CardContent className="space-y-3 px-5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{p.nombre}</span>
                        {p.codigo && <span className="rounded bg-muted px-1.5 font-mono text-xs text-muted-foreground">{p.codigo}</span>}
                        <span className="text-sm text-muted-foreground">{[p.dependencia, p.turno, `${p.trabajadores} trab.`].filter(Boolean).join(" · ")}</span>
                        {max && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", max.clase)}>Riesgo máx.: {max.texto}</span>}
                        <div className="ml-auto flex items-center gap-1">
                          {!sesion.demo && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={`/imprimir/puesto/${p.id}`} target="_blank" rel="noopener" title="Informe de evaluación del puesto"><Printer /> Informe</a>
                            </Button>
                          )}
                          {!sesion.demo && ROLES_NOTIFICAN.includes(sesion.rol ?? "") && <BotonNotificarPuesto puestoId={p.id} trabajadores={p.trabajadores} />}
                          {editaPuestos && <EditorPuesto empresaId={id} puesto={p} dependencias={dependencias} agentes={listas.agente_riesgo} turnos={listas.turno} />}
                        </div>
                      </div>
                      {p.tareas && <p className="line-clamp-2 text-sm text-muted-foreground">{p.tareas}</p>}
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
                        {GRUPOS.map(([g, nombre]) => (
                          <div key={g} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="w-24 text-muted-foreground">{nombre}</span>
                            {(p.riesgos[g] ?? []).length === 0 ? (
                              <span className="text-muted-foreground/60">—</span>
                            ) : (
                              (p.riesgos[g] ?? []).map((a) => {
                                const n = nivelRiesgo(p.evaluacion[claveRiesgo(g, a)]);
                                return (
                                  <span key={a} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                                    <Semaforo estado={n?.estado ?? "aviso"} className={n ? "" : "opacity-30"} /> {a}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
