"use client";

import { useCallback } from "react";
import type { Item } from "@/lib/listas";
import { agregarAlCatalogo, buscarDiagnosticos } from "../acciones";
import { BuscadorCatalogo, coincide, palabrasDe, type Opcion } from "./buscador-catalogo";
import { indicacionPreestablecida } from "./perfiles";

type Props = {
  cie10: string;
  descripcion: string;
  onElegir: (d: { cie10: string; descripcion: string }) => void;
  onEscribir: (descripcion: string) => void;
  autoFocus?: boolean;
};

const GRUPOS_DX = ["Mis diagnósticos", "Más usados", "CIE-10"];

// Escribe parte del nombre o del código ("hernia", "sindrome viral", "M54"), sin acentos, y elige de la lista.
// Primero tu lista, luego lo que el servicio ya usó, luego el catálogo CIE-10. Si no está: «Agregar "…"».
export function BuscadorDiagnostico({ cie10, descripcion, onElegir, onEscribir, autoFocus }: Props) {
  const buscar = useCallback(async (texto: string): Promise<Opcion[]> =>
    (await buscarDiagnosticos(texto)).map((r, i) => ({
      clave: `${i}-${r.cie10}-${r.descripcion}`,
      codigo: r.cie10,
      nombre: r.descripcion,
      usos: r.usos,
      grupo: r.usos >= 900000 ? GRUPOS_DX[0] : r.usos > 0 ? GRUPOS_DX[1] : GRUPOS_DX[2],
    })), []);

  return (
    <BuscadorCatalogo
      valor={descripcion}
      codigo={cie10}
      conCodigo
      autoFocus={autoFocus}
      placeholder="Escribe el diagnóstico o el código…"
      grupos={GRUPOS_DX}
      buscar={buscar}
      onEscribir={onEscribir}
      onElegir={(o) => onElegir({ cie10: o.codigo, descripcion: o.nombre })}
      agregarA="mis diagnósticos"
      proponerCodigo
      onAgregar={async (nombre, codigo) => {
        const r = await agregarAlCatalogo("diagnostico", nombre, codigo);
        if (!r.ok || !r.item) return r.mensaje;
        onElegir({ cie10: r.item.codigo ?? "", descripcion: r.item.nombre });
        return null;
      }}
    />
  );
}

const GRUPOS_MED = ["Mis medicinas", "Vademécum"];

// Medicinas: filtra en memoria la lista ya cargada (rápido en una PC modesta y sin internet)
export function BuscadorMedicina({ valor, medicinas, onElegir, onEscribir, onAgregada }: {
  valor: string;
  medicinas: Item[];
  onElegir: (it: Item) => void;
  onEscribir: (texto: string) => void;
  onAgregada: (it: Item) => void;
}) {
  const buscar = useCallback((texto: string): Opcion[] => {
    const palabras = palabrasDe(texto);
    return medicinas.flatMap((m) => {
      const pre = indicacionPreestablecida(m.texto);
      const detalle = [pre.presentacion, pre.concentracion].filter(Boolean).join(" ");
      if (!coincide(`${m.nombre} ${detalle}`, palabras)) return [];
      return [{ clave: m.id, codigo: "", nombre: m.nombre, detalle, grupo: m.datos?.propio === true ? GRUPOS_MED[0] : GRUPOS_MED[1] }];
    }).slice(0, 40);
  }, [medicinas]);

  return (
    <BuscadorCatalogo
      valor={valor}
      placeholder="Principio activo (DCI)"
      grupos={GRUPOS_MED}
      buscar={buscar}
      onEscribir={onEscribir}
      onElegir={(o) => {
        const it = medicinas.find((m) => m.id === o.clave);
        if (it) onElegir(it);
      }}
      agregarA="mis medicinas"
      onAgregar={async (nombre) => {
        const r = await agregarAlCatalogo("medicina", nombre);
        if (!r.ok || !r.item) return r.mensaje;
        const it: Item = { id: r.item.id, codigo: r.item.codigo, nombre: r.item.nombre, grupo: null, texto: r.item.texto, orden: 0, activo: true, datos: { propio: true } };
        onAgregada(it);
        onElegir(it);
        return null;
      }}
    />
  );
}
