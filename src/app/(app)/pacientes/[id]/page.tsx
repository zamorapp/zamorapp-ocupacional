import type { Metadata } from "next";
import Link from "next/link";
import { textoLateralidad } from "@/lib/lateralidad";
import { notFound } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, BellRing, CalendarClock, Printer, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CONSULTAS_DEMO,
  ESTILO_APTITUD,
  ETIQUETA_APTITUD,
  ETIQUETA_ESTADO,
  GRUPOS_RIESGO,
  edad,
  fecha,
  iniciales,
} from "@/lib/pacientes";
import { obtenerTrabajador } from "@/lib/pacientes-datos";
import { listarConsultas } from "@/lib/consultas";
import { ETIQUETA_ESTADO_CONSULTA } from "@/lib/consultas-tipos";
import { obtenerSesion } from "@/lib/sesion";
import { esRolEmpresa } from "@/lib/sesion-roles";
import { listarAdjuntos } from "@/lib/adjuntos";
import { Adjuntos } from "@/components/app/adjuntos";
import { EnviarEstudio } from "@/components/app/enviar-estudio";
import { itemsDeLista, type Item } from "@/lib/listas";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { EmpleoAnterior } from "@/lib/historia-laboral";
import { HistoriaLaboral } from "./historia-laboral";
import { BotonConsulta } from "./boton-consulta";
import { PasarAEmpresa } from "@/components/app/pasar-a-empresa";
import { listarEmpresas } from "@/lib/empresas";
import { MenuImprimir } from "@/components/app/menu-imprimir";
import { FrescoAlVolver } from "@/components/app/fresco-al-volver";
import Cargando from "../../loading";
import { NotificacionesRiesgo } from "@/components/app/notificacion-riesgos";
import { type NotificacionRiesgo, ROLES_NOTIFICAN } from "@/lib/notificacion-riesgos";
import { cn } from "@/lib/utils";
import { ahora, hoyCaracas } from "@/lib/fecha";
import { alertasDeTrabajador } from "@/lib/alertas";
import { AlertasPaciente } from "./alertas-paciente";
import { Vacaciones } from "./vacaciones";
import type { Vacacion } from "./vacaciones-acciones";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await obtenerTrabajador((await params).id);
  return { title: t ? `${t.nombres} ${t.apellidos}` : "Paciente" };
}

export default async function FichaPaciente({ params }: Props) {
  const t = await obtenerTrabajador((await params).id);
  if (!t) notFound();
  const sesion = await obtenerSesion();
  const consultas = sesion.demo
    ? (CONSULTAS_DEMO[t.id] ?? []).map((c, i) => ({ id: String(i), demo: true, fecha: c.fecha, motivo: c.motivo, tipo: c.tipo, detalle: c.medico, aptitud: c.aptitud, reposo: false, tratamiento: false }))
    : (await listarConsultas({ trabajadorId: t.id, limite: 100 })).map((c) => ({ id: c.id, demo: false, fecha: c.fecha, motivo: c.motivo ?? "Sin motivo", tipo: c.tipo, detalle: ETIQUETA_ESTADO_CONSULTA[c.estado], aptitud: c.aptitud, reposo: c.tieneReposo, tratamiento: c.tieneTratamiento }));
  const verAdjuntos = !sesion.demo && Boolean(sesion.orgId) && !esRolEmpresa(sesion.rol);
  const [adjuntos, empleos, catalogoEstudios] = verAdjuntos
    ? await Promise.all([
        listarAdjuntos(t.id),
        crearClienteServidor().then((s) => s.from("historia_laboral").select("*").eq("trabajador_id", t.id).order("creado_en")).then((r) => (r.data ?? []) as EmpleoAnterior[]),
        // Auditoría: queda registrado quién abrió la historia (la base ignora a quien no es personal de salud)
        // Catálogo de paraclínicos: clase de cada estudio del historial (imagen, funcional, laboratorio)
        itemsDeLista(sesion.orgId, "paraclinico", true),
        crearClienteServidor().then((s) => s.rpc("registrar_acceso", { p_trabajador: t.id })),
      ])
    : [[], [] as EmpleoAnterior[], [] as Item[]];
  // RR. HH.: solo nombre y clase de cada estudio del catálogo (para elegir qué envía)
  const estudiosRrhh = sesion.rol === "gerente_empresa" && !sesion.demo && sesion.orgId
    ? (await itemsDeLista(sesion.orgId, "paraclinico", true)).map((i) => ({ id: i.id, nombre: i.nombre, grupo: i.grupo, datos: typeof i.datos?.clase === "string" ? { clase: i.datos.clase } : null }))
    : [];
  // Grupo sanguíneo: dato de salud, solo para el personal del servicio (decisión de Cesar; la base tampoco se lo entrega a RR. HH.)
  const verSalud = sesion.demo || ["administrador", "gerente_medico", "medico", "enfermeria", "recepcion"].includes(sesion.rol ?? "");
  // Notificación de riesgos del puesto (LOPCYMAT art. 56.3)
  const conBase = !sesion.demo && Boolean(sesion.orgId);
  const [{ data: tp }, { data: notifs }, { data: vacs }] = conBase
    ? await crearClienteServidor().then((s) => Promise.all([
        s.from("trabajadores").select("puesto_id, puestos(nombre, evaluado_en), empresas(dias_post_vacacional)").eq("id", t.id).single(),
        s.from("notificaciones_riesgo").select("id, puesto_id, puesto, entregada_en, firmada_en, contenido").eq("trabajador_id", t.id).order("entregada_en", { ascending: false }).order("creado_en", { ascending: false }).limit(20),
        s.from("vacaciones").select("id, desde, regreso").eq("trabajador_id", t.id).order("regreso", { ascending: false }).limit(10),
      ]))
    : [{ data: null }, { data: null }, { data: null }];
  const puestoActual = tp as unknown as { puesto_id: string | null; puestos: { nombre: string; evaluado_en: string | null } | null; empresas: { dias_post_vacacional: number } | null } | null;
  // Vacaciones y post vacacional: las anotan el servicio y RR. HH. (no son datos de salud)
  const vacaciones = (vacs ?? []) as Vacacion[];
  const anotaVacaciones = ["administrador", "gerente_medico", "medico", "enfermeria", "recepcion", "gerente_empresa"].includes(sesion.rol ?? "");
  const notificaciones: NotificacionRiesgo[] = (notifs ?? []).map((n) => ({ id: n.id, puestoId: n.puesto_id, puesto: n.puesto, entregadaEn: n.entregada_en, firmadaEn: n.firmada_en, contenido: n.contenido }));
  const examenVencido = t.proximoExamen !== null && t.proximoExamen < hoyCaracas();
  // Alertas para la próxima evaluación: solo el personal clínico (la base no se las entrega a nadie más)
  const alertas = conBase && sesion.clinico ? await alertasDeTrabajador(t.id) : [];
  // Empresa inactiva: la ficha y toda su historia se ven; para atenderlo de nuevo se pasa a una empresa activa
  const pasarA = t.empresaInactiva && conBase && !esRolEmpresa(sesion.rol)
    ? (await listarEmpresas()).map((e) => ({ id: e.id, nombre: e.razonSocial }))
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href="/pacientes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>
      {/* Con la caché de 30 s, volver a la ficha nunca muestra resultados o consultas de antes */}
      <FrescoAlVolver generada={`${t.id}-${ahora()}`} cargando={<Cargando />}>

      {/* Encabezado fijo de la ficha: identidad y aptitud vigente */}
      <Card className="py-5">
        <CardContent className="flex flex-wrap items-center gap-5 px-5">
          <Avatar className="size-16">
            <AvatarFallback className="bg-primary text-xl font-semibold text-primary-foreground">{iniciales(t)}</AvatarFallback>
          </Avatar>
          <div className="min-w-56 flex-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t.nombres} {t.apellidos}
              {alertas.length > 0 && (
                <span role="img" aria-label="Tiene una alerta para esta evaluación" title="Tiene una alerta para esta evaluación" className="ml-2 inline-flex align-[-1px]">
                  <BellRing className="size-4 text-aviso-texto" aria-hidden />
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{t.cedula}</span> · Historia {t.historia}{edad(t.fechaNacimiento) !== null && ` · ${edad(t.fechaNacimiento)} años`}{t.sexo && ` · ${t.sexo === "F" ? "Femenino" : "Masculino"}`}
            </p>
            <p className="mt-1 truncate text-sm">
              {[t.cargo, t.empresa].filter(Boolean).join(" · ")}
              {t.empresaInactiva && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Empresa inactiva</span>}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-xs text-muted-foreground">Aptitud vigente</span>
            {t.aptitud ? (
              <span className={cn("rounded-full px-3 py-1 text-sm font-medium", ESTILO_APTITUD[t.aptitud])}>{ETIQUETA_APTITUD[t.aptitud]}</span>
            ) : (
              <span className="text-sm text-muted-foreground">Sin evaluar</span>
            )}
            <span className="text-xs text-muted-foreground">desde {fecha(t.aptitudFecha)}</span>
          </div>
          {pasarA && (
            <div className="w-full">
              <PasarAEmpresa trabajadorId={t.id} empresaActual={t.empresa} empresas={pasarA} />
            </div>
          )}
          <div className="flex w-full gap-2 xl:w-auto">
            {/* RR. HH. envía estudios al expediente; solo los ve el personal de salud (entregar_estudio) */}
            {sesion.rol === "gerente_empresa" && !sesion.demo && sesion.orgId && (
              <EnviarEstudio orgId={sesion.orgId} trabajadorId={t.id} nombre={`${t.nombres} ${t.apellidos}`} catalogo={estudiosRrhh} />
            )}
            {!esRolEmpresa(sesion.rol) && (
              <>
                <BotonConsulta trabajadorId={t.id} habilitado={!sesion.demo} />
                {sesion.clinico && (
                  <Button variant="outline" asChild className="flex-1 xl:flex-none">
                    <Link href={`/imprimir/historia/${t.id}`} target="_blank"><Printer /> Imprimir historia</Link>
                  </Button>
                )}
                {sesion.clinico && (
                  <Button variant="outline" asChild className="flex-1 xl:flex-none">
                    <Link href={`/imprimir/historia-laboral/${t.id}`} target="_blank"><BriefcaseBusiness /> Historia laboral</Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {examenVencido && (
        <div className="flex items-center gap-3 rounded-lg border border-alerta/30 bg-alerta/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 shrink-0 text-alerta-texto" />
          Examen periódico vencido desde el {fecha(t.proximoExamen)}.
        </div>
      )}

      {alertas.length > 0 && (
        <AlertasPaciente alertas={alertas} puedeDescartar={["medico", "gerente_medico", "administrador"].includes(sesion.rol ?? "")} />
      )}

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="laboral">Laboral y riesgos</TabsTrigger>
          <TabsTrigger value="consultas">Consultas ({consultas.length})</TabsTrigger>
          {verAdjuntos && <TabsTrigger value="historia">Historia laboral ({empleos.length})</TabsTrigger>}
          {verAdjuntos && <TabsTrigger value="resultados">Estudios ({adjuntos.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumen" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
            <CardContent>
              <Datos filas={[
                ["Fecha de nacimiento", fecha(t.fechaNacimiento)],
                ...(verSalud ? [["Grupo sanguíneo", t.grupoSanguineo] as [string, string | null]] : []),
                ["Lateralidad", textoLateralidad(t.lateralidad)],
                ["Teléfono", t.telefono],
                ["Correo", t.correo],
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Vigilancia de la salud</CardTitle></CardHeader>
            <CardContent>
              <Datos filas={[
                ["Estado", ETIQUETA_ESTADO[t.estado]],
                ["Última aptitud", fecha(t.aptitudFecha)],
                ["Próximo examen", fecha(t.proximoExamen)],
                ["Tipo de paciente", t.tipoPaciente],
              ]} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="laboral" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Puesto actual</CardTitle></CardHeader>
            <CardContent>
              <Datos filas={[
                ["Empresa", t.empresa],
                ["Dependencia", t.dependencia],
                ["Cargo", t.cargo || null],
                ["Turno", t.turno],
                ["Ingreso", fecha(t.fechaIngreso)],
              ]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Riesgos del puesto</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {GRUPOS_RIESGO.map(([clave, nombre]) => {
                const lista = t.riesgos[clave] ?? [];
                return (
                  <div key={clave} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="w-28 shrink-0 text-muted-foreground">{nombre}</span>
                    {lista.length ? lista.map((r) => (
                      <span key={r} className="rounded-md bg-muted px-2 py-0.5">{r}</span>
                    )) : <span className="text-muted-foreground/60">—</span>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          {conBase && (
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Vacaciones y post vacacional</CardTitle></CardHeader>
              <CardContent>
                <Vacaciones trabajadorId={t.id} iniciales={vacaciones} diasPost={puestoActual?.empresas?.dias_post_vacacional ?? 5} hoy={hoyCaracas()} editable={anotaVacaciones} fechasPosv={consultas.filter((c) => /post\s*-?\s*vacacional/i.test(c.motivo)).map((c) => c.fecha.slice(0, 10))} />
              </CardContent>
            </Card>
          )}
          {conBase && (
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Notificación de riesgos (LOPCYMAT art. 56.3)</CardTitle></CardHeader>
              <CardContent>
                <NotificacionesRiesgo
                  trabajadorId={t.id}
                  puesto={{ id: puestoActual?.puesto_id ?? null, nombre: puestoActual?.puestos?.nombre ?? "", evaluadoEn: puestoActual?.puestos?.evaluado_en ?? null }}
                  iniciales={notificaciones}
                  edita={ROLES_NOTIFICAN.includes(sesion.rol ?? "")}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="consultas" className="mt-4">
          <Card className="py-0">
            {consultas.length === 0 ? (
              <div className="grid place-items-center gap-2 py-14 text-muted-foreground">
                <CalendarClock className="size-7" /> Sin consultas registradas.
              </div>
            ) : (
              <ul className="divide-y">
                {consultas.map((c) => (
                  <li key={c.id} className="relative flex flex-wrap items-center gap-4 px-5 py-3 transition hover:bg-muted/40">
                    {!c.demo && <Link href={`/atencion/${c.id}`} className="absolute inset-0" aria-label="Abrir consulta" />}
                    <span className="w-24 font-mono text-sm text-muted-foreground">{fecha(c.fecha)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.motivo}</div>
                      <div className="text-xs capitalize text-muted-foreground">{c.tipo} · {c.detalle}</div>
                    </div>
                    {c.aptitud && (
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ESTILO_APTITUD[c.aptitud])}>{ETIQUETA_APTITUD[c.aptitud]}</span>
                    )}
                    {!c.demo && <MenuImprimir consultaId={c.id} aptitud={Boolean(c.aptitud)} reposo={c.reposo} tratamiento={c.tratamiento} preoperatoria={/preoper/i.test(c.motivo)} compacto />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
        {verAdjuntos && (
          <TabsContent value="historia" className="mt-4">
            <Card><CardContent><HistoriaLaboral trabajadorId={t.id} empleos={empleos} /></CardContent></Card>
          </TabsContent>
        )}
        {verAdjuntos && (
          <TabsContent value="resultados" className="mt-4">
            <Card><CardContent><Adjuntos orgId={sesion.orgId!} trabajadorId={t.id} iniciales={adjuntos} catalogo={catalogoEstudios} consultas={consultas.filter((c) => !c.demo)} /></CardContent></Card>
          </TabsContent>
        )}
      </Tabs>
      </FrescoAlVolver>
    </div>
  );
}

function Datos({ filas }: { filas: [string, string | null][] }) {
  return (
    <dl className="divide-y text-sm">
      {filas.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
