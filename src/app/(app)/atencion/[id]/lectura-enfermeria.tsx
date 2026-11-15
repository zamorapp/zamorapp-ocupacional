import Link from "next/link";
import { BookOpen, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ETIQUETA_APTITUD } from "@/lib/pacientes";
import type { ConsultaCompleta } from "@/lib/consultas";
import { ETIQUETA_ESTADO_CONSULTA, ETIQUETA_ORIGEN } from "@/lib/consultas-tipos";

const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function Parte({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <div className="text-sm [overflow-wrap:anywhere]">{children}</div>
    </section>
  );
}

// Lo que enfermería ve de la consulta del médico: solo lectura, para conocer el caso antes de su evolución.
// La observación privada del médico no se muestra.
export function LecturaEnfermeria({ consulta }: { consulta: ConsultaCompleta }) {
  const d = consulta.datos;
  const t = consulta.trabajador;
  const signos = ([["ta", "Tensión", "mmHg"], ["fc", "Pulso", "lpm"], ["fr", "Respiración", "rpm"], ["temp", "Temperatura", "°C"], ["sat", "Saturación", "%"], ["peso", "Peso", "kg"], ["talla", "Talla", ""]] as const)
    .filter(([k]) => d.signos?.[k]?.trim());
  const alterados = [...d.examenFuncional, ...d.examenFisico].filter((f) => f.valor.trim() && f.valor.trim() !== f.normal.trim());
  const paraclinicos = d.paraclinicos.filter((p) => p.resultado.trim());
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg"><BookOpen className="size-5 text-primary" aria-hidden /> Consulta del {fechaCorta(d.fecha)}</CardTitle>
            <CardDescription className="[overflow-wrap:anywhere]">
              {t.nombre} · C.I. {t.cedula} · {t.empresa}{t.cargo ? ` · ${t.cargo}` : ""}
              <br />{d.motivoTexto || "Consulta"} · {ETIQUETA_ESTADO_CONSULTA[d.estado]}{consulta.medico ? ` · ${consulta.medico}` : ""}
            </CardDescription>
          </div>
          <Button asChild>
            <Link href={`/enfermeria?trabajador=${t.id}&consulta=${d.id}#nueva`}><PenLine /> Escribir evolución de enfermería</Link>
          </Button>
        </div>
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Solo lectura: enfermería conoce el caso aquí; la consulta la escribe y la cambia el médico.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {d.enfermedadActual.trim() && <Parte titulo="Enfermedad actual"><p className="whitespace-pre-line">{d.enfermedadActual}</p></Parte>}
        {signos.length > 0 && (
          <Parte titulo="Signos vitales">
            <p className="flex flex-wrap gap-x-4 gap-y-1 font-cifra">{signos.map(([k, n, u]) => <span key={k}>{n} {d.signos[k]} {u}</span>)}</p>
          </Parte>
        )}
        {d.antecedentes.length > 0 && (
          <Parte titulo="Antecedentes">
            <ul className="list-disc pl-5">{d.antecedentes.map((a) => <li key={a.id}>{a.nombre}{a.observacion ? `: ${a.observacion}` : ""}</li>)}</ul>
          </Parte>
        )}
        {alterados.length > 0 && (
          <Parte titulo="Hallazgos del examen">
            <ul className="list-disc pl-5">{alterados.map((f) => <li key={f.clave}>{f.nombre}: {f.valor}</li>)}</ul>
          </Parte>
        )}
        {paraclinicos.length > 0 && (
          <Parte titulo="Paraclínicos">
            <ul className="list-disc pl-5">{paraclinicos.map((p) => <li key={p.id}>{p.nombre}: {p.resultado}</li>)}</ul>
          </Parte>
        )}
        {d.diagnosticos.length > 0 && (
          <Parte titulo="Diagnósticos">
            <ul className="list-disc pl-5">
              {d.diagnosticos.map((x) => <li key={`${x.cie10}-${x.descripcion}`}><span className="font-cifra text-xs">{x.cie10}</span> {x.descripcion} <span className="text-muted-foreground">· {ETIQUETA_ORIGEN[x.origen] ?? x.origen}</span></li>)}
            </ul>
          </Parte>
        )}
        {d.tratamiento.length > 0 && (
          <Parte titulo="Tratamiento indicado">
            <ul className="list-disc pl-5">
              {d.tratamiento.map((m, i) => <li key={i}>{[m.medicina, m.concentracion, m.presentacion, m.dosis, m.via, m.frecuencia, m.duracion].filter(Boolean).join(" · ")}</li>)}
            </ul>
          </Parte>
        )}
        {d.indicaciones.trim() && <Parte titulo="Indicaciones"><p className="whitespace-pre-line">{d.indicaciones}</p></Parte>}
        {d.reposo.activo && <Parte titulo="Reposo">Del {fechaCorta(d.reposo.desde)} al {fechaCorta(d.reposo.hasta)}{d.reposo.causa ? ` · ${d.reposo.causa}` : ""}</Parte>}
        {d.aptitud.clasificacion && (
          <Parte titulo="Aptitud">
            {ETIQUETA_APTITUD[d.aptitud.clasificacion as keyof typeof ETIQUETA_APTITUD] ?? d.aptitud.clasificacion}
            {d.aptitud.limitaciones.length > 0 && <span className="text-muted-foreground"> · {d.aptitud.limitaciones.join(", ")}</span>}
          </Parte>
        )}
        {d.recomendacionesTrabajador.trim() && <Parte titulo="Recomendaciones al trabajador"><p className="whitespace-pre-line">{d.recomendacionesTrabajador}</p></Parte>}
        {d.conclusiones.trim() && <Parte titulo="Conclusiones"><p className="whitespace-pre-line">{d.conclusiones}</p></Parte>}
      </CardContent>
    </Card>
  );
}
