"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { confirmarCodigo, prepararDosPasos, type Paso } from "@/lib/dos-pasos";
import { ES_ESCRITORIO, MOTIVO_HELLO, puedeOfrecerHuella } from "@/lib/huella";
import { guardarEquipoNavegador, nombreEquipo } from "@/lib/equipo-confianza";
import { OfrecerHuella } from "@/components/app/huella";
import { VerCodigosRespaldo } from "@/components/app/codigos-respaldo";

export function FormularioDosPasos() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>({ tipo: "cargando" });
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [desdeHello, setDesdeHello] = useState(false);
  const [ofrecer, setOfrecer] = useState(false);
  const [recordar, setRecordar] = useState(true); // equipo de confianza: no pedir el código en cada entrada
  const [dias, setDias] = useState(0); // días que dura la confianza según la organización (0 = no se ofrece)
  const [respaldo, setRespaldo] = useState<string | null>(null); // perdió el teléfono: escribe un código de respaldo
  const [codigos, setCodigos] = useState<string[] | null>(null); // recién activado: códigos para guardar
  const preparado = useRef(false); // un solo código QR aunque el efecto corra dos veces

  useEffect(() => {
    if (preparado.current) return;
    preparado.current = true;
    const supabase = crearClienteNavegador();
    // Entró con Windows Hello y hay internet, pero la nube aún no tiene el segundo paso de esta cuenta
    try {
      if (sessionStorage.getItem(MOTIVO_HELLO)) { setDesdeHello(true); sessionStorage.removeItem(MOTIVO_HELLO); }
    } catch { /* sin almacenamiento */ }
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace("/login"); return; }
      setPaso(await prepararDosPasos(supabase));
      if (!ES_ESCRITORIO) supabase.rpc("dias_equipo_confianza").then(({ data }) => setDias(typeof data === "number" ? data : 0));
    })();
  }, [router]);

  async function verificar(e: React.FormEvent) {
    e.preventDefault();
    if (paso.tipo !== "activar" && paso.tipo !== "codigo") return;
    setCargando(true);
    setError(null);
    const fallo = await confirmarCodigo(crearClienteNavegador(), paso.factorId, codigo);
    if (fallo) { setCargando(false); setError(fallo); setCodigo(""); return; }
    // Equipo de confianza (decisión de Cesar): el código queda de respaldo y para revalidar cada cierto tiempo
    if (recordar && dias > 0 && !ES_ESCRITORIO) {
      const { data } = await crearClienteNavegador().rpc("confiar_equipo", { p_nombre: nombreEquipo() });
      const equipo = data as { token: string; vence: string } | null;
      if (equipo?.token) guardarEquipoNavegador(equipo.token, equipo.vence);
    }
    // Teléfono recién activado: se crean los códigos de respaldo y se muestran una sola vez
    if (paso.tipo === "activar") {
      const { data } = await crearClienteNavegador().rpc("generar_codigos_respaldo");
      if (Array.isArray(data) && data.length) { setCargando(false); setCodigos(data as string[]); return; }
    }
    await seguir();
  }

  // Ya con el segundo paso se puede registrar la huella: la próxima vez entra sin clave
  async function seguir() {
    setCodigos(null);
    if (!desdeHello && (await puedeOfrecerHuella(crearClienteNavegador()))) { setCargando(false); setOfrecer(true); return; }
    alPanel();
  }

  // Código de respaldo: borra el teléfono perdido y lleva a escanear un QR nuevo (no abre los datos por sí solo)
  async function usarRespaldo(e: React.FormEvent) {
    e.preventDefault();
    if (!respaldo?.trim()) return;
    setCargando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("usar_codigo_respaldo", { p_codigo: respaldo });
    if (error || data !== "ok") {
      setCargando(false);
      setError(data === "espera" ? "Demasiados intentos. Espera 15 minutos y vuelve a probar." : data === "incorrecto" ? "Ese código no es válido o ya se usó." : "No se pudo verificar el código. Intenta de nuevo.");
      return;
    }
    setRespaldo(null);
    setCodigo("");
    setPaso(await prepararDosPasos(supabase));
    setCargando(false);
  }

  function alPanel() {
    router.replace("/panel");
    router.refresh();
  }

  async function salir() {
    await crearClienteNavegador().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (ofrecer) return <OfrecerHuella alTerminar={alPanel} />;
  if (codigos) return <VerCodigosRespaldo codigos={codigos} alTerminar={() => void seguir()} />;
  if (paso.tipo === "cargando") return <div className="grid place-items-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (paso.tipo === "error") {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{paso.mensaje}</p>
        <Button variant="outline" className="w-full" onClick={salir}>Volver a entrar</Button>
      </div>
    );
  }

  if (respaldo !== null) {
    return (
      <form onSubmit={usarRespaldo} className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Usar un código de respaldo</h1>
          <p className="text-sm text-muted-foreground">
            Escribe uno de los 10 códigos que guardaste al activar la verificación. Después escanearás un código QR
            con tu teléfono nuevo.
          </p>
        </div>
        <Input
          autoFocus
          autoComplete="off"
          placeholder="ABCDE-23456"
          className="h-12 text-center font-mono text-xl uppercase tracking-widest"
          value={respaldo}
          onChange={(e) => { setRespaldo(e.target.value); setError(null); }}
        />
        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={cargando || respaldo.replace(/[^0-9a-z]/gi, "").length !== 10}>
          {cargando && <Loader2 className="animate-spin" />} Continuar
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          ¿Tampoco tienes los códigos? Pide a otro administrador que reinicie tu verificación (Configuración → Usuarios). ·{" "}
          <button type="button" className="text-primary hover:underline" onClick={() => { setRespaldo(null); setError(null); }}>Volver</button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={verificar} className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10">
          {paso.tipo === "activar" ? <Smartphone className="size-6 text-primary" /> : <ShieldCheck className="size-6 text-primary" />}
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{paso.tipo === "activar" ? "Activa la verificación en dos pasos" : "Verificación en dos pasos"}</h1>
          <p className="text-sm text-muted-foreground">
            {paso.tipo === "activar"
              ? "Tu cuenta administra datos de salud: además de la contraseña, pedirá un código de tu teléfono."
              : "Escribe el código de 6 dígitos que muestra la app autenticadora de tu teléfono."}
          </p>
        </div>
      </div>

      {paso.tipo === "activar" && (
        <ol className="space-y-3 text-sm">
          <li><span className="font-medium">1.</span> Instala en tu teléfono <span className="font-medium">Google Authenticator</span> o <span className="font-medium">Microsoft Authenticator</span> (gratis).</li>
          <li className="space-y-2">
            <p><span className="font-medium">2.</span> En la app toca «+» y escanea este código:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={paso.qr} alt="Código QR para la app autenticadora" className="mx-auto size-44 rounded-lg border bg-white p-2" />
            <p className="text-xs text-muted-foreground">¿No puedes escanear? Escribe esta clave en la app:</p>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-left font-mono text-xs break-all"
              onClick={() => { navigator.clipboard?.writeText(paso.secreto).then(() => setCopiado(true)).catch(() => {}); }}
            >
              {paso.secreto} <span className="flex shrink-0 items-center gap-1 font-sans text-primary"><Copy className="size-3.5" />{copiado ? "Copiada" : "Copiar"}</span>
            </button>
          </li>
          <li><span className="font-medium">3.</span> Escribe el código de 6 dígitos que aparece:</li>
        </ol>
      )}

      <div className="space-y-2">
        <Label htmlFor="codigo" className="sr-only">Código de 6 dígitos</Label>
        <Input
          id="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={7}
          placeholder="123 456"
          className="h-12 text-center font-mono text-2xl tracking-[0.3em]"
          value={codigo}
          onChange={(e) => { setCodigo(e.target.value); setError(null); }}
        />
      </div>
      {desdeHello && paso.tipo !== "activar" && (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-sm">
          Windows Hello abrió tu sesión en esta PC. Como hay internet, la nube pide una vez el código de tu teléfono para
          proteger los datos de salud. Sin internet, Windows Hello basta.
        </p>
      )}
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!ES_ESCRITORIO && dias > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>
            Confiar en este equipo por {dias} {dias === 1 ? "día" : "días"}
            <span className="block text-xs text-muted-foreground">Aquí no volverá a pedir el código hasta entonces.</span>
            <span className="block text-xs text-aviso-texto">No lo marques en un equipo compartido.</span>
          </span>
        </label>
      )}
      <Button type="submit" className="h-11 w-full" disabled={cargando || codigo.replace(/\D/g, "").length !== 6}>
        {cargando && <Loader2 className="animate-spin" />} {paso.tipo === "activar" ? "Activar y entrar" : "Entrar"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {paso.tipo === "codigo" && !ES_ESCRITORIO && (
          <><button type="button" className="text-primary hover:underline" onClick={() => { setRespaldo(""); setError(null); }}>¿Perdiste el teléfono? Usa un código de respaldo</button> · </>
        )}
        {paso.tipo === "codigo" && ES_ESCRITORIO && <>¿Perdiste el teléfono? Usa un código de respaldo en zamorapp-ocupacional.vercel.app. · </>}
        <button type="button" className="text-primary hover:underline" onClick={salir}>Salir</button>
      </p>
    </form>
  );
}
