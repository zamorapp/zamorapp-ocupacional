"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, ClipboardPen, Copy, FileText, Handshake, KeyRound, Lightbulb, Link2, Loader2, Lock, LockOpen, MessageCircle, Plus, Printer, RefreshCw, Save, Trash2, Users, X,
} from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  APARTADOS, METODO_PSICOSOCIAL, NIVELES, TOTAL_PREGUNTAS, codigoLegible, conclusionSugerida, idGrupo, nivelMedia, ordenarPorRojo, porcentaje, prioridadDimension,
  riesgoGlobal, type Dimension, type Medida, type Nivel, type Resultados,
} from "@/lib/psicosocial";
import type { EvaluacionPsicosocial, Grupo } from "@/lib/psicosocial-datos";
import { cn } from "@/lib/utils";
import { borrarPsicosocial, cambiarEstadoPsicosocial, cargarPapel, crearEnlaceOficina, generarCodigos, guardarPsicosocial } from "../acciones";

type Props = {
  ev: EvaluacionPsicosocial;
  resultados: Resultados | null;
  codigos: { libres: string[]; usados: number; enTelefonos: number };
  enlaceOficina: string | null;
  perfiles: number[][] | null;
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

export function PanelPsicosocial({ ev, resultados, codigos, enlaceOficina, perfiles, puestosEmpresa, urlPublica, demo, puedeEditar, puedeReabrir }: Props) {
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
  const [token, setToken] = useState(enlaceOficina);
  const enlaceTodos = token ? `${urlPublica}/c/o/${token}` : null;
  const textoGrupo = (u: string) =>
    `Hola, equipo. ${ev.empresa} y el Comité de Seguridad y Salud Laboral están evaluando las condiciones de trabajo. Les pedimos responder una encuesta ANÓNIMA desde su teléfono (unos 8 minutos, una pregunta por pantalla): no pide nombre ni cédula. Cada quien la responde UNA vez: ${u}`;
  const pedirEnlace = (nuevo: boolean) => iniciar(async () => {
    if (demo) { setAviso({ ok: false, texto: "En modo demo no se guardan datos." }); return; }
    const r = await crearEnlaceOficina(ev.id, nuevo);
    setAviso({ ok: r.ok, texto: r.mensaje });
    if (r.ok && r.token) setToken(r.token);
  });
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
                texto: `${participacion >= ev.minimo ? "Al cerrar aparecen los resultados. " : `Todavía no hay ${ev.minimo} respuestas: el informe saldrá sin resultados. `}Después no se reabre si ya hay respuestas. Los códigos que falten dejan de servir y RR. HH. podrá ver el informe agregado. Puedes seguir editando conclusiones y medidas.`,
                accion: "Cerrar",
              }))) return;
              correr(() => cambiarEstadoPsicosocial(ev.id, "cerrada"));
            }}><Lock /> Cerrar y entregar</Button>
          )}
          {cerrada && puedeReabrir && participacion === 0 && <Button size="sm" variant="outline" disabled={ocupado} onClick={() => correr(() => cambiarEstadoPsicosocial(ev.id, "abierta"))}><LockOpen /> Reabrir</Button>}
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
          <div className="space-y-1.5">
            <Label htmlFor="ev-titulo">Nombre</Label>
            <Input id="ev-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!editable} maxLength={160} />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ac-fecha">Fecha del acuerdo</Label>
              <Input id="ac-fecha" type="date" className="max-w-[12rem]" value={acuerdoFecha} onChange={(e) => setAcuerdoFecha(e.target.value)} disabled={!editable} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ac-nota">Cómo consta</Label>
              <Input id="ac-nota" value={acuerdoNota} onChange={(e) => setAcuerdoNota(e.target.value)} disabled={!editable} maxLength={1000} placeholder="Ej. Acta n.º 14 del Comité SSL" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-[20rem]">
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
        <Paso n={2} titulo="Repartir: un enlace para todos o códigos" icono={<Link2 className="size-4 text-muted-foreground" />} listo={codigos.usados > 0}>
          {/* Enlace único de la oficina: lo más rápido para un equipo pequeño */}
          {!cerrada && (puedeEditar || token) && (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><Users className="size-5" /></span>
                <div className="min-w-0">
                  <p className="font-medium">Un solo enlace para toda la oficina</p>
                  <p className="text-xs text-muted-foreground">Mándalo al grupo de WhatsApp. Cada quien responde desde su teléfono, una pregunta por pantalla. Admite hasta {ev.trabajadores ?? "el número de"} trabajadores{ev.trabajadores ? "" : " que anotes en el paso 1"}; nadie entra con nombre ni cédula.</p>
                </div>
              </div>
              {enlaceTodos ? (
                <>
                  <p className="break-all rounded-lg bg-background px-3 py-2 font-cifra text-xs">{enlaceTodos}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(textoGrupo(enlaceTodos))}`, "_blank", "noopener")}><MessageCircle /> Enviar al grupo</Button>
                    <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(textoGrupo(enlaceTodos)).then(() => setAviso({ ok: true, texto: "Copiado el mensaje con el enlace de la oficina." }), () => {}); }}><Copy /> Copiar</Button>
                    {editable && (
                      <Button variant="ghost" disabled={ocupado} onClick={async () => {
                        if (!(await confirmar({ titulo: "¿Cambiar el enlace?", texto: "El enlace actual deja de servir para quien no haya empezado. Úsalo si se reenvió a personas de fuera.", accion: "Cambiar" }))) return;
                        pedirEnlace(true);
                      }}><RefreshCw /> Cambiar enlace</Button>
                    )}
                  </div>
                  {codigos.enTelefonos > 0 && <p className="text-xs text-muted-foreground">{codigos.enTelefonos} {codigos.enTelefonos === 1 ? "persona empezó y aún no envía" : "personas empezaron y aún no envían"}.</p>}
                </>
              ) : editable ? (
                <Button disabled={ocupado || !ev.acuerdoFecha || (!ev.trabajadores && codigos.libres.length === 0)} onClick={() => pedirEnlace(false)}
                  title={!ev.acuerdoFecha ? "Primero guarda la fecha del acuerdo con el Comité" : !ev.trabajadores ? "Anota y guarda cuántos trabajadores van a responder" : undefined}>
                  {ocupado ? <Loader2 className="animate-spin" /> : <Link2 />} Crear enlace para la oficina
                </Button>
              ) : null}
              {editable && !enlaceTodos && (!ev.acuerdoFecha || !ev.trabajadores) && (
                <p className="text-xs text-aviso-texto">Antes, guarda en el paso 1 {!ev.acuerdoFecha ? "la fecha del acuerdo" : ""}{!ev.acuerdoFecha && !ev.trabajadores ? " y " : ""}{!ev.trabajadores ? "cuántos trabajadores responden" : ""}.</p>
              )}
            </div>
          )}
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
            También puedes repartir códigos sueltos: papelitos al azar (por ejemplo, de una caja), así nadie sabe qué código tiene cada quien, o por WhatsApp un código distinto a cada trabajador (el siguiente se marca solo cuando lo usan).
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
            Van <strong className="text-foreground">{resultados.total}</strong> respuestas.{" "}
            {resultados.abierta
              ? `Los resultados aparecen al cerrar la evaluación (con ${resultados.minimo} respuestas o más): así nadie puede saber qué contestó la última persona que respondió.`
              : `Hacían falta ${resultados.minimo} para mostrar resultados sin que nadie pueda ser reconocido.`}
          </div>
        ) : (
          <div className="space-y-6">
            <ResumenOficina dimensiones={resultados.dimensiones ?? []} total={resultados.total} />
            <ul className="space-y-3">
              {(resultados.dimensiones ?? []).map((d) => {
                const a = APARTADOS[d.apartado - 1];
                const pr = prioridadDimension(d);
                return (
                  <li key={d.apartado} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,15rem)_1fr_6rem] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">{a.nombre}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        Promedio {String(d.media).replace(".", ",")} de {a.maximo}
                        <span className={cn("rounded-full px-1.5 py-px text-[11px] font-medium", NIVELES[nivelMedia(d.apartado, d.media)].clase)}>{NIVELES[nivelMedia(d.apartado, d.media)].nombre}</span>
                      </div>
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

            {(resultados.grupos ?? []).length === 0 && !!resultados.sin_grupo && (
              <p className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                Los puestos tienen pocas respuestas: para que nadie pueda ser reconocido (ni restando), los resultados salen solo para toda la empresa.
              </p>
            )}
            {(resultados.grupos ?? []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Por puesto o área · % en rojo</h3>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted text-xs text-muted-foreground">
                      <tr>
                        <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-medium shadow-[1px_0_0_var(--border),4px_0_8px_-4px_rgb(0_0_0/0.15)]">Grupo</th>
                        {APARTADOS.map((a) => <th key={a.n} className="px-1 py-2 text-center font-medium">{a.corto}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {resultados.grupos!.map((g) => (
                        <tr key={g.id}>
                          <td className="sticky left-0 z-10 max-w-[9rem] bg-card px-3 py-2 shadow-[1px_0_0_var(--border),4px_0_8px_-4px_rgb(0_0_0/0.15)] sm:max-w-none"><div className="font-medium break-words">{g.nombre}</div><div className="text-xs text-muted-foreground">{g.n} respuestas</div></td>
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
            {perfiles && perfiles.length > 0 && <Perfiles perfiles={perfiles} />}
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

// Riesgo de toda la oficina con el PROMEDIO de cada apartado (complementa el % de personas en rojo del método)
function ResumenOficina({ dimensiones, total }: { dimensiones: Dimension[]; total: number }) {
  if (dimensiones.length === 0) return null;
  const niveles = dimensiones.map((d) => nivelMedia(d.apartado, d.media));
  const g = riesgoGlobal(niveles);
  const cuenta = (n: Nivel) => niveles.filter((x) => x === n).length;
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border bg-gradient-to-br from-card to-muted/40 p-4 shadow-sm sm:grid-cols-[auto_1fr] sm:items-center">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-14 place-items-center rounded-2xl text-lg font-bold shadow-inner", NIVELES[g.nivel].barra, g.nivel === 1 ? "text-[#3d2c00]" : "text-white")}>{g.texto.slice(0, 1)}</span>
        <div>
          <p className="text-xs text-muted-foreground">Riesgo psicosocial de la oficina · {total} respuestas</p>
          <p className="text-xl font-semibold">{g.texto}</p>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Por promedio: ${cuenta(2)} apartados en rojo, ${cuenta(1)} en amarillo, ${cuenta(0)} en verde`}>
          {[2, 1, 0].map((n) => cuenta(n as Nivel) > 0 && <div key={n} className={NIVELES[n].barra} style={{ width: `${(cuenta(n as Nivel) * 100) / niveles.length}%` }} />)}
        </div>
        <p className="text-xs text-muted-foreground">
          Por el promedio de la oficina: <strong className="text-alerta-texto">{cuenta(2)} en rojo</strong> · <strong className="text-aviso-texto">{cuenta(1)} en amarillo</strong> · <strong className="text-ok-texto">{cuenta(0)} en verde</strong> de 6 apartados.
          {" "}Criterio del servicio: Alto = 2 o más en rojo; Moderado = 1 en rojo o 3 en amarillo. Las prioridades se fijan con el % de personas en rojo, como pide el método.
        </p>
      </div>
    </div>
  );
}

// Cada persona, sin nombre, sin puesto y sin orden de llegada (ordenadas de más a menos rojo). Solo el servicio.
function Perfiles({ perfiles }: { perfiles: number[][] }) {
  const conRojo = perfiles.filter((p) => p.filter((x) => x === 2).length >= 3).length;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Cada persona (anónima)</h3>
      <p className="text-xs text-muted-foreground">
        Una fila por cuestionario, sin nombre, sin puesto y ordenadas de más a menos rojo (no por quién respondió primero). Solo la ve el servicio médico; RR. HH. no.
        {conRojo > 0 && <> <strong className="text-alerta-texto">{conRojo} {conRojo === 1 ? "persona tiene" : "personas tienen"} 3 o más apartados en rojo</strong>: conviene ofrecer a todo el equipo consulta voluntaria y confidencial.</>}
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[520px] text-xs">
          <thead className="bg-muted text-muted-foreground">
            <tr><th className="px-2 py-1.5 text-left font-medium">#</th>{APARTADOS.map((a) => <th key={a.n} className="px-1 py-1.5 text-center font-medium">{a.corto}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {perfiles.map((p, i) => (
              <tr key={i}>
                <td className="px-2 py-1 font-cifra text-muted-foreground">{i + 1}</td>
                {p.map((n, j) => (
                  <td key={j} className="px-1 py-1">
                    <span className={cn("block rounded-md py-1 text-center text-[11px] font-semibold", NIVELES[n].clase)}>{NIVELES[n].nombre}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
