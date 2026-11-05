"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ClipboardPen, Copy, FileText, Handshake, KeyRound, Lightbulb, Loader2, Lock, LockOpen, MessageCircle, Plus, Printer, Save, Trash2, X,
} from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  APARTADOS, METODO_PSICOSOCIAL, NIVELES, TOTAL_PREGUNTAS, codigoLegible, conclusionSugerida, idGrupo, ordenarPorRojo, porcentaje, prioridadDimension,
  type Dimension, type Medida, type Resultados,
} from "@/lib/psicosocial";
import type { EvaluacionPsicosocial, Grupo } from "@/lib/psicosocial-datos";
import { cn } from "@/lib/utils";
import { borrarPsicosocial, cambiarEstadoPsicosocial, cargarPapel, generarCodigos, guardarPsicosocial } from "../acciones";

type Props = {
  ev: EvaluacionPsicosocial;
  resultados: Resultados | null;
  codigos: { libres: string[]; usados: number };
  puestosEmpresa: string[];
  urlPublica: string;
  demo: boolean;
  puedeEditar: boolean;
  puedeReabrir: boolean;
};

const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function Paso({ n, titulo, icono, listo, children, accion }: { n: number; titulo: string; icono: React.ReactNode; listo?: boolean; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 font-semibold">
          <span className={cn("grid size-7 place-items-center rounded-full text-sm", listo ? "bg-ok/15 text-ok-texto" : "bg-primary/10 text-primary")}>
            {listo ? <CheckCircle2 className="size-4" /> : n}
          </span>
          {icono}{titulo}
        </h2>
        {accion}
      </div>
      {children}
    </Card>
  );
}

// Barra apilada verde / amarillo / rojo con los porcentajes adentro (el número se lee también sin color)
function Barra({ d, n }: { d: Dimension; n: number }) {
  const v = [d.verde, d.amarillo, d.rojo];
  return (
    <div className="flex h-7 w-full overflow-hidden rounded-md bg-muted text-[11px] font-semibold" role="img"
      aria-label={`Verde ${porcentaje(d.verde, n)} %, amarillo ${porcentaje(d.amarillo, n)} %, rojo ${porcentaje(d.rojo, n)} %`}>
      {v.map((x, i) => x > 0 && (
        <div key={i} className={cn("grid place-items-center", NIVELES[i].barra, i === 1 ? "text-[#3d2c00]" : "text-white")} style={{ width: `${(x * 100) / n}%` }}>
          {porcentaje(x, n) >= 9 && `${porcentaje(x, n)} %`}
        </div>
      ))}
    </div>
  );
}

// Celda del mapa por puesto: % en rojo, con fondo más intenso cuanto más alto
function CeldaRojo({ d, n }: { d: Dimension | undefined; n: number }) {
  if (!d) return <td className="px-2 py-2 text-center text-muted-foreground">—</td>;
  const p = porcentaje(d.rojo, n);
  const pr = prioridadDimension(d);
  return (
    <td className="px-1 py-1 text-center">
      <span className={cn("block rounded-md px-2 py-1.5 font-semibold tabular-nums", pr.clase)} title={`${pr.texto}: ${d.rojo} de ${n} en rojo`}>{p} %</span>
    </td>
  );
}

export function PanelPsicosocial({ ev, resultados, codigos, puestosEmpresa, urlPublica, demo, puedeEditar, puedeReabrir }: Props) {
  const router = useRouter();
  const cerrada = ev.estado === "cerrada";
  const editable = puedeEditar && !cerrada;
  const [titulo, setTitulo] = useState(ev.titulo);
  const [trabajadores, setTrabajadores] = useState(ev.trabajadores ? String(ev.trabajadores) : "");
  const [minimo, setMinimo] = useState(ev.minimo);
  const [grupos, setGrupos] = useState<Grupo[]>(ev.grupos);
  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [acuerdoFecha, setAcuerdoFecha] = useState(ev.acuerdoFecha ?? "");
  const [acuerdoNota, setAcuerdoNota] = useState(ev.acuerdoNota);
  const [conclusiones, setConclusiones] = useState(ev.conclusiones);
  const [medidas, setMedidas] = useState<Medida[]>(ev.medidas);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [cantidad, setCantidad] = useState(() => Math.max(1, Math.min(500, (ev.trabajadores ?? 10) - codigos.libres.length - codigos.usados)));

  const cambiado = useMemo(() => JSON.stringify([titulo, trabajadores, minimo, grupos, acuerdoFecha, acuerdoNota, conclusiones, medidas])
    !== JSON.stringify([ev.titulo, ev.trabajadores ? String(ev.trabajadores) : "", ev.minimo, ev.grupos, ev.acuerdoFecha ?? "", ev.acuerdoNota, ev.conclusiones, ev.medidas]),
  [titulo, trabajadores, minimo, grupos, acuerdoFecha, acuerdoNota, conclusiones, medidas, ev]);

  const correr = (f: () => Promise<{ ok: boolean; mensaje: string }>, refrescar = true) => iniciar(async () => {
    if (demo) { setAviso({ ok: false, texto: "En modo demo no se guardan datos." }); return; }
    const r = await f();
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok && refrescar) router.refresh();
  });
  const guardar = () => correr(() => guardarPsicosocial(ev.id, {
    titulo, trabajadores: trabajadores ? Number(trabajadores) : null, minimo, grupos, acuerdoFecha: acuerdoFecha || null, acuerdoNota, conclusiones, medidas,
  }, cerrada));

  const enlace = (c: string) => `${urlPublica}/c/${c}`;
  const textoWhatsApp = (c: string) =>
    `Hola. ${ev.empresa} y el Comité de Seguridad y Salud Laboral están evaluando las condiciones de trabajo. Te invitamos a responder un cuestionario ANÓNIMO de 38 preguntas (unos 10 minutos): no pide tu nombre ni tu cédula. Este enlace es solo para ti y sirve una vez: ${enlace(c)}`;
  const siguiente = codigos.libres[0];
  const participacion = resultados ? resultados.total : 0;
  const base = ev.trabajadores ?? (codigos.libres.length + codigos.usados || 0);

  const agregarGrupo = (nombre: string) => {
    const t = nombre.trim().slice(0, 120);
    if (!t || grupos.some((g) => g.nombre.toLowerCase() === t.toLowerCase()) || grupos.length >= 40) return;
    setGrupos([...grupos, { id: idGrupo(grupos.map((g) => g.id)), nombre: t }]);
    setNuevoGrupo("");
  };
  const sugerirMedida = (apartado: number, medida: string) => {
    if (medidas.some((m) => m.medida === medida)) return;
    setMedidas([...medidas, { id: crypto.randomUUID(), apartado, medida, responsable: "", plazo: "" }]);
  };

  const prioritarios = resultados?.dimensiones ? ordenarPorRojo(resultados.dimensiones).filter((d) => prioridadDimension(d).orden >= 1) : [];

  return (
    <div className="space-y-5">
      {/* Estado y acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", cerrada ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
          {cerrada ? `Cerrada el ${ev.cerradaEn ? fecha(ev.cerradaEn) : ""}: RR. HH. ya ve el informe` : "Abierta: recibiendo respuestas"}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><a href={`/imprimir/psicosocial/${ev.id}`}><FileText /> Informe</a></Button>
          {puedeEditar && !cerrada && (
            <Button size="sm" variant="outline" disabled={ocupado} onClick={async () => {
              if (!(await confirmar({
                titulo: "¿Cerrar y entregar la evaluación?",
                texto: `${resultados?.suficiente ? "" : `Todavía no hay ${ev.minimo} respuestas: el informe saldrá sin resultados. `}Los códigos que falten dejan de servir y RR. HH. podrá ver el informe agregado. Puedes seguir editando conclusiones y medidas.`,
                accion: "Cerrar",
              }))) return;
              correr(() => cambiarEstadoPsicosocial(ev.id, "cerrada"));
            }}><Lock /> Cerrar y entregar</Button>
          )}
          {cerrada && puedeReabrir && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => correr(() => cambiarEstadoPsicosocial(ev.id, "abierta"))}><LockOpen /> Reabrir</Button>}
          {puedeEditar && !cerrada && participacion === 0 && codigos.usados === 0 && (
            <Button size="sm" variant="ghost" className="text-alerta-texto" disabled={ocupado} onClick={async () => {
              if (!(await confirmar({ titulo: "¿Borrar esta evaluación?", texto: "Todavía nadie respondió. Se borran también sus códigos.", accion: "Borrar", peligro: true }))) return;
              iniciar(async () => { const r = await borrarPsicosocial(ev.id); if (r.ok) router.push("/psicosocial"); else setAviso({ ok: false, texto: r.mensaje }); });
            }}><Trash2 /> Borrar</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 1. Preparar */}
        <Paso n={1} titulo="Preparar con el Comité" icono={<Handshake className="size-4 text-muted-foreground" />} listo={!!ev.acuerdoFecha}>
          <p className="text-sm text-muted-foreground">
            La licencia del método exige acordarlo con el Comité de Seguridad y Salud Laboral (o los delegados de prevención) y garantizar el anonimato. Sin la fecha del acuerdo no se generan códigos.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="ac-fecha">Fecha del acuerdo</Label>
              <Input id="ac-fecha" type="date" value={acuerdoFecha} onChange={(e) => setAcuerdoFecha(e.target.value)} disabled={!editable} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-nota">Cómo consta</Label>
              <Input id="ac-nota" value={acuerdoNota} onChange={(e) => setAcuerdoNota(e.target.value)} disabled={!editable} maxLength={1000} placeholder="Ej. Acta n.º 14 del Comité SSL" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="ev-titulo">Nombre</Label>
              <Input id="ev-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!editable} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-trab">Trabajadores</Label>
              <Input id="ev-trab" inputMode="numeric" value={trabajadores} onChange={(e) => setTrabajadores(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={!editable} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-min" title="Un grupo con menos respuestas se junta con otros para que nadie sea reconocido">Mínimo por grupo</Label>
              <Input id="ev-min" type="number" min={3} max={50} value={minimo} onChange={(e) => setMinimo(Math.max(3, Math.min(50, Number(e.target.value) || 5)))} disabled={!editable} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Puestos o áreas que elige el trabajador</Label>
            <ul className="flex flex-wrap gap-1.5">
              {grupos.map((g, i) => (
                <li key={g.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-1 text-sm text-primary">
                  <input aria-label={`Nombre del grupo ${i + 1}`} value={g.nombre} disabled={!editable} maxLength={120}
                    onChange={(e) => setGrupos(grupos.map((x) => (x.id === g.id ? { ...x, nombre: e.target.value } : x)))}
                    className="field-sizing-content min-w-16 rounded-full bg-transparent px-2 py-0.5 outline-none focus:bg-background" />
                  {editable && <button type="button" onClick={() => setGrupos(grupos.filter((x) => x.id !== g.id))} className="rounded-full p-0.5 hover:bg-primary/20" aria-label={`Quitar ${g.nombre}`}><X className="size-3.5" /></button>}
                </li>
              ))}
              {grupos.length === 0 && <li className="text-sm text-muted-foreground">Sin grupos: los resultados salen solo para toda la empresa.</li>}
            </ul>
            {editable && (
              <>
                <div className="flex gap-2">
                  <Input value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarGrupo(nuevoGrupo); } }} placeholder="Agregar puesto o área" aria-label="Nuevo puesto o área" />
                  <Button type="button" variant="outline" onClick={() => agregarGrupo(nuevoGrupo)} disabled={!nuevoGrupo.trim()}><Plus /> Agregar</Button>
                </div>
                {puestosEmpresa.filter((p) => !grupos.some((g) => g.nombre === p)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {puestosEmpresa.filter((p) => !grupos.some((g) => g.nombre === p)).slice(0, 20).map((p) => (
                      <button key={p} type="button" onClick={() => agregarGrupo(p)} className="rounded-full border px-2.5 py-0.5 text-xs hover:border-primary">+ {p}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Paso>

        {/* 2. Repartir */}
        <Paso n={2} titulo="Repartir códigos" icono={<KeyRound className="size-4 text-muted-foreground" />} listo={codigos.usados > 0}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: "Respondieron", v: participacion, sub: base ? `${porcentaje(participacion, base)} % de ${base}` : "" },
              { k: "Códigos sin usar", v: codigos.libres.length, sub: "por repartir o en manos" },
              { k: "Por enlace", v: codigos.usados, sub: `${Math.max(0, participacion - codigos.usados)} en papel` },
            ].map((x) => (
              <div key={x.k} className="rounded-xl bg-muted/50 p-3">
                <div className="text-2xl font-semibold tabular-nums">{x.v}</div>
                <div className="text-xs font-medium">{x.k}</div>
                {x.sub && <div className="text-[11px] text-muted-foreground">{x.sub}</div>}
              </div>
            ))}
          </div>
          {editable && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="cod-n">Códigos nuevos</Label>
                <Input id="cod-n" type="number" min={1} max={500} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="w-24" />
              </div>
              <Button disabled={ocupado || !ev.acuerdoFecha} title={!ev.acuerdoFecha ? "Primero guarda la fecha del acuerdo con el Comité" : undefined}
                onClick={() => correr(() => generarCodigos(ev.id, cantidad))}>
                {ocupado ? <Loader2 className="animate-spin" /> : <KeyRound />} Generar
              </Button>
              {!ev.acuerdoFecha && <span className="text-xs text-aviso-texto">Guarda primero la fecha del acuerdo.</span>}
            </div>
          )}
          {codigos.libres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href={`/imprimir/psicosocial/${ev.id}?hoja=codigos`}><Printer /> Imprimir papelitos con QR</a></Button>
              {siguiente && !cerrada && (
                <>
                  <Button variant="outline" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(siguiente))}`, "_blank", "noopener")}>
                    <MessageCircle /> WhatsApp ({codigoLegible(siguiente)})
                  </Button>
                  <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(textoWhatsApp(siguiente)).then(() => setAviso({ ok: true, texto: `Copiado el enlace del código ${codigoLegible(siguiente)}.` }), () => {}); }}>
                    <Copy /> Copiar
                  </Button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Reparte los papelitos al azar (por ejemplo, de una caja): así nadie sabe qué código tiene cada quien. Por WhatsApp, manda un código distinto a cada trabajador; el siguiente se marca solo cuando lo usan, así que no reenvíes el mismo.
          </p>
          {editable && <PapelDialogo ev={ev} grupos={grupos} demo={demo} alListo={(t) => { setAviso({ ok: true, texto: t }); router.refresh(); }} />}
        </Paso>
      </div>

      {/* 3. Resultados */}
      <Paso n={3} titulo="Resultados" icono={null} listo={!!resultados?.suficiente}
        accion={resultados?.suficiente ? <span className="text-xs text-muted-foreground">{resultados.total} respuestas · % de trabajadores en cada nivel</span> : null}>
        {!resultados ? (
          <p className="text-sm text-muted-foreground">No se pudieron leer los resultados. Revisa la conexión y recarga.</p>
        ) : !resultados.suficiente ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Van <strong className="text-foreground">{resultados.total}</strong> respuestas. Los resultados aparecen a partir de {resultados.minimo}, para que nadie pueda ser reconocido.
          </div>
        ) : (
          <div className="space-y-6">
            <ul className="space-y-3">
              {(resultados.dimensiones ?? []).map((d) => {
                const a = APARTADOS[d.apartado - 1];
                const pr = prioridadDimension(d);
                return (
                  <li key={d.apartado} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,15rem)_1fr_6rem] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">{a.nombre}</div>
                      <div className="text-xs text-muted-foreground">Media {String(d.media).replace(".", ",")} de {a.maximo}</div>
                    </div>
                    <Barra d={d} n={resultados.total} />
                    <span className={cn("justify-self-start rounded-full px-2.5 py-0.5 text-xs font-medium sm:justify-self-end", pr.clase)}>{pr.texto}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {NIVELES.map((n) => <span key={n.nombre} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", n.barra)} /> {n.nombre}: {n.que.toLowerCase()}</span>)}
              <span>Prioritario = la mitad o más en rojo · A vigilar = más de un tercio (la referencia es un tercio).</span>
            </div>

            {(resultados.grupos ?? []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Por puesto o área · % en rojo</h3>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Grupo</th>
                        {APARTADOS.map((a) => <th key={a.n} className="px-1 py-2 text-center font-medium">{a.corto}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {resultados.grupos!.map((g) => (
                        <tr key={g.id}>
                          <td className="px-3 py-2"><div className="font-medium">{g.nombre}</div><div className="text-xs text-muted-foreground">{g.n} respuestas</div></td>
                          {APARTADOS.map((a) => <CeldaRojo key={a.n} d={g.dimensiones.find((x) => x.apartado === a.n)} n={g.n} />)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!!resultados.sin_grupo && (
                  <p className="text-xs text-muted-foreground">{resultados.sin_grupo} respuestas de grupos con menos de {resultados.minimo} cuentan en el total pero no se muestran por grupo.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Paso>

      {/* 4. Conclusiones y plan */}
      <Paso n={4} titulo="Conclusiones y medidas preventivas" icono={<ClipboardPen className="size-4 text-muted-foreground" />} listo={medidas.length > 0 && !!conclusiones}>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="concl">Conclusiones</Label>
            {puedeEditar && resultados?.suficiente && (
              <Button size="sm" variant="ghost" onClick={() => setConclusiones(conclusionSugerida(resultados))}><Lightbulb /> Sugerir</Button>
            )}
          </div>
          <Textarea id="concl" rows={5} value={conclusiones} onChange={(e) => setConclusiones(e.target.value)} disabled={!puedeEditar} maxLength={8000}
            placeholder="Qué exposiciones son prioritarias, en qué puestos y por qué (origen en la organización del trabajo)." />
        </div>

        {puedeEditar && prioritarios.length > 0 && (
          <div className="space-y-1.5 rounded-xl bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">Medidas que propone el método para lo prioritario (toca para agregar):</p>
            <div className="flex flex-wrap gap-1.5">
              {prioritarios.flatMap((d) => APARTADOS[d.apartado - 1].medidas.map((m) => ({ a: d.apartado, m }))).filter((x) => !medidas.some((y) => y.medida === x.m)).map((x) => (
                <button key={x.m} type="button" onClick={() => sugerirMedida(x.a, x.m)} className="rounded-lg border bg-background px-2.5 py-1 text-left text-xs hover:border-primary">
                  <span className="font-medium">{APARTADOS[x.a - 1].corto}:</span> {x.m}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="space-y-2">
          {medidas.map((m) => (
            <li key={m.id} className="grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-[10rem_1fr_10rem_7rem_auto] sm:items-start">
              <select aria-label="Apartado" className="h-9 rounded-md border bg-transparent px-2 text-sm" value={m.apartado} disabled={!puedeEditar}
                onChange={(e) => setMedidas(medidas.map((x) => (x.id === m.id ? { ...x, apartado: Number(e.target.value) } : x)))}>
                {APARTADOS.map((a) => <option key={a.n} value={a.n}>{a.corto}</option>)}
              </select>
              <Textarea aria-label="Medida" rows={2} className="min-h-9" value={m.medida} disabled={!puedeEditar} maxLength={1000}
                onChange={(e) => setMedidas(medidas.map((x) => (x.id === m.id ? { ...x, medida: e.target.value } : x)))} />
              <Input aria-label="Responsable" placeholder="Responsable" value={m.responsable} disabled={!puedeEditar} maxLength={160}
                onChange={(e) => setMedidas(medidas.map((x) => (x.id === m.id ? { ...x, responsable: e.target.value } : x)))} />
              <Input aria-label="Plazo" placeholder="Plazo" value={m.plazo} disabled={!puedeEditar} maxLength={60}
                onChange={(e) => setMedidas(medidas.map((x) => (x.id === m.id ? { ...x, plazo: e.target.value } : x)))} />
              {puedeEditar && <Button size="icon" variant="ghost" aria-label="Quitar medida" onClick={() => setMedidas(medidas.filter((x) => x.id !== m.id))}><Trash2 /></Button>}
            </li>
          ))}
        </ul>
        {puedeEditar && medidas.length < 60 && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setMedidas([...medidas, { id: crypto.randomUUID(), apartado: prioritarios[0]?.apartado ?? 1, medida: "", responsable: "", plazo: "" }])}>
            <Plus /> Medida
          </Button>
        )}
      </Paso>

      <p className="text-[11px] leading-snug text-muted-foreground">{METODO_PSICOSOCIAL.cita} {METODO_PSICOSOCIAL.licencia}</p>

      {/* Guardar siempre a la vista */}
      {puedeEditar && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 rounded-2xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur lg:bottom-4">
          <div className="flex items-center gap-3">
            {aviso ? (
              <p role={aviso.ok ? "status" : "alert"} className={cn("min-w-0 flex-1 truncate text-sm", aviso.ok ? "text-ok-texto" : "text-alerta-texto")}>{aviso.texto}</p>
            ) : (
              <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{cambiado ? "Hay cambios sin guardar." : cerrada ? "Cerrada: solo cambian conclusiones y medidas." : "Todo guardado."}</p>
            )}
            <Button onClick={guardar} disabled={ocupado || !cambiado}>{ocupado ? <Loader2 className="animate-spin" /> : <Save />} Guardar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Transcribir un cuestionario respondido en papel: una fila por pregunta con 5 botones (S, MV, AV, SA, N)
function PapelDialogo({ ev, grupos, demo, alListo }: { ev: EvaluacionPsicosocial; grupos: Grupo[]; demo: boolean; alListo: (t: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [grupo, setGrupo] = useState<string>("");
  const [r, setR] = useState<(number | null)[]>(() => Array(TOTAL_PREGUNTAS).fill(null));
  const [error, setError] = useState<string | null>(null);
  const [cargados, setCargados] = useState(0);
  const [ocupado, iniciar] = useTransition();
  const hechas = r.filter((x) => x !== null).length;
  const corta = (o: string) => (o.length <= 12 ? o : o.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 4));

  const cargar = () => iniciar(async () => {
    setError(null);
    if (demo) { setError("En modo demo no se guardan datos."); return; }
    if (grupos.length && !grupo) { setError("Elige el puesto o área que marcó."); return; }
    if (hechas < TOTAL_PREGUNTAS) { setError(`Faltan ${TOTAL_PREGUNTAS - hechas} preguntas.`); return; }
    const res = await cargarPapel(ev.id, grupo || null, r as number[]);
    if (!res.ok) { setError(res.mensaje); return; }
    setCargados((n) => n + 1);
    setR(Array(TOTAL_PREGUNTAS).fill(null));
    setGrupo("");
    alListo(`Cuestionario en papel cargado (${cargados + 1} en esta tanda).`);
  });

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild><Button variant="ghost" className="self-start"><ClipboardPen /> Cargar un cuestionario en papel</Button></DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cuestionario en papel</DialogTitle>
          <DialogDescription>Transcribe las respuestas tal cual. No se guarda quién lo cargó ni cuándo. Cuando termines, destruye o entrega el papel al Comité.</DialogDescription>
        </DialogHeader>
        {grupos.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Puesto o área">
            {grupos.map((g) => (
              <button key={g.id} type="button" role="radio" aria-checked={grupo === g.id} onClick={() => setGrupo(g.id)}
                className={cn("rounded-full border px-3 py-1 text-sm", grupo === g.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary")}>{g.nombre}</button>
            ))}
          </div>
        )}
        <div className="space-y-4">
          {APARTADOS.map((a) => (
            <div key={a.n}>
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{a.n}. {a.nombre}</div>
              <ul className="divide-y rounded-lg border">
                {a.preguntas.map((q) => (
                  <li key={q.n} className="grid grid-cols-1 gap-1.5 px-2 py-1.5 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span className="text-sm"><span className="mr-1 text-muted-foreground tabular-nums">{q.n}.</span>{q.texto}</span>
                    <div role="radiogroup" aria-label={`Pregunta ${q.n}`} className="flex gap-1">
                      {q.opciones.map((o, i) => (
                        <button key={i} type="button" role="radio" aria-checked={r[q.n - 1] === i} title={o}
                          onClick={() => setR((prev) => { const x = [...prev]; x[q.n - 1] = i; return x; })}
                          className={cn("h-8 min-w-10 rounded-md border px-1.5 text-xs", r[q.n - 1] === i ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary")}>
                          {corta(o)}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-3 border-t bg-background px-6 py-3">
          <span className="flex-1 text-sm text-muted-foreground">{error ? <span className="text-alerta-texto">{error}</span> : `${hechas} de ${TOTAL_PREGUNTAS}`}</span>
          <Button onClick={cargar} disabled={ocupado}>{ocupado ? <Loader2 className="animate-spin" /> : <Save />} Guardar y otro</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
