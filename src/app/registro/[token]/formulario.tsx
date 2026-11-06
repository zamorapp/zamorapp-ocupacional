"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Building2, CheckCircle2, Loader2, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { conArticulo, ESTADO_CIVIL, LATERALIDAD, NIVEL_EDUCATIVO, PREGUNTA_HABITO, TURNOS, valorHabito } from "@/lib/solicitudes-paciente";
import { enviarRegistro } from "./acciones";

export type CatalogoRegistro = { remitente: string; antecedentes: { id: string; nombre: string; grupo: string }[]; habitos: { clave: string; nombre: string }[] };
type Props = { token: string; servicio: string; empresa: string | null; motivos: { id: string; nombre: string }[]; hoy: string; maximo: string; catalogo: CatalogoRegistro | null };

const GRUPO_ANTECEDENTE: Record<string, string> = { personal: "¿Tienes o has tenido alguna de estas?", familiar: "¿Alguien de tu familia (padres, hermanos, abuelos) tiene o tuvo…?" };
const tituloGrupo = (g: string) => GRUPO_ANTECEDENTE[g] ?? g.charAt(0).toUpperCase() + g.slice(1);

// Botones de una sola opción (más rápidos que una lista en el celular)
function Opciones<T extends string>({ etiqueta, valor, opciones, alCambiar }: { etiqueta: string; valor: T | ""; opciones: { v: T; t: React.ReactNode }[]; alCambiar: (v: T | "") => void }) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} onClick={() => alCambiar(valor === o.v ? "" : o.v)}
          className={cn("flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition",
            valor === o.v ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary")}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
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

export function FormularioRegistro({ token, servicio, empresa, motivos, hoy, maximo, catalogo }: Props) {
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
        <p className="text-sm text-muted-foreground">{servicio} recibió tus datos. Te confirmaremos el día y la hora de tu consulta por WhatsApp.</p>
        <p className="text-xs text-muted-foreground">Ya puedes cerrar esta página.</p>
      </section>
    );
  }

  const enviar = (form: HTMLFormElement) => {
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (!tipo) return setError("Indica si vienes por tu cuenta o de una empresa.");
    if ((f.motivo ?? "").trim().length < 3) return setError(`Cuéntanos qué te motiva a consultar con ${conArticulo(remitente)}.`);
    if (!f.acepto) return setError("Marca la autorización para que el servicio use tus datos.");
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
      else setListo(f.nombres?.trim().split(/\s+/)[0] ?? "");
    });
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enviar(e.currentTarget); }}>
      {/* Trampa para robots: invisible para las personas */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sitio web<input name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Seccion titulo="Tus datos">
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

      <Seccion titulo="¿Cómo te contactamos?">
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

      <Seccion titulo="Tu consulta">
        <div className="space-y-2">
          <span className="block text-sm font-medium">¿Vienes por tu cuenta o de una empresa? *</span>
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
            <span className="block text-sm font-medium">¿Qué evaluación necesitas?</span>
            <Opciones etiqueta="Evaluación" valor={motivo} alCambiar={setMotivo} opciones={motivos.map((m) => ({ v: m.id, t: m.nombre }))} />
          </div>
        )}
        <div>
          <Label htmlFor="motivo" className="mb-1.5 leading-snug">¿Qué te motiva a consultar con {conArticulo(remitente)}? *</Label>
          <Textarea id="motivo" name="motivo" required minLength={3} maxLength={1000} rows={4}
            placeholder="Con tus palabras: qué sientes o qué necesitas y desde cuándo. Ej.: me duele la espalda desde hace un mes; o examen pre-empleo." className="text-base" />
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
        <Seccion titulo="Tu salud" ayuda="Marca solo lo que aplica. Si no sabes, déjalo en blanco: lo conversas en la consulta.">
          {grupos.map((g) => (
            <div key={g} className="space-y-2">
              <span className="block text-sm font-medium">{tituloGrupo(g)}</span>
              <div className="flex flex-wrap gap-2">
                {catalogo.antecedentes.filter((a) => a.grupo === g).map((a) => {
                  const marcado = a.id in antecedentes;
                  return (
                    <button key={a.id} type="button" role="checkbox" aria-checked={marcado}
                      onClick={() => setAntecedentes((x) => { const n = { ...x }; if (marcado) delete n[a.id]; else n[a.id] = ""; return n; })}
                      className={cn("flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition",
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
        <Seccion titulo="Tus hábitos">
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
                  <Input aria-label={h.nombre} value={r.detalle} maxLength={120} placeholder="Escribe aquí (opcional)" className="h-10 text-base" onChange={(e) => poner({ detalle: e.target.value })} />
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

      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={enviando}>
        {enviando ? <Loader2 className="animate-spin" /> : <Send />} Enviar mis datos
      </Button>
    </form>
  );
}
