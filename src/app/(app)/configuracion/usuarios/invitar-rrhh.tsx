"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Link2, Link2Off, Loader2, MessageCircle } from "lucide-react";
import { Aviso, Campo, CampoSelect } from "@/components/app/campo";
import { CasillasPermisos } from "@/components/app/permisos-portal";
import { confirmar } from "@/components/app/confirmar";
import { RequiereInternet, useSinInternet } from "@/components/app/sin-internet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Invitacion } from "@/lib/invitaciones";
import type { PermisoPortal } from "@/lib/permisos-portal";
import { empresaDeInvitacion, esRolEmpresa, nombreRolInvitado, ROLES_INVITABLES, type Rol } from "@/lib/sesion-roles";
import { cn } from "@/lib/utils";
import { anularInvitacion, crearInvitacion } from "../acciones";

type Empresa = { id: string; nombre: string; contactos: { nombre: string; telefono: string }[] };

const ESTADO: Record<Invitacion["estado"], { t: string; c: string }> = {
  vigente: { t: "Esperando", c: "bg-aviso/20 text-aviso-texto" },
  usada: { t: "Ya entró", c: "bg-ok/15 text-ok-texto" },
  vencida: { t: "Venció", c: "bg-muted text-muted-foreground" },
  anulada: { t: "Anulada", c: "bg-muted text-muted-foreground" },
};
const dia = (iso: string) => new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", timeZone: "America/Caracas" }).format(new Date(iso));

// Qué hace cada rol al entrar (lo que lee el administrador antes de crear el enlace)
const QUE_HACE: Partial<Record<Rol, string>> = {
  gerente_empresa: "Entra al portal de su empresa para pedir evaluaciones y ver resultados. Nunca ve diagnósticos.",
  enfermeria: "Registra atenciones de enfermería de su empresa y lee las historias del médico. No firma ni cambia lo del médico.",
  medico: "Atiende y firma consultas; ve las historias clínicas.",
  gerente_medico: "Lo del médico, más reportes, auditoría y ajustes clínicos.",
  recepcion: "Registra trabajadores, citas y llegadas. No abre historias clínicas.",
  coordinador_sst: "Accidentes, puestos de trabajo e informes de SST. No abre historias clínicas.",
  supervisor: "Consulta trabajadores y accidentes de su empresa. Solo lectura; sin datos clínicos.",
  delegado_prevencion: "Consulta trabajadores y accidentes de su empresa. Solo lectura; sin datos clínicos.",
  auditor: "Revisa la auditoría de su empresa. Solo lectura; sin datos clínicos.",
};
const SERVICIO = ROLES_INVITABLES.filter((r) => !esRolEmpresa(r));
const CLIENTE = ROLES_INVITABLES.filter((r) => esRolEmpresa(r));

// Invitación por enlace con su rol: la persona crea su cuenta desde el enlace y entra ya con el rol elegido.
// El administrador lo manda por WhatsApp desde su teléfono.
export function InvitarPorEnlace({ empresas, invitaciones, empresaInicial, rolInicial }: { empresas: Empresa[]; invitaciones: Invitacion[]; empresaInicial?: string; rolInicial?: string }) {
  const [estado, accion, creando] = useActionState(crearInvitacion, null);
  const [rol, setRol] = useState<Rol>(ROLES_INVITABLES.includes(rolInicial as Rol) ? (rolInicial as Rol) : "gerente_empresa");
  const reglaEmpresa = empresaDeInvitacion(rol);
  const esRrhh = rol === "gerente_empresa";
  const [empresaId, setEmpresaId] = useState(empresas.some((e) => e.id === empresaInicial) ? empresaInicial! : (empresas[0]?.id ?? ""));
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [permisos, setPermisos] = useState<PermisoPortal[] | null>(null);
  const [, iniciar] = useTransition();
  const sinInternet = useSinInternet();
  // Los contactos de la empresa sirven para RR. HH. y demás roles de empresa
  const contactos = esRolEmpresa(rol) ? (empresas.find((e) => e.id === empresaId)?.contactos ?? []) : [];
  const faltaEmpresa = reglaEmpresa === "obligatoria" && !empresaId;
  // A la vista solo lo que sirve (Esperando / Ya entró); anuladas y vencidas detrás de «Ver anteriores»
  // (el mantenimiento las borra solo a los 30 días si nunca se usaron)
  const [verAnteriores, setVerAnteriores] = useState(false);
  const anteriores = invitaciones.filter((i) => i.estado === "anulada" || i.estado === "vencida").length;
  const visibles = verAnteriores ? invitaciones : invitaciones.filter((i) => i.estado === "vigente" || i.estado === "usada");

  return (
    <Card id="invitar">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Link2 className="size-4" /> Invitar por enlace</CardTitle>
        <p className="text-sm text-muted-foreground">Para quien todavía no tiene cuenta: elige su rol, le llega un enlace por WhatsApp, crea su cuenta y entra ya con ese rol. Vale 7 días y un solo uso.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {sinInternet && <RequiereInternet texto="La invitación vive en la nube para que la persona la abra desde su teléfono. Conéctate para crearla." />}
        {empresas.length === 0 && reglaEmpresa === "obligatoria" && (
          <p className="text-sm">
            Primero registra la empresa en <Link href="/empresas" className="font-medium text-primary underline-offset-4 hover:underline">Empresas</Link>; luego vuelve aquí para crear el enlace.
          </p>
        )}
        <form action={accion} className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <CampoSelect id="rol" etiqueta="Rol *" value={rol} onChange={(e) => { setRol(e.target.value as Rol); setPermisos(null); }}>
              <optgroup label="Del servicio médico">{SERVICIO.map((r) => <option key={r} value={r}>{nombreRolInvitado(r)}</option>)}</optgroup>
              <optgroup label="De la empresa cliente">{CLIENTE.map((r) => <option key={r} value={r}>{r === "gerente_empresa" ? "RR. HH. de la empresa" : nombreRolInvitado(r)}</option>)}</optgroup>
            </CampoSelect>
            <p className="text-xs text-muted-foreground">{QUE_HACE[rol]}</p>
          </div>
          {reglaEmpresa !== "ninguna" ? (
            <CampoSelect id="empresa_id" etiqueta={reglaEmpresa === "obligatoria" ? "Empresa *" : "Empresa"} value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setNombre(""); setTelefono(""); }}
              ayuda={rol === "enfermeria" ? "Solo verá a los trabajadores de esta empresa." : reglaEmpresa === "opcional" ? "Sin empresa, ve todas." : undefined}>
              {reglaEmpresa === "opcional" && <option value="">Todas las empresas</option>}
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </CampoSelect>
          ) : (
            <p className="text-sm text-muted-foreground sm:pt-9">Trabaja con todas las empresas del servicio.</p>
          )}
          <Campo id="nombre" etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Quién recibe" maxLength={120} />
          <Campo id="telefono" etiqueta="WhatsApp" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="0414-1234567" />
          {esRrhh && <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <p className="text-sm font-medium">Qué podrá hacer en el portal</p>
            <CasillasPermisos nombre="permisos" valor={permisos} onChange={setPermisos} />
            <p className="text-xs text-muted-foreground">Siempre podrá ver a sus trabajadores y pedir informes o copias. Lo cambias después en «Usuarios y roles».</p>
          </div>}
          {contactos.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Contactos de la empresa:
              {contactos.map((c) => (
                <button key={c.telefono} type="button" onClick={() => { setNombre(c.nombre); setTelefono(c.telefono); }} className="rounded-full border px-2 py-0.5 hover:bg-muted">{c.nombre}</button>
              ))}
            </p>
          )}
          <div className="flex justify-end sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={creando || faltaEmpresa || sinInternet} className="h-10 w-full sm:w-auto">{creando ? <Loader2 className="animate-spin" /> : <Link2 />} Crear enlace</Button>
          </div>
        </form>

        {estado?.ok && estado.enlace ? (
          <EnlaceListo mensaje={estado.mensaje} enlace={estado.enlace} whatsapp={estado.whatsapp} />
        ) : (
          <Aviso resultado={estado} />
        )}

        {visibles.length > 0 && (
          <ul className="divide-y rounded-md border">
            {visibles.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                {/* Celular: el texto ocupa todo el renglón y el estado + «Anular» van debajo; desde sm, al lado */}
                <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <span className="block font-medium [overflow-wrap:anywhere]">{i.nombre || "Sin nombre"}</span>
                  <span className="block text-xs [overflow-wrap:anywhere]"><span className="font-medium text-primary">{nombreRolInvitado(i.rol)}</span>{i.empresa ? <span className="text-muted-foreground"> · {i.empresa}</span> : null}</span>
                  <span className="block text-xs text-muted-foreground">Creada el {dia(i.creadoEn)}{i.usadaEn ? ` · entró el ${dia(i.usadaEn)}` : i.estado === "vigente" ? ` · vence el ${dia(i.vence)}` : ""}</span>
                </span>
                <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium sm:ml-0", ESTADO[i.estado].c)}>{ESTADO[i.estado].t}</span>
                {i.estado === "vigente" && (
                  <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-0" onClick={async () => {
                    if (await confirmar({ titulo: "¿Anular este enlace?", texto: "Ya no servirá para entrar. Puedes crear otro cuando quieras.", accion: "Anular", peligro: true })) iniciar(async () => { await anularInvitacion(i.id); });
                  }}><Link2Off /> Anular</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {anteriores > 0 && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <button type="button" onClick={() => setVerAnteriores(!verAnteriores)} aria-expanded={verAnteriores} className="min-h-11 underline-offset-4 hover:underline sm:min-h-0">
              {verAnteriores ? "Ocultar anteriores" : `Ver anteriores (${anteriores})`}
            </button>
            {verAnteriores && <span>Anuladas y vencidas: se borran solas a los 30 días.</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// El enlace recién creado (solo se ve ahora): enviarlo por WhatsApp o copiarlo
export function EnlaceListo({ mensaje, enlace, whatsapp }: { mensaje: string; enlace: string; whatsapp?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-2 rounded-md bg-ok/10 p-3 text-sm">
      <p className="font-medium text-ok-texto">{mensaje}</p>
      <p className="break-all rounded bg-background px-2 py-1 font-mono text-xs">{enlace}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm"><a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Enviar por WhatsApp</a></Button>
        <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(enlace); setCopiado(true); }}>{copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar enlace"}</Button>
      </div>
    </div>
  );
}
