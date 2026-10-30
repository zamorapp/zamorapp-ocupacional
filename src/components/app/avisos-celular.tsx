"use client";

import { useEffect, useState } from "react";
import { BellRing, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VAPID_PUBLICA } from "@/lib/push-publica";
import { activarAvisos, probarAviso, quitarAvisos } from "./avisos-celular-acciones";

type Estado = "cargando" | "no-soporta" | "instalar-iphone" | "bloqueado" | "apagado" | "activo";
const OFERTA_IGNORADA = "zamorapp.avisos-celular.ignorado";

function llave(base64: string) {
  const b = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
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
      setEndpoint(sub?.endpoint ?? null);
      setEstado(sub && Notification.permission === "granted" ? "activo" : "apagado");
    })();
  }, [escritorio]);
  return { estado, setEstado, endpoint, setEndpoint };
}

async function suscribir() {
  if ((await Notification.requestPermission()) !== "granted") return null;
  const reg = await registro();
  await navigator.serviceWorker.ready;
  const vieja = await reg.pushManager.getSubscription();
  // Una suscripción con otra llave (llaves renovadas) no sirve: se cambia
  if (vieja) await vieja.unsubscribe();
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave(VAPID_PUBLICA) });
}

/** Tarjeta de Mi perfil: activar, probar o quitar los avisos en este celular (en el escritorio solo dice dónde se activan). */
export function AvisosCelular({ escritorio = false }: { escritorio?: boolean }) {
  const { estado, setEstado, endpoint, setEndpoint } = useAvisos(escritorio);
  const [trabajando, setTrabajando] = useState(false);
  const [equipo, setEquipo] = useState("celular");
  useEffect(() => setEquipo(window.matchMedia("(pointer: coarse)").matches ? "celular" : "equipo"), []);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  const correr = async (paso: () => Promise<{ ok: boolean; mensaje: string } | null>) => {
    setTrabajando(true);
    setMensaje(null);
    try {
      const r = await paso();
      if (r) setMensaje({ ok: r.ok, texto: r.mensaje });
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : "No se pudo." });
    }
    setTrabajando(false);
  };

  const activar = () => correr(async () => {
    const sub = await suscribir();
    if (!sub) { setEstado("bloqueado"); return null; }
    const j = sub.toJSON();
    const r = await activarAvisos({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "", equipo: nombreEquipo() });
    if (r.ok) { setEndpoint(sub.endpoint); setEstado("activo"); }
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
            <Button variant="outline" size="sm" disabled={trabajando || !endpoint} onClick={() => correr(() => probarAviso(endpoint ?? ""))}>
              {trabajando && <Loader2 className="animate-spin" />} Enviar uno de prueba
            </Button>
            <Button variant="ghost" size="sm" disabled={trabajando} onClick={quitar}>Desactivar</Button>
          </div>
        )}
        {mensaje && <p role="status" className={mensaje.ok ? "text-ok-texto" : "text-alerta-texto"}>{mensaje.texto}</p>}
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
