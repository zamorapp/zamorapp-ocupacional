"use client";

import { useEffect, useReducer } from "react";
import type { Motor } from "@/lib/movil/motor";

// Vuelve a dibujar cuando el motor guarda o sincroniza
export function useMotor(m: Motor) {
  const [, forzar] = useReducer((x: number) => x + 1, 0);
  useEffect(() => m.suscribir(forzar), [m]);
  return m.estado();
}
