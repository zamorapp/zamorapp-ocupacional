import type { Metadata } from "next";
import { opciones } from "@/lib/listas";
import { plantillasDeOrg } from "@/lib/plantillas-servidor";
import { obtenerSesion } from "@/lib/sesion";
import { Volver } from "../volver";
import { EditorPlantillas } from "./editor-plantillas";

export const metadata: Metadata = { title: "Plantillas de examen" };

const LISTAS = ["motivo_consulta", "perfil_examen_funcional", "perfil_examen_fisico", "recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente", "clasificacion_aptitud"];

export default async function Plantillas() {
  const sesion = await obtenerSesion();
  const [listas, plantillas] = await Promise.all([opciones(sesion.orgId, LISTAS), plantillasDeOrg(sesion.orgId, false)]);
  const editable = !sesion.demo && (sesion.rol === "administrador" || sesion.rol === "gerente_medico");
  // Solo motivos con código (la plantilla se enlaza por código); preventivos primero
  const motivos = listas.motivo_consulta
    .filter((m) => m.codigo)
    .sort((a, b) => Number(b.grupo === "preventivo") - Number(a.grupo === "preventivo") || a.orden - b.orden)
    .map((m) => ({ codigo: m.codigo!, nombre: m.nombre, preventivo: m.grupo === "preventivo" }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plantillas de examen</h1>
        <p className="text-muted-foreground">
          Al elegir el motivo en la consulta se precargan el examen normal, las recomendaciones y la vigencia. El botón «Perfil normal» de la consulta, además, pone la aptitud elegida aquí y marca «sin diagnósticos». El médico revisa y cambia lo que haga falta; nada se borra de lo ya escrito.
        </p>
      </div>
      {motivos.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">Conecta Supabase para editar las plantillas.</p>
      ) : (
        <EditorPlantillas motivos={motivos} plantillas={plantillas} listas={listas} editable={editable} />
      )}
    </div>
  );
}
