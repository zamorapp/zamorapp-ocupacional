"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Vuelve a pedir la página cada cierto tiempo para ver en vivo el estado de las citas
export function Refrescar({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}
