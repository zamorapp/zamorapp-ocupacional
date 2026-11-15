"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, Check, FlaskConical, Globe2, Loader2, Search, Stethoscope, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Item } from "@/lib/listas";
import { casillasPerfil, perfilesSugeridos } from "@/lib/perfiles-paraclinicos";
import type { Plantilla } from "@/lib/plantillas";
import { cn } from "@/lib/utils";
import { EditorPlantillas } from "../plantillas/editor-plantillas";
import { elegirPerfilCasilla, restaurarCasilla, type Antes } from "./acciones";

export type Motivo = { id: string; codigo: string; nombre: string; preventivo: boolean };
export type Empresa = { id: string; nombre: string };

// "" = todas las empresas (lo general)
export type Seleccion = { empresaId: string; motivoId: string; paso: 1 | 2 | 3 };

const TODAS = "";
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// El modo demo no es un error: se avisa en ámbar
const demo = (m: string) => m.startsWith("En modo demo");
const examenesDe = (p?: Item) => p?.texto?.split("\n").map((l) => l.trim()).filter(Boolean) ?? [];

// Un paso del asistente: abierto muestra su contenido; hecho muestra la respuesta en una línea con «Cambiar»
function Paso({ n, titulo, abierto, hecho, respuesta, alCambiar, children }: {
  n: number; titulo: string; abierto: boolean; hecho: boolean; respuesta?: React.ReactNode; alCambiar: () => void; children: React.ReactNode;
}) {
  return (
    <li className={cn("relative rounded-xl border bg-card transition", abierto ? "border-primary/50 shadow-sm" : "")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
          hecho && !abierto ? "bg-ok/15 text-ok-texto" : abierto ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          {hecho && !abierto ? <Check className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{titulo}</h3>
          {!abierto && hecho && respuesta && <p className="truncate text-sm text-muted-foreground">{respuesta}</p>}
        </div>
        {!abierto && hecho && <Button type="button" variant="ghost" size="sm" onClick={alCambiar}>Cambiar</Button>}
      </div>
      {abierto && <div className="border-t px-4 py-4">{children}</div>}
    </li>
  );
}

export function Asistente({ editable, motivos, empresas, plantillas, listas, perfiles, sel, setSel, alVerCatalogo }: {
  editable: boolean;
  motivos: Motivo[];
  empresas: Empresa[];
  plantillas: Plantilla[];
  listas: Record<string, Item[]>;
  perfiles: Item[];
  sel: Seleccion;
  setSel: (s: Seleccion) => void;
  alVerCatalogo: () => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [eleccion, setEleccion] = useState<string | null>(null); // id de perfil · "ninguno" · "general"
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string; antes?: Antes[] } | null>(null);
  const [editarPlantilla, setEditarPlantilla] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const activos = useMemo(() => perfiles.filter((p) => p.activo), [perfiles]);
  const empresa = empresas.find((e) => e.id === sel.empresaId) ?? null;
  const nombreEmpresa = empresa?.nombre ?? "Todas las empresas";
  const motivo = motivos.find((m) => m.id === sel.motivoId) ?? null;

  const ir = (s: Partial<Seleccion>) => {
    setSel({ ...sel, ...s });
    setEleccion(null);
    setEditarPlantilla(false);
    if (s.paso !== 3) setAviso(null);
  };

  // ── Paso 1: empresa ──
  const lista = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    return empresas.filter((e) => !q || sinAcentos(e.nombre).includes(q)).slice(0, q ? 30 : 8);
  }, [empresas, buscar]);

  // ── Paso 3: qué sale hoy y qué se puede elegir ──
  const casilla = { e: empresa?.id ?? null, m: motivo?.id ?? null };
  const consulta = { empresaId: empresa?.id ?? null, empresa: empresa?.nombre ?? "", motivoId: motivo?.id ?? null };
  const actual = motivo ? perfilesSugeridos(activos, consulta)[0] : undefined;
  const decidido = activos.find((p) => casillasPerfil(p).pares.some((c) => c.e === casilla.e && c.m === casilla.m));
  const excluidoAqui = activos.some((p) => casillasPerfil(p).excluir.some((c) => c.e === casilla.e && c.m === casilla.m));
  // Lo general = lo que saldría en esta evaluación para una empresa sin nada propio
  const general = motivo
    ? perfilesSugeridos(activos.map((p) => {
        const { pares, excluir } = casillasPerfil(p);
        const fuera = (cs: typeof pares) => cs.filter((c) => !(c.e === casilla.e && c.m === casilla.m));
        return { ...p, datos: { ...(p.datos ?? {}), pares: fuera(pares), excluir: fuera(excluir) } };
      }), { empresaId: null, empresa: "", motivoId: motivo.id })[0]
    : undefined;
  const hoy = decidido ? decidido.id
    : !actual ? (empresa && !excluidoAqui ? "general" : "ninguno")
    : empresa && actual.id === general?.id ? "general" : actual.id;
  const elegido = eleccion ?? hoy;

  const guardar = () => {
    if (!motivo || elegido === hoy) return;
    iniciar(async () => {
      const r = await elegirPerfilCasilla(empresa?.id ?? null, motivo.id, elegido === "ninguno" ? null : elegido);
      setAviso(r);
      if (r.ok) setEleccion(null);
    });
  };
  const deshacer = () => aviso?.antes && iniciar(async () => {
    const r = await restaurarCasilla(aviso.antes!);
    setAviso(r.ok ? { ok: true, mensaje: r.mensaje } : r);
    setEleccion(null);
  });

  const plantilla = motivo ? plantillas.find((p) => p.motivo === motivo.codigo && p.activo) : undefined;
  const nombreDe = (l: string, c: string | null) => (c ? listas[l]?.find((i) => i.codigo === c)?.nombre ?? c : null);

  const Opcion = ({ id, titulo, detalle, icono }: { id: string; titulo: React.ReactNode; detalle?: React.ReactNode; icono?: React.ReactNode }) => (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition",
      elegido === id ? "border-primary bg-primary/5" : "hover:border-primary/40", !editable && "cursor-default")}>
      <input type="radio" name="perfil-casilla" className="mt-1 size-4 accent-[var(--primary)]" checked={elegido === id} disabled={!editable || ocupado}
        onChange={() => { setEleccion(id); setAviso(null); }} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{icono}{titulo}{hoy === id && <span className="rounded-full bg-muted px-2 text-xs font-normal text-muted-foreground">así está hoy</span>}</span>
        {detalle && <span className="mt-0.5 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{detalle}</span>}
      </span>
    </label>
  );

  const resumenExamenes = (p?: Item) => {
    const xs = examenesDe(p);
    return xs.length ? `${xs.length} ${xs.length === 1 ? "examen" : "exámenes"}: ${xs.slice(0, 6).join(", ")}${xs.length > 6 ? "…" : ""}` : "Sin exámenes escritos";
  };

  return (
    <ol className="space-y-3" aria-label="Asistente de ajustes clínicos">
      <Paso n={1} titulo="¿Para qué empresa?" abierto={sel.paso === 1} hecho={sel.paso > 1} alCambiar={() => ir({ paso: 1 })}
        respuesta={nombreEmpresa}>
        <p className="mb-3 text-sm text-muted-foreground">Elige la empresa que quieres ajustar, o «Todas las empresas» para lo que vale en general.</p>
        <label className="mb-3 flex items-center gap-2 rounded-lg border bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={`Buscar entre ${empresas.length} empresas`} aria-label="Buscar empresa"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {!buscar && (
            <button type="button" onClick={() => ir({ empresaId: TODAS, paso: 2 })}
              className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition hover:border-primary/50", sel.empresaId === TODAS && "border-primary bg-primary/5")}>
              <Globe2 className="size-4 shrink-0 text-primary" />
              <span><span className="font-medium">Todas las empresas</span><span className="block text-xs text-muted-foreground">Lo general: vale para las empresas sin ajuste propio</span></span>
            </button>
          )}
          {lista.map((e) => (
            <button key={e.id} type="button" onClick={() => ir({ empresaId: e.id, paso: 2 })}
              className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition hover:border-primary/50", sel.empresaId === e.id && "border-primary bg-primary/5")}>
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{e.nombre}</span>
            </button>
          ))}
        </div>
        {!buscar && empresas.length > lista.length && <p className="mt-2 text-xs text-muted-foreground">Se ven {lista.length} de {empresas.length}. Escribe para buscar las demás.</p>}
        {buscar && !lista.length && <p className="mt-2 text-sm text-muted-foreground">Ninguna empresa se llama así. Revisa cómo está escrita o búscala por otra palabra.</p>}
      </Paso>

      <Paso n={2} titulo="¿Qué evaluación?" abierto={sel.paso === 2} hecho={sel.paso > 2} alCambiar={() => ir({ paso: 2 })}
        respuesta={motivo?.nombre}>
        {[
          { titulo: "Evaluaciones preventivas", items: motivos.filter((m) => m.preventivo) },
          { titulo: "Otras consultas", items: motivos.filter((m) => !m.preventivo) },
        ].filter((g) => g.items.length).map((g) => (
          <div key={g.titulo} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-sm font-medium">{g.titulo}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map((m) => (
                <button key={m.id} type="button" aria-pressed={m.id === sel.motivoId} onClick={() => ir({ motivoId: m.id, paso: 3 })}
                  className={cn("rounded-full border px-3 py-1.5 text-sm transition", m.id === sel.motivoId ? "border-transparent bg-primary text-primary-foreground" : "bg-card hover:border-primary/50")}>
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Paso>

      <Paso n={3} titulo="¿Qué se precarga en la consulta?" abierto={sel.paso === 3} hecho={false} alCambiar={() => ir({ paso: 3 })}>
        {motivo && (
          <div className="space-y-6">
            <p className="text-sm">
              Estás ajustando <b className="font-semibold">{nombreEmpresa}</b> en <b className="font-semibold">{motivo.nombre}</b>.
            </p>

            {/* Paraclínicos: lo único que cambia por empresa */}
            <section aria-labelledby="as-para" className="space-y-3">
              <div className="flex items-start gap-2">
                <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <h4 id="as-para" className="font-semibold">Paraclínicos que se piden</h4>
                  <p className="text-sm text-muted-foreground">
                    {empresa ? `Solo para ${empresa.nombre} en ${motivo.nombre}.` : `Para las empresas que no tengan su propio ajuste en ${motivo.nombre}.`} Elegir aquí no borra ningún perfil.
                  </p>
                </div>
              </div>
              <div className="space-y-4" role="radiogroup" aria-labelledby="as-para">
                {empresa && (
                  <div className="grid gap-2">
                    <Opcion id="general" icono={<Globe2 className="size-3.5 text-muted-foreground" />}
                      titulo={<>Seguir lo general (hoy: {general ? `«${general.nombre}»` : "ninguno"})</>}
                      detalle={<>{general ? `${resumenExamenes(general)}.` : "Sin paraclínicos mientras lo general no tenga un perfil para esta evaluación."} Si cambias lo general, {empresa.nombre} cambia también.</>} />
                  </div>
                )}
                <div className="grid gap-2">
                  <p className="text-sm font-medium">{empresa ? `O fija un perfil solo para ${empresa.nombre}:` : `Elige lo general para ${motivo.nombre}:`}</p>
                  {activos.map((p) => <Opcion key={p.id} id={p.id} titulo={p.nombre} detalle={resumenExamenes(p)} />)}
                  <Opcion id="ninguno" icono={<X className="size-3.5 text-muted-foreground" />} titulo="Ninguno: no pedir paraclínicos"
                    detalle={empresa ? `En ${empresa.nombre} esta evaluación no llevará laboratorio. Los perfiles siguen existiendo para las demás empresas.` : "Lo general queda sin paraclínicos en esta evaluación."} />
                </div>
              </div>
              {editable ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={guardar} disabled={ocupado || elegido === hoy}>
                    {ocupado && <Loader2 className="animate-spin" />} {empresa ? `Guardar para ${empresa.nombre}` : "Guardar lo general"}
                  </Button>
                  {elegido !== hoy && <Button type="button" variant="ghost" onClick={() => setEleccion(null)} disabled={ocupado}>Dejar como estaba</Button>}
                  <button type="button" onClick={alVerCatalogo} className="ml-auto text-sm font-medium text-primary hover:underline">Crear o editar perfiles</button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Solo el administrador y el gerente médico pueden cambiar esto.</p>
              )}
              {aviso && (
                <div role="status" className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm", aviso.ok ? "border-ok/40 bg-ok/10" : demo(aviso.mensaje) ? "border-aviso/40 bg-aviso/15 text-aviso-texto" : "border-alerta/40 bg-alerta/10 text-alerta-texto")}>
                  <span className="min-w-0 flex-1">{aviso.mensaje}</span>
                  {aviso.ok && aviso.antes && aviso.antes.length > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={deshacer} disabled={ocupado}><Undo2 /> Deshacer</Button>
                  )}
                </div>
              )}
            </section>

            {/* Lo demás sale de la plantilla del motivo: igual para todas las empresas */}
            <section aria-labelledby="as-plantilla" className="space-y-3">
              <div className="flex items-start gap-2">
                <Stethoscope className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <h4 id="as-plantilla" className="font-semibold">Examen, recomendaciones y vigencia</h4>
                  <p className="text-sm text-muted-foreground">Salen de la plantilla de {motivo.nombre} y son iguales para todas las empresas.</p>
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border px-3 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt className="text-muted-foreground">Examen funcional</dt>
                <dd>{nombreDe("perfil_examen_funcional", plantilla?.datos.funcional ?? null) ?? <span className="text-muted-foreground">Se llena en la consulta</span>}</dd>
                <dt className="text-muted-foreground">Examen físico</dt>
                <dd>{nombreDe("perfil_examen_fisico", plantilla?.datos.fisico ?? null) ?? <span className="text-muted-foreground">Se llena en la consulta</span>}</dd>
                <dt className="text-muted-foreground">Recomendaciones</dt>
                <dd>{plantilla ? (plantilla.datos.aptitud.length + plantilla.datos.empresa.length + plantilla.datos.trabajador.length) || <span className="text-muted-foreground">Ninguna</span> : <span className="text-muted-foreground">Ninguna</span>}</dd>
                <dt className="text-muted-foreground">Vigencia de la aptitud</dt>
                <dd>{plantilla?.datos.meses ? `${plantilla.datos.meses} ${plantilla.datos.meses === 1 ? "mes" : "meses"}` : <span className="text-muted-foreground">La de la organización</span>}</dd>
              </dl>
              <Button type="button" variant="outline" onClick={() => setEditarPlantilla(!editarPlantilla)}>
                {editarPlantilla ? "Cerrar la plantilla" : editable ? `Editar la plantilla de ${motivo.nombre} (cambia para todas las empresas)` : `Ver la plantilla de ${motivo.nombre}`}
              </Button>
              {editarPlantilla && <EditorPlantillas motivos={[motivo]} plantillas={plantillas} listas={listas} editable={editable} />}
            </section>
          </div>
        )}
      </Paso>
    </ol>
  );
}
