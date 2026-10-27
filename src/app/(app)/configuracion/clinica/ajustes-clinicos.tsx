"use client";

import { useMemo, useState } from "react";
import { Building2, FlaskConical, ListChecks, Pencil, Search, Stethoscope, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Item, Lista } from "@/lib/listas";
import { alcancePerfil, perfilesSugeridos } from "@/lib/perfiles-paraclinicos";
import { resumenPlantilla, type Plantilla } from "@/lib/plantillas";
import { cn } from "@/lib/utils";
import { EditorLista } from "../listas/editor-lista";
import { EditorPlantillas } from "../plantillas/editor-plantillas";

type Motivo = { id: string; codigo: string; nombre: string; preventivo: boolean };
type Empresa = { id: string; nombre: string };
type Pestana = "plantillas" | "perfiles" | "recomendaciones" | "examenes";
type Origen = "propio" | "motivo" | "empresa";

const SELECT = "h-10 w-full min-w-0 rounded-md border bg-card px-3 text-sm";
const RECOMENDACIONES = [
  { lista: "recomendacion_aptitud", titulo: "Aptitud" },
  { lista: "recomendacion_empresa", titulo: "A la empresa" },
  { lista: "recomendacion_paciente", titulo: "Al trabajador" },
] as const;

// De dónde sale el perfil sugerido: propio de la empresa (y del motivo), general del motivo o general de la empresa.
// Mismo criterio que perfilesSugeridos, que es la función que usa la consulta.
function origenPerfil(p: Item, empresa: Empresa): Origen {
  const a = alcancePerfil(p);
  const deEmpresa = a.empresas.length ? a.empresas.includes(empresa.id) : Boolean(p.grupo && empresa.nombre.toLowerCase().includes(p.grupo.toLowerCase()));
  if (deEmpresa && a.motivos.length) return "propio";
  return deEmpresa ? "empresa" : "motivo";
}

const ETIQUETA_ORIGEN: Record<Origen, string> = { propio: "propio de la empresa y el motivo", motivo: "general del motivo", empresa: "de la empresa, para cualquier motivo" };

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
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [motivoId, setMotivoId] = useState(motivos[0]?.id ?? "");
  const [pestana, setPestana] = useState<Pestana>("plantillas");
  const [recomendacion, setRecomendacion] = useState<(typeof RECOMENDACIONES)[number]["lista"]>("recomendacion_aptitud");
  const [filtro, setFiltro] = useState("");

  const empresa = empresas.find((e) => e.id === empresaId) ?? { id: "", nombre: "" };
  const motivo = motivos.find((m) => m.id === motivoId) ?? motivos[0];

  const sugeridosDe = (e: Empresa, m: Motivo) => perfilesSugeridos(activos, { empresaId: e.id || null, empresa: e.nombre, motivoId: m.id });
  const sugeridos = sugeridosDe(empresa, motivo);
  const perfil = sugeridos[0];
  const plantilla = plantillas.find((p) => p.motivo === motivo.codigo && p.activo);
  const nombreDe = (lista: string, codigos: string[]) => codigos.map((c) => listas[lista]?.find((i) => i.codigo === c)?.nombre ?? c);

  const meta = new Map(listasMeta.map((l) => [l.codigo, l]));
  const motivosLista = motivos.map((m) => ({ codigo: m.codigo, nombre: m.nombre }));
  const alcance = { empresas, motivos: motivos.map((m) => ({ id: m.id, nombre: m.nombre })), catalogo: catalogo.filter((c) => c.activo).map((c) => c.nombre) };

  const ir = (p: Pestana) => {
    setPestana(p);
    requestAnimationFrame(() => document.getElementById("editores")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Matriz: primero las empresas con perfil propio; el buscador filtra por nombre
  const columnas = motivos.filter((m) => m.preventivo).slice(0, 6);
  const cols = columnas.length ? columnas : motivos.slice(0, 6);
  const filas = useMemo(() => {
    const conPropio = (e: Empresa) => cols.some((m) => {
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

  const Fila = ({ titulo, origen, editar, children }: { titulo: string; origen: React.ReactNode; editar: Pestana; children: React.ReactNode }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t px-4 py-3 first:border-t-0 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto]">
      <div className="col-span-2 text-xs font-semibold text-muted-foreground sm:col-span-1 sm:pt-0.5">{titulo}</div>
      <div className="min-w-0 text-sm">
        {children}
        <div className="mt-1 text-xs text-muted-foreground">{origen}</div>
      </div>
      <button type="button" onClick={() => ir(editar)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10">
        <Pencil className="size-3.5" /> {editable ? "Editar" : "Ver"}
      </button>
    </div>
  );

  const examen = plantilla && (plantilla.datos.funcional || plantilla.datos.fisico)
    ? [plantilla.datos.funcional && `Funcional: ${nombreDe("perfil_examen_funcional", [plantilla.datos.funcional])[0]}`, plantilla.datos.fisico && `Físico: ${nombreDe("perfil_examen_fisico", [plantilla.datos.fisico])[0]}`].filter(Boolean).join(" · ")
    : null;
  const frases = plantilla
    ? [...nombreDe("recomendacion_aptitud", plantilla.datos.aptitud), ...nombreDe("recomendacion_empresa", plantilla.datos.empresa), ...nombreDe("recomendacion_paciente", plantilla.datos.trabajador)]
    : [];
  const examenesPerfil = perfil?.texto?.split("\n").map((l) => l.trim()).filter(Boolean) ?? [];
  const sinNada = <span className="text-aviso-texto">Nada configurado</span>;
  const deLaPlantilla = plantilla ? <>De la plantilla de <b className="font-medium text-foreground">{motivo.nombre}</b></> : "Sin plantilla activa para este motivo";

  return (
    <div className="space-y-8">
      {/* Simulador: solo lee la configuración con las mismas funciones que usa la consulta; no toca pacientes */}
      <section aria-labelledby="probar" className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="gap-4 p-4">
          <h2 id="probar" className="font-semibold">Probar una combinación</h2>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Empresa</span>
            <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={SELECT}>
              {!empresas.length && <option value="">Sin empresas</option>}
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Motivo de la consulta</span>
            <div className="flex flex-wrap gap-1.5">
              {motivos.map((m) => (
                <button key={m.id} type="button" aria-pressed={m.id === motivo.id} onClick={() => setMotivoId(m.id)}
                  className={cn("rounded-full border px-3 py-1 text-sm transition", m.id === motivo.id ? "border-transparent bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}>
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Para los paraclínicos la consulta sugiere primero el perfil propio de la empresa y el motivo; si no hay, el general del motivo; y si tampoco, el de la empresa para cualquier motivo.
          </p>
        </Card>

        <Card className="gap-0 overflow-hidden p-0">
          <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <Stethoscope className="size-4 text-primary" />
            <h2 className="font-semibold">Así se abre la consulta</h2>
            <span className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">{empresa.nombre || "—"} · {motivo.nombre}</span>
          </header>
          <Fila titulo="Examen" origen={deLaPlantilla} editar="plantillas">{examen ?? sinNada}</Fila>
          <Fila titulo="Paraclínicos" editar="perfiles"
            origen={perfil
              ? <>Perfil sugerido <b className="font-medium text-foreground">«{perfil.nombre}»</b>, {ETIQUETA_ORIGEN[origenPerfil(perfil, empresa)]}{sugeridos.length > 1 && ` · también: ${sugeridos.slice(1, 4).map((p) => p.nombre).join(", ")}`}</>
              : "Ningún perfil corresponde a esta combinación"}>
            {examenesPerfil.length ? (
              <div className="flex flex-wrap gap-1.5">
                {examenesPerfil.slice(0, 14).map((x) => <span key={x} className="rounded-full border px-2 py-0.5 text-xs">{x}</span>)}
                {examenesPerfil.length > 14 && <span className="text-xs text-muted-foreground">+{examenesPerfil.length - 14}</span>}
              </div>
            ) : sinNada}
          </Fila>
          <Fila titulo="Recomendaciones" origen={deLaPlantilla} editar="plantillas">
            {frases.length ? <ul className="list-disc space-y-0.5 pl-4">{frases.slice(0, 6).map((f) => <li key={f}>{f}</li>)}{frases.length > 6 && <li className="list-none text-xs text-muted-foreground">y {frases.length - 6} más</li>}</ul> : sinNada}
          </Fila>
          <Fila titulo="Vigencia de la aptitud" origen={plantilla?.datos.meses ? deLaPlantilla : "La de la organización (Configuración › Organización)"} editar="plantillas">
            {plantilla?.datos.meses ? `${plantilla.datos.meses} ${plantilla.datos.meses === 1 ? "mes" : "meses"}` : "Por defecto"}
          </Fila>
          {plantilla && <Fila titulo="Resumen" origen={deLaPlantilla} editar="plantillas">{resumenPlantilla(plantilla.datos) || "Plantilla vacía"}</Fila>}
        </Card>
      </section>

      {/* Matriz empresa × motivo */}
      <section aria-labelledby="matriz" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="matriz" className="text-lg font-semibold">Paraclínicos por empresa</h2>
            <p className="text-sm text-muted-foreground">Qué perfil sale en cada combinación. Toca una casilla para probarla arriba.</p>
          </div>
          <label className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 sm:w-64">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar empresa" aria-label="Buscar empresa" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span><b className="text-ok-texto">●</b> Propio de la empresa</span>
          <span><b className="text-info-texto">●</b> General del motivo</span>
          <span>○ Sin perfil</span>
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
                    const elegida = e.id === empresa.id && m.id === motivo.id;
                    return (
                      <td key={m.id} className={cn("p-0", elegida && "bg-primary/10 outline-2 -outline-offset-2 outline-primary")}>
                        <button type="button" onClick={() => { setEmpresaId(e.id); setMotivoId(m.id); document.getElementById("probar")?.scrollIntoView({ behavior: "smooth" }); }}
                          className="block w-full px-3 py-2 text-left hover:bg-muted" aria-label={`${e.nombre}, ${m.nombre}: ${p ? p.nombre : "sin perfil"}`}>
                          {p ? <span className={o === "motivo" ? "text-info-texto" : "font-medium text-ok-texto"}>● {p.nombre}</span> : <span className="text-muted-foreground">○</span>}
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

      {/* Editores: los mismos de Configuración, con sus mismas acciones y permisos */}
      <section id="editores" className="scroll-mt-20 space-y-4">
        <div role="tablist" aria-label="Ajustes" className="flex gap-1 overflow-x-auto border-b">
          {([
            ["plantillas", "Plantillas por motivo", Wand2],
            ["perfiles", "Perfiles de paraclínicos", Building2],
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
      </section>
    </div>
  );
}
