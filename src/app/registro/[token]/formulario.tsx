"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Building2, Check, CheckCircle2, FileDown, Loader2, Send, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { conArticulo, ESTADO_CIVIL, LATERALIDAD, NIVEL_EDUCATIVO, PREGUNTA_HABITO, TURNOS, valorHabito } from "@/lib/solicitudes-paciente";
import { enviarRegistro } from "./acciones";

// registrado: el enlace es para un trabajador que ya tiene ficha; faltan = lo que su ficha no tiene; verificar = pide los
// 4 últimos números de su cédula antes de ver documentos (20261030918000)
// solo_registro: el no registrado llena solo sus datos de registro, sin consulta (20261030929000)
export type CatalogoRegistro = { remitente: string; registrado?: boolean; solo_registro?: boolean; verificar?: boolean | null; faltan?: string[] | null; antecedentes: { id: string; nombre: string; grupo: string }[]; habitos: { clave: string; nombre: string }[] };
type Props = { token: string; servicio: string; telefono?: string | null; empresa: string | null; motivos: { id: string; nombre: string }[]; hoy: string; maximo: string; catalogo: CatalogoRegistro | null; saludo?: string | null };

const GRUPO_ANTECEDENTE: Record<string, string> = { personal: "¿Tiene o ha tenido alguna de estas?", familiar: "¿Alguien de su familia (padres, hermanos, abuelos) tiene o tuvo…?" };
const PRIVADO = "Esto solo lo ve su médico; su empresa no ve sus antecedentes ni diagnósticos.";
const tituloGrupo = (g: string) => GRUPO_ANTECEDENTE[g] ?? g.charAt(0).toUpperCase() + g.slice(1);

// Botones de una sola opción (más rápidos que una lista en el celular)
function Opciones<T extends string>({ etiqueta, valor, opciones, alCambiar }: { etiqueta: string; valor: T | ""; opciones: { v: T; t: React.ReactNode }[]; alCambiar: (v: T | "") => void }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} onClick={() => alCambiar(valor === o.v ? "" : o.v)}
          className={cn("flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition sm:min-h-10",
            valor === o.v ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-foreground hover:border-primary")}>
          {valor === o.v && <Check className="size-4" />} {o.t}
        </button>
      ))}
    </div>
  );
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm motion-safe:animate-aparecer [animation-delay:120ms]">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {ayuda && <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

// Lista de opciones como botones (estado civil, instrucción, mano)
const opcionesDe = <T extends string>(o: Record<T, string>) => (Object.entries(o) as [T, string][]).map(([v, t]) => ({ v, t }));

// Trabajador ya registrado: no escribe nada si su ficha está completa; si falta algo, se le pide solo eso
function FormularioRegistrado({ token, hoy, faltan, verificar, telefono }: { token: string; hoy: string; faltan: string[]; verificar: boolean; telefono?: string | null }) {
  const [sexo, setSexo] = useState<"F" | "M" | "">("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();
  const pide = (c: string) => faltan.includes(c);
  const enviar = (form: HTMLFormElement) => {
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (pide("sexo") && !sexo) return setError("Indique su sexo.");
    setError(null);
    iniciar(async () => {
      const r = await enviarRegistro(token, { ...f, ...(pide("sexo") ? { sexo } : {}) });
      if (!r.ok) return setError(r.mensaje);
      router.refresh();
    });
  };
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enviar(e.currentTarget); }}>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sitio web<input name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {verificar && (
        <Seccion titulo="Confirme que es usted" ayuda="Así nadie más puede abrir sus documentos si este enlace llega a otra persona.">
          <div>
            <Label htmlFor="ultimos4" className="mb-1.5">Últimos 4 números de su cédula *</Label>
            <Input id="ultimos4" name="ultimos4" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off"
              placeholder="Ej.: 5678" className="h-11 w-32 text-center text-lg tracking-[0.4em]" />
          </div>
        </Seccion>
      )}
      {faltan.length > 0 && (
        <Seccion titulo="Complete su ficha" ayuda="Ya tiene ficha con nosotros. Solo nos falta esto:">
          {pide("cedula") && (
            <div>
              <Label htmlFor="cedula" className="mb-1.5">Cédula *</Label>
              <Input id="cedula" name="cedula" required inputMode="text" autoComplete="off" placeholder="Ej.: V-12345678" maxLength={14} className="h-11 text-base" />
            </div>
          )}
          {pide("fecha_nacimiento") && (
            <div>
              <Label htmlFor="fecha_nacimiento" className="mb-1.5">Fecha de nacimiento *</Label>
              <Input id="fecha_nacimiento" name="fecha_nacimiento" type="date" required min="1900-01-01" max={hoy} autoComplete="bday" className="h-11 text-base" />
            </div>
          )}
          {pide("sexo") && (
            <div>
              <span className="mb-1.5 block text-sm font-medium">Sexo *</span>
              <Opciones etiqueta="Sexo" valor={sexo} alCambiar={setSexo} opciones={[{ v: "F", t: "Femenino" }, { v: "M", t: "Masculino" }]} />
            </div>
          )}
          {pide("telefono") && (
            <div>
              <Label htmlFor="telefono" className="mb-1.5">Celular (WhatsApp) *</Label>
              <Input id="telefono" name="telefono" type="tel" required inputMode="tel" autoComplete="tel" placeholder="Ej.: 0414-1234567" maxLength={20} className="h-11 text-base" />
            </div>
          )}
          {pide("direccion") && (
            <div>
              <Label htmlFor="direccion" className="mb-1.5">Dirección *</Label>
              <Input id="direccion" name="direccion" required autoComplete="street-address" maxLength={300} className="h-11 text-base" />
            </div>
          )}
        </Seccion>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">
          {telefono && error.startsWith("Hiciste demasiados intentos")
            ? <>{error.replace(/\.$/, "")}: <a className="font-medium underline" href={`tel:${telefono}`}>{telefono}</a>.</>
            : error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" /> : <FileDown />} {faltan.length ? "Guardar y ver mis documentos" : "Ver mis documentos"}
      </Button>
    </form>
  );
}

export function FormularioRegistro({ token, servicio, telefono, empresa, motivos, hoy, maximo, catalogo, saludo }: Props) {
  if (catalogo?.registrado) return <FormularioRegistrado token={token} hoy={hoy} faltan={catalogo.faltan ?? []} verificar={Boolean(catalogo.verificar)} telefono={telefono} />;
  if (catalogo?.solo_registro) return <FormularioCorto token={token} servicio={servicio} empresa={empresa} hoy={hoy} saludo={saludo} />;
  return <FormularioCompleto token={token} servicio={servicio} empresa={empresa} motivos={motivos} hoy={hoy} maximo={maximo} catalogo={catalogo} saludo={saludo} />;
}

// «Solo registro»: los datos para su ficha y nada más (1 minuto). Sus documentos aparecen apenas los guarda.
function FormularioCorto({ token, servicio, empresa, hoy, saludo }: { token: string; servicio: string; empresa: string | null; hoy: string; saludo?: string | null }) {
  const [sexo, setSexo] = useState<"F" | "M" | "">("");
  const [particular, setParticular] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();
  if (listo !== null) {
    return (
      <section role="status" className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-ok" />
        <h2 className="text-xl font-semibold">¡Listo{listo ? `, ${listo}` : ""}!</h2>
        <p className="text-sm text-muted-foreground">{servicio} recibió sus datos.</p>
        <p className="text-xs text-muted-foreground">Ya puede cerrar esta página.</p>
      </section>
    );
  }
  const enviar = (form: HTMLFormElement) => {
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    // Lleva al primer dato que falta y dice cuál (Diseño, #348): el botón nunca se ve apagado sin explicación
    const faltan: [string, string][] = [
      ["nombres", "Falta su nombre."], ["apellidos", "Faltan sus apellidos."], ["cedula", "Falta su cédula."],
      ["fecha_nacimiento", "Falta su fecha de nacimiento."], ["telefono", "Falta su celular."],
      ...(particular ? [] : [...(empresa ? [] : [["empresa", "Escriba la empresa donde trabaja."] as [string, string]]), ["cargo", "Escriba su cargo en la empresa."] as [string, string]]),
      ["acepto", "Marque la autorización para continuar."],
    ];
    form.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
    const falta = faltan.find(([k]) => !(f[k] ?? "").trim());
    if (falta) {
      const campo = form.elements.namedItem(falta[0]) as HTMLElement | null;
      campo?.setAttribute("aria-invalid", "true");
      campo?.focus();
      return setError(falta[1]);
    }
    setError(null);
    iniciar(async () => {
      const r = await enviarRegistro(token, { ...f, sexo, tipo: particular ? "particular" : "empresa", ...(empresa && !f.empresa ? { empresa } : {}), acepto: "" });
      if (!r.ok) return setError(r.mensaje);
      // Con documentos preparados, la página vuelve a pedirse y los muestra para descargar
      if (r.documentos) router.refresh();
      else setListo(saludo?.trim() || f.nombres?.trim().replace(/\s+/g, " ") || "");
    });
  };
  return (
    <form noValidate className="space-y-4 [&_[aria-invalid=true]]:border-destructive [&_[aria-invalid=true]]:ring-2 [&_[aria-invalid=true]]:ring-destructive/30" onSubmit={(e) => { e.preventDefault(); enviar(e.currentTarget); }}>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sitio web<input name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <Seccion titulo="Sus datos" ayuda="Así salen sus documentos con su nombre.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nombres" className="mb-1.5">Nombres *</Label>
            <Input id="nombres" name="nombres" required autoComplete="given-name" maxLength={80} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="apellidos" className="mb-1.5">Apellidos *</Label>
            <Input id="apellidos" name="apellidos" required autoComplete="family-name" maxLength={80} className="h-11 text-base" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cedula" className="mb-1.5">Cédula *</Label>
            <Input id="cedula" name="cedula" required autoComplete="off" placeholder="Ej.: V-12345678" maxLength={14} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="fecha_nacimiento" className="mb-1.5">Fecha de nacimiento *</Label>
            <Input id="fecha_nacimiento" name="fecha_nacimiento" type="date" required min="1900-01-01" max={hoy} autoComplete="bday" className="h-11 text-base" />
            <p className="mt-1 text-xs text-muted-foreground">Día / mes / año</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="telefono" className="mb-1.5">Celular (WhatsApp) *</Label>
            <Input id="telefono" name="telefono" type="tel" required inputMode="tel" autoComplete="tel" placeholder="Ej.: 0414-1234567" maxLength={20} className="h-11 text-base" />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium">Sexo</span>
            <Opciones etiqueta="Sexo" valor={sexo} alCambiar={setSexo} opciones={[{ v: "F", t: "Femenino" }, { v: "M", t: "Masculino" }]} />
          </div>
        </div>
        {!particular && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="empresa" className="mb-1.5">Empresa donde trabajas{empresa ? "" : " *"}</Label>
              <Input id="empresa" name="empresa" defaultValue={empresa ?? ""} maxLength={120} className="h-11 text-base" />
            </div>
            <div>
              <Label htmlFor="cargo" className="mb-1.5">Cargo *</Label>
              <Input id="cargo" name="cargo" maxLength={120} placeholder="Ej.: operador de planta" className="h-11 text-base" />
            </div>
          </div>
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={particular} onChange={(e) => setParticular(e.target.checked)} className="size-5 shrink-0 accent-primary" />
          No trabajo en una empresa (vengo por mi cuenta)
        </label>
      </Seccion>
      <label className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <input type="checkbox" name="acepto" className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span>Autorizo a {servicio} a guardar estos datos para atenderme. Solo los ve su personal de salud.</span>
      </label>
      {error && <p role="alert" className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">{error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" /> : <Send />} Guardar mis datos
      </Button>
    </form>
  );
}

function FormularioCompleto({ token, servicio, empresa, motivos, hoy, maximo, catalogo, saludo }: Props) {
  const [sexo, setSexo] = useState<"F" | "M" | "">("");
  const [tipo, setTipo] = useState<"particular" | "empresa" | "">(empresa ? "empresa" : "");
  const [motivo, setMotivo] = useState("");
  const [turno, setTurno] = useState<"manana" | "tarde" | "">("");
  const [civil, setCivil] = useState<keyof typeof ESTADO_CIVIL | "">("");
  const [instruccion, setInstruccion] = useState<keyof typeof NIVEL_EDUCATIVO | "">("");
  const [mano, setMano] = useState<keyof typeof LATERALIDAD | "">("");
  // Antecedentes marcados (id → detalle) y hábitos respondidos (clave → sí/no y detalle)
  const [antecedentes, setAntecedentes] = useState<Record<string, string>>({});
  const [habitos, setHabitos] = useState<Record<string, { si: boolean | null; detalle: string }>>({});
  const remitente = catalogo?.remitente ?? servicio;
  const grupos = [...new Set((catalogo?.antecedentes ?? []).map((a) => a.grupo))].sort((a, b) => (a === "personal" ? -1 : b === "personal" ? 1 : a === "familiar" ? -1 : 0));
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const router = useRouter();

  if (listo !== null) {
    return (
      <section role="status" className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-ok" />
        <h2 className="text-xl font-semibold">¡Listo{listo ? `, ${listo}` : ""}!</h2>
        <p className="text-sm text-muted-foreground">{servicio} recibió sus datos. Le confirmaremos el día y la hora de su consulta por WhatsApp.</p>
        <p className="text-xs text-muted-foreground">Ya puede cerrar esta página.</p>
      </section>
    );
  }

  const enviar = (form: HTMLFormElement) => {
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (!tipo) return setError("Indique si viene por su cuenta o de una empresa.");
    if ((f.motivo ?? "").trim().length < 3) return setError(`Cuéntenos qué lo motiva a consultar con ${conArticulo(remitente)}.`);
    if (!f.acepto) return setError("Marque la autorización para que el servicio use sus datos.");
    setError(null);
    iniciar(async () => {
      const r = await enviarRegistro(token, { ...f, sexo, tipo, motivo_id: motivo, turno, estado_civil: civil, nivel_educativo: instruccion, lateralidad: mano, acepto: "" }, {
        antecedentes: Object.entries(antecedentes).map(([id, detalle]) => ({ id, detalle })),
        habitos: (catalogo?.habitos ?? []).flatMap((h) => {
          const r = habitos[h.clave];
          if (!r) return [];
          const valor = h.clave in PREGUNTA_HABITO ? (r.si === null ? "" : valorHabito(h.clave, r.si, r.detalle)) : r.detalle.trim();
          return valor ? [{ clave: h.clave, valor }] : [];
        }),
      });
      if (!r.ok) return setError(r.mensaje);
      // Con documentos preparados: la página vuelve a pedirse y muestra «Puede descargar…»
      if (r.documentos) router.refresh();
      else setListo(saludo?.trim() || f.nombres?.trim().replace(/\s+/g, " ") || "");
    });
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enviar(e.currentTarget); }}>
      {/* Trampa para robots: invisible para las personas */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sitio web<input name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Seccion titulo="Sus datos">
        <div>
          <Label htmlFor="cedula" className="mb-1.5">Cédula *</Label>
          <Input id="cedula" name="cedula" required inputMode="text" autoComplete="off" placeholder="Ej.: V-12345678" maxLength={14} className="h-11 text-base" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="nombres" className="mb-1.5">Nombres *</Label>
            <Input id="nombres" name="nombres" required autoComplete="given-name" maxLength={80} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="apellidos" className="mb-1.5">Apellidos *</Label>
            <Input id="apellidos" name="apellidos" required autoComplete="family-name" maxLength={80} className="h-11 text-base" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fecha_nacimiento" className="mb-1.5">Fecha de nacimiento *</Label>
            <Input id="fecha_nacimiento" name="fecha_nacimiento" type="date" required min="1900-01-01" max={hoy} autoComplete="bday" className="h-11 text-base" />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium">Sexo</span>
            <Opciones etiqueta="Sexo" valor={sexo} alCambiar={setSexo} opciones={[{ v: "F", t: "Femenino" }, { v: "M", t: "Masculino" }]} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="lugar_nacimiento" className="mb-1.5">Lugar de nacimiento</Label>
            <Input id="lugar_nacimiento" name="lugar_nacimiento" maxLength={80} placeholder="Ej.: Maturín, Monagas" className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="profesion" className="mb-1.5">Profesión u oficio</Label>
            <Input id="profesion" name="profesion" maxLength={80} placeholder="Ej.: soldador, contadora" className="h-11 text-base" />
          </div>
        </div>
        <div className="space-y-2">
          <span className="block text-sm font-medium">Estado civil</span>
          <Opciones etiqueta="Estado civil" valor={civil} alCambiar={setCivil} opciones={opcionesDe(ESTADO_CIVIL)} />
        </div>
        <div className="space-y-2">
          <span className="block text-sm font-medium">Hasta dónde estudiaste</span>
          <Opciones etiqueta="Instrucción" valor={instruccion} alCambiar={setInstruccion} opciones={opcionesDe(NIVEL_EDUCATIVO)} />
        </div>
        <div className="space-y-2">
          <span className="block text-sm font-medium">¿Con qué mano escribes?</span>
          <Opciones etiqueta="Mano dominante" valor={mano} alCambiar={setMano} opciones={opcionesDe(LATERALIDAD)} />
        </div>
      </Seccion>

      <Seccion titulo="¿Cómo lo contactamos?">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="telefono" className="mb-1.5">Celular (WhatsApp) *</Label>
            <Input id="telefono" name="telefono" type="tel" required inputMode="tel" autoComplete="tel" placeholder="Ej.: 0414-1234567" maxLength={20} className="h-11 text-base" />
          </div>
          <div>
            <Label htmlFor="correo" className="mb-1.5">Correo</Label>
            <Input id="correo" name="correo" type="email" autoComplete="email" maxLength={120} className="h-11 text-base" />
          </div>
        </div>
        <div>
          <Label htmlFor="direccion" className="mb-1.5">Dirección</Label>
          <Input id="direccion" name="direccion" autoComplete="street-address" maxLength={300} className="h-11 text-base" />
        </div>
      </Seccion>

      <Seccion titulo="Su consulta">
        <div className="space-y-2">
          <span className="block text-sm font-medium">¿Viene por su cuenta o de una empresa? *</span>
          <Opciones etiqueta="Tipo de paciente" valor={tipo} alCambiar={setTipo}
            opciones={[{ v: "particular", t: <><User className="size-4" /> Por mi cuenta</> }, { v: "empresa", t: <><Building2 className="size-4" /> De una empresa</> }]} />
        </div>
        {tipo === "empresa" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="empresa" className="mb-1.5">Empresa</Label>
              <Input id="empresa" name="empresa" defaultValue={empresa ?? ""} maxLength={120} className="h-11 text-base" />
            </div>
            <div>
              <Label htmlFor="cargo" className="mb-1.5">Cargo</Label>
              <Input id="cargo" name="cargo" maxLength={120} className="h-11 text-base" />
            </div>
            <div>
              <Label htmlFor="fecha_ingreso" className="mb-1.5">¿Desde cuándo trabajas allí?</Label>
              <Input id="fecha_ingreso" name="fecha_ingreso" type="date" min="1950-01-01" max={hoy} className="h-11 text-base" />
            </div>
          </div>
        )}
        {motivos.length > 0 && (
          <div className="space-y-2">
            <span className="block text-sm font-medium">¿Qué evaluación necesita?</span>
            <Opciones etiqueta="Evaluación" valor={motivo} alCambiar={setMotivo} opciones={motivos.map((m) => ({ v: m.id, t: m.nombre }))} />
          </div>
        )}
        <div>
          <Label htmlFor="motivo" className="mb-1.5 leading-snug">¿Qué lo motiva a consultar con {conArticulo(remitente)}? *</Label>
          <Textarea id="motivo" name="motivo" required minLength={3} maxLength={1000} rows={4}
            placeholder="Con sus palabras: qué siente o qué necesita y desde cuándo. Ej.: me duele la espalda desde hace un mes; o examen pre-empleo." className="text-base" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="fecha" className="mb-1.5">Día que prefieres</Label>
            <Input id="fecha" name="fecha" type="date" min={hoy} max={maximo} className="h-11 text-base" />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium">Horario</span>
            <Opciones etiqueta="Horario" valor={turno} alCambiar={setTurno} opciones={Object.entries(TURNOS).map(([v, t]) => ({ v: v as "manana" | "tarde", t }))} />
          </div>
        </div>
      </Seccion>

      {catalogo && catalogo.antecedentes.length > 0 && (
        <Seccion titulo="Su salud" ayuda="Marque solo lo que aplica. Si no sabe, déjelo en blanco: lo conversa en la consulta.">
          <p className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs"><ShieldCheck className="mt-px size-4 shrink-0 text-primary" /> {PRIVADO}</p>
          {grupos.map((g) => (
            <div key={g} className="space-y-2">
              <span className="block text-sm font-medium">{tituloGrupo(g)}</span>
              <div className="flex flex-wrap gap-2">
                {catalogo.antecedentes.filter((a) => a.grupo === g).map((a) => {
                  const marcado = a.id in antecedentes;
                  return (
                    <button key={a.id} type="button" role="checkbox" aria-checked={marcado}
                      onClick={() => setAntecedentes((x) => { const n = { ...x }; if (marcado) delete n[a.id]; else n[a.id] = ""; return n; })}
                      className={cn("flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition sm:min-h-10",
                        marcado ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary")}>
                      {marcado && <CheckCircle2 className="size-4" />} {a.nombre}
                    </button>
                  );
                })}
              </div>
              {catalogo.antecedentes.filter((a) => a.grupo === g && a.id in antecedentes).map((a) => (
                <div key={a.id}>
                  <Label htmlFor={`ant-${a.id}`} className="mb-1 text-xs text-muted-foreground">{a.nombre}: cuéntanos más (opcional)</Label>
                  <Input id={`ant-${a.id}`} value={antecedentes[a.id]} maxLength={200} className="h-10 text-base"
                    placeholder={g === "familiar" ? "¿Quién? Ej.: mi mamá" : "Ej.: desde 2019, tomo losartán"}
                    onChange={(e) => setAntecedentes((x) => ({ ...x, [a.id]: e.target.value }))} />
                </div>
              ))}
            </div>
          ))}
        </Seccion>
      )}

      {catalogo && catalogo.habitos.length > 0 && (
        <Seccion titulo="Sus hábitos" ayuda={catalogo.antecedentes.length ? undefined : PRIVADO}>
          {catalogo.habitos.map((h) => {
            const q = PREGUNTA_HABITO[h.clave];
            const r = habitos[h.clave] ?? { si: null, detalle: "" };
            const poner = (c: Partial<typeof r>) => setHabitos((x) => ({ ...x, [h.clave]: { ...r, ...c } }));
            return (
              <div key={h.clave} className="space-y-2">
                <span className="block text-sm font-medium">{q?.pregunta ?? h.nombre}</span>
                {q ? (
                  <>
                    <Opciones etiqueta={q.pregunta} valor={r.si === null ? "" : r.si ? "si" : "no"} alCambiar={(v) => poner({ si: v === "" ? null : v === "si" })}
                      opciones={[{ v: "no", t: "No" }, { v: "si", t: "Sí" }]} />
                    {r.si && <Input aria-label={q.detalle} value={r.detalle} maxLength={100} placeholder={q.detalle} className="h-10 text-base" onChange={(e) => poner({ detalle: e.target.value })} />}
                  </>
                ) : (
                  <Input aria-label={h.nombre} value={r.detalle} maxLength={120} placeholder="Escriba aquí (opcional)" className="h-10 text-base" onChange={(e) => poner({ detalle: e.target.value })} />
                )}
              </div>
            );
          })}
        </Seccion>
      )}

      <label className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <input type="checkbox" name="acepto" className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span>Autorizo a {servicio} a guardar estos datos para atenderme. Solo los ve su personal de salud.</span>
      </label>

      {error && <p role="alert" className="rounded-md bg-alerta/10 px-3 py-2 text-sm text-alerta-texto">{error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" /> : <Send />} Enviar mis datos
      </Button>
    </form>
  );
}
