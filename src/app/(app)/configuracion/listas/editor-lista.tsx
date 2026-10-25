"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Aviso, Campo, CampoTexto } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Item, Lista } from "@/lib/listas";
import { cn } from "@/lib/utils";
import { alternarItem, eliminarItem, guardarItem, moverItem, type Resultado } from "../acciones";

// Listas cuyo valor más importante es un texto largo (recomendaciones, plantillas)
const CON_TEXTO = new Set(["recomendacion_aptitud", "recomendacion_empresa", "recomendacion_paciente", "examen_funcional", "examen_fisico"]);
const ETIQUETA_TEXTO: Record<string, string> = {
  examen_funcional: "Valor por defecto",
  examen_fisico: "Valor por defecto",
};
const ETIQUETA_GRUPO: Record<string, string> = {
  motivo_consulta: "Grupo (preventivo / no_preventivo)",
  paraclinico: "Perfil o grupo",
  antecedente_medico: "Tipo (personal / familiar)",
  causa_reposo: "Tipo (reposo / permiso)",
};

function Formulario({ lista, item, alTerminar }: { lista: string; item: Item | null; alTerminar: () => void }) {
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
      <Campo id="codigo" etiqueta="Código" defaultValue={item?.codigo ?? ""} />
      <Campo id="grupo" etiqueta={ETIQUETA_GRUPO[lista] ?? "Grupo"} defaultValue={item?.grupo ?? ""} />
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

export function EditorLista({ lista, items, editable }: { lista: Lista; items: Item[]; editable: boolean }) {
  const [editando, setEditando] = useState<string | "nuevo" | null>(null);
  const [aviso, setAviso] = useState<Resultado | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [verInactivos, setVerInactivos] = useState(true);

  const ejecutar = (f: () => Promise<Resultado>) =>
    iniciar(async () => {
      const r = await f();
      setAviso(r.ok ? null : r);
    });

  const visibles = verInactivos ? items : items.filter((i) => i.activo);
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

      {aviso && <div className="border-b px-5 py-3"><Aviso resultado={aviso} /></div>}
      {editando === "nuevo" && <Formulario lista={lista.codigo} item={null} alTerminar={() => setEditando(null)} />}

      {visibles.length === 0 && editando !== "nuevo" && (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">Esta lista está vacía.</p>
      )}

      <ul className="divide-y">
        {visibles.map((item, i) =>
          editando === item.id ? (
            <li key={item.id}><Formulario lista={lista.codigo} item={item} alTerminar={() => setEditando(null)} /></li>
          ) : (
            <li key={item.id} className={cn("group flex items-start gap-3 px-5 py-3", !item.activo && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.nombre}</span>
                  {item.codigo && <span className="rounded bg-muted px-1.5 font-mono text-xs text-muted-foreground">{item.codigo}</span>}
                  {item.grupo && <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">{item.grupo}</span>}
                  {!item.activo && <span className="text-xs text-muted-foreground">inactivo</span>}
                </div>
                {item.texto && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.texto}</p>}
              </div>
              {editable && (
                <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="size-8" title="Subir" disabled={i === 0 || !verInactivos} onClick={() => ejecutar(() => moverItem(lista.codigo, item.id, -1))}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon" className="size-8" title="Bajar" disabled={i === visibles.length - 1 || !verInactivos} onClick={() => ejecutar(() => moverItem(lista.codigo, item.id, 1))}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon" className="size-8" title="Editar" onClick={() => setEditando(item.id)}><Pencil /></Button>
                  <Button variant="ghost" size="icon" className="size-8" title={item.activo ? "Desactivar" : "Activar"} onClick={() => ejecutar(() => alternarItem(item.id, !item.activo))}>
                    {item.activo ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 hover:text-destructive"
                    title="Eliminar"
                    onClick={() => confirm(`¿Eliminar «${item.nombre}»?`) && ejecutar(() => eliminarItem(item.id))}
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
