"use client";

import { useEffect, useState } from "react";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmar } from "@/components/app/confirmar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  ES_ESCRITORIO, activarHuella, entrarConHuella, huellaActivaAqui, huellaActivaEscritorio, huellaDisponible,
  listarHuellas, noOfrecerHuella, quitarHuella, quitarHuellaEscritorio,
} from "@/lib/huella";

const NOMBRE = ES_ESCRITORIO ? "Windows Hello" : "huella";
const AUTO_HELLO = "zamorapp.hello.automatico";
export const AVISO_HELLO_VISTO = "zamorapp-aviso-hello";

/** Botón de la pantalla de ingreso. Grande si este equipo ya tiene huella; discreto si solo es posible. */
// «activaEnPC»: lo que el servidor de la app ya preguntó a la puerta (escritorio). En la PC de Cesar la consulta
// desde la página nunca llegaba a la puerta (30-oct) y el botón no salía; con el dato del servidor sale igual.
export function BotonEntrarHuella({ alEntrar, activaEnPC = false }: { alEntrar: () => void; activaEnPC?: boolean }) {
  const [estado, setEstado] = useState<"no" | "posible" | "activa">(ES_ESCRITORIO && activaEnPC ? "activa" : "no");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!(await huellaDisponible("ingreso"))) return;
      const activa = await huellaActivaAqui() || (ES_ESCRITORIO && activaEnPC);
      // En escritorio el botón solo aparece si alguien activó Windows Hello en esta PC
      if (activa || !ES_ESCRITORIO) setEstado(activa ? "activa" : "posible");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entrar = async () => {
    setError(null);
    setCargando(true);
    const r = await entrarConHuella(crearClienteNavegador());
    // Tras entrar el botón queda desactivado mientras la app navega: otro toque abriría una segunda sesión
    if (r.ok) { alEntrar(); return; }
    setCargando(false);
    setError(r.mensaje);
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

/**
 * Código de 6 dígitos para registrar la huella cuando la sesión entró sin él (equipo de confianza): la nube no
 * registra llaves sin ese paso. Se escribe aquí mismo y se reintenta, sin mandar a otra pantalla.
 */
function CodigoParaHuella({ mensaje, ocupado, alConfirmar, alCancelar }: { mensaje: string; ocupado: boolean; alConfirmar: (codigo: string) => void; alCancelar?: () => void }) {
  const [codigo, setCodigo] = useState("");
  const limpio = codigo.replace(/\D/g, "");
  return (
    <form className="space-y-2 text-left" onSubmit={(e) => { e.preventDefault(); if (limpio.length === 6) alConfirmar(limpio); }}>
      <label htmlFor="codigo-huella" className="block text-sm font-medium">{mensaje}</label>
      <div className="flex gap-2">
        <Input id="codigo-huella" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456"
          aria-describedby="codigo-huella-ayuda"
          className="h-11 min-w-0 flex-1 text-center font-mono text-lg tracking-widest" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        <Button type="submit" className="h-11 whitespace-nowrap" disabled={ocupado || limpio.length !== 6}>
          {ocupado ? <Loader2 className="animate-spin" /> : <Fingerprint />} Seguir
        </Button>
        {alCancelar && <Button type="button" variant="ghost" className="h-11 whitespace-nowrap" onClick={alCancelar} disabled={ocupado}>Cancelar</Button>}
      </div>
      <p id="codigo-huella-ayuda" className="text-xs text-muted-foreground">El que muestra ahora Google Authenticator o Microsoft Authenticator en tu teléfono.</p>
    </form>
  );
}

/** Se muestra una vez, justo después de entrar con contraseña: activar la huella o seguir sin ella. */
export function OfrecerHuella({ alTerminar }: { alTerminar: () => void }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pideCodigo, setPideCodigo] = useState<string | null>(null);
  // Ya se ofreció en esta apertura: el aviso del panel no la repite justo al llegar (se montaba otro botón
  // «Activar Windows Hello» mientras la activación de aquí terminaba)
  useEffect(() => { try { sessionStorage.setItem(AVISO_HELLO_VISTO, "1"); } catch { /* sin almacenamiento */ } }, []);
  const activar = async (codigo?: string) => {
    setError(null);
    setCargando(true);
    const r = await activarHuella(crearClienteNavegador(), codigo);
    setCargando(false);
    // Activada no se marca "no ofrecer": la web ya recuerda la llave y el escritorio lo sabe por la puerta (si la
    // PC se reinstala sin datos, vuelve a ofrecerla)
    if (r.ok) { alTerminar(); return; }
    if (r.pideCodigo) { setPideCodigo(r.mensaje); if (codigo) setError(r.mensaje); return; }
    setError(r.mensaje);
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
      {error && <p role="alert" className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">{error}</p>}
      <div className="flex flex-col gap-2">
        {pideCodigo ? (
          <CodigoParaHuella mensaje={pideCodigo} ocupado={cargando} alConfirmar={(c) => void activar(c)} />
        ) : (
          <Button className="h-11" onClick={() => void activar()} disabled={cargando}>
            {cargando ? <Loader2 className="animate-spin" /> : <Fingerprint />} Activar {NOMBRE}
          </Button>
        )}
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
  const [pideCodigo, setPideCodigo] = useState<string | null>(null);

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

  const hacer = async (accion: () => Promise<{ ok: true } | { ok: false; mensaje: string; pideCodigo?: true }>, exito: string) => {
    setAviso(null);
    setOcupado(true);
    const r = await accion();
    setOcupado(false);
    if (!r.ok && r.pideCodigo) {
      // Primera vez: solo aparece el campo; si el código falló, además se dice por qué
      if (pideCodigo) setAviso({ ok: false, texto: r.mensaje });
      setPideCodigo(r.mensaje);
      return;
    }
    setPideCodigo(null);
    setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.mensaje });
    if (r.ok) await cargar();
  };
  const supabase = () => crearClienteNavegador();
  const activarAqui = (codigo?: string) => hacer(() => activarHuella(supabase(), codigo), `Listo: la próxima vez entra con ${NOMBRE}.`);
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
        {aviso && <p className={aviso.ok ? "rounded-md bg-primary/10 px-3 py-2 text-primary" : "rounded-md bg-alerta/10 px-3 py-2 text-alerta-texto"}>{aviso.texto}</p>}
        {disponible && pideCodigo && !yaActiva && <CodigoParaHuella mensaje={pideCodigo} ocupado={ocupado} alConfirmar={(c) => void activarAqui(c)} alCancelar={() => { setPideCodigo(null); setAviso(null); }} />}
        {disponible && !pideCodigo && (
          <div className="flex flex-wrap gap-2">
            {yaActiva ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 font-medium text-primary"><Fingerprint className="size-4" /> Activa en esta PC</span>
                <Button variant="ghost" disabled={ocupado} onClick={() => hacer(() => quitarHuellaEscritorio(supabase()), "Esta PC volverá a pedir la contraseña.")}>Quitar de esta PC</Button>
              </>
            ) : (
              <Button disabled={ocupado} onClick={() => void activarAqui()}>
                {ocupado ? <Loader2 className="animate-spin" /> : <Fingerprint />} Activar en este equipo
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
