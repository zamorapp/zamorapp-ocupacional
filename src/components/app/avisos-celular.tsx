"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { activarAvisos, llaveAvisos, probarAviso, quitarAvisos } from "./avisos-celular-acciones";

type Estado = "cargando" | "no-soporta" | "instalar-iphone" | "bloqueado" | "apagado" | "activo";
const OFERTA_IGNORADA = "zamorapp.avisos-celular.ignorado";

function llave(base64: string) {
  const b = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function base64url(llave: ArrayBuffer | null) {
  if (!llave) return null;
  return btoa(String.fromCharCode(...new Uint8Array(llave))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const nombreEquipo = () => {
  const ua = navigator.userAgent;
  return /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Windows/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "Navegador";
};

async function registro() {
  // En desarrollo no hay service worker (registro-sw.tsx): se registra aquí para poder probar
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register("/sw.js");
}

function useAvisos(escritorio = false) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  useEffect(() => {
    if (escritorio) return;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone: solo recibe avisos con la app agregada a la pantalla de inicio
        const iphone = /iPhone|iPad/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;
        return setEstado(iphone ? "instalar-iphone" : "no-soporta");
      }
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const sub = await (await registro()).pushManager.getSubscription().catch(() => null);
      // Suscrita con otra llave (llaves renovadas): sus avisos rebotan, así que se muestra apagada para volver a activarla
      const vigente = sub && Notification.permission === "granted" && base64url(sub.options.applicationServerKey) === (await llaveAvisos().catch(() => null));
      setEndpoint(vigente ? sub.endpoint : null);
      setEstado(vigente ? "activo" : "apagado");
    })();
  }, [escritorio]);
  return { estado, setEstado, endpoint, setEndpoint };
}

// Aviso de prueba de punta a punta: el servidor lo envía y el service worker cuenta si llegó y si Android lo mostró.
// Así se sabe dónde se pierde (servicio de avisos, ahorro de batería o notificaciones silenciadas) sin adivinar.
const RESPUESTA_CELULAR = 12000;
function esperarRecibo(prueba: string) {
  return new Promise<{ mostrado: boolean; error?: string } | null>((listo) => {
    const alRecibir = (e: MessageEvent) => {
      if (e.data?.tipo !== "aviso-recibido" || e.data.prueba !== prueba) return;
      navigator.serviceWorker.removeEventListener("message", alRecibir);
      clearTimeout(t);
      listo({ mostrado: Boolean(e.data.mostrado), error: e.data.error });
    };
    const t = setTimeout(() => { navigator.serviceWorker.removeEventListener("message", alRecibir); listo(null); }, RESPUESTA_CELULAR);
    navigator.serviceWorker.addEventListener("message", alRecibir);
  });
}
type Mensaje = { tono: "ok" | "aviso" | "alerta"; texto: string; pasos?: string[]; plegados?: boolean; detalle?: string };
type Respuesta = { ok: boolean; mensaje: string; detalle?: string };
const PASOS_NOTIFICACIONES = ["Abre Ajustes del teléfono › Apps.", "Entra en zamorApp (si no aparece, Chrome) › Notificaciones.", "Activa «Permitir notificaciones» y todas las categorías."];
const PASOS_BATERIA = ["Abre Ajustes del teléfono › Apps.", "Entra en zamorApp (si no aparece, Chrome) › Batería.", "Elige «Sin restricciones» o «No optimizar».", "Vuelve aquí y toca «Enviar uno de prueba»."];
async function probarDePuntaAPunta(enviar: (prueba: string) => Promise<Respuesta>, alEsperar: () => void): Promise<Mensaje> {
  const prueba = crypto.randomUUID();
  const recibo = esperarRecibo(prueba);
  const r = await enviar(prueba);
  if (!r.ok) return { tono: "alerta", texto: r.mensaje, detalle: r.detalle };
  alEsperar();
  const v = await recibo;
  if (v?.mostrado) return { tono: "ok", texto: "Listo: el aviso llegó a este celular.", pasos: PASOS_NOTIFICACIONES, plegados: true };
  if (v) return { tono: "alerta", texto: "El teléfono no deja mostrar los avisos.", pasos: PASOS_NOTIFICACIONES, detalle: v.error };
  return { tono: "alerta", texto: "El aviso no llegó a este celular. Casi siempre es el ahorro de batería.", pasos: PASOS_BATERIA };
}

function Resultado({ m }: { m: Mensaje }) {
  const [abiertos, setAbiertos] = useState(!m.plegados);
  const color = m.tono === "ok" ? "text-ok-texto" : m.tono === "aviso" ? "text-aviso-texto" : "text-alerta-texto";
  return (
    <div role="status" className="space-y-1.5">
      <p className={color}>
        {m.texto}
        {m.plegados && m.pasos && !abiertos && (
          <> <button type="button" onClick={() => setAbiertos(true)} className="text-xs text-muted-foreground underline underline-offset-2">¿No lo viste?</button></>
        )}
      </p>
      {m.pasos && abiertos && (
        <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">{m.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
      )}
      {m.detalle && <p className="text-xs text-muted-foreground">Detalle: {m.detalle}</p>}
    </div>
  );
}

async function suscribir() {
  if ((await Notification.requestPermission()) !== "granted") return null;
  const publica = await llaveAvisos();
  if (!publica) throw new Error("La llave de avisos de Vercel falta o no es válida. Pídele a Claude que la renueve.");
  const reg = await registro();
  await navigator.serviceWorker.ready;
  const vieja = await reg.pushManager.getSubscription();
  // Una suscripción con otra llave (llaves renovadas) no sirve: se cambia
  if (vieja) await vieja.unsubscribe();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave(publica) });
}

/** Tarjeta de Mi perfil: activar, probar o quitar los avisos en este celular (en el escritorio solo dice dónde se activan). */
export function AvisosCelular({ escritorio = false }: { escritorio?: boolean }) {
  const { estado, setEstado, endpoint, setEndpoint } = useAvisos(escritorio);
  const [trabajando, setTrabajando] = useState(false);
  const [equipo, setEquipo] = useState("celular");
  useEffect(() => setEquipo(window.matchMedia("(pointer: coarse)").matches ? "celular" : "equipo"), []);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [esperando, setEsperando] = useState(false);
  const alEsperar = () => setEsperando(true);

  const correr = async (paso: () => Promise<Mensaje | Respuesta | null>) => {
    setTrabajando(true);
    setMensaje(null);
    try {
      const r = await paso();
      if (r) setMensaje("tono" in r ? r : { tono: r.ok ? "ok" : "alerta", texto: r.mensaje, detalle: r.detalle });
    } catch (e) {
      setMensaje({ tono: "alerta", texto: e instanceof Error ? e.message : "No se pudo." });
    }
    setTrabajando(false);
    setEsperando(false);
  };

  const activar = () => correr(async () => {
    const sub = await suscribir();
    if (!sub) { setEstado("bloqueado"); return null; }
    const j = sub.toJSON();
    let guardada = false;
    const r = await probarDePuntaAPunta(async (prueba) => {
      const a = await activarAvisos({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", equipo: nombreEquipo(), prueba });
      guardada = Boolean(a.guardada);
      return a;
    }, alEsperar);
    // Guardada en la base: queda activa aunque la prueba no llegue (el mensaje dice qué ajustar en el teléfono)
    if (guardada) {
      setEndpoint(sub.endpoint); setEstado("activo");
      return r.tono === "ok" ? r : { ...r, tono: "aviso", texto: `Avisos activados, pero ${r.texto.charAt(0).toLowerCase()}${r.texto.slice(1)}` };
    }
    else await sub.unsubscribe().catch(() => {});
    return r;
  });

  const quitar = () => correr(async () => {
    const sub = await (await registro()).pushManager.getSubscription();
    const r = await quitarAvisos(sub?.endpoint ?? endpoint ?? "");
    await sub?.unsubscribe().catch(() => {});
    setEndpoint(null);
    setEstado("apagado");
    return r;
  });

  return (
    <Card id="avisos-celular">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><BellRing className="size-4" /> Avisos en el celular</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {escritorio ? (
          <p className="text-muted-foreground">Los avisos se activan desde tu celular: abre zamorApp en el celular › Mi perfil.</p>
        ) : (<>
        <div className="text-muted-foreground">
          <p>Te avisa al momento de:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>RR. HH.: registros, citas y solicitudes</li>
            <li>Plazos de accidentes</li>
            <li>Resultados por recibir</li>
            <li>Alertas para la próxima evaluación</li>
            <li>Cada mañana: exámenes por vencer</li>
          </ul>
          <p className="mt-1">Llega aunque la laptop esté apagada. Actívalo en cada {equipo} donde lo quieras.</p>
        </div>
        {estado === "cargando" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {estado === "no-soporta" && <p>Este navegador no recibe avisos. En Android usa Chrome; en iPhone, Safari con la app agregada a la pantalla de inicio.</p>}
        {estado === "instalar-iphone" && <p>En iPhone primero agrega zamorApp a la pantalla de inicio (Compartir › «Agregar a inicio»), ábrela desde ahí y vuelve aquí.</p>}
        {estado === "bloqueado" && (
          <p>Los avisos están bloqueados para esta página. En Chrome: toca el candado junto a la dirección › Permisos › Notificaciones › Permitir. Luego recarga.</p>
        )}
        {estado === "apagado" && (
          <Button onClick={activar} disabled={trabajando} size="lg" className="w-full sm:w-auto">
            {trabajando ? <Loader2 className="animate-spin" /> : <Smartphone />} Activar avisos en este {equipo}
          </Button>
        )}
        {estado === "activo" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ok/15 px-3 py-1 font-medium text-ok-texto">Activos en este {equipo}</span>
            <Button variant="outline" size="sm" disabled={trabajando || !endpoint} onClick={() => correr(() => probarDePuntaAPunta((prueba) => probarAviso(endpoint ?? "", prueba), alEsperar))}>
              {trabajando && <Loader2 className="animate-spin" />} Enviar uno de prueba
            </Button>
            <Button variant="ghost" size="sm" disabled={trabajando} onClick={quitar}>Desactivar</Button>
          </div>
        )}
        {esperando && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Esperando el aviso en este celular…</p>}
        {mensaje && <Resultado key={mensaje.texto} m={mensaje} />}
        </>)}
      </CardContent>
    </Card>
  );
}

/** Franja del Inicio en el celular: ofrece activar los avisos una vez; «Ignorar» la quita para siempre en este equipo. */
export function OfertaAvisosCelular() {
  const { estado } = useAvisos();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let ignorada = false;
    try { ignorada = localStorage.getItem(OFERTA_IGNORADA) === "1"; } catch {}
    setVisible(!ignorada && window.matchMedia("(pointer: coarse)").matches);
  }, []);
  if (!visible || estado !== "apagado") return null;
  const ignorar = () => {
    try { localStorage.setItem(OFERTA_IGNORADA, "1"); } catch {}
    setVisible(false);
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <BellRing className="size-5 shrink-0 text-primary" />
      <p className="flex-1">Recibe en este celular los avisos de RR. HH., accidentes, resultados y vencimientos.</p>
      <Button size="sm" asChild><a href="/configuracion/perfil#avisos-celular">Activar</a></Button>
      <Button size="sm" variant="ghost" onClick={ignorar}>Ignorar</Button>
    </div>
  );
}
