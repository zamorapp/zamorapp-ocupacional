"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, History, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { antiguedad } from "@/lib/fecha";
import { cn } from "@/lib/utils";
import { actualizarDatosTrabajador, fichaDeTrabajador, type OpcionesFicha } from "../../pacientes/acciones";

type Props = { trabajadorId: string; consultaId: string; bloqueado: boolean };

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-60";
const LATERALIDAD = ["Diestro", "Zurdo", "Ambidiestro"];
const fechaCorta = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
// La edad, solo en años («41 años»)
const anios = (nacimiento: string, hoy: string) => {
  const a = antiguedad(nacimiento, hoy);
  if (!a) return null;
  const n = /^(\d+) año/.exec(a)?.[1] ?? "0";
  return `${n} ${n === "1" ? "año" : "años"}`;
};
// Datos clave: si falta uno, el recuadro se abre solo y lo nombra
const CLAVE = { cargo: "cargo", fecha_ingreso_cargo: "fecha de ingreso al cargo", dependencia: "dependencia", sexo: "sexo", fecha_nacimiento: "fecha de nacimiento" } as const;

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function Campo({ id, etiqueta, nota, children, ancho }: { id: string; etiqueta: string; nota?: string | null; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={cn("min-w-0", ancho && "sm:col-span-2 lg:col-span-3")}>
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      {children}
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

// La ficha del trabajador (como la historia del SAME), plegada con su resumen y completada durante la consulta.
// Se guarda aparte de la consulta: cargo y dependencia nuevos se crean en la empresa del trabajador.
export function DatosTrabajador({ trabajadorId, consultaId, bloqueado }: Props) {
  const router = useRouter();
  const [op, setOp] = useState<OpcionesFicha | null>(null);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [cambiado, setCambiado] = useState(false);
  const [guardando, iniciar] = useTransition();

  useEffect(() => {
    fichaDeTrabajador(trabajadorId)
      .then((r) => {
        setOp(r);
        setF(r?.ficha ?? {});
        // Se abre solo si falta algún dato clave
        if (r && !bloqueado) setAbierto(Object.keys(CLAVE).some((k) => !r.ficha[k as keyof typeof CLAVE]));
      })
      .catch(() => setOp(null))
      .finally(() => setCargando(false));
  }, [trabajadorId, bloqueado]);

  // Cerrar o recargar con cambios sin guardar pregunta antes (el navegador muestra su aviso)
  useEffect(() => {
    if (!cambiado) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [cambiado]);

  if (cargando) return <div role="status" aria-label="Cargando la ficha" className="h-12 animate-pulse rounded-md bg-muted/50" />;
  if (!op) return <p className="text-sm text-muted-foreground">No se pudo leer la ficha del trabajador. Vuelve a abrir la consulta.</p>;

  const hoy = op.hoy;
  const v = (k: string) => f[k] ?? "";
  const faltan = (Object.keys(CLAVE) as (keyof typeof CLAVE)[]).filter((k) => !v(k));
  const falta = (k: string) => !bloqueado && faltan.includes(k as keyof typeof CLAVE);
  const borde = (k: string) => cn("h-10", falta(k) && "border-aviso");
  const poner = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setCambiado(true);
    setResultado(null);
  };
  const cambioDeCargo = Boolean(op.ficha.cargo) && v("cargo").trim().toLowerCase() !== op.ficha.cargo.trim().toLowerCase();
  const enCargo = antiguedad(op.ficha.fecha_ingreso_cargo, hoy);
  const edad = anios(op.ficha.fecha_nacimiento, hoy);
  const resumen = [op.ficha.cargo, op.ficha.dependencia, enCargo && `${enCargo} en el cargo`, edad, op.ficha.lateralidad].filter(Boolean) as string[];

  const guardar = (datos: FormData) =>
    iniciar(async () => {
      const r = await actualizarDatosTrabajador(trabajadorId, consultaId, datos);
      setResultado(r);
      if (r.ok) {
        setCambiado(false);
        const nueva = await fichaDeTrabajador(trabajadorId);
        if (nueva) { setOp(nueva); setF(nueva.ficha); }
        router.refresh(); // el encabezado (edad, cargo) y los riesgos del puesto toman lo nuevo
      }
    });

  const lista = (k: keyof OpcionesFicha["listas"], valorEsId = false) => (
    <>
      <option value="">Sin definir</option>
      {/* Un valor viejo que ya no está en la lista se sigue mostrando */}
      {!valorEsId && v(k) && !op.listas[k].some((i) => i.nombre === v(k)) && <option value={v(k)}>{v(k)}</option>}
      {op.listas[k].map((i) => <option key={i.id} value={valorEsId ? i.id : i.nombre}>{i.nombre}</option>)}
    </>
  );

  return (
    <details open={abierto} onToggle={(e) => setAbierto(e.currentTarget.open)} className="group">
      {/* En el celular «Editar» va arriba a la derecha y los chips debajo, a todo el ancho */}
      <summary className="flex cursor-pointer list-none flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm">
          {resumen.map((x) => <span key={x} className="whitespace-nowrap rounded-md bg-muted px-2 py-0.5">{x}</span>)}
          {!edad && !bloqueado && <span className="whitespace-nowrap rounded-md bg-aviso/15 px-2 py-0.5 text-aviso-texto">Edad: falta</span>}
          {!resumen.length && bloqueado && <span className="text-muted-foreground">Sin datos de la ficha</span>}
          {cambiado && <span className="whitespace-nowrap rounded-md bg-aviso/15 px-2 py-0.5 text-aviso-texto">Cambios sin guardar</span>}
        </div>
        <span className="flex shrink-0 items-center gap-1 self-end text-sm font-medium text-primary sm:self-auto">
          {!bloqueado && <Pencil className="size-3.5" />} {abierto ? "Cerrar" : bloqueado ? "Ver" : "Editar"}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <form action={guardar} className="mt-4 space-y-5">
        {faltan.length > 0 && !bloqueado && (
          <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">
            Falta: {faltan.map((k) => CLAVE[k]).join(", ")}. Salen en los informes, la constancia y la vigilancia.
          </p>
        )}
        <fieldset disabled={bloqueado} className="space-y-5">
          <Grupo titulo="Trabajo">
            <Campo id="dt-cargo" etiqueta="Cargo" nota={cambioDeCargo ? `Cambio de cargo: «${op.ficha.cargo}» pasa al historial.` : null}>
              <Input id="dt-cargo" name="cargo" list="dt-cargos" value={v("cargo")} onChange={poner("cargo")} placeholder="Escribe o elige; se crea si no existe" className={borde("cargo")} />
              <datalist id="dt-cargos">{op.cargos.map((c) => <option key={c} value={c} />)}</datalist>
            </Campo>
            <Campo id="dt-ingreso-cargo" etiqueta="Ingreso al cargo"
              nota={cambioDeCargo && v("fecha_ingreso_cargo") === op.ficha.fecha_ingreso_cargo ? "Si la dejas igual, el cargo nuevo cuenta desde hoy."
                : antiguedad(v("fecha_ingreso_cargo"), hoy) && `Antigüedad en el cargo: ${antiguedad(v("fecha_ingreso_cargo"), hoy)}`}>
              <Input id="dt-ingreso-cargo" name="fecha_ingreso_cargo" type="date" max={hoy} value={v("fecha_ingreso_cargo")} onChange={poner("fecha_ingreso_cargo")} className={borde("fecha_ingreso_cargo")} />
            </Campo>
            <Campo id="dt-dependencia" etiqueta="Dependencia o departamento">
              <Input id="dt-dependencia" name="dependencia" list="dt-dependencias" value={v("dependencia")} onChange={poner("dependencia")} placeholder="Escribe o elige; se crea si no existe" className={borde("dependencia")} />
              <datalist id="dt-dependencias">{op.dependencias.map((c) => <option key={c} value={c} />)}</datalist>
            </Campo>
            <Campo id="dt-ingreso" etiqueta="Ingreso a la empresa" nota={antiguedad(v("fecha_ingreso"), hoy) && `Antigüedad en la empresa: ${antiguedad(v("fecha_ingreso"), hoy)}`}>
              <Input id="dt-ingreso" name="fecha_ingreso" type="date" max={hoy} value={v("fecha_ingreso")} onChange={poner("fecha_ingreso")} className="h-10" />
            </Campo>
            <Campo id="dt-turno" etiqueta="Turno">
              <select id="dt-turno" name="turno" value={v("turno")} onChange={poner("turno")} className={SELECT}>{lista("turno")}</select>
            </Campo>
            <Campo id="dt-tipo" etiqueta="Tipo de paciente">
              <select id="dt-tipo" name="tipo_paciente_id" value={v("tipo_paciente_id")} onChange={poner("tipo_paciente_id")} className={SELECT}>{lista("tipo_paciente", true)}</select>
            </Campo>
            <Campo id="dt-ficha" etiqueta="N.º de ficha o código">
              <Input id="dt-ficha" name="ficha" value={v("ficha")} onChange={poner("ficha")} className="h-10" />
            </Campo>
          </Grupo>

          <Grupo titulo="Personales">
            <Campo id="dt-sexo" etiqueta="Sexo">
              <select id="dt-sexo" name="sexo" value={v("sexo")} onChange={poner("sexo")} className={cn(SELECT, falta("sexo") && "border-aviso")}>
                <option value="">Sin definir</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </select>
            </Campo>
            <Campo id="dt-nacimiento" etiqueta="Fecha de nacimiento" nota={anios(v("fecha_nacimiento"), hoy) && `Edad: ${anios(v("fecha_nacimiento"), hoy)}`}>
              <Input id="dt-nacimiento" name="fecha_nacimiento" type="date" max={hoy} value={v("fecha_nacimiento")} onChange={poner("fecha_nacimiento")} className={borde("fecha_nacimiento")} />
            </Campo>
            <Campo id="dt-lugar" etiqueta="Lugar de nacimiento">
              <Input id="dt-lugar" name="lugar_nacimiento" value={v("lugar_nacimiento")} onChange={poner("lugar_nacimiento")} className="h-10" />
            </Campo>
            <Campo id="dt-civil" etiqueta="Estado civil">
              <select id="dt-civil" name="estado_civil" value={v("estado_civil")} onChange={poner("estado_civil")} className={SELECT}>{lista("estado_civil")}</select>
            </Campo>
            <Campo id="dt-lateralidad" etiqueta="Lateralidad">
              <select id="dt-lateralidad" name="lateralidad" value={v("lateralidad")} onChange={poner("lateralidad")} className={SELECT}>
                <option value="">Sin definir</option>
                {LATERALIDAD.map((x) => <option key={x} value={x}>{x}</option>)}
                {v("lateralidad") && !LATERALIDAD.includes(v("lateralidad")) && <option value={v("lateralidad")}>{v("lateralidad")}</option>}
              </select>
            </Campo>
            <Campo id="dt-profesion" etiqueta="Profesión u oficio">
              <Input id="dt-profesion" name="profesion" value={v("profesion")} onChange={poner("profesion")} className="h-10" />
            </Campo>
            <Campo id="dt-nivel" etiqueta="Nivel educativo">
              <select id="dt-nivel" name="nivel_educativo" value={v("nivel_educativo")} onChange={poner("nivel_educativo")} className={SELECT}>{lista("nivel_educativo")}</select>
            </Campo>
          </Grupo>

          {/* Casi nunca hace falta en consulta: plegado aparte (los campos siguen en el formulario aunque esté cerrado) */}
          <details className="group/contacto rounded-md border px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
              Contacto {[op.ficha.telefono, op.ficha.correo].some(Boolean) ? `· ${[op.ficha.telefono, op.ficha.correo].filter(Boolean).join(" · ")}` : ""}
              <ChevronDown className="size-4 transition group-open/contacto:rotate-180" />
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campo id="dt-telefono" etiqueta="Teléfono">
                <Input id="dt-telefono" name="telefono" type="tel" value={v("telefono")} onChange={poner("telefono")} className="h-10" />
              </Campo>
              <Campo id="dt-correo" etiqueta="Correo">
                <Input id="dt-correo" name="correo" type="email" value={v("correo")} onChange={poner("correo")} className="h-10" />
              </Campo>
              <Campo id="dt-direccion" etiqueta="Dirección de habitación" ancho>
                <Input id="dt-direccion" name="direccion" value={v("direccion")} onChange={poner("direccion")} className="h-10" />
              </Campo>
            </div>
          </details>
        </fieldset>

        {op.historial.length > 0 && (
          <details className="rounded-md border px-3 py-2 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium"><History className="size-4 text-primary" /> Cargos anteriores ({op.historial.length})</summary>
            <ul className="mt-2 divide-y">
              {op.historial.map((h, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                  <span>{h.cargo}</span>
                  <span className="text-muted-foreground">{fechaCorta(h.desde)} – {fechaCorta(h.hasta)}{antiguedad(h.desde, h.hasta) && ` · ${antiguedad(h.desde, h.hasta)}`}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {!bloqueado && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {cambiado && !resultado && <span role="status" className="text-sm text-aviso-texto">Cambios sin guardar en la ficha</span>}
            {resultado && (
              <span role="status" className={resultado.ok ? "flex items-center gap-1 text-sm text-ok-texto" : "text-sm text-alerta-texto"}>
                {resultado.ok && <Check className="size-4" />} {resultado.mensaje}
              </span>
            )}
            <Button type="submit" size="sm" variant={cambiado ? "default" : "outline"} disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar datos del trabajador
            </Button>
          </div>
        )}
      </form>
    </details>
  );
}
