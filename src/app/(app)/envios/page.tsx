import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hoyCaracas } from "@/lib/fecha";
import { correoConfigurado, remitente } from "@/lib/correo";
import { empresaActivaId } from "@/lib/empresa-activa";
import { listarEmpresas } from "@/lib/empresas";
import { consultasDelDia, contarEnvios, historialEnvios, listarContactos, listarPlantillas } from "@/lib/envios";
import { obtenerSesion } from "@/lib/sesion";
import { EnvioLote } from "./envio-lote";
import { Filtros } from "./filtros";
import { ImportarContactos } from "./importar-contactos";
import { PestanasEnvios } from "./pestanas";

export const metadata: Metadata = { title: "Envíos a empresas" };
export const dynamic = "force-dynamic";
// Generar el PDF y enviar varios correos puede tardar más que el límite normal
export const maxDuration = 60;

export default async function Envios({ searchParams }: { searchParams: Promise<{ empresa?: string; fecha?: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion.clinico) notFound();
  const { empresa: pedida, fecha: f } = await searchParams;
  const fecha = f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : hoyCaracas();
  const [empresas, activa, plantillas, cuentas] = await Promise.all([listarEmpresas(), empresaActivaId(), listarPlantillas(), contarEnvios()]);
  const empresa = empresas.find((e) => e.id === pedida) ?? empresas.find((e) => e.id === activa) ?? null;
  const [consultas, contactos, historial] = empresa
    ? await Promise.all([consultasDelDia(empresa.id, fecha), listarContactos(empresa.id), historialEnvios(empresa.id)])
    : [[], [], []];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Envíos a empresas</h1>
          <p className="text-muted-foreground">Las evaluaciones del día, en PDF, al correo de la empresa o por WhatsApp. Cada envío queda registrado.</p>
        </div>
        <ImportarContactos empresas={empresas.map((e) => ({ nombre: e.razonSocial, rif: e.rif, correo: e.correo, telefono: e.telefono }))} puedeAutorizar={sesion.rol === "administrador" || sesion.rol === "gerente_medico"} />
      </div>
      <PestanasEnvios {...cuentas} />
      <Filtros empresas={empresas.map((e) => ({ id: e.id, nombre: e.razonSocial }))} empresa={empresa?.id ?? ""} fecha={fecha} />
      {empresa ? (
        <EnvioLote
          key={`${empresa.id}-${fecha}`}
          empresa={{ id: empresa.id, nombre: empresa.razonSocial }}
          fecha={fecha}
          consultas={consultas}
          contactos={contactos}
          historial={historial}
          plantillas={plantillas}
          correo={correoConfigurado() ? remitente() : null}
          puedeAutorizar={sesion.rol === "administrador" || sesion.rol === "gerente_medico"}
        />
      ) : (
        <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">Elige la empresa para ver sus evaluaciones del día.</p>
      )}
    </div>
  );
}
