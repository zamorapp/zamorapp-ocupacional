"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, ChevronDown, ClipboardCheck, Copy, Link2, Loader2, MessageCircle, Share2, Trash2, Undo2, UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DIAS_ENLACE_PACIENTE, edad, estadoEnlace, TURNOS, type Coincidencia, type SolicitudPaciente } from "@/lib/solicitudes-paciente";
import { aceptarSolicitudPaciente, anularEnlacePaciente, crearEnlacePaciente, descartarSolicitudPaciente, deshacerDescarte, type EnlaceNuevo } from "./paciente-enlace-acciones";

type Opcion = { id: string; nombre: string };
const PARTICULAR = "particular";
const esParticular = (nombre: string) => /particular/i.test(nombre);
const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const telefonoVisible = (t: string) => (t.startsWith("58") && t.length === 12 ? `0${t.slice(2, 5)}-${t.slice(5)}` : `+${t}`);

// ─── Botón «Enlace al paciente»: arma el enlace y lo manda por WhatsApp (a un número o eligiendo el contacto) ───
export function EnlacePaciente({ habilitado, empresas }: { habilitado: boolean; empresas: Opcion[] }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [r, setR] = useState<EnlaceNuevo | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const lista = empresas.filter((e) => !esParticular(e.nombre));
  const puedeCompartir = typeof navigator !== "undefined" && "share" in navigator;

  const cerrar = (v: boolean) => { setAbierto(v); if (!v) { setR(null); setNombre(""); setTelefono(""); setEmpresa(""); setCopiado(false); } };
  const crear = () => iniciar(async () => setR(await crearEnlacePaciente({ nombre, telefono, empresaId: empresa || null })));
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
            <Button variant="ghost" className="w-full" onClick={() => { setR(null); setNombre(""); setTelefono(""); setCopiado(false); }}><Link2 /> Hacer otro enlace</Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); crear(); }}>
            <div>
              <Label htmlFor="ep-nombre" className="mb-1.5">Nombre del paciente</Label>
              <Input id="ep-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Opcional, para saludarlo" className="h-10" />
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
            {r && !r.ok && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{r.mensaje}</p>}
            <Button type="submit" className="w-full" disabled={ocupado}>{ocupado ? <Loader2 className="animate-spin" /> : <Link2 />} Crear enlace</Button>
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
          <p className="font-medium">{d.nombres} {d.apellidos} <span className="font-normal text-muted-foreground">· {d.cedula} · {edad(d.fecha_nacimiento, hoy)} años{d.sexo ? ` · ${d.sexo === "F" ? "F" : "M"}` : ""}</span></p>
          <p className="text-xs text-muted-foreground">
            {[telefonoVisible(d.telefono), d.correo, d.direccion].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            {d.tipo === "particular" ? "Viene por su cuenta" : `De una empresa${d.empresa ? `: ${d.empresa}` : ""}${d.cargo ? ` · ${d.cargo}` : ""}`}
            {(d.fecha || d.turno) && ` · Prefiere ${[d.fecha && fechaCorta(d.fecha), d.turno && TURNOS[d.turno].toLowerCase()].filter(Boolean).join(", ")}`}
          </p>
          {d.motivo && <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs">«{d.motivo}»</p>}
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
            {empresas.filter((e) => !esParticular(e.nombre)).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
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
      {msg && !msg.ok && <p role="alert" className="flex items-start gap-1 text-xs text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {msg.texto}</p>}
    </li>
  );
}

const ETIQUETA: Record<string, string> = { esperando: "Esperando", "por revisar": "Por revisar", aceptada: "Aceptado", descartada: "Descartado", vencido: "Vencido", anulado: "Anulado" };
const COLOR: Record<string, string> = {
  esperando: "bg-muted text-muted-foreground", "por revisar": "bg-aviso/20 text-aviso-texto", aceptada: "bg-ok/15 text-ok-texto",
  descartada: "bg-muted text-muted-foreground", vencido: "bg-muted text-muted-foreground", anulado: "bg-muted text-muted-foreground",
};

function Enviados({ enviados, ahora }: { enviados: SolicitudPaciente[]; ahora: number }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!enviados.length) return null;
  return (
    <div className="border-t px-5 py-2">
      <button type="button" onClick={() => setAbierto((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        Enlaces enviados ({enviados.length}) <ChevronDown className={cn("size-3 transition", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <ul className="mt-2 space-y-1.5 text-xs">
          {enviados.map((e) => {
            const estado = estadoEnlace(e, ahora);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 font-medium", COLOR[estado])}>{ETIQUETA[estado]}</span>
                <span>{e.datos ? `${e.datos.nombres} ${e.datos.apellidos}` : e.nombre ?? "Sin nombre"}{e.telefono && <span className="text-muted-foreground"> · {telefonoVisible(e.telefono)}</span>}</span>
                <span className="text-muted-foreground">· enviado {fechaCorta(e.creado)}</span>
                {estado === "esperando" && (
                  <button type="button" disabled={ocupado} onClick={() => iniciar(async () => { const r = await anularEnlacePaciente(e.id); setError(r.ok ? null : r.mensaje); })}
                    className="font-medium text-destructive hover:underline disabled:opacity-60">Anular</button>
                )}
              </li>
            );
          })}
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
        <span className="text-xs text-muted-foreground">· llenaron el enlace que les enviaste</span>
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
