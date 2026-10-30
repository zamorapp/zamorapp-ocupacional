"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Pantallas clínicas (consulta, ficha del paciente) con la caché de navegación de 30 s: si esta vista llega de la
// caché (ya se mostró esa misma versión), no se monta lo de adentro con datos viejos. Se pide de nuevo y se muestra
// el esqueleto hasta que llega la versión nueva. Así un editor nunca arranca con lo de antes de guardar.
// «generada» solo identifica cada versión que manda el servidor; nunca se compara con la hora de la PC.
const vistas = new Set<string>();

export function FrescoAlVolver({ generada, children, cargando }: { generada: string; children: ReactNode; cargando: ReactNode }) {
  const router = useRouter();
  // Se decide antes del primer dibujo: lo de adentro nunca llega a montarse con la versión vieja
  const [vieja] = useState(() => (vistas.has(generada) ? generada : null));

  useEffect(() => {
    if (vieja === generada) router.refresh();
    else vistas.add(generada);
  }, [generada, vieja, router]);

  return vieja === generada ? cargando : children;
}
