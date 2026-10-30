"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nombreEquipo } from "@/lib/equipo-confianza";
import { pinValido } from "@/lib/movil/cripto";
import { NubeNavegador } from "@/lib/movil/nube-navegador";
import { RelojMovil } from "@/lib/movil/reloj";
import { abrirCopia, anotarEquipo, borrarTodo, crearCopia, hayCopia, revisarDesactivado, type Abierta } from "@/lib/movil/sesion";
import { TecladoPin } from "./pin";
import { Trabajo } from "./trabajo";

const BLOQUEO_SIN_USO = 5 * 60_000; // 5 min sin tocar la pantalla
const BLOQUEO_EN_FONDO = 60_000; // 1 min con la app en segundo plano

type Fase =
  | { f: "cargando" }
  | { f: "nueva"; error?: string }
  | { f: "pin-nuevo"; primero?: string; error?: string }
  | { f: "preparando"; texto: string }
  | { f: "bloqueada"; error?: string; ocupado?: boolean }
  | { f: "borrada"; motivo: string }
  | { f: "abierta"; a: Abierta };

export function AppMovil() {
  const [fase, setFase] = useState<Fase>({ f: "cargando" });
  const abierta = fase.f === "abierta" ? fase.a : null;

  const alRevocar = useCallback(async () => {
    await borrarTodo();
    setFase({ f: "borrada", motivo: "Este teléfono fue desactivado desde Configuración › Equipos y se borró su copia." });
  }, []);

  useEffect(() => {
    (async () => {
      if (await revisarDesactivado()) return setFase({ f: "borrada", motivo: "Este teléfono fue desactivado desde Configuración › Equipos y se borró su copia." });
      setFase((await hayCopia()) ? { f: "bloqueada" } : { f: "nueva" });
    })();
  }, []);

  const bloquear = useCallback(() => setFase((x) => (x.f === "abierta" ? { f: "bloqueada" } : x)), []);
  useBloqueoAutomatico(Boolean(abierta), bloquear);

  async function abrir(pin: string) {
    setFase({ f: "bloqueada", ocupado: true });
    const r = await abrirCopia(pin, alRevocar);
    if (r.ok) {
      setFase({ f: "abierta", a: r.abierta });
      r.abierta.motor.sincronizar().catch(() => {});
    } else if (r.borrado) setFase({ f: "borrada", motivo: "Se escribió mal el PIN 10 veces y se borró la copia del teléfono. Lo que ya se había sincronizado está a salvo en la nube." });
    else setFase({ f: "bloqueada", error: `PIN incorrecto. Quedan ${r.restantes} intentos.` });
  }

  async function preparar(pin: string) {
    const nubeTmp = new NubeNavegador(new RelojMovil());
    setFase({ f: "preparando", texto: "Revisando tu usuario…" });
    try {
      const uid = await nubeTmp.uid();
      if (!uid) throw new Error("Entra con tu usuario (con internet) y vuelve a abrir esta pantalla.");
      const org = await nubeTmp.orgAdministrador(uid);
      if (!org) throw new Error("Solo el administrador puede preparar un teléfono. Pídeselo al administrador.");
      setFase({ f: "preparando", texto: "Creando la copia cifrada…" });
      const a = await crearCopia(pin, alRevocar);
      setFase({ f: "preparando", texto: "Registrando este teléfono…" });
      await a.motor.registrar(a.nube, org, uid, `Celular · ${nombreEquipo()}`);
      await anotarEquipo(a.motor.meta.equipo!.id);
      setFase({ f: "abierta", a });
      a.motor.sincronizar().catch(() => {});
    } catch (e) {
      await borrarTodo();
      setFase({ f: "nueva", error: (e as Error).message || "No se pudo preparar el teléfono. Revisa la señal e intenta de nuevo." });
    }
  }

  if (fase.f === "abierta") return <Trabajo a={fase.a} alBloquear={bloquear} />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
      {fase.f === "cargando" && <Loader2 className="size-8 animate-spin text-primary" />}
      {fase.f === "bloqueada" && (
        <TecladoPin titulo="zamorApp sin internet" detalle="Escribe tu PIN para abrir" error={fase.error} ocupado={fase.ocupado} alListo={abrir} />
      )}
      {fase.f === "nueva" && <Presentacion error={fase.error} alEmpezar={() => setFase({ f: "pin-nuevo" })} />}
      {fase.f === "pin-nuevo" && (
        <TecladoPin
          key={fase.primero ? "2" : "1"}
          titulo={fase.primero ? "Repite el PIN" : "Crea un PIN"}
          detalle={fase.primero ? "Para confirmar que lo escribiste bien" : "De 8 a 12 números. Lo pedirá cada vez que abras esta pantalla."}
          error={fase.error}
          alListo={(pin) => {
            if (!fase.primero) {
              const malo = pinValido(pin);
              return setFase(malo ? { f: "pin-nuevo", error: malo } : { f: "pin-nuevo", primero: pin });
            }
            if (pin !== fase.primero) return setFase({ f: "pin-nuevo", error: "No coinciden. Empecemos de nuevo." });
            preparar(pin);
          }}
        />
      )}
      {fase.f === "preparando" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{fase.texto}</p>
        </div>
      )}
      {fase.f === "borrada" && (
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-alerta/10 text-alerta-texto"><ShieldCheck className="size-7" /></span>
          <p className="text-sm">{fase.motivo}</p>
          <Button onClick={() => setFase({ f: "nueva" })}>Preparar de nuevo</Button>
        </div>
      )}
    </main>
  );
}

function Presentacion({ error, alEmpezar }: { error?: string; alEmpezar: () => void }) {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const f = () => setEnLinea(navigator.onLine);
    f();
    addEventListener("online", f); addEventListener("offline", f);
    return () => { removeEventListener("online", f); removeEventListener("offline", f); };
  }, []);
  const puede = [
    "Buscar pacientes y ver su ficha e historial",
    "Registrar paciente nuevo con su número de historia",
    "Registrar consulta, diagnósticos y reposo",
    "Sincronizar solo con la nube y la PC al volver la señal",
  ];
  const noPuede = ["Firmar (se firma con un toque al volver la señal)", "Imprimir o sacar PDF", "Reportes, vigilancia, facturación y envíos"];
  return (
    <div className="w-full max-w-sm space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Smartphone className="size-7" /></span>
        <h1 className="text-xl font-semibold">Trabajar sin internet</h1>
        <p className="text-sm text-muted-foreground">Este teléfono guardará una copia cifrada de tus pacientes para atender sin señal.</p>
      </div>
      <ul className="space-y-2 rounded-xl border bg-card p-4 text-sm">
        {puede.map((t) => <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />{t}</li>)}
      </ul>
      <div className="rounded-xl bg-muted/60 p-4 text-sm">
        <p className="mb-1.5 font-medium">Todavía no hace sin señal</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{noPuede.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      <p className="text-xs text-muted-foreground">Protección: todo va cifrado con tu PIN, se bloquea a los 5 minutos, 10 PIN errados la borran y si pierdes el teléfono la borras desde Configuración › Equipos.</p>
      {error && <p className="rounded-lg bg-alerta/10 px-3 py-2 text-sm text-alerta-texto" role="alert">{error}</p>}
      {!enLinea && <p className="flex items-center gap-2 rounded-lg bg-aviso/15 px-3 py-2 text-sm text-aviso-texto"><WifiOff className="size-4" /> Para prepararlo la primera vez hace falta internet.</p>}
      <Button className="h-12 w-full text-base" disabled={!enLinea} onClick={alEmpezar}>Preparar este teléfono</Button>
    </div>
  );
}

// Bloqueo: 5 min sin tocar la pantalla, o 1 min en segundo plano. Cuenta con performance.now() (no la fecha)
function useBloqueoAutomatico(activo: boolean, bloquear: () => void) {
  const ultimo = useRef(0);
  const oculto = useRef<number | null>(null);
  useEffect(() => {
    if (!activo) return;
    ultimo.current = performance.now();
    const tocar = () => { ultimo.current = performance.now(); };
    const vis = () => {
      if (document.hidden) oculto.current = performance.now();
      else if (oculto.current != null && performance.now() - oculto.current > BLOQUEO_EN_FONDO) bloquear();
      else oculto.current = null;
    };
    const reloj = setInterval(() => { if (performance.now() - ultimo.current > BLOQUEO_SIN_USO) bloquear(); }, 15_000);
    const eventos = ["pointerdown", "keydown", "scroll"] as const;
    eventos.forEach((e) => addEventListener(e, tocar, { passive: true }));
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(reloj); eventos.forEach((e) => removeEventListener(e, tocar)); document.removeEventListener("visibilitychange", vis); };
  }, [activo, bloquear]);
}
