import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Brain, Briefcase, Map as IconoMapa, Monitor, PersonStanding, Printer } from "lucide-react";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { ROLES_ERGONOMIA } from "@/lib/ergonomia";
import { listarEvaluaciones } from "@/lib/ergonomia-datos";
import { listarPsicosociales } from "@/lib/psicosocial-datos";
import { ROLES_PSICOSOCIAL } from "@/lib/psicosocial";
import { estructuraEmpresa } from "@/lib/puestos";
import { GRUPOS, riesgoMaximo } from "@/lib/puestos-tipos";
import { listarEvaluacionesRiesgos } from "@/lib/riesgos-datos";
import { ROLES_RIESGOS } from "@/lib/riesgos-puesto";
import { obtenerSesion } from "@/lib/sesion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Evaluaciones de riesgos y puestos de trabajo" };
export const dynamic = "force-dynamic";

export default async function Evaluaciones() {
  const [sesion, empresaId, empresas] = await Promise.all([obtenerSesion(), empresaActivaId(), listarEmpresas()]);
  const ve = (roles: string[]) => sesion.demo || (!!sesion.rol && roles.includes(sesion.rol));
  const [riesgos, ergo, psico, estructura] = await Promise.all([
    ve(ROLES_RIESGOS) ? listarEvaluacionesRiesgos(empresaId).catch(() => []) : Promise.resolve([]),
    ve(ROLES_ERGONOMIA) ? listarEvaluaciones(empresaId).catch(() => []) : Promise.resolve([]),
    ve(ROLES_PSICOSOCIAL) ? listarPsicosociales(empresaId).catch(() => []) : Promise.resolve([]),
    empresaId ? estructuraEmpresa(empresaId) : Promise.resolve({ dependencias: [], puestos: [] }),
  ]);
  const empresa = empresas.find((e) => e.id === empresaId);
  const oficina = riesgos.filter((r) => r.tipo === "oficina").length;
  const tarjetas = [
    { href: "/riesgos", icono: IconoMapa, titulo: "Identificación de riesgos y mapa", texto: "Lista de chequeo por puesto (físicos, químicos, biológicos, ergonómicos, psicosociales y de seguridad), valoración, mapa de riesgos y gráficas.", n: riesgos.length - oficina, color: "from-sky-500/15", roles: ROLES_RIESGOS },
    { href: "/riesgos?tipo=oficina", icono: Monitor, titulo: "Trabajo en oficina", texto: "Pantalla, silla, mesa, luz, ruido, temperatura, pausas y carga mental, con mediciones y sus valores de referencia.", n: oficina, color: "from-violet-500/15", roles: ROLES_RIESGOS },
    { href: "/ergonomia", icono: PersonStanding, titulo: "Ergonomía de puestos", texto: "DEB, RULA, REBA, ROSA, NIOSH, OCRA y KIM con fotos de la tarea.", n: ergo.length, color: "from-amber-500/15", roles: ROLES_ERGONOMIA },
    { href: "/psicosocial", icono: Brain, titulo: "Riesgos psicosociales", texto: "Cuestionario anónimo desde el celular o en papel, con resultados por dimensión.", n: psico.length, color: "from-pink-500/15", roles: ROLES_PSICOSOCIAL },
  ].filter((t) => ve(t.roles));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Evaluaciones de riesgos y puestos de trabajo</h1>
        <p className="text-muted-foreground">Todo lo que identifica, mide y valora los riesgos de cada puesto, en un solo lugar{empresa ? ` · ${empresa.razonSocial}` : ""}.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tarjetas.map((t) => (
          <Link key={t.href} href={t.href} className={cn("group relative overflow-hidden rounded-2xl border bg-gradient-to-br to-transparent p-5 shadow-[0_14px_34px_-24px_rgba(15,40,60,.55)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-22px_rgba(15,40,60,.6)]", t.color)}>
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-card shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_6px_14px_-8px_rgba(0,0,0,.4)]"><t.icono className="size-6 text-primary" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">{t.titulo}</h2>
                  <span className="font-cifra text-2xl font-semibold">{t.n}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.texto}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">Abrir <ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <section id="puestos" className="scroll-mt-20 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Briefcase className="size-5" /> Puestos de trabajo y su riesgo</h2>
            <p className="text-sm text-muted-foreground">La matriz de cada puesto (la usan la consulta, la constancia y la notificación de riesgos).</p>
          </div>
          {empresa && <Link href={`/empresas/${empresa.id}`} className="text-sm font-medium text-primary hover:underline">Editar puestos en la empresa</Link>}
        </div>
        {!empresaId ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Elige una empresa arriba (selector de empresa) para ver sus puestos.</p>
        ) : estructura.puestos.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Esta empresa aún no tiene puestos registrados.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {estructura.puestos.map((p) => {
              const max = riesgoMaximo(p);
              const n = GRUPOS.reduce((a, [g]) => a + (p.riesgos[g]?.length ?? 0), 0);
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.nombre}</div>
                    <div className="truncate text-xs text-muted-foreground">{[p.dependencia, `${p.trabajadores} trabajadores`, n ? `${n} riesgos` : "sin riesgos"].filter(Boolean).join(" · ")}</div>
                  </div>
                  {max ? <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", max.clase)}>{max.texto}</span> : <span className="shrink-0 text-xs text-muted-foreground">Sin valorar</span>}
                  <Link href={`/imprimir/puesto/${p.id}`} aria-label={`Imprimir la ficha de ${p.nombre}`} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted"><Printer className="size-4" /></Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
