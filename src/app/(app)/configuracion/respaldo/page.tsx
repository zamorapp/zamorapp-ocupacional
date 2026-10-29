import type { Metadata } from "next";
import { DatabaseBackup, Laptop } from "lucide-react";
import { Semaforo } from "@/components/app/semaforo";
import { ESCRITORIO } from "@/lib/escritorio-actualizar";
import { estadoRespaldo, pruebaRestauracion } from "@/lib/respaldo";
import { obtenerSesion } from "@/lib/sesion";
import { Volver } from "../volver";
import { PantallaRespaldo } from "./pantalla";

export const metadata: Metadata = { title: "Respaldos" };

// Como la puerta (ROLES_RESPALDO): la lista de copias dice dónde está la base clínica
const VEN = ["administrador", "gerente_medico", "medico", "enfermeria"];

export default async function Respaldos() {
  const sesion = await obtenerSesion();
  const puedeConfigurar = sesion.rol === "administrador" || sesion.rol === "gerente_medico";
  const prueba = await pruebaRestauracion(sesion);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Volver />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><DatabaseBackup className="size-7 text-primary" /> Respaldos</h1>
        <p className="text-muted-foreground">
          La copia de seguridad de los datos de esta PC: aquí y, cifrada, en Google Drive. {sesion.demo && "En modo demo no se guardan cambios."}
        </p>
      </div>
      {!VEN.includes(sesion.rol ?? "") ? (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Los respaldos los ven el personal de salud y el administrador.</p>
      ) : ESCRITORIO || sesion.demo ? (
        <PantallaRespaldo puedeConfigurar={puedeConfigurar} demo={sesion.demo} prueba={prueba} />
      ) : (
        <EnLaWeb puede={puedeConfigurar} />
      )}
    </div>
  );
}

// En la web no hay base en la PC: solo se informa cómo va el respaldo del escritorio
async function EnLaWeb({ puede }: { puede: boolean }) {
  const sesion = await obtenerSesion();
  const respaldo = puede ? await estadoRespaldo(sesion) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-5 text-sm">
        <Laptop className="mt-0.5 size-5 shrink-0 text-primary" />
        <p>Los respaldos se manejan desde <strong>zamorApp Escritorio</strong>, en la PC del servicio. Ábrelo ahí y entra a Configuración › Respaldos.</p>
      </div>
      {respaldo && (
        <div className="rounded-xl border bg-card px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><Semaforo estado={respaldo.estado} /> {respaldo.titulo}</p>
          <p className="break-words text-xs text-muted-foreground">{respaldo.detalle}</p>
        </div>
      )}
    </div>
  );
}
