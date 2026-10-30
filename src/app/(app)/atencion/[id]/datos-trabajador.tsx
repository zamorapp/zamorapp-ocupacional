"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, History, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { antiguedad } from "@/lib/fecha";
import { actualizarDatosTrabajador, fichaDeTrabajador, type OpcionesFicha } from "../../pacientes/acciones";

type Props = { trabajadorId: string; consultaId: string; bloqueado: boolean };

const SELECT = "h-10 w-full rounded-md border bg-transparent px-3 text-sm disabled:opacity-60";
// La edad, solo en años («36 años»; un bebé no llega aquí)
const edad = (nacimiento: string) => {
  const a = antiguedad(nacimiento);
  if (!a) return null;
  const anios = /^(\d+) año/.exec(a)?.[1] ?? "0";
  return `Edad: ${anios} ${anios === "1" ? "año" : "años"}`;
};
const fechaCorta = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

function Campo({ id, etiqueta, nota, children }: { id: string; etiqueta: string; nota?: string | null; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="mb-1.5">{etiqueta}</Label>
      {children}
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

// La ficha del trabajador (como la historia del SAME) completada durante la consulta, sobre todo tras el registro
// rápido. Se guarda aparte de la consulta: cargo y dependencia nuevos se crean en la empresa del trabajador.
export function DatosTrabajador({ trabajadorId, consultaId, bloqueado }: Props) {
  const router = useRouter();
  const [op, setOp] = useState<OpcionesFicha | null>(null);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [cambiado, setCambiado] = useState(false);
  const [guardando, iniciar] = useTransition();

  useEffect(() => {
    fichaDeTrabajador(trabajadorId)
      .then((r) => { setOp(r); setF(r?.ficha ?? {}); })
      .catch(() => setOp(null))
      .finally(() => setCargando(false));
  }, [trabajadorId]);

  if (cargando) return <div role="status" aria-label="Cargando la ficha" className="h-40 animate-pulse rounded-md bg-muted/50" />;
  if (!op) return <p className="text-sm text-muted-foreground">No se pudo leer la ficha del trabajador. Vuelve a abrir la consulta.</p>;

  const v = (k: string) => f[k] ?? "";
  const poner = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setCambiado(true);
    setResultado(null);
  };
  const cambioDeCargo = Boolean(op.ficha.cargo) && v("cargo").trim().toLowerCase() !== op.ficha.cargo.trim().toLowerCase();
  const faltan = ["cargo", "dependencia", "sexo", "fecha_nacimiento", "fecha_ingreso_cargo"].filter((k) => !v(k)).length;

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
    <form action={guardar} className="space-y-4">
      {faltan > 0 && !bloqueado && (
        <p className="rounded-md bg-aviso/10 px-3 py-2 text-sm text-aviso-texto">
          {faltan === 1 ? "Falta un dato" : `Faltan ${faltan} datos`} de la ficha: salen en los informes, la constancia y la vigilancia.
        </p>
      )}
      <fieldset disabled={bloqueado} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo id="dt-cargo" etiqueta="Cargo" nota={cambioDeCargo ? `Cambio de cargo: «${op.ficha.cargo}» pasa al historial.` : null}>
          <Input id="dt-cargo" name="cargo" list="dt-cargos" value={v("cargo")} onChange={poner("cargo")} placeholder="Escribe o elige; se crea si no existe" className="h-10" />
          <datalist id="dt-cargos">{op.cargos.map((c) => <option key={c} value={c} />)}</datalist>
        </Campo>
        <Campo id="dt-ingreso-cargo" etiqueta="Ingreso al cargo" nota={cambioDeCargo && v("fecha_ingreso_cargo") === op.ficha.fecha_ingreso_cargo ? "Si la dejas igual, el cargo nuevo cuenta desde hoy." : antiguedad(v("fecha_ingreso_cargo")) && `Antigüedad en el cargo: ${antiguedad(v("fecha_ingreso_cargo"))}`}>
          <Input id="dt-ingreso-cargo" name="fecha_ingreso_cargo" type="date" value={v("fecha_ingreso_cargo")} onChange={poner("fecha_ingreso_cargo")} className="h-10" />
        </Campo>
        <Campo id="dt-dependencia" etiqueta="Dependencia o departamento">
          <Input id="dt-dependencia" name="dependencia" list="dt-dependencias" value={v("dependencia")} onChange={poner("dependencia")} placeholder="Escribe o elige; se crea si no existe" className="h-10" />
          <datalist id="dt-dependencias">{op.dependencias.map((c) => <option key={c} value={c} />)}</datalist>
        </Campo>
        <Campo id="dt-ingreso" etiqueta="Ingreso a la empresa" nota={antiguedad(v("fecha_ingreso")) && `Antigüedad en la empresa: ${antiguedad(v("fecha_ingreso"))}`}>
          <Input id="dt-ingreso" name="fecha_ingreso" type="date" value={v("fecha_ingreso")} onChange={poner("fecha_ingreso")} className="h-10" />
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
        <Campo id="dt-profesion" etiqueta="Profesión u oficio">
          <Input id="dt-profesion" name="profesion" value={v("profesion")} onChange={poner("profesion")} className="h-10" />
        </Campo>
        <Campo id="dt-nivel" etiqueta="Nivel educativo">
          <select id="dt-nivel" name="nivel_educativo" value={v("nivel_educativo")} onChange={poner("nivel_educativo")} className={SELECT}>{lista("nivel_educativo")}</select>
        </Campo>

        <Campo id="dt-sexo" etiqueta="Sexo">
          <select id="dt-sexo" name="sexo" value={v("sexo")} onChange={poner("sexo")} className={SELECT}>
            <option value="">Sin definir</option>
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
          </select>
        </Campo>
        <Campo id="dt-nacimiento" etiqueta="Fecha de nacimiento" nota={edad(v("fecha_nacimiento"))}>
          <Input id="dt-nacimiento" name="fecha_nacimiento" type="date" value={v("fecha_nacimiento")} onChange={poner("fecha_nacimiento")} className="h-10" />
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
            {["Diestro", "Zurdo", "Ambidiestro"].map((x) => <option key={x} value={x}>{x}</option>)}
            {v("lateralidad") && !["Diestro", "Zurdo", "Ambidiestro"].includes(v("lateralidad")) && <option value={v("lateralidad")}>{v("lateralidad")}</option>}
          </select>
        </Campo>
        <Campo id="dt-telefono" etiqueta="Teléfono">
          <Input id="dt-telefono" name="telefono" type="tel" value={v("telefono")} onChange={poner("telefono")} className="h-10" />
        </Campo>
        <Campo id="dt-correo" etiqueta="Correo">
          <Input id="dt-correo" name="correo" type="email" value={v("correo")} onChange={poner("correo")} className="h-10" />
        </Campo>
        <div className="sm:col-span-2 lg:col-span-3">
          <Campo id="dt-direccion" etiqueta="Dirección de habitación">
            <Input id="dt-direccion" name="direccion" value={v("direccion")} onChange={poner("direccion")} className="h-10" />
          </Campo>
        </div>
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
          {resultado && (
            <span role="status" className={resultado.ok ? "flex items-center gap-1 text-sm text-ok-texto" : "text-sm text-destructive"}>
              {resultado.ok && <Check className="size-4" />} {resultado.mensaje}
            </span>
          )}
          <Button type="submit" size="sm" variant={cambiado ? "default" : "outline"} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar datos del trabajador
          </Button>
        </div>
      )}
    </form>
  );
}
