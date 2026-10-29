import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { empresaActivaId } from "@/lib/empresa-activa";
import { FileSpreadsheet, Printer, ShieldAlert } from "lucide-react";
import { Barras } from "@/components/app/barras";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reporte } from "@/lib/reportes-catalogo";
import { cargarListado, parametrosListado, type ConsultaReporte } from "@/lib/reportes-listados";
import { SelectorPeriodo } from "../selector-periodo";
import { FiltrosReporte } from "./filtros";
import { TablaPivote } from "./pivote";
import { TablaReporte } from "./tabla";
import { LoteAptitud } from "./lote-aptitud";
import { estadosDeLote } from "@/lib/lote-aptitud";
import { hoyCaracas } from "@/lib/fecha";
import { correoConfigurado, remitente } from "@/lib/correo";
import { listarContactos, listarPlantillas } from "@/lib/envios";

export const dynamic = "force-dynamic";
// El envío de constancias genera el PDF en el servidor y puede tardar más que el límite normal
export const maxDuration = 60;

type Props = { params: Promise<{ tipo: string }>; searchParams: Promise<ConsultaReporte> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: reporte((await params).tipo)?.corto ?? "Reportes" };
}

const COLORES = ["bg-primary", "bg-chart-2", "bg-chart-3", "bg-chart-4"];

export default async function ReporteSame({ params, searchParams }: Props) {
  const [{ tipo }, q] = await Promise.all([params, searchParams]);
  // Aptitud: contactos y plantillas del envío no dependen del listado; se piden a la vez (un viaje menos)
  // (misma empresa que usa el listado: la de la URL o, si no hay, la activa)
  const idPrevio = tipo === "aptitud" ? (q.empresa ?? (await empresaActivaId())) : null;
  const extras = idPrevio ? Promise.all([listarContactos(idPrevio), listarPlantillas()]) : null;
  extras?.catch(() => null);
  const l = await cargarListado(tipo, q);
  if (!l) notFound();
  const { def, periodo, empresa } = l;
  const enlace = parametrosListado(q, empresa?.id ?? null).toString();
  // Aptitud emitida de una empresa: lista para marcar y sacar las constancias en un solo PDF
  const lote = def.clave === "aptitud" && empresa && l.listo && !l.sinAccesoClinico && l.filas.length > 0;
  const previos = lote && empresa && empresa.id === idPrevio ? await extras : null;
  const [estados, contactos, plantillas] = lote && empresa
    ? await Promise.all([estadosDeLote(l.filas.map((f) => String(f.id))), ...(previos ?? [listarContactos(empresa.id), listarPlantillas()])] as const)
    : [{}, [], []];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{def.titulo}</h1>
          <p className="text-muted-foreground">
            {empresa?.razonSocial ?? "Todas las empresas"} <span className="text-xs">(la empresa se elige arriba, en el encabezado)</span>
          </p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{def.descripcion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`/reportes/${def.clave}/excel?${enlace}`} download><FileSpreadsheet /> Excel</a>
          </Button>
          <Button asChild>
            <Link href={`/imprimir/reporte/${def.clave}?${enlace}`} target="_blank"><Printer /> Imprimir o PDF</Link>
          </Button>
        </div>
      </div>

      {def.periodo !== false ? (
        <SelectorPeriodo key={`${periodo.desde}${periodo.hasta}${empresa?.id}`} periodo={periodo} inicioEmpresa={empresa?.mesInicioGestion ?? 1} empresa={empresa?.razonSocial ?? null} />
      ) : (
        <p className="rounded-lg bg-muted/50 px-4 py-2 text-sm text-muted-foreground">Este reporte muestra la situación actual: no depende del período.</p>
      )}

      {!l.listo && (
        <div className="flex items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 text-aviso-texto" /> Conecta Supabase para ver los reportes.
        </div>
      )}
      {l.sinAccesoClinico && (
        <div className="flex items-center gap-3 rounded-lg border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-5 text-aviso-texto" /> Este reporte tiene datos médicos: solo lo ve el personal de salud (o quien tenga acceso clínico activado).
        </div>
      )}

      <FiltrosReporte columnas={def.columnas} valores={l.opcionesFiltro} opciones={def.opciones ?? []} elegidas={l.opc} ver={l.ver} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {l.indicadores.map((i) => (
          <Card key={i.titulo} className="gap-1 py-4">
            <CardContent className="space-y-1 px-5">
              <div className="text-sm text-muted-foreground">{i.titulo}</div>
              <div className="truncate text-2xl font-semibold tracking-tight" title={i.valor}>{i.valor}</div>
              {i.detalle && <div className="truncate text-xs text-muted-foreground" title={i.detalle}>{i.detalle}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
      {l.filas.length !== l.total && (
        <p className="text-sm text-muted-foreground">Filtrado: {l.filas.length.toLocaleString("es-VE")} de {l.total.toLocaleString("es-VE")} registros.</p>
      )}

      {l.filas.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {l.resumenes.map((r, i) => (
            <Card key={r.titulo}>
              <CardHeader><CardTitle className="text-base">{r.titulo}</CardTitle></CardHeader>
              <CardContent><Barras filas={r.filas} color={COLORES[i % COLORES.length]} /></CardContent>
            </Card>
          ))}
        </div>
      )}

      {def.clave === "aptitud" && !empresa && l.filas.length > 0 && (
        <p className="rounded-lg bg-muted/50 px-4 py-2 text-sm text-muted-foreground">Para sacar las constancias en un solo PDF, elige una empresa arriba, en el encabezado.</p>
      )}
      {lote && empresa ? (
        <LoteAptitud
          filas={l.filas}
          estados={estados}
          empresa={{ id: empresa.id, nombre: empresa.razonSocial }}
          usuarioId={l.sesion.usuarioId}
          puedeFirmar={l.sesion.clinico && l.sesion.rol !== "enfermeria"}
          envio={l.sesion.clinico ? { fecha: hoyCaracas(), contactos, plantillas, correo: correoConfigurado() ? remitente() : null, puedeAutorizar: l.sesion.rol === "administrador" || l.sesion.rol === "gerente_medico" } : null}
        />
      ) : l.pivote ? <TablaPivote p={l.pivote} /> : <TablaReporte columnas={l.columnas} filas={l.filas} totales={l.totales} />}
      {def.nota && <p className="text-xs text-muted-foreground">{def.nota}</p>}
      <p className="text-xs text-muted-foreground">Solo cuentan las consultas cerradas o firmadas; las que están en curso no entran en los reportes.</p>
    </div>
  );
}
