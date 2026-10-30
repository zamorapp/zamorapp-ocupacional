"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Circle, DatabaseBackup, Eye, EyeOff, FolderOpen, KeyRound, Loader2, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Semaforo } from "@/components/app/semaforo";
import { confirmar } from "@/components/app/confirmar";
import type { Estado } from "@/lib/demo";
import type { PruebaRestauracion } from "@/lib/respaldo";
import {
  TEXTO_PASO, cancelarRestauracion, claro, configurar, cuando, fechaDeCopia, leerEstado, nombreCarpeta, pasosDe, respaldar, restaurar, tamano,
  type Copia, type EstadoPuerta, type Respuesta,
} from "@/lib/respaldo-escritorio";
import { cn } from "@/lib/utils";

const MINIMO_CLAVE = 12; // si la puerta no manda claveMinima
const IGNORADA = "zamorapp.respaldo.fallida-ignorada";
const VENCE_HORAS = 25; // se respalda solo una vez al día: con un poco de holgura

type Aviso = { tipo: "ok" | "alerta"; texto: string; detalle?: string; dosPasos?: boolean } | null;

// Modo demo: una PC de ejemplo, para ver la pantalla sin zamorApp Escritorio
const DEMO: EstadoPuerta = {
  enCurso: false, paso: null, carpeta: "C:\\Users\\consultorio\\Mi unidad", cifrado: true, error: null, hora: "2026-10-29T15:20:00Z",
  ultimo: { fecha: "2026-10-29T14:42:00Z", ok: true, archivo: "zamorapp-20261029-1442.dump", bytes: 48_300_000, externo: "zamorapp-20261029-1442.zamorapp", automatico: true, sincronizado: true },
  copias: [
    { archivo: "C:\\zamorApp\\datos\\respaldos\\zamorapp-20261029-1442.dump", bytes: 48_300_000, externo: false },
    { archivo: "C:\\zamorApp\\datos\\respaldos\\zamorapp-20261028-1436.dump", bytes: 48_100_000, externo: false },
    { archivo: "C:\\Users\\consultorio\\Mi unidad\\zamorapp-20261029-1442.zamorapp", bytes: 48_300_160, externo: true },
  ],
  sugeridas: ["C:\\Users\\consultorio\\Mi unidad", "C:\\Users\\consultorio\\OneDrive"],
  pasos: ["nube", "pc", "drive", "prueba"], horaSinAncla: false, claveMinima: 12,
  avisoClave: "Sin esta clave, la copia de Drive no sirve; anótala en papel. La nube sigue siendo el otro respaldo.",
  restauracionProbada: { fecha: "2026-10-29T14:43:00Z", ok: true, archivo: "zamorapp-20261029-1442.zamorapp", detalle: null, anotadaEnNube: true },
  restauracionFallida: null, restauracionPendiente: null,
};

function semaforo(e: EstadoPuerta): { estado: Estado; titulo: string; detalle: string } {
  const u = e.ultimo;
  if (!u) return { estado: "alerta", titulo: "Aún no hay respaldo en esta PC", detalle: "Pulsa «Respaldar ahora» para guardar la primera copia." };
  if (!u.ok) return { estado: "alerta", titulo: `El respaldo de ${cuando(u.fecha, e.hora)} falló`, detalle: claro(e.error ?? "No se pudo completar.") };
  const vencido = e.hora && (Date.parse(e.hora) - Date.parse(u.fecha)) / 36e5 > VENCE_HORAS;
  if (vencido) return { estado: "alerta", titulo: `Sin respaldo desde ${cuando(u.fecha, e.hora)}`, detalle: "Pulsa «Respaldar ahora». Si vuelve a pasar, deja zamorApp abierto en esta PC durante el día." };
  if (!u.externo) {
    return { estado: "aviso", titulo: "Solo en esta PC", detalle: `Último: ${cuando(u.fecha, e.hora)}. Falta elegir la carpeta de Google Drive o la clave de respaldo: la copia no sale de la PC.` };
  }
  return { estado: "ok", titulo: "Respaldo al día", detalle: `Último: ${cuando(u.fecha, e.hora)} · en esta PC y en Google Drive (cifrado)` };
}

const tono = { ok: "border-ok/50 bg-ok/10 text-ok-texto", aviso: "border-aviso/60 bg-aviso/10 text-aviso-texto", alerta: "border-alerta/60 bg-alerta/10 text-alerta-texto" };

export function PantallaRespaldo({ puedeConfigurar, demo, prueba }: { puedeConfigurar: boolean; demo: boolean; prueba: PruebaRestauracion | null }) {
  // Empieza vacía también en demo: las fechas se escriben en el navegador (el servidor formatea distinto la hora)
  const [estado, setEstado] = useState<EstadoPuerta | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ignorada, setIgnorada] = useState<string | null>(null);
  const configRef = useRef<HTMLDivElement>(null);

  const recargar = useCallback(async () => {
    if (demo) return setEstado((e) => e ?? DEMO);
    const r = await leerEstado();
    if (r.ok) { setEstado(r.datos); setErrorCarga(null); } else setErrorCarga(r.mensaje);
  }, [demo]);
  useEffect(() => { void recargar(); }, [recargar]);
  useEffect(() => { try { setIgnorada(localStorage.getItem(IGNORADA)); } catch { /* sin almacenamiento */ } }, []);

  // Mientras dura el respaldo se consulta el paso cada segundo (la petición de respaldar espera hasta el final)
  const enCurso = trabajando || Boolean(estado?.enCurso);
  useEffect(() => {
    if (!enCurso || demo) return;
    const t = setInterval(() => void recargar(), 1000);
    return () => clearInterval(t);
  }, [enCurso, demo, recargar]);

  async function respaldarAhora() {
    setAviso(null);
    setTrabajando(true);
    if (demo) {
      for (const p of pasosDe(DEMO)) { setEstado((e) => e && { ...e, enCurso: true, paso: p }); await new Promise((ok) => setTimeout(ok, 900)); }
      setEstado(DEMO);
      setTrabajando(false);
      return setAviso({ tipo: "ok", texto: "Listo: en modo demo no se guarda ninguna copia." });
    }
    const r = await respaldar();
    setTrabajando(false);
    await recargar();
    if (r.ok && !r.datos.error) {
      const hora = fechaDeCopia(r.datos.archivo ?? "")?.hora;
      setAviso({ tipo: "ok", texto: `Listo: copia${hora ? ` de las ${hora}` : ""} guardada en esta PC${r.datos.externo ? " y en Google Drive" : ""}.` });
    } else {
      const crudo = r.ok ? r.datos.error ?? "" : r.mensaje;
      setAviso({ tipo: "alerta", texto: claro(crudo), detalle: crudo !== claro(crudo) ? crudo : undefined });
    }
  }

  if (!estado) {
    return errorCarga ? (
      <div role="alert" className="rounded-xl border border-alerta/60 bg-alerta/10 p-4 text-sm text-alerta-texto">
        {errorCarga} <button type="button" onClick={() => void recargar()} className="ml-1 font-medium underline">Intentar de nuevo</button>
      </div>
    ) : (
      <div role="status" aria-label="Revisando el respaldo" className="h-40 animate-pulse rounded-xl border bg-muted/40" />
    );
  }

  const s = semaforo(estado);
  const pasos = pasosDe(estado);
  const paso = estado.paso ? pasos.indexOf(estado.paso) : -1;
  const fallida = estado.restauracionFallida;
  const claveFallida = fallida ? `${fallida.fecha ?? ""}|${fallida.origen}` : null;
  const ignorar = () => { setIgnorada(claveFallida); try { if (claveFallida) localStorage.setItem(IGNORADA, claveFallida); } catch { /* sin almacenamiento */ } };
  const pendiente = estado.restauracionPendiente;
  async function cancelar() {
    if (demo) return setEstado({ ...estado!, restauracionPendiente: null });
    const r = await cancelarRestauracion();
    if (!r.ok) return setAviso({ tipo: "alerta", texto: r.mensaje, dosPasos: r.dosPasos });
    await recargar();
  }
  const copiaPendiente = pendiente ? fechaDeCopia(pendiente.origen) : null;

  return (
    <div className="space-y-6">
      {fallida && claveFallida !== ignorada && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-alerta/60 bg-alerta/10 px-4 py-3 text-sm sm:flex-row sm:items-start">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alerta-texto" />
          <p className="min-w-0 flex-1 break-words">
            <strong className="text-alerta-texto">No se pudo restaurar la copia{fallida.fecha ? ` (${cuando(fallida.fecha, estado.hora)})` : ""}.</strong> Esta PC siguió con sus datos de antes, sin cambios.
            <span className="mt-0.5 block text-xs text-muted-foreground">{claro(fallida.mensaje)}</span>
          </p>
          <Button variant="outline" size="sm" onClick={ignorar} className="self-start">Ignorar</Button>
        </div>
      )}
      {pendiente && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-aviso/60 bg-aviso/10 px-4 py-3 text-sm sm:flex-row sm:items-start">
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-aviso-texto" />
          <p className="min-w-0 flex-1">
            <strong>Restauración lista{copiaPendiente ? ` (copia del ${copiaPendiente.dia} a las ${copiaPendiente.hora})` : ""}:</strong> cierra y abre zamorApp para aplicarla.
            Al arrancar se carga la copia y luego se trae de la nube todo lo más nuevo.
          </p>
          {puedeConfigurar && <Button variant="outline" size="sm" onClick={() => void cancelar()} className="self-start">Cancelar restauración</Button>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          {/* 1. Estado */}
          <section aria-labelledby="estado-respaldo" className="rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h2 id="estado-respaldo" className="flex items-center gap-2 text-lg font-semibold"><Semaforo estado={s.estado} /> {s.titulo}</h2>
                <p className="mt-1 break-words text-sm text-muted-foreground">{s.detalle}</p>
                {s.estado === "aviso" && puedeConfigurar && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => configRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>Configurar</Button>
                )}
              </div>
              <Button size="lg" onClick={() => void respaldarAhora()} disabled={enCurso} className="w-full sm:w-auto">
                {enCurso ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
                {enCurso ? "Respaldando…" : "Respaldar ahora"}
              </Button>
            </div>

            {enCurso && (
              <ol role="status" aria-label="Avance del respaldo" className="mt-4 space-y-2 border-t pt-4 text-sm">
                {pasos.map((p, i) => {
                  const hecho = paso > i;
                  const ahora = paso === i;
                  return (
                    <li key={p} className={cn("flex items-center gap-2", !hecho && !ahora && "text-muted-foreground")}>
                      {hecho ? <Check className="size-4 text-ok-texto" /> : ahora ? <Loader2 className="size-4 animate-spin text-primary" /> : <Circle className="size-4" />}
                      <span className={cn(ahora && "font-medium")}>{TEXTO_PASO[p] ?? p}</span>
                      <span className="sr-only">{hecho ? "hecho" : ahora ? "en curso" : "falta"}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {aviso && (
              <div role={aviso.tipo === "alerta" ? "alert" : "status"} className={cn("mt-4 rounded-lg border px-3 py-2 text-sm", tono[aviso.tipo])}>
                {aviso.texto}
                {aviso.dosPasos && <> <Link href="/login/dos-pasos" className="font-medium underline">Verificar ahora</Link></>}
                {aviso.detalle && (
                  <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Ver detalle</summary><p className="mt-1 break-all font-mono">{aviso.detalle}</p></details>
                )}
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              zamorApp se respalda solo una vez al día. Guarda las últimas 7 copias en esta PC y 30 en Google Drive.
              {estado.horaSinAncla && " La hora de esta PC aún no se verificó con la nube: las fechas pueden no ser exactas."}
            </p>
          </section>

          {/* Prueba de que la copia se abre (restauracion_probada): la de esta PC; si no hay, la anotada en la nube */}
          {estado.restauracionProbada ? <Probada p={estado.restauracionProbada} hora={estado.hora} /> : prueba && (
            <section aria-label="Prueba de la copia" className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", prueba.estado === "ok" ? "bg-card" : tono[prueba.estado])}>
              <ShieldCheck className={cn("mt-0.5 size-4 shrink-0", prueba.estado === "ok" && "text-ok-texto")} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium text-foreground"><Semaforo estado={prueba.estado} /> {prueba.titulo}</span>
                <span className="block break-words text-xs text-muted-foreground">{prueba.detalle}</span>
              </span>
            </section>
          )}
        </div>

        <div ref={configRef} className="min-w-0 scroll-mt-20 space-y-4">
          <Carpeta estado={estado} puede={puedeConfigurar} demo={demo} alGuardar={setEstado} />
          <Clave estado={estado} puede={puedeConfigurar} demo={demo} alGuardar={setEstado} />
        </div>
      </div>

      {puedeConfigurar && (
        <Restaurar estado={estado} demo={demo}
          alPreparar={(origen) => (demo ? setEstado({ ...estado, restauracionPendiente: { origen, pedido: estado.hora ?? "" } }) : void recargar())} />
      )}
    </div>
  );
}

function Probada({ p, hora }: { p: NonNullable<EstadoPuerta["restauracionProbada"]>; hora?: string }) {
  return (
    <section aria-label="Prueba de la copia" className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", p.ok ? "bg-card" : tono.alerta)}>
      <ShieldCheck className={cn("mt-0.5 size-4 shrink-0", p.ok && "text-ok-texto")} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium text-foreground"><Semaforo estado={p.ok ? "ok" : "alerta"} /> {p.ok ? "La copia de Google Drive se abre" : "La copia de Google Drive no se pudo abrir"}</span>
        <span className="block break-words text-xs text-muted-foreground">
          {p.ok ? `Probada ${cuando(p.fecha, hora)} con la clave de respaldo` : `${claro(p.detalle ?? "")} Revisa la clave y pulsa «Respaldar ahora».`}
          {p.ok && (p.anotadaEnNube ? " · anotada en la nube" : " · se anota en la nube al volver internet")}
        </span>
      </span>
    </section>
  );
}

function SoloLectura() {
  return <p className="mt-3 text-xs text-muted-foreground">Lo cambia el administrador o el gerente médico.</p>;
}

function Fallo({ r }: { r: Extract<Respuesta<unknown>, { ok: false }> }) {
  return (
    <p role="alert" className="text-sm text-alerta-texto">
      {r.mensaje}
      {r.dosPasos && <> <Link href="/login/dos-pasos" className="font-medium underline">Verificar ahora</Link></>}
    </p>
  );
}

// 2. Carpeta de Google Drive
function Carpeta({ estado, puede, demo, alGuardar }: { estado: EstadoPuerta; puede: boolean; demo: boolean; alGuardar: (e: EstadoPuerta) => void }) {
  const actual = estado.carpeta;
  const enSugeridas = actual ? estado.sugeridas.includes(actual) : false;
  const [eleccion, setEleccion] = useState<string>(actual && !enSugeridas ? "otra" : actual ?? estado.sugeridas[0] ?? "otra");
  const [otra, setOtra] = useState(actual && !enSugeridas ? actual : "");
  const [guardando, setGuardando] = useState(false);
  const [res, setRes] = useState<Respuesta<EstadoPuerta> | null>(null);
  const destino = eleccion === "otra" ? otra.trim() : eleccion;

  async function guardar() {
    setGuardando(true);
    const r: Respuesta<EstadoPuerta> = demo ? { ok: false, mensaje: "En modo demo no se guardan cambios." } : await configurar({ carpeta: destino });
    setGuardando(false);
    setRes(r);
    if (r.ok) alGuardar({ ...estado, ...r.datos });
  }

  return (
    <section aria-labelledby="carpeta-externa" className="rounded-xl border bg-card p-5">
      <h2 id="carpeta-externa" className="flex items-center gap-2 font-semibold"><FolderOpen className="size-4 text-primary" /> Dónde se guarda la copia externa</h2>
      <p className="mt-1 text-sm text-muted-foreground">Elige la carpeta de Google Drive en esta PC. El programa de Google Drive la sube solo a tu cuenta.</p>
      {!puede ? (
        <>
          <p className="mt-3 break-all font-mono text-sm">{actual ?? "Sin carpeta: la copia no sale de esta PC."}</p>
          <SoloLectura />
        </>
      ) : (
        <fieldset className="mt-3 space-y-2" disabled={guardando}>
          <legend className="sr-only">Carpeta</legend>
          {estado.sugeridas.length === 0 && (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No encontramos Google Drive en esta PC. Instala Google Drive para escritorio, abre tu cuenta y vuelve aquí.</p>
          )}
          {[...estado.sugeridas, "otra"].map((ruta) => (
            <label key={ruta} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition hover:border-primary/40", eleccion === ruta && "border-primary bg-primary/5")}>
              <input type="radio" name="carpeta" value={ruta} checked={eleccion === ruta} onChange={() => setEleccion(ruta)} className="mt-1 accent-[var(--primary)]" />
              <span className="min-w-0 flex-1">
                {ruta === "otra" ? (
                  <>
                    <span className="font-medium">Otra carpeta…</span>
                    {eleccion === "otra" && (
                      <Input value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="G:\Mi unidad\zamorApp" aria-label="Ruta de la carpeta" className="mt-2 font-mono" />
                    )}
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-2 font-medium">{nombreCarpeta(ruta)}{ruta === actual && <span className="text-xs font-normal text-ok-texto">· en uso</span>}</span>
                    <span className="block break-all font-mono text-xs text-muted-foreground">{ruta}</span>
                  </>
                )}
              </span>
            </label>
          ))}
          {actual && !estado.carpetaExternaExiste && !demo && (
            <p className="text-sm text-aviso-texto">La carpeta en uso no está disponible ahora. ¿Está abierto Google Drive?</p>
          )}
          {res && !res.ok && <Fallo r={res} />}
          {res?.ok && <p role="status" className="text-sm text-ok-texto">Carpeta guardada.</p>}
          <Button onClick={() => void guardar()} disabled={guardando || !destino || destino === actual}>
            {guardando && <Loader2 className="size-4 animate-spin" />} {guardando ? "Guardando…" : "Guardar carpeta"}
          </Button>
        </fieldset>
      )}
    </section>
  );
}

// 3. Clave de respaldo: se escribe dos veces, con aviso fijo y casilla obligatoria; nunca se vuelve a mostrar
function Clave({ estado, puede, demo, alGuardar }: { estado: EstadoPuerta; puede: boolean; demo: boolean; alGuardar: (e: EstadoPuerta) => void }) {
  const [abierto, setAbierto] = useState(!estado.cifrado);
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [ver, setVer] = useState(false);
  const [anotada, setAnotada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [res, setRes] = useState<Respuesta<EstadoPuerta> | null>(null);
  const minimo = estado.claveMinima ?? MINIMO_CLAVE;
  const corta = clave.length > 0 && clave.length < minimo;
  const distinta = repetida.length > 0 && repetida !== clave;
  const lista = clave.length >= minimo && repetida === clave && anotada;

  async function guardar() {
    setGuardando(true);
    const r: Respuesta<EstadoPuerta> = demo ? { ok: false, mensaje: "En modo demo no se guardan cambios." } : await configurar({ clave, confirmacion: repetida });
    setGuardando(false);
    setRes(r);
    if (r.ok) {
      alGuardar({ ...estado, ...r.datos });
      setClave(""); setRepetida(""); setAnotada(false); setAbierto(false);
    }
  }

  return (
    <section aria-labelledby="clave-respaldo" className="rounded-xl border bg-card p-5">
      <h2 id="clave-respaldo" className="flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" /> Clave de respaldo</h2>
      {estado.cifrado ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ok-texto"><Check className="size-4" /> Clave configurada. La copia de Google Drive va cifrada.</p>
      ) : (
        <p className="mt-2 rounded-lg border border-aviso/60 bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">Sin clave, la copia no sale de esta PC.</p>
      )}
      {res?.ok && <p role="status" className="mt-2 text-sm text-ok-texto">Clave guardada. {res.datos.avisoClave ?? ""}</p>}
      {!puede ? <SoloLectura /> : !abierto ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => { setAbierto(true); setRes(null); }}>Cambiar clave</Button>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (lista) void guardar(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="clave">Clave de respaldo</Label>
            <div className="relative">
              <Input id="clave" type={ver ? "text" : "password"} autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} aria-invalid={corta} aria-describedby="clave-ayuda" className="pr-10" />
              <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? "Ocultar la clave" : "Ver la clave"} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
                {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p id="clave-ayuda" className={cn("text-xs", corta ? "text-alerta-texto" : "text-muted-foreground")}>
              {corta ? `Faltan ${minimo - clave.length} caracteres (mínimo ${minimo}).` : <>Usa una frase larga que solo tú conozcas; no copies una que hayas visto escrita.</>}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repetida">Repítela</Label>
            <Input id="repetida" type={ver ? "text" : "password"} autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} aria-invalid={distinta} />
            {distinta && <p className="text-xs text-alerta-texto">No coincide con la primera.</p>}
          </div>
          <div className="flex gap-2 rounded-lg border border-alerta/60 bg-alerta/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alerta-texto" />
            <p>
              <strong className="text-alerta-texto">{estado.avisoClave ?? "Sin esta clave, la copia de Drive no sirve; anótala en papel. La nube sigue siendo el otro respaldo."}</strong>{" "}
              Ni zamorApp ni el soporte pueden recuperarla: guárdala con los documentos del consultorio.
              {estado.cifrado && <span className="mt-1 block">Las copias anteriores siguen abriéndose con la clave anterior: no la botes hasta que pasen 30 días.</span>}
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={anotada} onChange={(e) => setAnotada(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
            La anoté en un lugar seguro, fuera de esta PC.
          </label>
          {res && !res.ok && <Fallo r={res} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!lista || guardando}>{guardando && <Loader2 className="size-4 animate-spin" />} {guardando ? "Guardando…" : "Guardar clave"}</Button>
            {estado.cifrado && <Button type="button" variant="ghost" onClick={() => { setAbierto(false); setClave(""); setRepetida(""); setAnotada(false); }}>Cancelar</Button>}
          </div>
        </form>
      )}
    </section>
  );
}

// 4. Restaurar una copia: plegado, en tono peligro, lejos de «Respaldar ahora»
function Restaurar({ estado, demo, alPreparar }: { estado: EstadoPuerta; demo: boolean; alPreparar: (origen: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [elegida, setElegida] = useState<Copia | null>(null);
  const [clave, setClave] = useState("");
  const [preparando, setPreparando] = useState(false);
  const [res, setRes] = useState<Extract<Respuesta<unknown>, { ok: false }> | null>(null);
  // La más reciente primero, sin importar dónde esté
  const copias = [...estado.copias].sort((a, b) => (/\d{8}-\d{4}(\d{2})?/.exec(b.archivo)?.[0] ?? "").localeCompare(/\d{8}-\d{4}(\d{2})?/.exec(a.archivo)?.[0] ?? ""));

  async function preparar() {
    if (!elegida) return;
    const f = fechaDeCopia(elegida.archivo);
    const si = await confirmar({
      titulo: `¿Restaurar la copia${f ? ` del ${f.dia} a las ${f.hora}` : ""}?`,
      texto: "Al cerrar y abrir zamorApp, esta PC carga esa copia y luego trae de la nube todo lo más nuevo. Los datos actuales de la PC quedan guardados aparte por si acaso.",
      accion: "Preparar restauración",
      peligro: true,
    });
    if (!si) return;
    setPreparando(true);
    setRes(null);
    const r = demo ? ({ ok: true } as const) : await restaurar(elegida.archivo, elegida.externo && clave ? clave : undefined);
    setPreparando(false);
    if (!r.ok) return setRes(r);
    setClave("");
    setElegida(null);
    setAbierto(false);
    alPreparar(elegida.archivo);
  }

  return (
    <section aria-labelledby="restaurar" className="rounded-xl border border-alerta/30 bg-card">
      <button type="button" id="restaurar" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} aria-controls="restaurar-cuerpo"
        className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium text-alerta-texto hover:bg-alerta/5">
        <RotateCcw className="size-4 shrink-0" />
        <span className="flex-1">Restaurar una copia…</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <div id="restaurar-cuerpo" className="space-y-3 border-t px-5 py-4 text-sm">
          <p className="text-muted-foreground">Úsalo solo si los datos de esta PC se dañaron o si instalaste zamorApp en otra PC. Pide la verificación en dos pasos.</p>
          {copias.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-muted-foreground">No hay copias en esta PC ni en la carpeta de Google Drive.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {copias.map((c) => {
                const f = fechaDeCopia(c.archivo);
                const activa = elegida?.archivo === c.archivo;
                return (
                  <li key={c.archivo}>
                    <button type="button" onClick={() => { setElegida(c); setRes(null); }} aria-pressed={activa}
                      className={cn("w-full rounded-lg border p-3 text-left transition hover:border-alerta/50", activa && "border-alerta bg-alerta/5")}>
                      <span className="block font-medium">{f ? `${f.dia} · ${f.hora}` : "Copia"}</span>
                      <span className="block text-xs text-muted-foreground">{c.externo ? "Google Drive · cifrada" : "Esta PC"} · {tamano(c.bytes)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {elegida && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              {elegida.externo && (
                <div className="space-y-1.5">
                  <Label htmlFor="clave-copia">Clave de respaldo de esa copia</Label>
                  <Input id="clave-copia" type="password" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} className="max-w-sm" />
                  <p className="text-xs text-muted-foreground">{estado.cifrado ? "Si la dejas vacía se usa la clave guardada en esta PC." : "Es la clave que tenías cuando se hizo la copia."}</p>
                </div>
              )}
              {res && <Fallo r={res} />}
              <Button variant="destructive" onClick={() => void preparar()} disabled={preparando || (elegida.externo && !estado.cifrado && !clave)}>
                {preparando && <Loader2 className="size-4 animate-spin" />} {preparando ? "Preparando…" : "Preparar restauración"}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
