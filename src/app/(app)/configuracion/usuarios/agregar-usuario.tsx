"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, Loader2, Stethoscope, UserPlus } from "lucide-react";
import { Aviso } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ETIQUETA_ROL, ROLES_EMPRESA, type Rol } from "@/lib/sesion-roles";
import { cn } from "@/lib/utils";
import { agregarUsuario } from "../acciones";

// Qué ve y qué no ve cada rol, en palabras del día a día (resumen de Manual › Usuarios)
const ROLES_SERVICIO: { rol: Rol; ve: string; nove?: string }[] = [
  { rol: "medico", ve: "Atiende y firma consultas; ve las historias clínicas." },
  { rol: "enfermeria", ve: "Registra atenciones de enfermería y ve las historias. Puedes limitarla a una empresa." },
  { rol: "gerente_medico", ve: "Lo del médico, más reportes, auditoría y ajustes clínicos." },
  { rol: "recepcion", ve: "Registra trabajadores, citas y llegadas.", nove: "No abre historias clínicas." },
  { rol: "coordinador_sst", ve: "Accidentes, puestos de trabajo e informes de SST.", nove: "No abre historias clínicas." },
  { rol: "administrador", ve: "Todo: configuración, usuarios y cobros.", nove: "Historias clínicas solo si le marcas «Clínico»." },
];
const ROLES_CLIENTE: { rol: Rol; ve: string; nove?: string }[] = [
  { rol: "gerente_empresa", ve: "Pide citas, carga la nómina y ve las aptitudes de su empresa.", nove: "Nunca ve diagnósticos, grupo sanguíneo ni discapacidad." },
  { rol: "supervisor", ve: "Consulta trabajadores y accidentes de su empresa.", nove: "Solo lectura; sin datos clínicos." },
  { rol: "delegado_prevencion", ve: "Consulta trabajadores y accidentes de su empresa.", nove: "Solo lectura; sin datos clínicos." },
  { rol: "auditor", ve: "Revisa la auditoría de su empresa.", nove: "Solo lectura; sin datos clínicos." },
  { rol: "trabajador", ve: "Solo su propia ficha (la que tiene su mismo correo).", nove: "No ve a nadie más." },
];

const TITULOS = ["¿Quién?", "¿Qué rol?", "¿De qué empresa?", "Revisar"] as const;

// Agregar usuario en pasos: correo → rol (con lo que ve y no ve) → empresa (roles de empresa; opcional para enfermería y médico) → revisar
// Enfermería y médico pueden quedar en una sola empresa (la enfermera de una empresa cliente); sin marcar, ven todas.
const LIMITABLES: Rol[] = ["enfermeria", "medico"];
export function AgregarUsuario({ empresas }: { empresas: { id: string; nombre: string }[] }) {
  const [estado, accion, enviando] = useActionState(agregarUsuario, null);
  const [paso, setPaso] = useState(0);
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<Rol | null>(null);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const entradaCorreo = useRef<HTMLInputElement>(null);
  const deEmpresa = rol ? ROLES_EMPRESA.includes(rol) : false;
  const pideEmpresa = deEmpresa || (rol ? LIMITABLES.includes(rol) : false);

  // Al agregar bien, se vuelve a empezar para el siguiente
  useEffect(() => {
    if (estado?.ok) { setPaso(0); setCorreo(""); setRol(null); setElegidas([]); }
  }, [estado]);

  const siguiente = () => {
    if (paso === 0 && !entradaCorreo.current?.reportValidity()) return;
    if (paso === 1 && !rol) return;
    if (paso === 2 && deEmpresa && !elegidas.length) return;
    setPaso(paso === 1 && !pideEmpresa ? 3 : paso + 1); // sin empresa que elegir, salta a revisar
  };
  const atras = () => setPaso(paso === 3 && !pideEmpresa ? 1 : paso - 1);
  const visibles = rol && !pideEmpresa ? [0, 1, 3] : [0, 1, 2, 3];
  const nombres = elegidas.map((id) => empresas.find((e) => e.id === id)?.nombre).filter(Boolean).join(", ");

  const Opcion = ({ r }: { r: { rol: Rol; ve: string; nove?: string } }) => (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 transition hover:bg-muted/50", rol === r.rol && "border-primary ring-1 ring-primary")}>
      <input type="radio" name="rol-elegido" checked={rol === r.rol} onChange={() => { setRol(r.rol); setElegidas([]); }} className="mt-1 size-4 accent-[var(--primary)]" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{r.rol === "gerente_empresa" ? "RR. HH. de la empresa" : ETIQUETA_ROL[r.rol]}</span>
        <span className="block text-xs text-muted-foreground">{r.ve}</span>
        {r.nove && <span className="block text-xs text-aviso-texto">{r.nove}</span>}
      </span>
    </label>
  );

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="size-4" /> Agregar usuario</CardTitle>
        {/* Celular: «Paso N de M» con barra fina; desde sm, los chips */}
        <div className="space-y-1.5 sm:hidden" aria-hidden>
          <p className="text-xs font-medium text-muted-foreground">Paso {visibles.indexOf(paso) + 1} de {visibles.length} · {TITULOS[paso]}</p>
          <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((visibles.indexOf(paso) + 1) / visibles.length) * 100}%` }} /></div>
        </div>
        <ol className="hidden flex-wrap gap-1.5 sm:flex" aria-label="Pasos">
          {TITULOS.map((t, i) => (i === 2 && rol && !pideEmpresa ? null : (
            <li key={t} aria-current={i === paso ? "step" : undefined}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                i === paso ? "border-primary bg-primary text-primary-foreground" : i < paso ? "bg-ok/10 text-ok-texto" : "text-muted-foreground")}>
              <span aria-hidden>{i < paso ? <Check className="size-3" /> : i + 1}</span>{t}
            </li>
          )))}
        </ol>
      </CardHeader>
      <CardContent>
        <form action={accion} onSubmit={(e) => { if (paso < 3) { e.preventDefault(); siguiente(); } }} className="space-y-4">
          {/* Lo que se envía: siempre presente aunque el paso no se vea */}
          <input type="hidden" name="rol" value={rol ?? ""} />
          {pideEmpresa && elegidas.map((id) => <input key={id} type="hidden" name="empresas" value={id} />)}

          <div hidden={paso !== 0} className="max-w-md">
            <label htmlFor="correo" className="mb-1.5 block text-sm font-medium">Correo con el que la persona creó su cuenta</label>
            <Input ref={entradaCorreo} id="correo" name="correo" type="email" required value={correo} onChange={(e) => setCorreo(e.target.value.trim())} className="h-10" placeholder="nombre@correo.com" />
            <p className="mt-1 text-xs text-muted-foreground">Primero la persona crea su cuenta en la pantalla de ingreso; luego la agregas aquí.</p>
          </div>

          {paso === 1 && (
            <div className="space-y-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Stethoscope className="size-4 text-primary" /> Del servicio médico</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{ROLES_SERVICIO.map((r) => <Opcion key={r.rol} r={r} />)}</div>
              <p className="flex items-center gap-1.5 pt-1 text-sm font-medium"><Building2 className="size-4 text-primary" /> De la empresa cliente (entran al portal y solo ven su empresa)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{ROLES_CLIENTE.map((r) => <Opcion key={r.rol} r={r} />)}</div>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{deEmpresa ? "Solo verá lo de la empresa que marques." : "Si atiende en una sola empresa, márcala: solo verá a esos trabajadores y sus atenciones. Sin marcar, ve todas las empresas."}</p>
              {empresas.length === 0 && <p className="text-sm">Todavía no hay empresas: regístrala primero en Empresas.</p>}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {empresas.map((e) => (
                  <label key={e.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 text-sm", elegidas.includes(e.id) && "border-primary")}>
                    <input type="checkbox" checked={elegidas.includes(e.id)} onChange={(ev) => setElegidas(ev.target.checked ? [...elegidas, e.id] : elegidas.filter((x) => x !== e.id))} className="size-4 accent-[var(--primary)]" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{e.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {paso === 3 && rol && (() => {
            const info = [...ROLES_SERVICIO, ...ROLES_CLIENTE].find((r) => r.rol === rol);
            const Fila = ({ etiqueta, n, children }: { etiqueta: string; n: number; children: React.ReactNode }) => (
              <li className="grid grid-cols-1 items-center gap-x-3 gap-y-0.5 px-3 py-2.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
                <span className="text-xs text-muted-foreground sm:text-sm">{etiqueta}</span>
                <span className="min-w-0">{children}</span>
                <Button type="button" variant="ghost" size="sm" className="-ml-3 justify-self-start sm:ml-0 sm:justify-self-auto" onClick={() => setPaso(n)}>Cambiar</Button>
              </li>
            );
            return (
              <ul className="divide-y rounded-lg border text-sm">
                <Fila etiqueta="Correo" n={0}><span className="break-all">{correo}</span></Fila>
                <Fila etiqueta="Rol" n={1}>
                  <span className="block">{rol === "gerente_empresa" ? "RR. HH. de la empresa" : ETIQUETA_ROL[rol]}</span>
                  {info?.nove && <span className="block text-xs text-aviso-texto">{info.nove}</span>}
                </Fila>
                {pideEmpresa && <Fila etiqueta="Empresa" n={2}><span className="[overflow-wrap:anywhere]">{nombres || "Todas las empresas"}</span></Fila>}
              </ul>
            );
          })()}

          <Aviso resultado={estado} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {paso > 0 && <Button type="button" variant="ghost" className="mr-auto" onClick={atras}><ChevronLeft /> Atrás</Button>}
            {paso === 1 && !rol && <p className="text-xs text-muted-foreground">Elige un rol para seguir.</p>}
            {paso === 2 && !elegidas.length && <p className="text-xs text-muted-foreground">Marca al menos una empresa para seguir.</p>}
            {paso < 3 ? (
              // Claves distintas: si React reusara el mismo botón, al pasar a «Revisar» el clic de «Siguiente» enviaría el formulario
              <Button key="siguiente" type="button" onClick={siguiente} disabled={(paso === 1 && !rol) || (paso === 2 && !elegidas.length)}>Siguiente <ChevronRight /></Button>
            ) : (
              <Button key="agregar" type="submit" disabled={enviando}>{enviando ? <Loader2 className="animate-spin" /> : <UserPlus />} Agregar usuario</Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
