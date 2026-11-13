"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bot, Check, ChevronDown, CircleCheck, CircleX, Copy, Eye, FlaskConical, KeyRound, Loader2, PencilLine, Power, ShieldCheck, TriangleAlert } from "lucide-react";
import { RequiereInternet, useSinInternet } from "@/components/app/sin-internet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { apagarLlave, crearLlave, type LlaveNueva } from "./acciones";

type Llave = { id: string; nombre: string; final: string; permiso: "consultar" | "crear"; creada_en: string; vence_en: string; revocada_en: string | null; ultimo_uso_en: string | null; usos: number; encendida: boolean };
type Linea = { id: number; en: string; llave: string; accion: string; ensayo: boolean; ok: boolean; empresa: string | null; resumen: string | null; error: string | null };
export type EstadoAgentes = { local: boolean; desde: string; hasta: string; llaves: Llave[]; registro: Linea[]; total: number };

const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" }).format(new Date(iso));
const soloFecha = (iso: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeZone: "America/Caracas" }).format(new Date(iso));
const SUGERIDOS = ["Claude", "ChatGPT", "Gemini"];
const DURACIONES = [{ dias: 7, texto: "7 días" }, { dias: 30, texto: "30 días" }, { dias: 90, texto: "90 días" }];
const PROPIAS: Record<string, string> = { llave_creada: "Llave creada", llave_apagada: "Llave apagada" };

export function PantallaAgentes({ estado, titulos, consultas, creaciones }: { estado: EstadoAgentes; titulos: Record<string, string>; consultas: string[]; creaciones: string[] }) {
  const encendidas = estado.llaves.filter((l) => l.encendida);
  const [nueva, setNueva] = useState<Extract<LlaveNueva, { ok: true }> | null>(null);
  return (
    <div className="space-y-6">
      {estado.local ? <RequiereInternet texto="Las llaves y el registro viven en la nube. Aquí se ven al volver la conexión." /> : null}
      {/* Estado: de un vistazo, si la puerta está abierta */}
      <section className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-4", encendidas.length ? "border-ok/40 bg-ok/5" : "bg-muted/40")}>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", encendidas.length ? "bg-ok/15 text-ok-texto" : "bg-muted text-muted-foreground")}>
          <Bot className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <div className="font-medium">{encendidas.length ? `Puerta encendida · ${encendidas.length} llave${encendidas.length === 1 ? "" : "s"}` : "Puerta apagada"}</div>
          <p className="text-sm text-muted-foreground">
            {encendidas.length
              ? "Quien tenga una llave encendida puede entrar. Apágala cuando termines."
              : "Ningún agente puede entrar. Se enciende al crear una llave."}
          </p>
        </div>
      </section>

      {nueva ? <LlaveRecienCreada nueva={nueva} cerrar={() => setNueva(null)} /> : <CrearLlave alCrear={setNueva} llenas={encendidas.length >= 10} />}

      <Llaves llaves={estado.llaves} />
      <QuePuede consultas={consultas} creaciones={creaciones} />
      <Registro estado={estado} titulos={titulos} />
    </div>
  );
}

function CrearLlave({ alCrear, llenas }: { alCrear: (n: Extract<LlaveNueva, { ok: true }>) => void; llenas: boolean }) {
  const [nombre, setNombre] = useState("");
  const [permiso, setPermiso] = useState<"consultar" | "crear">("consultar");
  const [dias, setDias] = useState(30);
  const [error, setError] = useState("");
  const [ocupado, iniciar] = useTransition();
  const sinInternet = useSinInternet();

  const crear = () => iniciar(async () => {
    setError("");
    const r = await crearLlave(nombre, permiso, dias);
    if (r.ok) alCrear(r); else setError(r.mensaje);
  });

  return (
    <section aria-labelledby="crear-llave" className="space-y-4 rounded-xl border bg-card p-4">
      <h2 id="crear-llave" className="flex items-center gap-2 font-medium"><KeyRound className="size-4 text-primary" aria-hidden /> Crear una llave</h2>
      {sinInternet ? <RequiereInternet texto="La puerta para agentes vive en la nube: crea la llave cuando vuelva la conexión." /> : null}

      <div className="space-y-1.5">
        <Label htmlFor="llave-nombre">1. ¿Para quién es?</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="llave-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Por ejemplo: Claude" className="h-11 max-w-xs sm:h-9" />
          {SUGERIDOS.map((s) => (
            <button key={s} type="button" onClick={() => setNombre(s)}
              aria-pressed={nombre === s}
              className={cn("inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm transition hover:border-primary/50 hover:bg-primary/5 sm:min-h-8", nombre === s && "border-primary bg-primary/10 font-medium text-primary")}>
              {nombre === s ? <Check className="size-3.5" aria-hidden /> : null}{s}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">2. ¿Qué puede hacer?</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            { v: "consultar", icono: Eye, titulo: "Solo consultar", texto: "Busca y lee. No cambia nada. Ve nombres y cédulas; nada de salud." },
            { v: "crear", icono: PencilLine, titulo: "Consultar y crear", texto: "Además crea empresas, presupuestos, trabajadores y citas." },
          ] as const).map(({ v, icono: Icono, titulo, texto }) => (
            <label key={v} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition hover:border-primary/40", permiso === v && "border-primary bg-primary/5 ring-1 ring-primary/30")}>
              <input type="radio" name="permiso" value={v} checked={permiso === v} onChange={() => setPermiso(v)} className="mt-1 size-4 accent-[var(--color-primary)]" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium"><Icono className="size-4" aria-hidden /> {titulo}</span>
                <span className="block text-sm text-muted-foreground">{texto}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">3. ¿Cuánto dura?</legend>
        <div className="flex flex-wrap gap-2">
          {DURACIONES.map((d) => (
            <button key={d.dias} type="button" aria-pressed={dias === d.dias} onClick={() => setDias(d.dias)}
              className={cn("inline-flex min-h-11 items-center gap-1 rounded-md border px-4 text-sm transition hover:border-primary/50 sm:min-h-9", dias === d.dias && "border-primary bg-primary/10 font-medium text-primary")}>
              {dias === d.dias ? <Check className="size-3.5" aria-hidden /> : null}{d.texto}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Al vencer se apaga sola. La puedes apagar antes con un clic.</p>
      </fieldset>

      {error ? <p role="alert" className="rounded-md border border-alerta/40 bg-alerta/5 px-3 py-2 text-sm text-alerta-texto">{error}</p> : null}
      {llenas ? <p className="text-sm text-muted-foreground">Ya hay 10 llaves encendidas. Apaga una para crear otra.</p> : null}
      <Button size="lg" className="h-11 w-full sm:h-10 sm:w-auto" disabled={ocupado || sinInternet || llenas || nombre.trim().length < 2} onClick={crear}>
        {ocupado ? <Loader2 className="animate-spin" /> : <KeyRound />} Crear llave
      </Button>
    </section>
  );
}

function Copiar({ texto, etiqueta, principal = false }: { texto: string; etiqueta: string; principal?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const [fallo, setFallo] = useState(false);
  return (
    <div className="space-y-1">
      <Button type="button" variant={principal ? "default" : "outline"} className="h-11 w-full max-sm:min-h-11 sm:h-9 sm:w-auto"
        onClick={async () => {
          try { await navigator.clipboard.writeText(texto); setCopiado(true); setFallo(false); setTimeout(() => setCopiado(false), 4000); } catch { setFallo(true); }
        }}>
        {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : etiqueta}
      </Button>
      {fallo ? (
        <>
          <p className="text-xs text-alerta-texto">No se pudo copiar solo: toca el recuadro de abajo y cópialo a mano.</p>
          <p className="select-all break-all rounded-md border bg-background p-2 font-mono text-xs">{texto}</p>
        </>
      ) : null}
    </div>
  );
}

export function LlaveRecienCreada({ nueva, cerrar }: { nueva: Extract<LlaveNueva, { ok: true }>; cerrar: () => void }) {
  const [ver, setVer] = useState(false);
  const [seguro, setSeguro] = useState(false);
  const router = useRouter();
  const base = nueva.direccion.replace(/\/zk_[0-9a-f]+$/, "");
  return (
    <section aria-labelledby="llave-lista" className="space-y-4 rounded-xl border-2 border-primary/50 bg-primary/5 p-4">
      <div>
        <h2 id="llave-lista" className="flex items-center gap-2 font-medium"><CircleCheck className="size-5 text-ok-texto" aria-hidden /> Llave de «{nueva.nombre}» lista</h2>
        <p className="mt-1 flex items-start gap-2 text-sm text-aviso-texto"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><strong className="font-medium">Se ve solo esta vez.</strong> Cópiala ahora. No la pegues en un chat ni la mandes por WhatsApp: quien la tenga puede entrar.</span></p>
      </div>
      <div className="space-y-2 rounded-lg border bg-background p-3 text-sm">
        <h3 className="font-medium">Forma recomendada: dirección y llave por separado</h3>
        <p className="text-muted-foreground">Si tu agente tiene una casilla para la llave (cabecera «Authorization: Bearer»), usa esta: la llave no queda escrita en la dirección.</p>
        <p className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">{base}</p>
        <div className="flex flex-wrap gap-2">
          <Copiar texto={base} etiqueta="Copiar dirección" />
          <Copiar texto={nueva.llave} etiqueta="Copiar llave" principal />
        </div>
      </div>
      <details className="group rounded-lg border bg-background p-3 text-sm" open={ver} onToggle={(e) => setVer((e.target as HTMLDetailsElement).open)}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-primary hover:underline sm:min-h-0">
          Mi agente solo acepta una dirección (Claude, por ejemplo) <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2 space-y-2">
          <p className="flex items-start gap-2 text-aviso-texto"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Esta dirección lleva la llave adentro. {nueva.permiso === "crear" ? "Para esta forma conviene una llave «Solo consultar». " : ""}Si llegas a compartir la dirección, apaga la llave.</span></p>
          <Copiar texto={nueva.direccion} etiqueta="Copiar dirección con llave" />
        </div>
      </details>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>En tu agente (Claude, ChatGPT, Gemini…) abre <strong className="font-medium">Conectores</strong> y elige <strong className="font-medium">agregar conector personalizado</strong>.</li>
        <li>Pega lo que copiaste, ponle de nombre «zamorApp» y guarda.</li>
        <li>Pídele al agente: «muéstrame el resumen de zamorApp». Si responde, quedó conectado.</li>
      </ol>
      <p className="text-xs text-muted-foreground">Vence el {soloFecha(nueva.vence)}. Todo lo que haga queda en el registro de abajo.</p>
      {seguro ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">
          <span className="flex-1 basis-56">¿Ya la copiaste? Al cerrar no se vuelve a mostrar.</span>
          <Button className="h-11 sm:h-8" onClick={() => { cerrar(); router.refresh(); }}>Sí, cerrar</Button>
          <Button variant="outline" className="h-11 sm:h-8" onClick={() => setSeguro(false)}>Todavía no</Button>
        </div>
      ) : (
        <Button variant="outline" className="h-11 sm:h-9" onClick={() => setSeguro(true)}>Listo, ya la copié</Button>
      )}
    </section>
  );
}

function Llaves({ llaves }: { llaves: Llave[] }) {
  const [porApagar, setPorApagar] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ocupado, iniciar] = useTransition();
  const [verTodas, setVerTodas] = useState(false);
  const router = useRouter();
  if (!llaves.length) return null;
  const visibles = verTodas ? llaves : llaves.filter((l) => l.encendida);
  const apagadas = llaves.length - llaves.filter((l) => l.encendida).length;

  const apagar = (id: string) => iniciar(async () => {
    setError("");
    const r = await apagarLlave(id);
    if (!r.ok) setError(r.mensaje); else { setPorApagar(null); router.refresh(); }
  });

  return (
    <section aria-labelledby="llaves" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1.5">
        <h2 id="llaves" className="text-sm font-semibold uppercase tracking-[.08em] text-foreground/80">Llaves</h2>
        {apagadas > 0 ? (
          <button type="button" className="min-h-11 text-sm text-primary hover:underline sm:min-h-0" onClick={() => setVerTodas((v) => !v)}>
            {verTodas ? "Ver solo las encendidas" : "Ver también las apagadas o vencidas"}
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="rounded-md border border-alerta/40 bg-alerta/5 px-3 py-2 text-sm text-alerta-texto">{error}</p> : null}
      {!visibles.length ? <p className="text-sm text-muted-foreground">No hay llaves encendidas.</p> : null}
      <ul className="space-y-2">
        {visibles.map((l) => {
          const estado = l.encendida ? "Encendida" : l.revocada_en ? "Apagada" : "Vencida";
          return (
            <li key={l.id} className={cn("rounded-xl border bg-card p-4", !l.encendida && "opacity-70")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{l.nombre}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", l.encendida ? "bg-ok/15 text-ok-texto" : "bg-muted text-muted-foreground")}>{estado}</span>
                    <span className="rounded-full border px-2 py-0.5 text-xs">{l.permiso === "crear" ? "Consulta y crea" : "Solo consulta"}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Termina en <span className="font-mono">…{l.final}</span> · {l.encendida ? `vence el ${soloFecha(l.vence_en)}` : l.revocada_en ? `apagada el ${soloFecha(l.revocada_en)}` : `venció el ${soloFecha(l.vence_en)}`}
                    {" · "}{l.ultimo_uso_en ? `último uso ${fechaHora(l.ultimo_uso_en)} (${l.usos} ${l.usos === 1 ? "vez" : "veces"})` : "sin usar todavía"}
                  </p>
                </div>
                {l.encendida && porApagar !== l.id ? (
                  <Button variant="outline" className="h-11 sm:h-9" onClick={() => { setError(""); setPorApagar(l.id); }}><Power /> Apagar</Button>
                ) : null}
              </div>
              {porApagar === l.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">
                  <span className="flex-1 basis-56">¿Apagar la llave de «{l.nombre}»? Deja de servir al instante y no se puede volver a encender; lo que creó se queda.</span>
                  <Button variant="destructive" className="h-11 sm:h-8" disabled={ocupado} onClick={() => apagar(l.id)}>{ocupado ? <Loader2 className="animate-spin" /> : <Power />} Sí, apagar</Button>
                  <Button variant="outline" className="h-11 sm:h-8" disabled={ocupado} onClick={() => setPorApagar(null)}>Cancelar</Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QuePuede({ consultas, creaciones }: { consultas: string[]; creaciones: string[] }) {
  return (
    <details className="group rounded-xl border bg-card p-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium sm:min-h-0">
        <ShieldCheck className="size-4 text-primary" aria-hidden /> Qué puede hacer un agente y qué no
        <ChevronDown className="ml-auto size-4 transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="font-medium">Consultar</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{consultas.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
        <div>
          <div className="font-medium">Crear</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{creaciones.map((c) => <li key={c}>{c.replace(/^Crear /, "").replace(/^./, (x) => x.toUpperCase())}</li>)}</ul>
          <p className="mt-1 text-xs text-muted-foreground">Primero ensaya y te muestra; si repite una orden, no duplica. El presupuesto nace en borrador.</p>
        </div>
        <div>
          <div className="font-medium">Nunca</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>Ver o tocar historias, diagnósticos, aptitudes ni reposos</li>
            <li>Usar tu firma o tu sello</li>
            <li>Borrar o cambiar lo que ya existe</li>
            <li>Mover una cédula que está en otra empresa: se detiene y te avisa</li>
            <li>Trabajar sin internet (lo creado baja a la PC con la sincronía)</li>
          </ul>
        </div>
      </div>
    </details>
  );
}

function Registro({ estado, titulos }: { estado: EstadoAgentes; titulos: Record<string, string> }) {
  const titulo = (a: string) => PROPIAS[a] ?? titulos[a] ?? a;
  return (
    <section aria-labelledby="registro" className="space-y-3">
      <div className="border-b pb-1.5">
        <h2 id="registro" className="text-sm font-semibold uppercase tracking-[.08em] text-foreground/80">Registro</h2>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="reg-desde">Desde</Label>
          <Input id="reg-desde" type="date" name="desde" defaultValue={estado.desde} max={estado.hasta} className="h-11 sm:h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="reg-hasta">Hasta</Label>
          <Input id="reg-hasta" type="date" name="hasta" defaultValue={estado.hasta} className="h-11 sm:h-9" />
        </div>
        <Button type="submit" variant="outline" className="h-11 max-sm:min-h-11 sm:h-9">Ver</Button>
      </form>
      {!estado.registro.length ? (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">Ningún agente ha hecho nada entre esas fechas.</p>
      ) : (
        <>
          <ul className="divide-y rounded-xl border bg-card">
            {estado.registro.map((r) => (
              <li key={r.id} className="flex gap-3 p-3 text-sm">
                {r.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok-texto" aria-label="Hecho" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-alerta-texto" aria-label="Rechazado" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{titulo(r.accion)}</span>
                    {r.ensayo ? <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-xs font-medium text-info-texto"><FlaskConical className="size-3" aria-hidden /> Ensayo</span> : null}
                  </div>
                  {r.ok
                    ? (r.resumen && r.resumen !== "Consulta" ? <p className="break-words text-muted-foreground">{r.resumen}</p> : null)
                    : <p className="break-words text-alerta-texto">{r.error ?? "No se hizo."}</p>}
                  <p className="text-xs text-muted-foreground">{fechaHora(r.en)} · {r.llave}{r.empresa ? ` · ${r.empresa}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
          {estado.total > estado.registro.length ? (
            <p className="text-sm text-muted-foreground">Se muestran las {estado.registro.length} líneas más recientes de {estado.total}. Acorta las fechas para ver las demás.</p>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">El registro se guarda un año y luego se limpia solo (Configuración › Limpieza).</p>
    </section>
  );
}
