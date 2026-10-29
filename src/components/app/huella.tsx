"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmar } from "@/components/app/confirmar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  ES_ESCRITORIO, activarHuella, entrarConHuella, huellaActivaAqui, huellaActivaEscritorio, huellaDisponible,
  listarHuellas, noOfrecerHuella, quitarHuella, quitarHuellaEscritorio,
} from "@/lib/huella";

const NOMBRE = ES_ESCRITORIO ? "Windows Hello" : "huella";
const AUTO_HELLO = "zamorapp.hello.automatico";

/** Botón de la pantalla de ingreso. Grande si este equipo ya tiene huella; discreto si solo es posible. */
export function BotonEntrarHuella({ alEntrar }: { alEntrar: () => void }) {
  const [estado, setEstado] = useState<"no" | "posible" | "activa">("no");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!(await huellaDisponible())) return;
      const activa = await huellaActivaAqui();
      // En escritorio el botón solo aparece si alguien activó Windows Hello en esta PC
      if (activa || !ES_ESCRITORIO) setEstado(activa ? "activa" : "posible");
    })();
  }, []);

  const entrar = async () => {
    setError(null);
    setCargando(true);
    const r = await entrarConHuella(crearClienteNavegador());
    setCargando(false);
    if (r.ok) alEntrar(); else setError(r.mensaje);
  };

  // Escritorio con Windows Hello activo: al abrir el programa se pide la huella o el PIN sin tocar nada (pedido de
  // Cesar: entrar directo). Una vez por ventana: tras «Salir» o si se cancela, queda el botón y no insiste.
  useEffect(() => {
    if (!ES_ESCRITORIO || estado !== "activa") return;
    try {
      if (sessionStorage.getItem(AUTO_HELLO)) return;
      sessionStorage.setItem(AUTO_HELLO, "1");
    } catch { return; }
    void entrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (estado === "no") return null;

  return (
    <div className="space-y-3">
      {estado === "activa" ? (
        <Button type="button" variant="outline" className="h-12 w-full gap-2 border-primary/40 text-base" onClick={entrar} disabled={cargando}>
          {cargando ? <Loader2 className="animate-spin" /> : <Fingerprint className="size-5 text-primary" />}
          Entrar con {NOMBRE}
        </Button>
      ) : (
        <p className="text-center text-sm">
          <button type="button" className="inline-flex items-center gap-1.5 text-primary hover:underline" onClick={entrar} disabled={cargando}>
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />} Entrar con {NOMBRE}
          </button>
        </p>
      )}
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {estado === "activa" && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> o con tu contraseña <span className="h-px flex-1 bg-border" />
        </div>
      )}
    </div>
  );
}

/** Se muestra una vez, justo después de entrar con contraseña: activar la huella o seguir sin ella. */
export function OfrecerHuella({ alTerminar }: { alTerminar: () => void }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activar = async () => {
    setError(null);
    setCargando(true);
    const r = await activarHuella(crearClienteNavegador());
    setCargando(false);
    // Activada no se marca "no ofrecer": la web ya recuerda la llave y el escritorio lo sabe por la puerta (si la
    // PC se reinstala sin datos, vuelve a ofrecerla)
    if (r.ok) alTerminar(); else setError(r.mensaje);
  };
  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10">
        <Fingerprint className="size-8 text-primary" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">¿Entrar con {NOMBRE} la próxima vez?</p>
        <p className="text-sm text-muted-foreground">
          {ES_ESCRITORIO
            ? "Usa la huella, el rostro o el PIN de Windows en vez de la contraseña en esta PC."
            : "Usa la huella o el rostro de este equipo en vez de la contraseña. Tu huella no sale del equipo."}
        </p>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2">
        <Button className="h-11" onClick={activar} disabled={cargando}>
          {cargando ? <Loader2 className="animate-spin" /> : <Fingerprint />} Activar {NOMBRE}
        </Button>
        <Button variant="ghost" onClick={() => { void noOfrecerHuella(); alTerminar(); }} disabled={cargando}>Ahora no</Button>
      </div>
    </div>
  );
}

type Llave = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
const fecha = (iso?: string) => iso ? new Date(iso).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" }) : "nunca";

/** Tarjeta de "Mi perfil": activar la huella en este equipo y ver o quitar las ya asociadas. */
export function HuellaCuenta() {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [llaves, setLlaves] = useState<Llave[] | null>(null);
  const [activaPC, setActivaPC] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const cargar = async () => {
    const supabase = crearClienteNavegador();
    if (ES_ESCRITORIO) setActivaPC(await huellaActivaEscritorio(supabase));
    else setLlaves(await listarHuellas(supabase));
  };
  useEffect(() => {
    (async () => {
      const d = await huellaDisponible();
      setDisponible(d);
      if (d || !ES_ESCRITORIO) await cargar();
    })();
  }, []);

  const hacer = async (accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>, exito: string) => {
    setAviso(null);
    setOcupado(true);
    const r = await accion();
    setOcupado(false);
    setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.mensaje });
    if (r.ok) await cargar();
  };
  const supabase = () => crearClienteNavegador();
  const yaActiva = ES_ESCRITORIO ? activaPC : false;

  return (
    <Card id="huella">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Fingerprint className="size-5 text-primary" /> Entrar con {NOMBRE}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {ES_ESCRITORIO
            ? "En esta PC puedes entrar con la huella, el rostro o el PIN de Windows en vez de la contraseña, también sin internet."
            : "Entra con la huella o el rostro de tu celular, tablet o PC en vez de la contraseña. Actívalo en cada equipo que uses."}
        </p>
        {disponible === false && (
          <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
            {ES_ESCRITORIO ? "Esta versión del programa aún no trae la huella. Actualiza zamorApp Escritorio." : "Este equipo o navegador no tiene huella, rostro ni PIN configurado."}
          </p>
        )}
        {llaves && llaves.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {llaves.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                <Fingerprint className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.friendly_name || "Equipo"}</div>
                  <div className="text-xs text-muted-foreground">Activada el {fecha(l.created_at)} · último uso: {fecha(l.last_used_at)}</div>
                </div>
                <Button size="sm" variant="ghost" disabled={ocupado} aria-label="Quitar"
                  onClick={async () => (await confirmar({ titulo: "¿Quitar esta huella?", texto: "Ese equipo volverá a pedir la contraseña.", accion: "Quitar", peligro: true })) && hacer(() => quitarHuella(supabase(), l.id, llaves.length - 1), "Huella quitada.")}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {aviso && <p className={aviso.ok ? "rounded-md bg-primary/10 px-3 py-2 text-primary" : "rounded-md bg-destructive/10 px-3 py-2 text-destructive"}>{aviso.texto}</p>}
        {disponible && (
          <div className="flex flex-wrap gap-2">
            {yaActiva ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 font-medium text-primary"><Fingerprint className="size-4" /> Activa en esta PC</span>
                <Button variant="ghost" disabled={ocupado} onClick={() => hacer(() => quitarHuellaEscritorio(supabase()), "Esta PC volverá a pedir la contraseña.")}>Quitar de esta PC</Button>
              </>
            ) : (
              <Button disabled={ocupado} onClick={() => hacer(() => activarHuella(supabase()), `Listo: la próxima vez entra con ${NOMBRE}.`)}>
                {ocupado ? <Loader2 className="animate-spin" /> : <Fingerprint />} Activar en este equipo
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
