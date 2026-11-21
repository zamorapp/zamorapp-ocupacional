import type { Metadata } from "next";
import { listarTodosEspecialistas } from "@/lib/especialistas";
import { itemsDeLista } from "@/lib/listas";
import { obtenerSesion } from "@/lib/sesion";
import { supabaseConfigurado } from "@/lib/config";
import { Volver } from "../volver";
import { EditorEspecialistas } from "./editor";

export const metadata: Metadata = { title: "Especialistas" };
export const dynamic = "force-dynamic";

// Registro de médicos especialistas para las referencias (Cesar, 19-nov-2026): nombre y apellido,
// especialidad, dirección del consultorio (si se tiene) y contacto. Gestiona gerencia y recepción.
export default async function Especialistas() {
  const sesion = await obtenerSesion();
  const puede = !sesion.demo && Boolean(sesion.orgId) && ["administrador", "gerente_medico", "recepcion"].includes(sesion.rol ?? "");
  const [especialistas, especialidades] = puede && supabaseConfigurado
    ? await Promise.all([listarTodosEspecialistas(), itemsDeLista(sesion.orgId, "especialidad", true)])
    : [[], []];
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Especialistas</h1>
        <p className="text-muted-foreground">
          Los médicos a quienes refieres pacientes. Al hacer una referencia, la carta sale a nombre del especialista,
          con su especialidad y su consultorio. Lo que quites de aquí no toca las cartas ya emitidas.
        </p>
      </div>
      {!puede ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Solo la gerencia y la recepción registran especialistas.
        </p>
      ) : (
        <EditorEspecialistas especialistas={especialistas} especialidades={especialidades.map((e) => e.nombre)} />
      )}
    </div>
  );
}
