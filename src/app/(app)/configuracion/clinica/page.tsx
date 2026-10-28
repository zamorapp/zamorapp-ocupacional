import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listarEmpresas } from "@/lib/empresas";
import { itemsDeLista, listarListas, opciones, type Item } from "@/lib/listas";
import { alcancePerfil } from "@/lib/perfiles-paraclinicos";
import { plantillasDeOrg } from "@/lib/plantillas-servidor";
import { obtenerSesion } from "@/lib/sesion";
import { Volver } from "../volver";
import { AjustesClinicos } from "./ajustes-clinicos";

export const metadata: Metadata = { title: "Ajustes clínicos" };

const LISTAS = ["motivo_consulta", "perfil_examen_funcional", "perfil_examen_fisico", "recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente"];
const EDITABLES = ["grupo_paraclinicos", "recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente", "paraclinico"];

// Una sola pantalla para todo lo que se precarga al abrir una consulta: plantillas por motivo (lista
// «plantilla_examen»), perfiles de paraclínicos por empresa y motivo («grupo_paraclinicos»), recomendaciones
// y el catálogo de exámenes. No tiene tablas propias: reúne las listas y reutiliza sus editores y acciones.
export default async function AjustesClinicosPagina() {
  const sesion = await obtenerSesion();
  const editable = !sesion.demo && (sesion.rol === "administrador" || sesion.rol === "gerente_medico");
  // Solo personal clínico, administrador o gerente médico (la ruta se cierra en el servidor, no solo en el menú)
  if (!sesion.clinico && !editable) notFound();

  const [listas, plantillas, empresas, perfiles, catalogo, todas] = await Promise.all([
    opciones(sesion.orgId, LISTAS),
    plantillasDeOrg(sesion.orgId, false),
    listarEmpresas(), // con la RLS de empresas_permitidas
    itemsDeLista(sesion.orgId, "grupo_paraclinicos"),
    itemsDeLista(sesion.orgId, "paraclinico"),
    listarListas(sesion.orgId),
  ]);
  const recomendaciones = await Promise.all(
    ["recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente"].map((l) => itemsDeLista(sesion.orgId, l)),
  );

  const visibles = empresas.filter((e) => e.activa).map((e) => ({ id: e.id, nombre: e.razonSocial }));
  const idsVisibles = new Set(empresas.map((e) => e.id));
  // Quien no edita no recibe ids de empresas que no puede ver. Quien edita los recibe completos para que
  // guardar un perfil no le quite empresas que existen pero no están en su lista.
  const perfilesSeguros: Item[] = editable
    ? perfiles
    : perfiles.map((p) => ({ ...p, datos: { ...p.datos, empresas: alcancePerfil(p).empresas.filter((id) => idsVisibles.has(id)) } }));

  const motivos = listas.motivo_consulta
    .filter((m) => m.codigo)
    .sort((a, b) => Number(b.grupo === "preventivo") - Number(a.grupo === "preventivo") || a.orden - b.orden)
    .map((m) => ({ id: m.id, codigo: m.codigo!, nombre: m.nombre, preventivo: m.grupo === "preventivo" }));
  const porCodigo = new Map(todas.map((l) => [l.codigo, l]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Volver />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ajustes clínicos</h1>
        <p className="text-muted-foreground">
          Todo lo que se precarga al abrir una consulta, en un solo lugar. Elige una empresa y un motivo para ver cómo se abriría y de dónde sale cada cosa.
        </p>
      </div>
      {motivos.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-10 text-center text-muted-foreground">Conecta Supabase para ver y editar los ajustes clínicos.</p>
      ) : (
        <AjustesClinicos
          editable={editable}
          motivos={motivos}
          empresas={visibles}
          plantillas={plantillas}
          listas={listas}
          perfiles={perfilesSeguros}
          catalogo={catalogo}
          recomendaciones={recomendaciones}
          listasMeta={EDITABLES.flatMap((c) => (porCodigo.has(c) ? [porCodigo.get(c)!] : []))}
        />
      )}
    </div>
  );
}
