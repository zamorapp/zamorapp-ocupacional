"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRightLeft, CalendarPlus, Check, ClipboardCheck, Copy, Link2, Loader2, MessageCircle, Smartphone, Undo2, UserMinus, UserPlus, XCircle } from "lucide-react";
import { Campo } from "@/components/app/campo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { confirmar } from "@/components/app/confirmar";
import { RequiereInternet, useSinInternet } from "@/components/app/sin-internet";
import { Button } from "@/components/ui/button";
import { dma, venceTexto, type RevisionDepuracion } from "@/lib/depurar-nomina";
import { hoyCaracas } from "@/lib/fecha";
import { enlaceWhatsApp } from "@/lib/mensajes";
import { cn } from "@/lib/utils";
import { anularEnlaceDepuracion, citarEgreso, confirmarDepuracion, crearEnlaceDepuracion, deshacerDepuracion, liberarEnlaceDepuracion } from "./depurar-nomina-acciones";

type Contacto = { nombre: string; telefono: string };

// 04141234567 → 0414-1234567 mientras se escribe (con +58 o más dígitos se deja como está)
const formatoTelefono = (v: string) => {
  const d = v.replace(/\D/g, "");
  return /^0\d{0,10}$/.test(d) && !v.trim().startsWith("+") ? (d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d) : v;
};

// Botón de la cabecera de la ficha, al lado de «Invitar a RR. HH.» (Cesar, 12-nov): nombre y teléfono de quien recibe
// (el teléfono es la llave del enlace) → «Crear enlace» → WhatsApp con el mensaje listo.
// `abrir`: llega desde el botón de la tarjeta en Empresas (?depurar=1) y abre el cuadro de una vez.
export function BotonDepurarNomina({ empresaId, empresa, enNomina, revision, contactos, abrir = false }: {
  empresaId: string; empresa: string; enNomina: number; revision: RevisionDepuracion | null; contactos: Contacto[]; abrir?: boolean;
}) {
  const [abierto, setAbierto] = useState(abrir);
  const [clave, setClave] = useState(0);
  return (
    <Dialog open={abierto} onOpenChange={(v) => {
      setAbierto(v);
      if (!v) setClave((k) => k + 1);
      // Al cerrar, quita ?depurar=1 para que recargar la ficha no lo vuelva a abrir
      if (!v && abrir) window.history.replaceState(null, "", window.location.pathname);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline"><ClipboardCheck /> Depurar nómina con RR. HH.</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Depurar nómina con RR. HH.</DialogTitle>
          <DialogDescription>
            Le llega un enlace con los {enNomina} trabajadores registrados de {empresa}: marca quién ya no está y agrega a quien falta. No necesita cuenta. Nada cambia hasta que tú confirmes.
          </DialogDescription>
        </DialogHeader>
        <FormEnlace key={clave} empresaId={empresaId} empresa={empresa} revision={revision} contactos={contactos} />
      </DialogContent>
    </Dialog>
  );
}

function FormEnlace({ empresaId, empresa, revision, contactos }: { empresaId: string; empresa: string; revision: RevisionDepuracion | null; contactos: Contacto[] }) {
  const router = useRouter();
  const sinInternet = useSinInternet();
  const vigente = revision?.estado === "vigente" ? revision : null;
  const [otraPersona, setOtraPersona] = useState(!vigente);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState<{ url: string; mensaje: string; telefono: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const crear = (nuevo: boolean) => iniciar(async () => {
    setError("");
    const x = await crearEnlaceDepuracion(empresaId, empresa, nuevo ? nombre : vigente?.rrhh_nombre ?? "", nuevo ? telefono : "", nuevo);
    if (!x.ok || !x.enlace) { setError(x.mensaje); return; }
    setListo({ url: x.enlace, mensaje: x.mensaje_wa!, telefono: nuevo ? telefono : "" });
    router.refresh();
  });

  if (listo) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 rounded-md bg-ok/10 px-3 py-2 text-sm font-medium text-ok-texto"><Check className="size-4" /> Enlace listo. Vale 7 días.</p>
        <Button asChild size="lg" className="w-full">
          <a href={enlaceWhatsApp(listo.telefono || null, listo.mensaje)} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp y enviar</a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Al abrirlo, RR. HH. escribe su teléfono y el enlace queda solo en ese teléfono: si lo reenvía, no abre. Lo que marque lo ves en esta misma ficha.
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={async () => { await navigator.clipboard.writeText(listo.url); setCopiado(true); }}>
          {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar enlace"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sinInternet && <RequiereInternet texto="El enlace vive en la nube para que RR. HH. lo abra desde su teléfono. Conéctate para crearlo." />}
      {vigente && !otraPersona ? (
        <>
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            Ya hay un enlace activo para <b>{vigente.rrhh_nombre || "RR. HH."}</b> (teléfono terminado en {vigente.telefono_fin}), hasta el {venceTexto(vigente.vence)}.
          </p>
          {error && <p className="text-sm text-alerta-texto" role="alert">{error}</p>}
          <Button size="lg" className="w-full" onClick={() => crear(false)} disabled={pendiente || sinInternet}>
            {pendiente ? <Loader2 className="animate-spin" /> : <MessageCircle />} Enviarlo de nuevo
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setOtraPersona(true)}>Mandarlo a otra persona</Button>
        </>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); crear(true); }}>
          {vigente && <p className="text-xs text-muted-foreground">El enlace anterior deja de servir; lo que ya marcaron se conserva.</p>}
          {contactos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Toca un contacto o escribe los datos:</p>
              <div className="flex flex-wrap gap-1.5">
                {contactos.map((c) => (
                  <button key={c.telefono} type="button" onClick={() => { setNombre(c.nombre); setTelefono(formatoTelefono(c.telefono)); }} aria-pressed={telefono === formatoTelefono(c.telefono)}
                    className="min-h-9 rounded-full border px-2.5 text-xs hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10">
                    {c.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Campo id="dep-nombre" etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Quién recibe" maxLength={120} autoComplete="off" />
          <Campo id="dep-telefono" etiqueta="WhatsApp (es la llave del enlace)" type="tel" value={telefono} onChange={(e) => setTelefono(formatoTelefono(e.target.value))} placeholder="0414-1234567" inputMode="tel" autoComplete="off" />
          {error && <p className="text-sm text-alerta-texto" role="alert">{error}</p>}
          {telefono.replace(/\D/g, "").length > 0 && telefono.replace(/\D/g, "").length < 10 && (
            <p className="text-xs text-muted-foreground">Escribe el número completo (11 dígitos, como 0414-1234567).</p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pendiente || sinInternet || telefono.replace(/\D/g, "").length < 10}>
            {pendiente ? <><Loader2 className="animate-spin" /> Creando…</> : <><Link2 /> Crear enlace</>}
          </Button>
        </form>
      )}
    </div>
  );
}

// Ficha de la empresa › «Revisión de nómina con RR. HH.» (Cesar, 12-nov-2026). Cesar manda el enlace por WhatsApp;
// RR. HH. marca quién ya no está y quién falta; aquí Cesar ve si cada uno tiene la evaluación de egreso y confirma con
// un clic (queda «Deshacer» ese día).
export function DepurarNomina({ empresaId, revision }: { empresaId: string; revision: RevisionDepuracion }) {
  const router = useRouter();
  const sinInternet = useSinInternet();
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [hecho, setHecho] = useState<{ lote: string; texto: string } | null>(null);
  const r = revision;
  const vigente = r.estado === "vigente";
  // Por defecto: todos los que siguen en la nómina y todos los agregados con cédula que no estaban registrados
  const [quitar, setQuitar] = useState<Set<string>>(() => new Set(r.no_estan.filter((n) => n.en_nomina).map((n) => n.id)));
  const [sumar, setSumar] = useState<Set<string>>(() => new Set(r.agregados.filter((a) => a.cedula && !a.registrado).map((a) => a.id)));
  const conRespuestas = Boolean(r.no_estan.length || r.agregados.length || r.siguen);
  const pendientesRevision = vigente || (r.estado === "vencido" && conRespuestas);
  const confirmadoHoy = r.estado === "aplicado" && r.lote_id && r.aplicado_en && hoyCaracas(r.aplicado_en) === hoyCaracas();

  const liberar = () => iniciar(async () => {
    if (!(await confirmar({ titulo: "¿Permitir otro teléfono?", texto: "RR. HH. podrá abrir el enlace en otro teléfono escribiendo su número. El teléfono anterior deja de funcionar.", accion: "Permitir" }))) return;
    const x = await liberarEnlaceDepuracion(empresaId, r.id);
    setAviso({ ok: x.ok, texto: x.mensaje });
    router.refresh();
  });

  const anular = () => iniciar(async () => {
    if (!(await confirmar({ titulo: "¿Anular el enlace?", texto: "RR. HH. ya no podrá abrirlo. Lo que marcó se queda aquí para revisarlo.", accion: "Anular", peligro: true }))) return;
    const x = await anularEnlaceDepuracion(empresaId, r.id);
    setAviso({ ok: x.ok, texto: x.mensaje });
    router.refresh();
  });

  const confirmarTodo = () => iniciar(async () => {
    const nQ = r.no_estan.filter((n) => n.en_nomina && quitar.has(n.id)).length;
    const nS = r.agregados.filter((a) => sumar.has(a.id) && a.cedula && !a.registrado).length;
    const ok = await confirmar({
      titulo: `¿Confirmar lo que indicó RR. HH.?`,
      texto: [nQ && `Se inactivan ${nQ} ${nQ === 1 ? "trabajador" : "trabajadores"} (no se borra nada: quedan fuera de las estadísticas y los vencimientos).`,
        nS && `Se agregan ${nS} a la nómina.`, "Puedes deshacerlo hoy mismo. El enlace de RR. HH. se cierra."].filter(Boolean).join(" "),
      accion: "Confirmar",
    });
    if (!ok) return;
    const x = await confirmarDepuracion(empresaId, r.id, [...quitar], [...sumar]);
    setAviso({ ok: x.ok, texto: x.mensaje });
    if (x.ok && x.lote) setHecho({ lote: x.lote, texto: x.mensaje });
    router.refresh();
  });

  const deshacer = (lote: string) => iniciar(async () => {
    if (!(await confirmar({ titulo: "¿Deshacer la depuración de hoy?", texto: "Los inactivados vuelven a la nómina y se quitan los agregados que no se hayan usado.", accion: "Deshacer" }))) return;
    const x = await deshacerDepuracion(empresaId, lote);
    setAviso({ ok: x.ok, texto: x.mensaje });
    setHecho(null);
    router.refresh();
  });

  // Solo se muestra cuando hay algo que ver: enlace activo, respuestas sin confirmar o una confirmación de hoy
  if (!pendientesRevision && !confirmadoHoy && !hecho && !aviso) return null;
  const quien = r.rrhh_nombre || "RR. HH.";

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ClipboardCheck className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Depuración de nómina con RR. HH.</h2>
          <p className="text-sm text-muted-foreground">
            {vigente ? <>Enlace para <b className="text-foreground">{quien}</b> <span className="whitespace-nowrap">(teléfono …{r.telefono_fin})</span>, activo hasta el {venceTexto(r.vence)}. </> : r.estado === "vencido" ? <>El enlace de {quien} venció. </> : null}
            {r.bloqueado ? <b className="text-alerta-texto">Bloqueado por intentos con otro teléfono. </b>
              : vigente && !r.abierto_en ? "Todavía no lo abre. "
              : vigente && r.abierto_en ? <>Lo abrió el {dma(hoyCaracas(r.abierto_en))}. </> : null}
            {r.enviado_en && r.estado !== "aplicado" && <b className="text-ok-texto">Ya lo envió ({dma(hoyCaracas(r.enviado_en))}).</b>}
          </p>
        </div>
        {vigente && (
          <div className="flex flex-wrap gap-2">
            {(r.abierto_en || r.bloqueado) && <Button variant="outline" size="sm" onClick={liberar} disabled={pendiente || sinInternet}><Smartphone /> {r.bloqueado ? "Desbloquear" : "Permitir otro teléfono"}</Button>}
            <Button variant="ghost" size="sm" className="text-alerta-texto" onClick={anular} disabled={pendiente}><XCircle /> Anular</Button>
          </div>
        )}
      </div>

      {sinInternet && <div className="mt-3"><RequiereInternet texto="La revisión de RR. HH. vive en la nube. Conéctate para verla o confirmarla." /></div>}

      {aviso && <p className={cn("mt-3 rounded-md px-3 py-2 text-sm", aviso.ok ? "bg-ok/10 text-ok-texto" : "bg-alerta/10 text-alerta-texto")} role="status">{aviso.texto}</p>}

      {/* Lo que propuso RR. HH. */}
      {pendientesRevision && conRespuestas && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Cifra n={r.en_nomina} t="En la nómina" />
            <Cifra n={r.siguen} t="Siguen" clase="bg-ok/10 text-ok-texto" />
            <Cifra n={r.no_estan.length} t="Ya no están" clase="bg-alerta/10 text-alerta-texto" />
            <Cifra n={r.agregados.length} t="Faltan (agregados)" clase="bg-info/10 text-info-texto" />
          </div>

          {r.no_estan.length > 0 && (
            <div>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><UserMinus className="size-4 text-alerta-texto" /> Ya no están según RR. HH.</h3>
              <p className="mb-2 text-xs text-muted-foreground">Desmarca a quien no quieras inactivar. La evaluación de egreso se busca en las consultas de su período actual.</p>
              <ul className="divide-y rounded-xl border">
                {r.no_estan.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
                    <input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={!n.en_nomina} aria-label={`Inactivar a ${n.nombre}`}
                      checked={n.en_nomina && quitar.has(n.id)} onChange={(e) => setQuitar((s) => { const c = new Set(s); if (e.target.checked) c.add(n.id); else c.delete(n.id); return c; })} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/pacientes/${n.id}`} className="font-medium hover:underline">{n.nombre}</Link>
                      <p className="text-xs text-muted-foreground">{[n.cedula, n.cargo, n.motivo].filter(Boolean).join(" · ")}{!n.en_nomina && ` · ya está ${n.estado}`}</p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 pl-8 sm:w-auto sm:justify-end sm:pl-0">
                      <Egreso n={n} />
                      {!n.egreso && !n.cita_egreso && <CitarEgreso empresaId={empresaId} trabajadorId={n.id} nombre={n.nombre} bloqueado={sinInternet} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {r.agregados.length > 0 && (
            <div>
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4 text-info-texto" /> Faltan en tu registro</h3>
              <p className="mb-2 text-xs text-muted-foreground">Los que traen cédula se agregan a la nómina al confirmar. Sin cédula, «Registrar» abre la ficha nueva con su nombre y cargo: solo falta la cédula.</p>
              <ul className="divide-y rounded-xl border">
                {r.agregados.map((a) => {
                  const puede = Boolean(a.cedula && !a.registrado);
                  return (
                    <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
                      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-primary" disabled={!puede} aria-label={`Agregar a ${a.nombres} ${a.apellidos}`}
                        checked={puede && sumar.has(a.id)} onChange={(e) => setSumar((s) => { const c = new Set(s); if (e.target.checked) c.add(a.id); else c.delete(a.id); return c; })} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.nombres} {a.apellidos}</p>
                        <p className="text-xs text-muted-foreground">{[a.cedula ? `C.I. ${a.cedula}` : null, a.cargo].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="w-full pl-8 sm:w-auto sm:pl-0">
                      {a.registrado ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="shrink-0 rounded-full bg-aviso/15 px-2.5 py-1 text-xs font-medium text-aviso-texto">
                            Ya registrado{a.registrado.misma_empresa ? "" : " en otra empresa"}{a.registrado.estado !== "activo" ? ` (${a.registrado.estado})` : ""}
                          </span>
                          {/* En otra empresa: se pasa desde su ficha (cargo y período nuevos); aquí, abrirla */}
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/pacientes/${a.registrado.id}`}>{a.registrado.misma_empresa ? "Ver ficha" : <><ArrowRightLeft /> Abrir ficha para pasarlo</>}</Link>
                          </Button>
                        </span>
                      ) : !a.cedula ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Falta la cédula</span>
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/pacientes?${new URLSearchParams({ nuevo: "1", empresa: empresaId, nombres: a.nombres, apellidos: a.apellidos, ...(a.cargo ? { cargo: a.cargo } : {}) })}`}>
                              <UserPlus /> Registrar
                            </Link>
                          </Button>
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-info/10 px-2.5 py-1 text-xs font-medium text-info-texto">Nuevo</span>
                      )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="flex-1 text-xs text-muted-foreground">
              {r.en_nomina - r.siguen - r.no_estan.length > 0 && `RR. HH. dejó ${r.en_nomina - r.siguen - r.no_estan.length} sin revisar: no se tocan. `}
              Nada cambia hasta que confirmes.
            </p>
            <Button onClick={confirmarTodo} disabled={pendiente || sinInternet || (!quitar.size && !sumar.size)}>
              {pendiente ? <Loader2 className="animate-spin" /> : <Check />} Confirmar ({r.no_estan.filter((n) => n.en_nomina && quitar.has(n.id)).length} inactivar · {r.agregados.filter((a) => sumar.has(a.id) && a.cedula && !a.registrado).length} agregar)
            </Button>
          </div>
        </div>
      )}

      {/* Ya confirmado hoy: Deshacer */}
      {(hecho || confirmadoHoy) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-ok/10 px-3 py-2.5 text-sm text-ok-texto">
          <Check className="size-4" /> <span className="flex-1">{hecho?.texto ?? "Confirmaste hoy la revisión de RR. HH."}</span>
          <Button size="sm" variant="outline" onClick={() => deshacer(hecho?.lote ?? r.lote_id!)} disabled={pendiente}><Undo2 /> Deshacer</Button>
        </div>
      )}
    </section>
  );
}

function Cifra({ n, t, clase }: { n: number; t: string; clase?: string }) {
  return (
    <div className={cn("rounded-xl bg-muted px-2 py-2", clase)}>
      <b className="block text-xl tabular-nums">{n}</b>
      <span className="text-xs text-muted-foreground">{t}</span>
    </div>
  );
}

function Egreso({ n }: { n: RevisionDepuracion["no_estan"][number] }) {
  const [texto, clase] = n.egreso?.hecha ? [`Egreso hecho ${dma(n.egreso.fecha)}`, "bg-ok/10 text-ok-texto"]
    : n.egreso ? [`Egreso en curso ${dma(n.egreso.fecha)}`, "bg-info/10 text-info-texto"]
    : n.cita_egreso ? [`Egreso citado ${dma(n.cita_egreso)}`, "bg-info/10 text-info-texto"]
    : ["Sin evaluación de egreso", "bg-aviso/15 text-aviso-texto"];
  return <span className={cn("inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", clase)}>{texto}</span>;
}

// «Citar egreso»: un toque abre la fecha (hoy por defecto) y otro guarda la cita con motivo Egreso
function CitarEgreso({ empresaId, trabajadorId, nombre, bloqueado }: { empresaId: string; trabajadorId: string; nombre: string; bloqueado: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(() => hoyCaracas());
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const guardar = () => iniciar(async () => {
    setError("");
    const x = await citarEgreso(empresaId, trabajadorId, fecha);
    if (!x.ok) { setError(x.mensaje); return; }
    setAbierto(false);
    router.refresh();
  });
  if (!abierto) {
    return <Button size="sm" variant="outline" onClick={() => setAbierto(true)} disabled={bloqueado}><CalendarPlus /> Citar egreso</Button>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input type="date" value={fecha} min={hoyCaracas()} onChange={(e) => setFecha(e.target.value)} aria-label={`Fecha del egreso de ${nombre}`}
        className="h-8 rounded-md border bg-transparent px-2 text-sm" />
      <span className="flex items-center gap-1">
        <Button size="sm" onClick={guardar} disabled={pendiente || !fecha}>{pendiente ? <Loader2 className="animate-spin" /> : <Check />} Citar</Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>Cancelar</Button>
      </span>
      {error && <span className="w-full text-xs text-alerta-texto" role="alert">{error}</span>}
    </span>
  );
}
