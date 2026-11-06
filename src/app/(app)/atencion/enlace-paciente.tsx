"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Ban, Check, ChevronDown, ClipboardCheck, Copy, ExternalLink, Eye, FileDown, Link2, Loader2, MessageCircle, MessagesSquare, Share2, Stamp, Trash2, Undo2, UserCheck, UserPlus, X } from "lucide-react";
import { confirmar } from "@/components/app/confirmar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DIAS_ENLACE_PACIENTE, edad, ESTADO_CIVIL, estadoEnlace, LATERALIDAD, NIVEL_EDUCATIVO, TURNOS, type Coincidencia, type SolicitudPaciente } from "@/lib/solicitudes-paciente";
import { DIETAS } from "@/lib/dietas";
import { BOTONES_BIENESTAR } from "@/lib/bienestar";
import { DOCS_REGISTRO, type EleccionRegistro } from "@/lib/registro-documentos";
import { aceptarSolicitudPaciente, anularEnlacePaciente, crearEnlacePaciente, descartarSolicitudPaciente, deshacerDescarte, eliminarEnlacePaciente, quitarEnlacePaciente, volverEnlacePaciente, type EnlaceNuevo } from "./paciente-enlace-acciones";

type Opcion = { id: string; nombre: string };
const PARTICULAR = "particular";
const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const telefonoVisible = (t: string) => (t.startsWith("58") && t.length === 12 ? `0${t.slice(2, 5)}-${t.slice(5)}` : `+${t}`);

// ordenes: lo que sale del perfil, ya separado por clase de estudio (laboratorio, rayos X, eco…)
type Perfil = Opcion & { examenes: number; ordenes: { nombre: string; examenes: string[] }[] };
const SIN_DOCS = { orden: false, ta: false, dieta: false, bienestar: false };
const campo = "h-9 w-full rounded-md border bg-background px-2 text-sm";

// Una fila con casilla: el documento y, si está marcado, sus opciones debajo
function FilaDoc({ marcado, alCambiar, titulo, children }: { marcado: boolean; alCambiar: (v: boolean) => void; titulo: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 transition", marcado && "border-primary/60 bg-primary/5")}>
      <label className="flex min-h-7 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={marcado} onChange={(e) => alCambiar(e.target.checked)} className="size-4 accent-primary" /> {titulo}
      </label>
      {marcado && children && <div className="mt-2 grid gap-2 pl-6">{children}</div>}
    </div>
  );
}

// ─── Botón «Enlace al paciente»: arma el enlace y lo manda por WhatsApp (a un número o eligiendo el contacto) ───
export function EnlacePaciente({ habilitado, empresas, perfiles = [], motivos = [], puedeFirmar = false }: {
  habilitado: boolean; empresas: Opcion[]; perfiles?: Perfil[]; motivos?: Opcion[]; puedeFirmar?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [empresa, setEmpresa] = useState("");
  // Documentos que descarga al terminar su registro
  const [docs, setDocs] = useState(SIN_DOCS);
  const [perfil, setPerfil] = useState("");
  const [motivo, setMotivo] = useState("");
  const [diasTa, setDiasTa] = useState<7 | 14>(7);
  const [dieta, setDieta] = useState("general");
  // Temas de bienestar que van en la hoja (al menos uno)
  const [temas, setTemas] = useState<string[]>(["pausas"]);
  const [firma, setFirma] = useState(true);
  const [conversadas, setConversadas] = useState(false);
  const elegido = perfiles.find((p) => p.id === perfil);
  // Cada orden cuenta como un documento: el paciente ve una fila por cada una
  const marcados = Object.values(docs).filter(Boolean).length + (docs.orden && elegido ? Math.max(elegido.ordenes.length - 1, 0) : 0);
  const previa = () => {
    const q = new URLSearchParams({ nombre, ...(empresa ? { empresa } : {}),
      ...(docs.orden && perfil ? { perfil, ...(motivo ? { motivo } : {}) } : {}), ...(docs.ta ? { ta: String(diasTa) } : {}),
      ...(docs.dieta ? { dieta } : {}), ...(docs.bienestar ? { bienestar: "1", tema: temas.join(",") } : {}), ...(puedeFirmar && firma ? { firma: "1" } : {}), ...(conversadas ? { conversadas: "1" } : {}) });
    return `/imprimir/registro-previa?${q}`;
  };
  const marcar = (k: keyof typeof SIN_DOCS) => (v: boolean) => setDocs((d) => ({ ...d, [k]: v }));
  const [r, setR] = useState<EnlaceNuevo | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const lista = empresas;
  const puedeCompartir = typeof navigator !== "undefined" && "share" in navigator;

  const limpiar = () => { setR(null); setNombre(""); setTelefono(""); setCopiado(false); setDocs(SIN_DOCS); setPerfil(""); setMotivo(""); setTemas(["pausas"]); };
  const cerrar = (v: boolean) => { setAbierto(v); if (!v) { limpiar(); setEmpresa(""); } };
  const crear = () => {
    if (docs.orden && !perfil) return setR({ ok: false, mensaje: "Elige el perfil de exámenes de la orden." });
    const documentos: EleccionRegistro = {
      orden: docs.orden ? { perfilId: perfil, motivoId: motivo || null } : null,
      controlTa: docs.ta ? diasTa : null,
      dieta: docs.dieta ? dieta : null,
      bienestar: docs.bienestar,
      temas: docs.bienestar ? temas : [],
      firma: puedeFirmar && firma,
      conversadas,
    };
    iniciar(async () => setR(await crearEnlacePaciente({ nombre, telefono, empresaId: empresa || null, documentos })));
  };
  const copiar = async (texto: string) => { try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); } };

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!habilitado}><Link2 /> Enlace al paciente</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enlace para que el paciente pida su consulta</DialogTitle>
          <DialogDescription>El paciente llena sus datos desde su teléfono y te llega a «Por revisar». Nada entra a su ficha hasta que lo aceptes. Vale {DIAS_ENLACE_PACIENTE} días y sirve una sola vez.</DialogDescription>
        </DialogHeader>
        {r?.ok ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 rounded-md bg-ok/10 px-3 py-2 text-sm text-ok-texto"><Check className="size-4" /> Enlace listo. Envíalo ahora: por seguridad no se vuelve a mostrar.</p>
            <div className="grid gap-2">
              <Button asChild size="lg"><a href={r.whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> {telefono.trim() ? "Abrir WhatsApp" : "Elegir el contacto en WhatsApp"}</a></Button>
              {puedeCompartir && (
                <Button variant="outline" onClick={() => navigator.share({ text: r.texto }).catch(() => {})}><Share2 /> Compartir por otra app</Button>
              )}
              <Button variant="outline" onClick={() => copiar(r.texto)}>{copiado ? <ClipboardCheck /> : <Copy />} {copiado ? "Copiado" : "Copiar mensaje con el enlace"}</Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={limpiar}><Link2 /> Hacer otro enlace</Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); crear(); }}>
            <div>
              <Label htmlFor="ep-nombre" className="mb-1.5">Nombre del paciente (opcional)</Label>
              <Input id="ep-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Para saludarlo" className="h-10" />
            </div>
            <div>
              <Label htmlFor="ep-telefono" className="mb-1.5">Celular (opcional)</Label>
              <Input id="ep-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="0414-1234567" maxLength={20} className="h-10" />
              <p className="mt-1 text-xs text-muted-foreground">Vacío: WhatsApp te deja elegir el contacto.</p>
            </div>
            {lista.length > 0 && (
              <div>
                <Label htmlFor="ep-empresa" className="mb-1.5">Empresa (opcional)</Label>
                <select id="ep-empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
                  <option value="">Que lo diga el paciente</option>
                  {lista.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            )}
            <fieldset className="space-y-2">
              <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><FileDown className="size-4 text-primary" /> Al terminar, descarga (opcional)</legend>
              <p className="-mt-1 text-xs text-muted-foreground">Salen llenos con su nombre, cédula y empresa apenas envíe sus datos.</p>
              <FilaDoc marcado={docs.orden} alCambiar={marcar("orden")} titulo={DOCS_REGISTRO.orden.nombre}>
                {perfiles.length ? (
                  <>
                    <select value={perfil} onChange={(e) => setPerfil(e.target.value)} aria-label="Perfil de exámenes" className={cn(campo, !perfil && "border-aviso")}>
                      <option value="">Perfil de exámenes…</option>
                      {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.examenes})</option>)}
                    </select>
                    {elegido && (
                      <div className="space-y-1.5 rounded-md bg-background/70 p-2 text-xs" aria-live="polite">
                        <p className="font-medium">{elegido.ordenes.length === 1 ? "Sale 1 orden:" : `Salen ${elegido.ordenes.length} órdenes separadas:`}</p>
                        {elegido.ordenes.map((o) => (
                          <p key={o.nombre}><b>{o.nombre}</b> <span className="text-muted-foreground">({o.examenes.length}): {o.examenes.join(", ")}</span></p>
                        ))}
                      </div>
                    )}
                    {motivos.length > 0 && (
                      <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Tipo de examen" className={campo}>
                        <option value="">Tipo de examen (opcional)</option>
                        {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-aviso-texto">Primero arma un perfil en <Link href="/configuracion/listas?l=grupo_paraclinicos" className="font-medium underline">Perfiles de paraclínicos</Link>.</p>
                )}
              </FilaDoc>
              <FilaDoc marcado={docs.ta} alCambiar={marcar("ta")} titulo={DOCS_REGISTRO["control-ta"].nombre}>
                <div role="radiogroup" aria-label="Días de control" className="flex gap-2">
                  {([7, 14] as const).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={diasTa === n} onClick={() => setDiasTa(n)}
                      className={cn("h-8 rounded-full border px-3 text-xs", diasTa === n ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary")}>{n} días</button>
                  ))}
                </div>
              </FilaDoc>
              <FilaDoc marcado={docs.dieta} alCambiar={marcar("dieta")} titulo={DOCS_REGISTRO.dieta.nombre}>
                <select value={dieta} onChange={(e) => setDieta(e.target.value)} aria-label="Tipo de alimentación" className={campo}>
                  {DIETAS.map((x) => <option key={x.clave} value={x.clave}>{x.boton}</option>)}
                </select>
              </FilaDoc>
              <FilaDoc marcado={docs.bienestar} alCambiar={marcar("bienestar")} titulo={DOCS_REGISTRO.bienestar.nombre}>
                <div role="group" aria-label="Temas de bienestar" className="flex flex-wrap gap-1.5">
                  {BOTONES_BIENESTAR.map((t) => {
                    const activo = temas.includes(t.clave);
                    const unico = activo && temas.length === 1;
                    return (
                      <button key={t.clave} type="button" aria-pressed={activo} disabled={unico || (!activo && temas.length >= 12)} title={unico ? "Debe quedar al menos un tema" : undefined}
                        onClick={() => setTemas((x) => (activo ? x.filter((k) => k !== t.clave) : [...x, t.clave]))}
                        className={cn("inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs", activo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary", unico && "cursor-default")}>
                        {activo && <Check className="size-3" />} {t.boton}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Salen con tu versión de cada hoja. <Link href="/atencion/hojas" className="font-medium text-primary underline">Leerlas o editarlas</Link></p>
              </FilaDoc>
              {marcados > 0 && puedeFirmar && (
                <label className="flex items-start gap-2 px-1 pt-1 text-sm">
                  <input type="checkbox" checked={firma} onChange={(e) => setFirma(e.target.checked)} className="size-4 accent-primary" />
                  <Stamp className="size-4 shrink-0 text-muted-foreground" /> <span>Firmados a mi nombre <span className="block text-xs text-muted-foreground">Salen con tu nombre, MPPS y «Firmado digitalmente», antes de ver al paciente</span></span>
                </label>
              )}
              {marcados > 0 && !puedeFirmar && <p className="px-1 text-xs text-muted-foreground">Salen sin firma: solo un médico los envía firmados.</p>}
              {marcados > 0 && (
                <label className="flex items-start gap-2 px-1 pt-1 text-sm">
                  <input type="checkbox" checked={conversadas} onChange={(e) => setConversadas(e.target.checked)} className="size-4 accent-primary" />
                  <MessagesSquare className="size-4 shrink-0 text-muted-foreground" /> <span>Ya lo atendí en consulta <span className="block text-xs text-muted-foreground">Leerá «Aquí tienes las indicaciones que conversaste en consulta con…»</span></span>
                </label>
              )}
            </fieldset>
            {r && !r.ok && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{r.mensaje}</p>}
            {marcados > 0 && (
              <Button variant="outline" className="w-full" asChild>
                <a href={previa()} target="_blank" rel="noreferrer"><Eye /> Ver cómo lo verá el paciente <ExternalLink className="size-3.5" aria-hidden /></a>
              </Button>
            )}
            <Button type="submit" className="w-full" disabled={ocupado}>{ocupado ? <Loader2 className="animate-spin" /> : <Link2 />} {marcados ? `Crear enlace con ${marcados} documento${marcados > 1 ? "s" : ""}` : "Crear enlace"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Una solicitud llenada: revisar, elegir empresa y día, aceptar o descartar ───
function Revisar({ s, previo, empresas, motivos, hoy, alDescartar }: {
  s: SolicitudPaciente; previo?: Coincidencia; empresas: Opcion[]; motivos: Opcion[]; hoy: string; alDescartar: (s: SolicitudPaciente) => void;
}) {
  const d = s.datos!;
  const sugerida = useMemo(() => {
    if (d.tipo === "particular") return PARTICULAR;
    const texto = (d.empresa ?? s.empresaSugerida ?? "").toLowerCase().trim();
    return (texto && empresas.find((e) => e.nombre.toLowerCase().includes(texto) || texto.includes(e.nombre.toLowerCase()))?.id) || "";
  }, [d, s.empresaSugerida, empresas]);
  const [empresa, setEmpresa] = useState(sugerida);
  const [motivo, setMotivo] = useState(d.motivo_id && motivos.some((m) => m.id === d.motivo_id) ? d.motivo_id : "");
  const [fecha, setFecha] = useState(d.fecha && d.fecha >= hoy ? d.fecha : hoy);
  const [hora, setHora] = useState("");
  const [actualizar, setActualizar] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string; ficha?: string } | null>(null);
  const contactoNuevo = previo && [
    telefonoVisible(d.telefono) !== previo.telefono && `teléfono ${telefonoVisible(d.telefono)}`,
    d.correo && d.correo !== previo.correo && `correo ${d.correo}`,
    d.direccion && d.direccion !== previo.direccion && "dirección",
  ].filter(Boolean);

  const aceptar = () => iniciar(async () => {
    const r = await aceptarSolicitudPaciente({ id: s.id, empresa, motivoId: motivo || null, fecha, hora: hora || null, actualizarContacto: actualizar });
    setMsg({ ok: r.ok, texto: r.mensaje ?? "", ficha: "trabajadorId" in r ? r.trabajadorId : undefined });
  });

  if (msg?.ok) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
        <UserCheck className="size-4 text-ok" /> <span><b>{d.nombres} {d.apellidos}</b>: {msg.texto}</span>
        {msg.ficha && <Link href={`/pacientes/${msg.ficha}`} className="font-medium text-primary hover:underline">Abrir ficha</Link>}
      </li>
    );
  }

  return (
    <li className="space-y-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-48 flex-1">
          <p className="font-medium">{d.nombres} {d.apellidos} <span className="font-normal text-muted-foreground">· <span className="whitespace-nowrap">{d.cedula}</span> · <span className="whitespace-nowrap">{edad(d.fecha_nacimiento, hoy)} años{d.sexo ? ` · ${d.sexo}` : ""}</span></span></p>
          <p className="text-xs text-muted-foreground">
            {[telefonoVisible(d.telefono), d.correo, d.direccion].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {d.tipo === "particular" ? "Viene por su cuenta" : `De una empresa${d.empresa ? `: ${d.empresa}` : ""}${d.cargo ? ` · ${d.cargo}` : ""}`}
            {(d.fecha || d.turno) && ` · Prefiere ${[d.fecha && fechaCorta(d.fecha), d.turno && TURNOS[d.turno].toLowerCase()].filter(Boolean).join(", ")}`}
          </p>
          {d.motivo && <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs">«{d.motivo}»</p>}
          {(d.estado_civil || d.nivel_educativo || d.lateralidad || d.profesion || d.lugar_nacimiento) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[d.estado_civil && ESTADO_CIVIL[d.estado_civil], d.lugar_nacimiento && `nació en ${d.lugar_nacimiento}`, d.nivel_educativo && NIVEL_EDUCATIVO[d.nivel_educativo],
                d.profesion, d.lateralidad && `mano ${LATERALIDAD[d.lateralidad].toLowerCase()}`, d.fecha_ingreso && `ingresó ${fechaCorta(d.fecha_ingreso)}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {((d.antecedentes?.length ?? 0) > 0 || (d.habitos?.length ?? 0) > 0) && (
            <details className="mt-1 rounded-md border bg-background px-2 py-1 text-xs">
              <summary className="cursor-pointer font-medium">Salud que marcó: {d.antecedentes?.length ?? 0} antecedentes, {d.habitos?.length ?? 0} hábitos · pasan a su consulta</summary>
              <ul className="mt-1 space-y-0.5">
                {d.antecedentes?.map((a) => <li key={a.id}>{a.grupo === "familiar" ? "Familiar: " : ""}<b>{a.nombre}</b>{a.observacion && ` · ${a.observacion}`}</li>)}
                {d.habitos?.map((h) => <li key={h.clave}>{h.nombre}: {h.valor}</li>)}
              </ul>
            </details>
          )}
        </div>
        <span className="text-xs text-muted-foreground">Llegó {fechaCorta(s.recibido!)}</span>
      </div>

      {previo ? (
        <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <p className="flex flex-wrap items-center gap-1"><UserCheck className="size-3.5 text-primary" /> Ya tiene ficha: <b>{previo.nombre}</b> · {previo.empresa}
            {previo.estado !== "activo" && <span className="text-aviso-texto">({previo.estado}: si vuelve a trabajar, reingrésalo desde su ficha)</span>}
            <Link href={`/pacientes/${previo.id}`} className="ml-1 font-medium text-primary hover:underline">Abrir</Link></p>
          <p className="text-muted-foreground">La cita se agenda en su ficha; no se crea otra.</p>
          {contactoNuevo && contactoNuevo.length > 0 && (
            <label className="flex items-center gap-2"><input type="checkbox" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} className="accent-primary" />
              Actualizar en la ficha: {contactoNuevo.join(", ")}</label>
          )}
        </div>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:max-w-sm">
          <span className="flex items-center gap-1"><UserPlus className="size-3.5" /> Paciente nuevo: ¿en qué empresa lo registro?</span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} aria-label="Empresa del paciente nuevo" className={cn("h-9 rounded-md border bg-background px-2 text-sm text-foreground", !empresa && "border-aviso")}>
            <option value="">Elige…</option>
            <option value={PARTICULAR}>Particular (sin empresa)</option>
            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Motivo
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-9 w-48 rounded-md border bg-background px-2 text-sm text-foreground">
            <option value="">Sin motivo</option>
            {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Día<Input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className="h-9 w-40" /></label>
        <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">Hora<Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-9 w-32" /></label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" disabled={ocupado || (!previo && !empresa)} onClick={aceptar}>{ocupado ? <Loader2 className="animate-spin" /> : <Check />} Aceptar y agendar</Button>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => iniciar(async () => { const r = await descartarSolicitudPaciente(s.id); if (r.ok) alDescartar(s); else setMsg({ ok: false, texto: r.mensaje }); })}>
            <Trash2 /> Descartar
          </Button>
        </div>
      </div>
      {!hora && <p className="flex items-center gap-1 text-xs text-aviso-texto"><AlertTriangle className="size-3.5 shrink-0" /> Sin hora: la cita queda para el día, sin hora fija.</p>}
      {msg && !msg.ok && <p role="alert" className="flex items-start gap-1 text-xs text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {msg.texto}</p>}
    </li>
  );
}

// Los que ya terminaron se pueden quitar de la lista (los vencidos o anulados sin llenar se borran solos a los 30 días)
const TERMINADO = new Set(["vencido", "anulado", "descartada", "aceptada"]);
// Un enlace aceptado sirve 30 días desde que lo llenó (subir resultados); pasado eso ya no hay nada que anular
const vencidoResultados = (e: SolicitudPaciente, ahora: number) => !e.recibido || Date.parse(e.recibido) + 30 * 86_400_000 < ahora;
const ETIQUETA: Record<string, string> = { esperando: "Esperando", "por revisar": "Por revisar", aceptada: "Aceptado", descartada: "Descartado", vencido: "Vencido", anulado: "Anulado" };
const COLOR: Record<string, string> = {
  esperando: "bg-muted text-muted-foreground", "por revisar": "bg-aviso/20 text-aviso-texto", aceptada: "bg-ok/15 text-ok-texto",
  descartada: "bg-muted text-muted-foreground", vencido: "bg-muted text-muted-foreground", anulado: "bg-muted text-muted-foreground",
};

function Enviados({ enviados, ahora }: { enviados: SolicitudPaciente[]; ahora: number }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [quitados, setQuitados] = useState<SolicitudPaciente[]>([]);
  const [ocultarDeshacer, setOcultarDeshacer] = useState<string[]>([]);
  const lista = enviados.filter((e) => !quitados.some((q) => q.id === e.id));
  if (!enviados.length) return null;
  const quitar = (e: SolicitudPaciente) => iniciar(async () => {
    const r = await quitarEnlacePaciente(e.id);
    if (r.ok) {
      setQuitados((v) => [...v, e]);
      setError(null);
      // El Deshacer se va solo a los 10 s; el enlace sigue fuera de la lista
      setTimeout(() => setOcultarDeshacer((v) => [...v, e.id]), 10_000);
    } else setError(r.mensaje);
  });
  const nombreDe = (e: SolicitudPaciente) => e.datos ? `${e.datos.nombres} ${e.datos.apellidos}` : e.nombre ?? "sin nombre";
  // Anular: el enlace deja de servir al instante (llenar, descargar y subir resultados); lo ya recibido se queda
  const anular = async (e: SolicitudPaciente, aceptado: boolean) => {
    const si = await confirmar({
      titulo: `¿Anular el enlace de ${nombreDe(e)}?`,
      texto: aceptado
        ? "Desde ya no podrá descargar sus documentos ni enviar resultados. Lo que ya está en su ficha no cambia."
        : "Desde ya no podrá llenar sus datos con ese enlace. Si lo necesita, envíale uno nuevo.",
      accion: "Anular enlace",
      peligro: true,
    });
    if (si) iniciar(async () => { const r = await anularEnlacePaciente(e.id); setError(r.ok ? null : r.mensaje); });
  };
  // Eliminar: borra el enlace y lo que el paciente escribió en él. Ficha, cita y resultados subidos se quedan
  const eliminar = async (e: SolicitudPaciente, estado: string) => {
    const si = await confirmar({
      titulo: `¿Eliminar el enlace de ${nombreDe(e)}?`,
      texto: (estado === "por revisar"
        ? "Se borran los datos que el paciente envió y todavía no revisaste. "
        : estado === "esperando" ? "El enlace deja de servir y se borra. " : "Se borra el enlace. ")
        + (estado === "aceptada" ? "Su ficha, su cita y los resultados que subió se quedan en su historia. " : "")
        + "No se puede deshacer.",
      accion: "Eliminar",
      peligro: true,
      ...(TERMINADO.has(estado) ? { alternativa: { texto: "Solo quitar de la lista", alElegir: () => quitar(e) } } : {}),
    });
    if (si) iniciar(async () => {
      const r = await eliminarEnlacePaciente(e.id);
      if (r.ok) { setQuitados((v) => [...v, e]); setOcultarDeshacer((v) => [...v, e.id]); setError(null); } else setError(r.mensaje);
    });
  };
  const volver = (e: SolicitudPaciente) => iniciar(async () => {
    const r = await volverEnlacePaciente(e.id);
    if (r.ok) { setQuitados((v) => v.filter((q) => q.id !== e.id)); setOcultarDeshacer((v) => v.filter((id) => id !== e.id)); } else setError(r.mensaje);
  });
  return (
    <div className="border-t px-5 py-2">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        Enlaces enviados ({lista.length}) <ChevronDown className={cn("size-3 transition", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <ul className="mt-2 space-y-1.5 text-xs">
          {lista.map((e) => {
            const estado = estadoEnlace(e, ahora);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 font-medium", COLOR[estado])}>{ETIQUETA[estado]}</span>
                <span>{e.datos ? `${e.datos.nombres} ${e.datos.apellidos}` : e.nombre ?? "Sin nombre"}{e.telefono && <span className="text-muted-foreground"> · {telefonoVisible(e.telefono)}</span>}</span>
                <span className="text-muted-foreground">· enviado {fechaCorta(e.creado)}</span>
                {(estado === "esperando" || (estado === "aceptada" && !vencidoResultados(e, ahora))) && (
                  <button type="button" disabled={ocupado} onClick={() => anular(e, estado === "aceptada")}
                    title={estado === "aceptada" ? "Ya no podrá descargar ni enviar resultados con este enlace" : "El enlace deja de servir"}
                    className="inline-flex items-center gap-1 font-medium text-destructive hover:underline disabled:opacity-60"><Ban className="size-3" /> Anular</button>
                )}
                {TERMINADO.has(estado) && (
                  <button type="button" disabled={ocupado} onClick={() => quitar(e)} title="Lo saca de esta lista. Se puede deshacer."
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60">
                    <X className="size-3" /> Quitar de la lista
                  </button>
                )}
                <button type="button" disabled={ocupado} onClick={() => eliminar(e, estado)} title="Borra el enlace. Su ficha y sus resultados se quedan."
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive hover:underline disabled:opacity-60">
                  <Trash2 className="size-3" /> Eliminar
                </button>
              </li>
            );
          })}
          {quitados.filter((e) => !ocultarDeshacer.includes(e.id)).map((e) => (
            <li key={`q-${e.id}`} className="flex items-center gap-2 text-muted-foreground">
              Quitaste el enlace de {e.datos ? `${e.datos.nombres} ${e.datos.apellidos}` : e.nombre ?? "sin nombre"}.
              <button type="button" disabled={ocupado} onClick={() => volver(e)} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                <Undo2 className="size-3" /> Deshacer
              </button>
            </li>
          ))}
          {error && <li className="text-destructive">{error}</li>}
        </ul>
      )}
    </div>
  );
}

// ─── Bandeja «Por revisar» (sale solo si hay algo) ───
export function PorRevisar({ porRevisar, enviados, coincidencias, empresas, motivos, hoy, ahora }: {
  porRevisar: SolicitudPaciente[]; enviados: SolicitudPaciente[]; coincidencias: Record<string, Coincidencia>; empresas: Opcion[]; motivos: Opcion[]; hoy: string; ahora: number;
}) {
  const [descartados, setDescartados] = useState<SolicitudPaciente[]>([]);
  const [, iniciar] = useTransition();
  const visibles = porRevisar.filter((s) => s.datos && !descartados.some((x) => x.id === s.id));
  if (!visibles.length && !descartados.length && !enviados.length) return null;
  return (
    <Card id="por-revisar" className={cn("scroll-mt-20 gap-0 py-0", visibles.length > 0 && "border-primary/50")}>
      <CardHeader className={cn("flex flex-row flex-wrap items-center gap-2 py-3", visibles.length > 0 && "border-b bg-primary/5")}>
        <UserPlus className="size-5 text-primary" />
        <CardTitle className="text-base">{visibles.length ? `Pacientes por revisar (${visibles.length})` : "Pacientes por enlace"}</CardTitle>
        <span className="text-xs text-muted-foreground"><span className="hidden sm:inline">· </span>llenaron el enlace que les enviaste</span>
      </CardHeader>
      <CardContent className="px-0">
        {visibles.length > 0 && (
          <ul className="divide-y">
            {visibles.map((s) => <Revisar key={s.id} s={s} previo={coincidencias[s.id]} empresas={empresas} motivos={motivos} hoy={hoy} alDescartar={(x) => setDescartados((v) => [...v, x])} />)}
          </ul>
        )}
        {descartados.map((s) => (
          <p key={s.id} className="flex items-center gap-2 border-t px-5 py-2 text-xs text-muted-foreground">
            Descartaste a {s.datos?.nombres} {s.datos?.apellidos}.
            <button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              onClick={() => iniciar(async () => { const r = await deshacerDescarte(s.id); if (r.ok) setDescartados((v) => v.filter((x) => x.id !== s.id)); })}>
              <Undo2 className="size-3" /> Deshacer
            </button>
          </p>
        ))}
        <Enviados enviados={enviados} ahora={ahora} />
      </CardContent>
    </Card>
  );
}
