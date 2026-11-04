"use client";

import { useMemo, useState } from "react";
import { Building2, ChevronDown, FlaskConical, ListChecks, Search, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Item, Lista } from "@/lib/listas";
import { alcancePerfil, casillasPerfil, perfilesSugeridos } from "@/lib/perfiles-paraclinicos";
import type { Plantilla } from "@/lib/plantillas";
import { cn } from "@/lib/utils";
import { EditorLista } from "../listas/editor-lista";
import { EditorPlantillas } from "../plantillas/editor-plantillas";
import { Asistente, type Empresa, type Motivo, type Seleccion } from "./asistente";

type Pestana = "plantillas" | "perfiles" | "recomendaciones" | "examenes";
type Origen = "propio" | "motivo" | "empresa";

const RECOMENDACIONES = [
  { lista: "recomendacion_aptitud", titulo: "Aptitud" },
  { lista: "recomendacion_empresa", titulo: "A la empresa" },
  { lista: "recomendacion_paciente", titulo: "Al trabajador" },
] as const;

// De dónde sale el perfil sugerido: propio de la empresa (y del motivo), general del motivo o general de la empresa.
// Mismo criterio que perfilesSugeridos, que es la función que usa la consulta.
function origenPerfil(p: Item, empresa: Empresa): Origen {
  if (casillasPerfil(p).pares.some((c) => c.e === empresa.id)) return "propio";
  const a = alcancePerfil(p);
  const deEmpresa = a.empresas.length ? a.empresas.includes(empresa.id) : Boolean(p.grupo && empresa.nombre.toLowerCase().includes(p.grupo.toLowerCase()));
  if (deEmpresa && a.motivos.length) return "propio";
  return deEmpresa ? "empresa" : "motivo";
}


export function AjustesClinicos(props: {
  editable: boolean;
  motivos: Motivo[];
  empresas: Empresa[];
  plantillas: Plantilla[];
  listas: Record<string, Item[]>;
  perfiles: Item[];
  catalogo: Item[];
  recomendaciones: Item[][];
  listasMeta: Lista[];
}) {
  const { editable, motivos, empresas, plantillas, listas, perfiles, catalogo, recomendaciones, listasMeta } = props;
  const activos = useMemo(() => perfiles.filter((p) => p.activo), [perfiles]);
  const [sel, setSel] = useState<Seleccion>({ empresaId: "", motivoId: motivos[0]?.id ?? "", paso: 1 });
  const [pestana, setPestana] = useState<Pestana>("perfiles");
  const [catalogos, setCatalogos] = useState(false);
  const [recomendacion, setRecomendacion] = useState<(typeof RECOMENDACIONES)[number]["lista"]>("recomendacion_aptitud");
  const [filtro, setFiltro] = useState("");

  const sugeridosDe = (e: Empresa, m: Motivo) => perfilesSugeridos(activos, { empresaId: e.id || null, empresa: e.nombre, motivoId: m.id });

  const meta = new Map(listasMeta.map((l) => [l.codigo, l]));
  const motivosLista = motivos.map((m) => ({ codigo: m.codigo, nombre: m.nombre }));
  const alcance = { empresas, motivos: motivos.map((m) => ({ id: m.id, nombre: m.nombre })), catalogo: catalogo.filter((c) => c.activo).map((c) => c.nombre) };

  const verCatalogo = (p: Pestana) => {
    setPestana(p);
    setCatalogos(true);
    requestAnimationFrame(() => document.getElementById("editores")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Matriz: primero las empresas con perfil propio; el buscador filtra por nombre
  const columnas = motivos.filter((m) => m.preventivo).slice(0, 6);
  const cols = columnas.length ? columnas : motivos.slice(0, 6);
  const filas = useMemo(() => {
    const conPropio = (e: Empresa) => activos.some((p) => casillasPerfil(p).excluir.some((c) => c.e === e.id)) || cols.some((m) => {
      const p = perfilesSugeridos(activos, { empresaId: e.id, empresa: e.nombre, motivoId: m.id })[0];
      return p && origenPerfil(p, e) !== "motivo";
    });
    const q = filtro.trim().toLowerCase();
    return empresas
      .filter((e) => !q || e.nombre.toLowerCase().includes(q))
      .map((e) => ({ e, propio: conPropio(e) }))
      .sort((a, b) => Number(b.propio) - Number(a.propio) || a.e.nombre.localeCompare(b.e.nombre))
      .slice(0, q ? 50 : 12);
  }, [empresas, activos, cols, filtro]);

  return (
    <div className="space-y-8">
      <Asistente editable={editable} motivos={motivos} empresas={empresas} plantillas={plantillas} listas={listas} perfiles={perfiles}
        sel={sel} setSel={setSel} alVerCatalogo={() => verCatalogo("perfiles")} />

      {/* Matriz empresa × motivo */}
      <section aria-labelledby="matriz" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="matriz" className="text-lg font-semibold">Cómo está cada empresa</h2>
            <p className="text-sm text-muted-foreground">Qué perfil de paraclínicos sale en cada evaluación. Toca una casilla para ajustarla en el asistente.</p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 sm:w-64">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar empresa" aria-label="Buscar empresa" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span><b className="text-ok-texto">●</b> Propio de la empresa</span>
          <span><b className="text-info-texto">●</b> General del motivo</span>
          <span>○ Sin paraclínicos</span>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Empresa</th>
                {cols.map((m) => <th key={m.id} className="px-3 py-2 font-semibold">{m.nombre}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map(({ e }) => (
                <tr key={e.id} className="border-b last:border-b-0">
                  <td className="max-w-[16rem] px-3 py-2 font-medium [overflow-wrap:anywhere]">{e.nombre}</td>
                  {cols.map((m) => {
                    const p = sugeridosDe(e, m)[0];
                    const o = p && origenPerfil(p, e);
                    const elegida = e.id === sel.empresaId && m.id === sel.motivoId;
                    return (
                      <td key={m.id} className={cn("p-0", elegida && "bg-primary/10 outline-2 -outline-offset-2 outline-primary")}>
                        <button type="button" onClick={() => { setSel({ empresaId: e.id, motivoId: m.id, paso: 3 }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          className="block w-full px-3 py-2 text-left hover:bg-muted" aria-label={`${e.nombre}, ${m.nombre}: ${p ? p.nombre : "sin perfil"}`}>
                          {p ? <span className={o === "motivo" ? "text-info-texto" : "font-medium text-ok-texto"}>● {p.nombre}</span> : <span className="text-muted-foreground">○ Ninguno</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={cols.length + 1} className="px-3 py-6 text-center text-muted-foreground">Ninguna empresa coincide.</td></tr>}
            </tbody>
          </table>
        </Card>
        {!filtro && empresas.length > filas.length && <p className="text-xs text-muted-foreground">Se muestran {filas.length} de {empresas.length} empresas, primero las que tienen perfil propio. Busca para ver otras.</p>}
      </section>

      {/* Catálogos completos: los mismos editores de Configuración, plegados para no saturar */}
      <section id="editores" className="scroll-mt-20 space-y-4">
        <button type="button" aria-expanded={catalogos} onClick={() => setCatalogos(!catalogos)}
          className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition hover:border-primary/40">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Catálogos completos</span>
            <span className="block text-sm text-muted-foreground">Crear, editar o borrar perfiles, plantillas, recomendaciones y exámenes. Lo que borres aquí desaparece para todas las empresas.</span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition", catalogos && "rotate-180")} />
        </button>
        {catalogos && <>
        <div role="tablist" aria-label="Catálogos" className="flex gap-1 overflow-x-auto border-b">
          {([
            ["perfiles", "Perfiles de paraclínicos", Building2],
            ["plantillas", "Plantillas por evaluación", Wand2],
            ["recomendaciones", "Recomendaciones", ListChecks],
            ["examenes", "Exámenes y rangos", FlaskConical],
          ] as const).map(([id, titulo, Icono]) => (
            <button key={id} role="tab" type="button" aria-selected={pestana === id} onClick={() => setPestana(id)}
              className={cn("inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition", pestana === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <Icono className="size-4" /> {titulo}
            </button>
          ))}
        </div>
        {!editable && <p className="text-sm text-muted-foreground">Solo el administrador y el gerente médico pueden cambiar estos ajustes. Tú los ves para saber qué se precarga.</p>}

        {pestana === "plantillas" && <EditorPlantillas motivos={motivos} plantillas={plantillas} listas={listas} editable={editable} />}
        {pestana === "perfiles" && meta.get("grupo_paraclinicos") && (
          <EditorLista key="perfiles" lista={meta.get("grupo_paraclinicos")!} items={perfiles} editable={editable} motivos={motivosLista} alcance={alcance} />
        )}
        {pestana === "recomendaciones" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {RECOMENDACIONES.map((r) => (
                <button key={r.lista} type="button" aria-pressed={recomendacion === r.lista} onClick={() => setRecomendacion(r.lista)}
                  className={cn("rounded-full border px-3 py-1 text-sm", recomendacion === r.lista ? "border-transparent bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}>
                  {r.titulo}
                </button>
              ))}
            </div>
            {meta.get(recomendacion) && (
              <EditorLista key={recomendacion} lista={meta.get(recomendacion)!} items={recomendaciones[RECOMENDACIONES.findIndex((r) => r.lista === recomendacion)]} editable={editable} motivos={motivosLista} />
            )}
          </div>
        )}
        {pestana === "examenes" && meta.get("paraclinico") && (
          <EditorLista key="examenes" lista={meta.get("paraclinico")!} items={catalogo} editable={editable} motivos={motivosLista} />
        )}
        </>}
      </section>
    </div>
  );
}
