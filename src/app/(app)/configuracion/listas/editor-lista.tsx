"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Aviso, Campo, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Item, Lista } from "@/lib/listas";
import { defExamen, textoReferencia } from "@/lib/paraclinicos";
import { alcancePerfil, examenesNoEncontrados } from "@/lib/perfiles-paraclinicos";
import { cn } from "@/lib/utils";
import { alternarItem, eliminarItem, guardarItem, moverItem, type Resultado } from "../acciones";
import { confirmar } from "@/components/app/confirmar";

// Listas cuyo valor más importante es un texto largo (recomendaciones, plantillas)
const CON_TEXTO = new Set(["recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente", "examen_funcional", "examen_fisico", "perfil_examen_fisico", "perfil_examen_funcional", "grupo_paraclinicos", "medicina"]);
const ETIQUETA_TEXTO: Record<string, string> = {
  examen_funcional: "Valor por defecto",
  examen_fisico: "Valor por defecto",
  perfil_examen_fisico: "Hallazgos: una línea por fila, «Fila: hallazgo» (ej. Nariz: congestión nasal)",
  perfil_examen_funcional: "Síntomas: una línea por fila, «Fila: síntoma» (ej. Respiratorio: tos húmeda)",
  grupo_paraclinicos: "Exámenes del perfil, uno por línea (con el mismo nombre del catálogo)",
  medicina: "Indicación que se llena sola, una línea por campo: «concentracion: 500 mg», «presentacion: Tableta», «via: Oral», «dosis: 1 tableta», «frecuencia: Cada 8 horas», «duracion: 5 días», «observacion: …»",
};
const ETIQUETA_GRUPO: Record<string, string> = {
  motivo_consulta: "Grupo (preventivo / no_preventivo)",
  paraclinico: "Perfil o grupo",
  antecedente_medico: "Tipo (personal / familiar)",
  causa_reposo: "Tipo (reposo / permiso)",
  medicina: "Laboratorio (opcional)",
  diagnostico: "Sistema orgánico (opcional)",
  diagnostico_declarable: "Notificación (inmediata / semanal)",
  declaracion_ocupacional: "Categoría del Anexo 1",
};
const ETIQUETA_CODIGO: Record<string, string> = { diagnostico: "Código CIE-10 *", diagnostico_declarable: "Inicio del código CIE-10 (ej. A15 cubre A15.0 a A15.9)", declaracion_ocupacional: "Códigos CIE-10 * (ej.: M54.5; varios con coma; !Z56.0 excluye)" };

type Motivo = { codigo: string; nombre: string };
type Opcion = { id: string; nombre: string };
type Alcance = { empresas: Opcion[]; motivos: Opcion[]; catalogo: string[] };

// Chips para elegir varias opciones; con muchas opciones aparece un buscador y se muestran primero las elegidas
function SelectorVarios({ nombre, titulo, opciones, inicial }: { nombre: string; titulo: string; opciones: Opcion[]; inicial: string[] }) {
  const [elegidos, setElegidos] = useState(inicial);
  const [buscar, setBuscar] = useState("");
  const muchas = opciones.length > 12;
  const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visibles = opciones
    .filter((o) => elegidos.includes(o.id) || !muchas || (buscar && sinAcentos(o.nombre).includes(sinAcentos(buscar))))
    .slice(0, 40);
  const alternar = (id: string) => setElegidos(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);
  return (
    <div className="sm:col-span-3">
      <input type="hidden" name={nombre} value={elegidos.join(",")} />
      <p className="mb-1.5 text-sm font-medium">{titulo} <span className="font-normal text-muted-foreground">(ninguna = todas)</span></p>
      {muchas && (
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={`Buscar entre ${opciones.length}…`} className="mb-2 h-9 w-full rounded-md border bg-card px-3 text-sm outline-none focus:border-primary sm:max-w-xs" />
      )}
      <div className="flex flex-wrap gap-1.5">
        {visibles.map((o) => {
          const activo = elegidos.includes(o.id);
          return (
            <button key={o.id} type="button" onClick={() => alternar(o.id)}
              className={cn("rounded-full border px-2.5 py-1 text-xs transition", activo ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}>
              {o.nombre}
            </button>
          );
        })}
        {muchas && !buscar && elegidos.length === 0 && <span className="text-xs text-muted-foreground">Escribe para buscar.</span>}
      </div>
    </div>
  );
}

// Paraclínicos: unidad y rango de referencia para el semáforo del resultado (se guardan en lista_items.datos)
function CamposResultado({ datos }: { datos?: Record<string, unknown> }) {
  const d = defExamen(datos);
  const v = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-3 sm:col-span-3 sm:grid-cols-6">
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor="d_tipo" className="mb-1.5 block text-sm font-medium">Resultado</label>
        <select id="d_tipo" name="d_tipo" defaultValue={d.tipo} className="h-10 w-full rounded-md border bg-transparent px-2 text-sm">
          <option value="numero">Número</option>
          <option value="informe">Normal / Alterado</option>
        </select>
      </div>
      <Campo id="d_unidad" etiqueta="Unidad" defaultValue={d.unidad} placeholder="mg/dL" />
      <Campo id="d_rango_min" etiqueta="Mínimo" defaultValue={v(d.min)} inputMode="decimal" placeholder="70" />
      <Campo id="d_rango_max" etiqueta="Máximo" defaultValue={v(d.max)} inputMode="decimal" placeholder="110" />
      <Campo id="d_rango_min_f" etiqueta="Mín. mujer" defaultValue={v(d.minF)} inputMode="decimal" placeholder="Igual" />
      <Campo id="d_rango_max_f" etiqueta="Máx. mujer" defaultValue={v(d.maxF)} inputMode="decimal" placeholder="Igual" />
      <p className="col-span-2 text-xs text-muted-foreground sm:col-span-6">Con el rango, el resultado se pinta solo: verde normal, ámbar fuera de rango, rojo alterado. Deja vacío lo que no aplique (p. ej. solo máximo para colesterol). «Mujer» solo si el rango cambia por sexo.</p>
    </div>
  );
}

// Elige uno o varios motivos; se guardan como códigos separados por coma en "grupo"
function SelectorMotivos({ motivos, inicial }: { motivos: Motivo[]; inicial: string }) {
  const [elegidos, setElegidos] = useState<string[]>(inicial.split(",").map((x) => x.trim()).filter(Boolean));
  return (
    <div className="sm:col-span-3">
      <input type="hidden" name="grupo" value={elegidos.join(",")} />
      <p className="mb-1.5 text-sm font-medium">Sugerir en estos motivos <span className="font-normal text-muted-foreground">(ninguno = en todos)</span></p>
      <div className="flex flex-wrap gap-1.5">
        {motivos.map((m) => {
          const activo = elegidos.includes(m.codigo);
          return (
            <button
              key={m.codigo}
              type="button"
              onClick={() => setElegidos(activo ? elegidos.filter((x) => x !== m.codigo) : [...elegidos, m.codigo])}
              className={cn("rounded-full border px-2.5 py-1 text-xs transition", activo ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}
            >
              {m.nombre}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Formulario({ lista, item, motivos, alcance, alTerminar }: { lista: string; item: Item | null; motivos: Motivo[]; alcance?: Alcance; alTerminar: () => void }) {
  const [estado, accion, enviando] = useActionState(guardarItem, null);
  useEffect(() => {
    if (estado?.ok) alTerminar();
  }, [estado, alTerminar]);
  const conTexto = CON_TEXTO.has(lista) || Boolean(item?.texto);
  const [faltantes, setFaltantes] = useState(() => (alcance ? examenesNoEncontrados(item?.texto ?? "", alcance.catalogo) : []));

  return (
    <form action={accion} className="grid gap-3 border-b bg-muted/30 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="lista" value={lista} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <Campo id="nombre" etiqueta="Nombre *" defaultValue={item?.nombre} required autoFocus />
      <Campo id="codigo" etiqueta={ETIQUETA_CODIGO[lista] ?? "Código"} defaultValue={item?.codigo ?? ""} required={lista === "diagnostico" || lista === "declaracion_ocupacional"} />
      {lista.startsWith("recomendacion_") ? (
        <SelectorMotivos motivos={motivos} inicial={item?.grupo ?? ""} />
      ) : lista === "grupo_paraclinicos" && alcance ? (
        <>
          {/* El nombre de empresa que guardaban los perfiles viejos se reemplaza al elegir empresas */}
          <input type="hidden" name="grupo" value={alcancePerfil(item ?? {}).empresas.length ? "" : (item?.grupo ?? "")} />
          <SelectorVarios nombre="d_empresas" titulo="Sugerir en estas empresas" opciones={alcance.empresas} inicial={alcancePerfil(item ?? {}).empresas} />
          <SelectorVarios nombre="d_motivos" titulo="Y en estos tipos de examen" opciones={alcance.motivos} inicial={alcancePerfil(item ?? {}).motivos} />
          {item?.grupo && !alcancePerfil(item).empresas.length && (
            <p className="text-xs text-aviso-texto sm:col-span-3">Este perfil se sugería por el nombre «{item.grupo}». Elige la empresa para que quede enlazado.</p>
          )}
        </>
      ) : (
        <Campo id="grupo" etiqueta={ETIQUETA_GRUPO[lista] ?? "Grupo"} defaultValue={item?.grupo ?? ""} />
      )}
      {lista === "paraclinico" && <CamposResultado datos={item?.datos} />}
      {conTexto ? (
        <div className="sm:col-span-3">
          <CampoTexto id="texto" etiqueta={ETIQUETA_TEXTO[lista] ?? "Texto"} defaultValue={item?.texto ?? ""} rows={3}
            onChange={alcance ? (e) => setFaltantes(examenesNoEncontrados(e.target.value, alcance.catalogo)) : undefined} />
          {faltantes.length > 0 && (
            <p className="mt-1.5 text-xs text-aviso-texto">
              No están en el catálogo: {faltantes.join(" · ")}. Se agregarán sin rango ni semáforo; revisa cómo están escritos o agrégalos en Paraclínicos.
            </p>
          )}
        </div>
      ) : (
        <input type="hidden" name="texto" value={item?.texto ?? ""} />
      )}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Aviso resultado={estado && !estado.ok ? estado : null} />
        <Button type="button" variant="ghost" className="ml-auto" onClick={alTerminar}><X /> Cancelar</Button>
        <Button type="submit" disabled={enviando}>{enviando && <Loader2 className="animate-spin" />} Guardar</Button>
      </div>
    </form>
  );
}

export function EditorLista({ lista, items, editable, motivos, alcance }: { lista: Lista; items: Item[]; editable: boolean; motivos: Motivo[]; alcance?: Alcance }) {
  const nombreDe = new Map([...(alcance?.empresas ?? []), ...(alcance?.motivos ?? [])].map((o) => [o.id, o.nombre]));
  const nombreMotivo = new Map(motivos.map((m) => [m.codigo, m.nombre]));
  const etiquetaGrupo = (g: string) =>
    lista.codigo.startsWith("recomendacion_") ? g.split(",").map((c) => nombreMotivo.get(c.trim()) ?? c).join(" · ") : g;
  const [editando, setEditando] = useState<string | "nuevo" | null>(null);
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [verInactivos, setVerInactivos] = useState(true);

  const ejecutar = (f: () => Promise<Resultado>) =>
    iniciar(async () => {
      const r = await f();
      setAviso(r.ok ? null : r);
    });

  const [filtro, setFiltro] = useState("");
  const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibles = (verInactivos ? items : items.filter((i) => i.activo))
    .filter((i) => !filtro || sinAcentos(`${i.nombre} ${i.codigo ?? ""} ${i.grupo ?? ""}`).includes(sinAcentos(filtro)));
  const inactivos = items.filter((i) => !i.activo).length;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{lista.nombre}</h2>
          {lista.descripcion && <p className="text-sm text-muted-foreground">{lista.descripcion}</p>}
        </div>
        {inactivos > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setVerInactivos(!verInactivos)}>
            {verInactivos ? `Ocultar ${inactivos} inactivos` : `Ver ${inactivos} inactivos`}
          </Button>
        )}
        {editable && (
          <Button size="sm" onClick={() => setEditando("nuevo")} disabled={editando === "nuevo"}>
            <Plus /> Agregar
          </Button>
        )}
        {ocupado && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {items.length > 12 && (
        <label className="relative block border-b px-5 py-2">
          <Search className="pointer-events-none absolute left-8 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={`Buscar en ${items.length} elementos…`} className="h-9 w-full rounded-md border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
      )}
      {aviso && <div className="border-b px-5 py-3"><Aviso resultado={aviso} /></div>}
      {editando === "nuevo" && <Formulario lista={lista.codigo} item={null} motivos={motivos} alcance={alcance} alTerminar={() => setEditando(null)} />}

      {visibles.length === 0 && editando !== "nuevo" && (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">Esta lista está vacía.</p>
      )}

      <ul className="divide-y">
        {visibles.map((item, i) =>
          editando === item.id ? (
            <li key={item.id}><Formulario lista={lista.codigo} item={item} motivos={motivos} alcance={alcance} alTerminar={() => setEditando(null)} /></li>
          ) : (
            <li key={item.id} className={cn("group flex items-start gap-3 px-5 py-3", !item.activo && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.nombre}</span>
                  {item.codigo && <span className="rounded bg-muted px-1.5 font-mono text-xs text-muted-foreground">{item.codigo}</span>}
                  {item.grupo && !alcance && <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">{etiquetaGrupo(item.grupo)}</span>}
                  {!item.activo && <span className="text-xs text-muted-foreground">inactivo</span>}
                </div>
                {lista.codigo === "paraclinico" && (() => {
                  const dx = defExamen(item.datos);
                  const ref = textoReferencia(dx, null);
                  return dx.tipo === "informe" ? <p className="mt-0.5 text-xs text-muted-foreground">Normal / Alterado</p>
                    : ref || dx.unidad ? <p className="mt-0.5 font-mono text-xs text-muted-foreground">{[ref, dx.unidad].filter(Boolean).join(" ")}</p>
                    : <p className="mt-0.5 text-xs text-aviso-texto">Sin rango: el resultado no se colorea</p>;
                })()}
                {alcance && (() => {
                  const a = alcancePerfil(item);
                  const nombres = (xs: string[]) => xs.map((x) => nombreDe.get(x) ?? "(inactiva)").join(", ");
                  return (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.empresas.length ? nombres(a.empresas) : item.grupo ? `Por nombre: ${item.grupo}` : "Todas las empresas"}
                      {" · "}{a.motivos.length ? nombres(a.motivos) : "todo tipo de examen"}
                    </p>
                  );
                })()}
                {item.texto && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{alcance ? item.texto.split("\n").map((l) => l.trim()).filter(Boolean).join(" · ") : item.texto}</p>}
              </div>
              {editable && (
                <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="size-8" title="Subir" disabled={i === 0 || !verInactivos || Boolean(filtro)} onClick={() => ejecutar(() => moverItem(lista.codigo, item.id, -1))}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon" className="size-8" title="Bajar" disabled={i === visibles.length - 1 || !verInactivos || Boolean(filtro)} onClick={() => ejecutar(() => moverItem(lista.codigo, item.id, 1))}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon" className="size-8" title="Editar" onClick={() => setEditando(item.id)}><Pencil /></Button>
                  <Button variant="ghost" size="icon" className="size-8" title={item.activo ? "Desactivar" : "Activar"} onClick={() => ejecutar(() => alternarItem(item.id, !item.activo))}>
                    {item.activo ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 hover:text-destructive"
                    title="Eliminar"
                    onClick={async () => (await confirmar({ titulo: `¿Eliminar «${item.nombre}»?`, accion: "Eliminar", peligro: true })) && ejecutar(() => eliminarItem(item.id))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      {!editable && <p className="border-t px-5 py-3 text-xs text-muted-foreground">Solo el administrador o el gerente médico pueden editar las listas.</p>}
    </Card>
  );
}
