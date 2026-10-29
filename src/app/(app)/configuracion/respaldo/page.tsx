import type { Metadata } from "next";
import { CalendarClock, DatabaseBackup, Laptop } from "lucide-react";
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
        <EnLaWeb />
      )}
      {VEN.includes(sesion.rol ?? "") && <CopiaProgramada puede={puedeConfigurar} />}
    </div>
  );
}

// En la web no hay base en la PC: la copia de la PC se maneja desde el escritorio
function EnLaWeb() {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-5 text-sm">
      <Laptop className="mt-0.5 size-5 shrink-0 text-primary" />
      <p>La copia de la PC se maneja desde <strong>zamorApp Escritorio</strong>, en la PC del servicio. Ábrelo ahí y entra a Configuración › Respaldos.</p>
    </div>
  );
}

// El segundo respaldo, independiente del escritorio: la tarea programada de la PC copia la base de la nube y sus
// archivos (scripts/respaldo.ps1). Su estado es el mismo que ve el Inicio (estado_respaldo), una sola vez por pantalla.
async function CopiaProgramada({ puede }: { puede: boolean }) {
  const sesion = await obtenerSesion();
  const respaldo = puede ? await estadoRespaldo(sesion) : null;
  return (
    <section aria-labelledby="copia-programada" className="space-y-3 rounded-xl border bg-card p-5 text-sm">
      <h2 id="copia-programada" className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-primary" /> Copia programada de la nube</h2>
      {respaldo && (
        <div className="rounded-lg border px-3 py-2">
          <p className="flex items-center gap-2 font-medium"><Semaforo estado={respaldo.estado} /> {respaldo.titulo}</p>
          <p className="break-words text-xs text-muted-foreground">{respaldo.detalle}</p>
        </div>
      )}
      <p className="text-muted-foreground">
        Es el segundo respaldo: cada día la tarea «zamorApp respaldo» guarda la base de la nube y sus archivos nuevos en
        Documentos\zamorApp Respaldos y en Google Drive (Mi unidad\zamorApp\respaldos-zamorApp), con 30 días y uno por mes
        durante un año, y una vez por semana prueba que se restaura.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Se programa una sola vez con doble clic en «programar-respaldo.cmd», en la carpeta zamorapp-ocupacional.</li>
        <li>Para una copia manual de la nube: scripts\respaldo.ps1.</li>
      </ul>
    </section>
  );
}
