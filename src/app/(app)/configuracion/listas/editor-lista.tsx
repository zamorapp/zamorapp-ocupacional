"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Aviso, Campo, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Item, Lista } from "@/lib/listas";
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
  grupo_paraclinicos: "Empresa a la que se sugiere (opcional)",
  medicina: "Laboratorio (opcional)",
  diagnostico: "Sistema orgánico (opcional)",
};
const ETIQUETA_CODIGO: Record<string, string> = { diagnostico: "Código CIE-10 *" };

type Motivo = { codigo: string; nombre: string };

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

function Formulario({ lista, item, motivos, alTerminar }: { lista: string; item: Item | null; motivos: Motivo[]; alTerminar: () => void }) {
  const [estado, accion, enviando] = useActionState(guardarItem, null);
  useEffect(() => {
    if (estado?.ok) alTerminar();
  }, [estado, alTerminar]);
  const conTexto = CON_TEXTO.has(lista) || Boolean(item?.texto);

  return (
    <form action={accion} className="grid gap-3 border-b bg-muted/30 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <input type="hidden" name="lista" value={lista} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <Campo id="nombre" etiqueta="Nombre *" defaultValue={item?.nombre} required autoFocus />
      <Campo id="codigo" etiqueta={ETIQUETA_CODIGO[lista] ?? "Código"} defaultValue={item?.codigo ?? ""} required={lista === "diagnostico"} />
      {lista.startsWith("recomendacion_") ? (
        <SelectorMotivos motivos={motivos} inicial={item?.grupo ?? ""} />
      ) : (
        <Campo id="grupo" etiqueta={ETIQUETA_GRUPO[lista] ?? "Grupo"} defaultValue={item?.grupo ?? ""} />
      )}
      {conTexto ? (
        <CampoTexto id="texto" etiqueta={ETIQUETA_TEXTO[lista] ?? "Texto"} defaultValue={item?.texto ?? ""} rows={3} className="sm:col-span-3" />
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

export function EditorLista({ lista, items, editable, motivos }: { lista: Lista; items: Item[]; editable: boolean; motivos: Motivo[] }) {
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
      {editando === "nuevo" && <Formulario lista={lista.codigo} item={null} motivos={motivos} alTerminar={() => setEditando(null)} />}

      {visibles.length === 0 && editando !== "nuevo" && (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">Esta lista está vacía.</p>
      )}

      <ul className="divide-y">
        {visibles.map((item, i) =>
          editando === item.id ? (
            <li key={item.id}><Formulario lista={lista.codigo} item={item} motivos={motivos} alTerminar={() => setEditando(null)} /></li>
          ) : (
            <li key={item.id} className={cn("group flex items-start gap-3 px-5 py-3", !item.activo && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.nombre}</span>
                  {item.codigo && <span className="rounded bg-muted px-1.5 font-mono text-xs text-muted-foreground">{item.codigo}</span>}
                  {item.grupo && <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">{etiquetaGrupo(item.grupo)}</span>}
                  {!item.activo && <span className="text-xs text-muted-foreground">inactivo</span>}
                </div>
                {item.texto && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.texto}</p>}
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
