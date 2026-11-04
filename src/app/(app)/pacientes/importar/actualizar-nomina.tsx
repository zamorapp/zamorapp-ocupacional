"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Undo2, Upload, UserMinus, UserPlus, Users, WifiOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hoyCaracas } from "@/lib/fecha";
import { type CampoNomina, ETIQUETA, type FilaNomina, type Lectura, leerNomina, mostrar, pct, type Plan, planNomina } from "@/lib/nomina";
import { cn } from "@/lib/utils";
import { actualizacionesDeHoy, aplicarParteNomina, datosNomina, deshacerNomina, type Parte } from "./acciones-nomina";
import { leerCSV } from "@/lib/importar";

type Pestana = "cambios" | "nuevos" | "salen" | "ausentes" | "revisar" | "avisos";
type Hecho = { lote: string; cambios: number; nuevos: number; inactivados: number };
const TANDA = 150;
const PARTE = 200;

/**
 * Actualizar la nómina con la plantilla de RR. HH. (Cesar, 04-nov-2026). Se descarga la nómina actual prellenada, RR. HH.
 * la corrige y completa, y al subirla se ve TODO antes de aplicar: qué se completa, qué cambia, quién entra y quién sale,
 * con el conteo. Cédula exacta; lo dudoso va a «Revisar» y no se toca. Después queda «Deshacer» (el mismo día).
 */
export function ActualizarNomina({ empresas, empresaInicial }: { empresas: { id: string; nombre: string }[]; empresaInicial: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [empresa, setEmpresa] = useState(empresaInicial);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [pestana, setPestana] = useState<Pestana>("cambios");
  const [excluir, setExcluir] = useState<Set<string>>(new Set());
  const [identidad, setIdentidad] = useState(false);
  const [ausentesFuera, setAusentesFuera] = useState(false);
  const [mostrarN, setMostrarN] = useState(TANDA);
  const [arrastrando, setArrastrando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const [deHoy, setDeHoy] = useState<{ id: string; archivo: string | null; creado_en: string }[]>([]);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => { actualizacionesDeHoy(empresa).then(setDeHoy).catch(() => setDeHoy([])); }, [empresa, hecho]);

  const reiniciar = () => { setArchivo(null); setLectura(null); setPlan(null); setExcluir(new Set()); setIdentidad(false); setAusentesFuera(false); setMensaje(null); setHecho(null); setMostrarN(TANDA); };

  const procesar = (f: File) => iniciar(async () => {
    reiniciar();
    setArchivo(f.name);
    if (f.size > 8 * 1024 * 1024) return setMensaje({ ok: false, texto: "Ese archivo pesa más de 8 MB. Sube la planilla de la nómina (.xlsx o .csv)." });
    try {
      const celdas: unknown[][] = /\.csv$/i.test(f.name) ? leerCSV(await f.text()) : await (await import("read-excel-file")).default(f);
      const l = leerNomina(celdas, hoyCaracas());
      if (l.faltan.length) return setMensaje({ ok: false, texto: "No encontré la columna «Cédula». Usa la plantilla que se descarga aquí o un Excel con una columna de cédulas." });
      if (!l.filas.length) return setMensaje({ ok: false, texto: "La planilla no tiene trabajadores." });
      const r = await datosNomina(empresa, l.filas.filter((x) => x.valida).map((x) => x.cedula));
      if (!r.ok || !r.actuales || !r.otros) return setMensaje({ ok: false, texto: r.mensaje });
      const p = planNomina(l.filas, r.actuales, r.otros, r.turnos ?? []);
      setLectura(l);
      setPlan(p);
      setPestana(p.cambios.length ? "cambios" : p.nuevos.length ? "nuevos" : p.salen.length ? "salen" : p.revisar.length ? "revisar" : "ausentes");
    } catch {
      setMensaje({ ok: false, texto: "No se pudo leer el archivo. Guárdalo como Excel (.xlsx) o CSV y vuelve a subirlo." });
    }
  });

  // Lo que se aplicará con las opciones elegidas
  const cuenta = useMemo(() => {
    if (!plan) return null;
    const cambios = plan.cambios.filter((c) => !excluir.has(c.id) && c.difs.some((d) => d.tipo !== "identidad" || identidad));
    const nuevos = plan.nuevos.filter((n) => !excluir.has(n.cedula));
    const salen = [...plan.salen, ...(ausentesFuera ? plan.ausentes : [])].filter((s) => !excluir.has(s.id));
    const identidadN = plan.cambios.filter((c) => c.difs.some((d) => d.tipo === "identidad")).length;
    return { cambios, nuevos, salen, identidadN, total: cambios.length + nuevos.length + salen.length };
  }, [plan, excluir, identidad, ausentesFuera]);

  const aplicar = () => iniciar(async () => {
    if (!plan || !lectura || !cuenta) return;
    setMensaje(null);
    const porFila = new Map(lectura.filas.map((f) => [f.fila, f]));
    const filas: FilaNomina[] = [...cuenta.cambios.map((c) => c.fila), ...cuenta.nuevos.map((n) => n.fila)].map((n) => porFila.get(n)!).filter(Boolean);
    const ids = cuenta.salen.map((s) => s.id);
    const partes = Math.max(Math.ceil(filas.length / PARTE), Math.ceil(ids.length / 500), 1);
    const opciones = { identidad, excluir: [...excluir] };
    let lote: string | null = null;
    const suma: Hecho = { lote: "", cambios: 0, nuevos: 0, inactivados: 0 };
    for (let i = 0; i < partes; i++) {
      setAvance(Math.round((i * 100) / partes));
      const r: { ok: boolean; mensaje: string; parte?: Parte } = await aplicarParteNomina(empresa, lote, archivo ?? "", filas.slice(i * PARTE, (i + 1) * PARTE), opciones,
        ids.slice(i * 500, (i + 1) * 500), "No está en la nómina de RR. HH.");
      if (!r.ok || !r.parte) {
        setAvance(null);
        if (lote) setHecho({ ...suma, lote });
        return setMensaje({ ok: false, texto: (lote ? `Se guardó una parte (${suma.cambios + suma.nuevos + suma.inactivados}); puedes deshacerla. ` : "No se guardó nada. ") + r.mensaje });
      }
      lote = r.parte.lote;
      suma.cambios += r.parte.cambios; suma.nuevos += r.parte.nuevos; suma.inactivados += r.parte.inactivados;
    }
    setAvance(null);
    setHecho({ ...suma, lote: lote! });
    setPlan(null);
    setMensaje({ ok: true, texto: `Nómina actualizada: ${suma.cambios} con datos completados o corregidos, ${suma.nuevos} nuevos y ${suma.inactivados} inactivos. La población de la vigilancia ya usa estos datos.` });
  });

  const deshacer = (id: string) => iniciar(async () => {
    const r = await deshacerNomina(id);
    setMensaje({ ok: r.ok, texto: r.mensaje });
    if (r.ok) { setHecho(null); setDeHoy((d) => d.filter((x) => x.id !== id)); }
  });

  const alternar = (k: string) => setExcluir((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Paso n={1} titulo="Elige la empresa">
            <Select value={empresa} onValueChange={(v) => { setEmpresa(v); reiniciar(); }}>
              <SelectTrigger className="h-11! w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </Paso>
          <Paso n={2} titulo="Envía la plantilla a RR. HH.">
            <Button variant="outline" className="h-11 w-full" asChild>
              <a href={`/pacientes/nomina-excel?empresa=${empresa}`}><Download /> Descargar nómina actual</a>
            </Button>
            <p className="text-xs text-muted-foreground">Viene llena con los trabajadores de hoy. RR. HH. corrige, llena lo <span className="rounded bg-[#FFF4C2] px-1 text-[#6b5800]">amarillo</span>, agrega a los nuevos y escribe NO a quien ya no está.</p>
          </Paso>
          <Paso n={3} titulo="Sube la planilla llena">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => entrada.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files[0]; if (f) procesar(f); }}
              className={cn("flex h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 text-sm font-medium transition",
                arrastrando ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/40")}
            >
              {ocupado && !avance ? <Loader2 className="size-4 animate-spin text-primary" /> : <Upload className="size-4 text-primary" />}
              <span className="truncate">{archivo ?? "Arrastra o elige el Excel"}</span>
            </button>
            <input ref={entrada} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ""; }} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><WifiOff className="size-3.5" /> Aplicar los cambios necesita internet.</p>
          </Paso>
        </CardContent>
      </Card>

      {mensaje && (
        <div role="status" className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm", mensaje.ok ? "border-ok/30 bg-ok/10" : "border-alerta/30 bg-alerta/10")}>
          {mensaje.ok ? <CheckCircle2 className="size-5 shrink-0 text-ok-texto" /> : <XCircle className="size-5 shrink-0 text-alerta-texto" />}
          <span className="min-w-0 flex-1">{mensaje.texto}</span>
          {hecho && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => deshacer(hecho.lote)}><Undo2 /> Deshacer</Button>}
          {mensaje.ok && <Link href="/pacientes" className="font-medium text-primary hover:underline">Ver pacientes</Link>}
        </div>
      )}

      {!plan && !hecho && deHoy.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
          <Undo2 className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-muted-foreground">Hoy se actualizó la nómina de esta empresa{deHoy[0].archivo ? ` con «${deHoy[0].archivo}»` : ""}. Puedes deshacerlo hasta el final del día.</span>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => deshacer(deHoy[0].id)}><Undo2 /> Deshacer</Button>
        </div>
      )}

      {plan && cuenta && (
        <>
          <Card className="py-0">
            <CardContent className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[minmax(0,15rem)_1fr]">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Población de la empresa</p>
                <p className="text-3xl font-semibold tabular-nums">{plan.poblacion.antes.toLocaleString("es-VE")} <span className="text-muted-foreground">→</span> {(plan.poblacion.despues - (ausentesFuera ? plan.ausentes.length : 0)).toLocaleString("es-VE")}</p>
                <p className="text-xs text-muted-foreground">{ausentesFuera && plan.ausentes.length ? `Sin contar ${plan.ausentes.length === 1 ? "al que no aparece y saldrá" : `a los ${plan.ausentes.length} que no aparecen y saldrán`}.` : plan.ausentes.length ? `${plan.ausentes.length === 1 ? "1 no aparece" : `${plan.ausentes.length} no aparecen`} en la planilla (siguen en la nómina salvo que elijas lo contrario).` : "Todos los trabajadores aparecen en la planilla."}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Datos completos para la vigilancia</p>
                {plan.completitud.map((c) => {
                  const total = Math.max(plan.poblacion.despues, 1);
                  const a = pct(c.antes, Math.max(plan.poblacion.antes, 1)), d = pct(c.despues, total);
                  return (
                    <div key={c.campo} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{ETIQUETA[c.campo]}</span>
                      <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${d}%` }} />
                        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(a, d)}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-right tabular-nums">{a}% → <b className={cn(d === 100 && "text-ok-texto")}>{d}%</b></span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Ficha activo={pestana === "cambios"} onClick={() => { setPestana("cambios"); setMostrarN(TANDA); }} icono={FileSpreadsheet} n={plan.cambios.length} texto="Completar o corregir" />
            <Ficha activo={pestana === "nuevos"} onClick={() => { setPestana("nuevos"); setMostrarN(TANDA); }} icono={UserPlus} n={plan.nuevos.length} texto="Nuevos" />
            <Ficha activo={pestana === "salen"} onClick={() => { setPestana("salen"); setMostrarN(TANDA); }} icono={UserMinus} n={plan.salen.length} texto="RR. HH. dice NO" />
            <Ficha activo={pestana === "ausentes"} onClick={() => { setPestana("ausentes"); setMostrarN(TANDA); }} icono={Users} n={plan.ausentes.length} texto="No aparecen" />
            <Ficha activo={pestana === "revisar"} onClick={() => { setPestana("revisar"); setMostrarN(TANDA); }} icono={AlertTriangle} n={plan.revisar.length} texto="Revisar a mano" tono="alerta" />
            <Ficha activo={pestana === "avisos"} onClick={() => { setPestana("avisos"); setMostrarN(TANDA); }} icono={XCircle} n={plan.avisos.length} texto="Datos ilegibles" tono="alerta" />
          </div>

          <Card className="gap-0 overflow-hidden py-0">
            <div className="border-b px-5 py-3 text-sm text-muted-foreground">
              {pestana === "cambios" && <>Desmarca a quien no quieras tocar. <span className="text-ok-texto">Verde</span>: dato que faltaba. <span className="line-through">Tachado</span>: nombre, sexo o nacimiento distintos (solo se cambian si lo eliges abajo). {plan.iguales > 0 && `${plan.iguales} sin cambios.`}</>}
              {pestana === "nuevos" && "Se registran en esta empresa como activos. Sus evaluaciones empiezan desde cero."}
              {pestana === "salen" && "Quedan inactivos: salen de la población y de las alertas, pero sus datos y su historia se conservan."}
              {pestana === "ausentes" && "Están en zamorApp pero no en la planilla. No se tocan, salvo que marques «Inactivar también a los que no aparecen»."}
              {pestana === "revisar" && "No se aplican solos: la cédula está en otra empresa o fuera de la nómina, o falta el nombre. Ábrelos para decidir."}
              {pestana === "avisos" && "Ese dato no se pudo leer y se ignora; el resto de la fila sí se usa. Corrígelo en la planilla si quieres que entre."}
            </div>
            <ul className="divide-y">
              {pestana === "cambios" && plan.cambios.slice(0, mostrarN).map((c) => (
                <Fila key={c.id} marcado={!excluir.has(c.id)} onMarcar={() => alternar(c.id)} titulo={c.nombre} sub={`${c.cedula} · fila ${c.fila}`}>
                  <div className="flex flex-wrap gap-1.5">
                    {c.difs.map((d) => (
                      <span key={d.campo} className={cn("rounded-md px-2 py-0.5 text-xs",
                        d.tipo === "completa" ? "bg-ok/10 text-ok-texto" : d.tipo === "identidad" ? (identidad ? "bg-alerta/15 text-alerta-texto" : "bg-muted text-muted-foreground line-through") : "bg-primary/10 text-foreground")}>
                        {ETIQUETA[d.campo]}: {d.tipo === "completa" ? "" : <>{mostrar(d.campo, d.antes)} → </>}<b>{mostrar(d.campo, d.despues)}</b>
                      </span>
                    ))}
                  </div>
                </Fila>
              ))}
              {pestana === "nuevos" && plan.nuevos.slice(0, mostrarN).map((n) => (
                <Fila key={n.cedula} marcado={!excluir.has(n.cedula)} onMarcar={() => alternar(n.cedula)} titulo={`${n.datos.nombres} ${n.datos.apellidos}`} sub={`${n.cedula} · fila ${n.fila}`}>
                  <span className="text-xs text-muted-foreground">{(["cargo", "dependencia", "sexo", "fechaNacimiento", "fechaIngreso"] as CampoNomina[]).filter((k) => n.datos[k]).map((k) => `${ETIQUETA[k]}: ${mostrar(k, n.datos[k]!)}`).join(" · ") || "Solo nombre y cédula"}</span>
                </Fila>
              ))}
              {(pestana === "salen" || pestana === "ausentes") && (pestana === "salen" ? plan.salen : plan.ausentes).slice(0, mostrarN).map((s) => (
                <Fila key={s.id} marcado={(pestana === "salen" || ausentesFuera) && !excluir.has(s.id)} desactivado={pestana === "ausentes" && !ausentesFuera}
                  onMarcar={() => alternar(s.id)} titulo={s.nombre} sub={`${s.cedula}${s.cargo ? ` · ${s.cargo}` : ""}${s.fila ? ` · fila ${s.fila}` : ""}`} />
              ))}
              {pestana === "revisar" && plan.revisar.slice(0, mostrarN).map((r) => (
                <li key={`${r.fila}-${r.cedula}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                  <span className="font-medium">{r.nombre}</span>
                  <span className="text-muted-foreground">{r.cedula} · fila {r.fila}</span>
                  <span className="w-full text-alerta-texto sm:w-auto sm:flex-1">{r.motivo}</span>
                  {r.id && <Link href={`/pacientes/${r.id}`} target="_blank" className="font-medium text-primary hover:underline">Abrir</Link>}
                </li>
              ))}
              {pestana === "avisos" && plan.avisos.slice(0, mostrarN).map((a, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 px-5 py-2.5 text-sm"><span className="text-muted-foreground">Fila {a.fila} · {a.cedula || "sin cédula"}</span><span>{a.texto}</span></li>
              ))}
              {listaVacia(plan, pestana) && <li className="px-5 py-8 text-center text-sm text-muted-foreground">Nada en esta lista.</li>}
            </ul>
            {largo(plan, pestana) > mostrarN && (
              <button type="button" onClick={() => setMostrarN((n) => n + TANDA)} className="w-full border-t py-3 text-sm font-medium text-primary hover:bg-muted/40">
                Ver {Math.min(TANDA, largo(plan, pestana) - mostrarN)} más de {largo(plan, pestana)}
              </button>
            )}
          </Card>

          <Card className="py-0 lg:sticky lg:bottom-3 lg:z-10 lg:shadow-lg">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <div className="flex-1 space-y-2 text-sm">
                {cuenta.identidadN > 0 && (
                  <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={identidad} onChange={(e) => setIdentidad(e.target.checked)} />
                    <span>Corregir también nombre, sexo o nacimiento distintos ({cuenta.identidadN})</span></label>
                )}
                {plan.ausentes.length > 0 && (
                  <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={ausentesFuera} onChange={(e) => setAusentesFuera(e.target.checked)} />
                    <span>{plan.ausentes.length === 1 ? "Inactivar también al que no aparece en la planilla" : `Inactivar también a los ${plan.ausentes.length} que no aparecen en la planilla`}</span></label>
                )}
                {avance !== null && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${avance}%` }} /></div>
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="ghost" onClick={reiniciar} disabled={ocupado}>Cancelar</Button>
                <Button className="h-auto min-h-11 flex-1 whitespace-normal py-2 lg:flex-none" disabled={ocupado || cuenta.total === 0} onClick={aplicar}>
                  {ocupado && avance !== null ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {cuenta.total === 0 ? "Nada que aplicar" : `Aplicar: ${resumen(cuenta.cambios.length, cuenta.nuevos.length, cuenta.salen.length)}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const resumen = (c: number, n: number, s: number) =>
  [c && `${c} ${c === 1 ? "ficha" : "fichas"}`, n && `${n} ${n === 1 ? "nuevo" : "nuevos"}`, s && `${s} ${s === 1 ? "inactivo" : "inactivos"}`].filter(Boolean).join(", ");

function largo(p: Plan, t: Pestana) {
  return { cambios: p.cambios, nuevos: p.nuevos, salen: p.salen, ausentes: p.ausentes, revisar: p.revisar, avisos: p.avisos }[t].length;
}
const listaVacia = (p: Plan, t: Pestana) => largo(p, t) === 0;

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>{titulo}
      </p>
      {children}
    </div>
  );
}

function Ficha({ activo, onClick, icono: Icono, n, texto, tono }: { activo: boolean; onClick: () => void; icono: typeof Users; n: number; texto: string; tono?: "alerta" }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      className={cn("flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition hover:border-primary/50",
        activo && "border-primary ring-2 ring-primary/20", n === 0 && "opacity-60")}>
      <Icono className={cn("size-4", tono === "alerta" && n > 0 ? "text-alerta-texto" : "text-primary")} />
      <span className="text-2xl font-semibold tabular-nums">{n.toLocaleString("es-VE")}</span>
      <span className="text-xs text-muted-foreground">{texto}</span>
    </button>
  );
}

function Fila({ marcado, onMarcar, titulo, sub, desactivado, children }: { marcado: boolean; onMarcar: () => void; titulo: string; sub: string; desactivado?: boolean; children?: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-3 px-5 py-3", desactivado && "opacity-60")}>
      <input type="checkbox" aria-label={`Incluir a ${titulo}`} className="mt-1 size-4 shrink-0 accent-primary" checked={marcado} disabled={desactivado} onChange={onMarcar} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm"><span className="font-medium">{titulo}</span> <span className="text-muted-foreground">{sub}</span></p>
        {children}
      </div>
    </li>
  );
}
