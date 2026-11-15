"use client";

import { useEffect } from "react";
import { marcarAbierto } from "./acciones";

// Anota que el paciente abrió el enlace (para «Enlaces enviados» del servicio). No muestra nada.
export function MarcarAbierto({ token }: { token: string }) {
  useEffect(() => { marcarAbierto(token).catch(() => {}); }, [token]);
  return null;
}
