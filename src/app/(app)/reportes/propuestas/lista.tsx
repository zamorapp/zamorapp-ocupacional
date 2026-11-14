"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Building2, Check, FileText, Loader2, ShieldCheck, Tag, X } from "lucide-react";
import { useSinInternet, RequiereInternet } from "@/components/app/sin-internet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Propuesta } from "@/lib/agentes/propuestas";
import { cn } from "@/lib/utils";
import { aprobarPropuesta, descartarPropuesta } from "./acciones";

type Par = [string, string];
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));
const fechaCorta = (d: unknown) => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : "");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const TIPOS: Record<string, { texto: string; icono: typeof Bot }> = {
  informe_vigilancia: { texto: "Borrador del informe", icono: FileText },
  programa_vigilancia: { texto: "Programa de vigilancia", icono: ShieldCheck },
  ajuste_empresa: { texto: "Ajuste de la empresa", icono: Building2 },
  precio_servicio: { texto: "Precio del catálogo", icono: Tag },
  precio_empresa: { texto: "Precio para la empresa", icono: Tag },
};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const cadena = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function ListaPropuestas({ pendientes, resueltas, abierta, secciones, analisis }: { pendientes: Propuesta[]; resueltas: Propuesta[]; abierta: string | null; secciones: Par[]; analisis: Par[] }) {
  const sinInternet = useSinInternet();
  return (
    <div className="space-y-6">
      {sinInternet ? <RequiereInternet texto="Puedes leer las propuestas; para aprobar o descartar hace falta internet." /> : null}
      {pendientes.length ? (
        <div className="space-y-4">
          {pendientes.map((p) => <Tarjeta key={p.id} p={p} enfocar={p.id === abierta} secciones={secciones} analisis={analisis} />)}
        </div>
      ) : (
        <section className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
          <Bot className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">No hay propuestas por revisar.</p>
            <p className="text-muted-foreground">Cuando tu agente proponga un programa, un ajuste o un borrador del informe, aparece aquí. La llave necesita la casilla «Vigilancia y reportes» (Configuración › Puerta para agentes).</p>
          </div>
        </section>
      )}
      {resueltas.length ? (
        <section aria-labelledby="resueltas" className="space-y-2">
          <h2 id="resueltas" className="text-sm font-medium text-muted-foreground">Revisadas hace poco</h2>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {resueltas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", p.estado === "aprobada" ? "bg-ok/15 text-ok-texto" : "bg-muted text-muted-foreground")}>
                  {p.estado === "aprobada" ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}{p.estado === "aprobada" ? "Aprobada" : "Descartada"}
                </span>
                <span className="min-w-0 flex-1 basis-48">{p.titulo}{p.empresa ? <span className="text-muted-foreground"> · {p.empresa}</span> : null}</span>
                <span className="text-xs text-muted-foreground">{p.resuelto_en ? fechaHora(p.resuelto_en) : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Tarjeta({ p, enfocar, secciones, analisis }: { p: Propuesta; enfocar: boolean; secciones: Par[]; analisis: Par[] }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (enfocar) ref.current?.scrollIntoView({ block: "start" }); }, [enfocar]);
  const t = TIPOS[p.tipo] ?? { texto: "Propuesta", icono: Bot };
  const Icono = t.icono;
  return (
    <section ref={ref} aria-labelledby={`p-${p.id}`} className={cn("scroll-mt-20 space-y-4 rounded-xl border bg-card p-4", enfocar && "ring-2 ring-primary/40")}>
      <header className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-aviso/15 text-aviso-texto"><Icono className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1 basis-60">
          <div className="text-xs font-medium uppercase tracking-wide text-aviso-texto">{t.texto} · propuesta de «{p.llave_nombre}»</div>
          <h2 id={`p-${p.id}`} className="font-medium">{p.titulo}</h2>
          <p className="text-sm text-muted-foreground">{p.empresa ? `${p.empresa} · ` : ""}{fechaHora(p.creado_en)}</p>
        </div>
      </header>
      {p.motivo ? <p className="rounded-md bg-muted/50 px-3 py-2 text-sm"><span className="font-medium">Nota del agente: </span>{p.motivo}</p> : null}
      {p.tipo === "informe_vigilancia" ? <Informe p={p} secciones={secciones} analisis={analisis} />
        : p.tipo === "programa_vigilancia" ? <Simple p={p}><Programa p={p} /></Simple>
        : p.tipo === "ajuste_empresa" ? <Simple p={p}><Ajuste p={p} /></Simple>
        : p.tipo === "precio_servicio" || p.tipo === "precio_empresa" ? <Simple p={p}><Precio p={p} /></Simple>
        : <Simple p={p}><Generica p={p} /></Simple>}
    </section>
  );
}

// Aprobar / Descartar, con el mensaje de resultado
function useResolver(id: string) {
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const correr = (f: () => Promise<{ ok: boolean; mensaje: string }>) => iniciar(async () => {
    setMensaje(null);
    const r = await f();
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) router.refresh();
  });
  return { mensaje, ocupado, aprobar: (e?: Parameters<typeof aprobarPropuesta>[1]) => correr(() => aprobarPropuesta(id, e)), descartar: () => correr(() => descartarPropuesta(id)) };
}

function Mensaje({ m }: { m: { ok: boolean; texto: string } | null }) {
  if (!m) return null;
  return <p role={m.ok ? "status" : "alert"} className={cn("rounded-md px-3 py-2 text-sm", m.ok ? "bg-ok/10 text-ok-texto" : "border border-alerta/40 bg-alerta/5 text-alerta-texto")}>{m.texto}</p>;
}

function Simple({ p, children }: { p: Propuesta; children: React.ReactNode }) {
  const { mensaje, ocupado, aprobar, descartar } = useResolver(p.id);
  const sinInternet = useSinInternet();
  return (
    <>
      {children}
      <Mensaje m={mensaje} />
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button className="h-11 sm:h-9" disabled={ocupado || sinInternet} onClick={() => aprobar()}>{ocupado ? <Loader2 className="animate-spin" /> : <Check />} Aprobar</Button>
        <Button variant="ghost" className="h-11 sm:h-9" disabled={ocupado || sinInternet} onClick={descartar}><X /> Descartar</Button>
      </div>
    </>
  );
}

function Filas({ filas }: { filas: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(9rem,auto)_1fr]">
      {filas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Programa({ p }: { p: Propuesta }) {
  const d = p.propuesto;
  const nombres = (v: unknown) => (lista(v).length ? lista(v).map(cadena).join(", ") : "Toda la empresa");
  return (
    <div className="space-y-2">
      <Filas filas={[
        ["Programa", cadena(d.nombre)],
        ...(d.proyecto ? [["Proyecto u obra", cadena(d.proyecto)] as [string, React.ReactNode]] : []),
        ["Riesgo o condición", cadena(d.riesgo) || "—"],
        ...(d.condiciones ? [["Condiciones", <span key="c" className="whitespace-pre-line">{cadena(d.condiciones)}</span>] as [string, React.ReactNode]] : []),
        ["Dependencias", nombres(d.dependencias)],
        ["Cargos", lista(d.cargos).length ? lista(d.cargos).map(cadena).join(", ") : "Todos"],
        ["Exámenes", lista(d.examenes).length ? (
          <ul key="e" className="space-y-0.5">{lista(d.examenes).map((e, i) => { const x = e as Record<string, unknown>; return <li key={i}>{cadena(x.nombre)}{x.cada_meses ? ` · cada ${cadena(x.cada_meses)} meses` : ""}</li>; })}</ul>
        ) : "—"],
        ["Metas", lista(d.metas).length ? (
          <ul key="m" className="space-y-0.5">{lista(d.metas).map((e, i) => { const x = e as Record<string, unknown>; return <li key={i}>{cadena(x.indicador)}{x.meta ? `: ${cadena(x.meta)}` : ""}</li>; })}</ul>
        ) : "—"],
      ]} />
      {p.antes ? <p className="text-xs text-muted-foreground">Cambia un programa que ya existe. Al aprobar se reemplaza con lo de arriba.</p> : null}
      <p className="text-xs text-muted-foreground">Después de aprobar lo puedes editar en Empresas › ficha › Programas de vigilancia.</p>
    </div>
  );
}

const ETIQUETA_AJUSTE: Record<string, string> = { proyecto: "Proyecto u obra", mes_inicio_gestion: "Mes en que empieza la gestión" };
const valorAjuste = (k: string, v: unknown) => (v == null || v === "" ? "(vacío)" : k === "mes_inicio_gestion" ? MESES[Number(v) - 1] ?? cadena(v) : cadena(v));

function Ajuste({ p }: { p: Propuesta }) {
  return (
    <Filas filas={Object.keys(p.propuesto).map((k) => [ETIQUETA_AJUSTE[k] ?? k, (
      <span key={k}><span className="text-muted-foreground line-through decoration-muted-foreground/50">{valorAjuste(k, p.antes?.[k])}</span> → <span className="font-medium">{valorAjuste(k, p.propuesto[k])}</span></span>
    )])} />
  );
}

function Generica({ p }: { p: Propuesta }) {
  return (
    <Filas filas={Object.entries(p.propuesto).filter(([, v]) => typeof v !== "object" || v === null).map(([k, v]) => [k.replace(/_/g, " "), (
      <span key={k}>{p.antes && k in p.antes ? <><span className="text-muted-foreground line-through">{cadena(p.antes[k])}</span> → </> : null}<span className="font-medium">{cadena(v)}</span></span>
    )])} />
  );
}

// Borrador del informe: cada sección propuesta junto a lo que ya tienes; eliges cuál queda y puedes corregir la del agente
function Informe({ p, secciones, analisis }: { p: Propuesta; secciones: Par[]; analisis: Par[] }) {
  const prop = (p.propuesto.secciones ?? {}) as Record<string, string>;
  const propAn = (p.propuesto.analisis ?? {}) as Record<string, string>;
  const actual = p.actual ?? { secciones: {}, analisis: {} };
  const items = [
    ...secciones.filter(([k]) => prop[k]).map(([k, t]) => ({ clave: k, titulo: t, grupo: "secciones" as const, agente: prop[k], mio: actual.secciones[k] ?? "" })),
    ...analisis.filter(([k]) => propAn[k]).map(([k, t]) => ({ clave: k, titulo: `Análisis · ${t}`, grupo: "analisis" as const, agente: propAn[k], mio: actual.analisis[k] ?? "" })),
  ];
  // Por defecto se usa el del agente donde no tienes nada escrito; donde ya escribiste, se queda lo tuyo
  const [usar, setUsar] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [`${i.grupo}.${i.clave}`, !i.mio.trim()])));
  const [textos, setTextos] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [`${i.grupo}.${i.clave}`, i.agente])));
  const { mensaje, ocupado, aprobar, descartar } = useResolver(p.id);
  const sinInternet = useSinInternet();
  const elegidos = items.filter((i) => usar[`${i.grupo}.${i.clave}`]);
  const aplicar = (todos: boolean) => {
    const sel = todos ? items : elegidos;
    aprobar({
      secciones: Object.fromEntries(sel.filter((i) => i.grupo === "secciones").map((i) => [i.clave, textos[`secciones.${i.clave}`]])),
      analisis: Object.fromEntries(sel.filter((i) => i.grupo === "analisis").map((i) => [i.clave, textos[`analisis.${i.clave}`]])),
    });
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Período del {fechaCorta(p.propuesto.desde)} al {fechaCorta(p.propuesto.hasta)}. Tu texto no cambia hasta que pulses «Usar lo elegido». Después revisa el informe en Vigilancia antes de imprimirlo.
      </p>
      {items.map((i) => {
        const k = `${i.grupo}.${i.clave}`;
        const si = usar[k];
        return (
          <div key={k} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{i.titulo}</h3>
              <div role="radiogroup" aria-label={`Qué texto queda en ${i.titulo}`} className="inline-flex rounded-md border p-0.5 text-sm">
                <button type="button" role="radio" aria-checked={si} onClick={() => setUsar({ ...usar, [k]: true })}
                  className={cn("min-h-9 rounded px-3", si ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Usar el del agente</button>
                <button type="button" role="radio" aria-checked={!si} onClick={() => setUsar({ ...usar, [k]: false })}
                  className={cn("min-h-9 rounded px-3", !si ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Dejar el mío</button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className={cn("min-w-0 rounded-lg border p-3 text-sm", !si && "border-primary/50 bg-primary/5")}>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tu texto</div>
                {i.mio.trim() ? <p className="whitespace-pre-line">{i.mio}</p> : <p className="italic text-muted-foreground">Vacío</p>}
              </div>
              <div className={cn("min-w-0 rounded-lg border p-3", si && "border-primary/50 bg-primary/5")}>
                <label htmlFor={`t-${p.id}-${k}`} className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Propuesta del agente (puedes corregirla)</label>
                <Textarea id={`t-${p.id}-${k}`} value={textos[k]} onChange={(e) => setTextos({ ...textos, [k]: e.target.value })} rows={Math.min(12, Math.max(4, Math.ceil(textos[k].length / 70)))} className="text-sm" />
              </div>
            </div>
          </div>
        );
      })}
      <Mensaje m={mensaje} />
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button className="h-11 sm:h-9" disabled={ocupado || sinInternet || !elegidos.length} onClick={() => aplicar(false)}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Check />} Usar lo elegido ({elegidos.length})
        </Button>
        <Button variant="outline" className="h-11 sm:h-9" disabled={ocupado || sinInternet} onClick={() => aplicar(true)}>Usar todo</Button>
        <Button variant="ghost" className="h-11 sm:h-9" disabled={ocupado || sinInternet} onClick={descartar}><X /> Descartar borrador</Button>
      </div>
    </div>
  );
}

// Precio propuesto (20261030961000): el de antes tachado, el nuevo y cuánto cambia. Solo vale para lo que se facture después.
const dolares = (v: unknown) => `$ ${Number(v ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function Precio({ p }: { p: Propuesta }) {
  const antes = Number(p.antes?.precio_usd ?? 0);
  const nuevo = Number(p.propuesto.precio_usd ?? 0);
  const pct = antes > 0 ? Math.round(((nuevo - antes) / antes) * 100) : null;
  return (
    <Filas filas={[
      ["Precio", <span key="p" className="tabular-nums whitespace-nowrap">{antes > 0
        ? <span className="text-muted-foreground line-through decoration-muted-foreground/50">{dolares(antes)}</span>
        : <span className="text-muted-foreground">Sin precio</span>} → <span className="font-medium">{dolares(nuevo)}</span>{pct !== null && pct !== 0
        ? <span className="ml-2 text-xs text-muted-foreground">{pct > 0 ? `sube ${pct} %` : `baja ${-pct} %`}</span> : null}</span>],
      ["Aplica a", p.tipo === "precio_empresa" ? `Solo ${p.empresa ?? "esta empresa"}` : "Todas las empresas sin precio convenido"],
      ["Notas ya hechas", "No cambian: el precio nuevo vale para lo que factures después."],
    ]} />
  );
}
