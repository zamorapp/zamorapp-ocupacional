"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { autenticadores } from "@/lib/dos-pasos";
import { olvidarEquipoNavegador } from "@/lib/equipo-confianza";
import { confirmar } from "@/components/app/confirmar";

type Autenticador = { id: string; friendly_name?: string; created_at: string };
type Equipo = { id: string; nombre: string; creado_en: string; vence: string };
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });

/** Tarjeta de "Mi perfil": estado de la verificación en dos pasos y cambio de teléfono. */
export function DosPasosCuenta({ obligatoria }: { obligatoria: boolean }) {
  const router = useRouter();
  const [lista, setLista] = useState<Autenticador[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipos, setEquipos] = useState<Equipo[]>([]);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    autenticadores(supabase).then(setLista);
    supabase.rpc("mis_equipos_confianza").then(({ data }) => setEquipos((data as Equipo[] | null) ?? []));
  }, []);

  // Si perdió o prestó un equipo: todos vuelven a pedir el código la próxima vez
  async function olvidarEquipos() {
    if (!(await confirmar({ titulo: "¿Olvidar todos los equipos de confianza?", texto: "Todos volverán a pedir el código la próxima vez que entres.", accion: "Olvidar todos", peligro: true }))) return;
    setOcupado(true);
    const { error } = await crearClienteNavegador().rpc("olvidar_equipos");
    setOcupado(false);
    if (error) { setError("No se pudo. Intenta de nuevo."); return; }
    olvidarEquipoNavegador();
    setEquipos([]);
  }

  async function cambiarTelefono() {
    if (!(await confirmar({ titulo: "¿Cambiar de teléfono?", texto: "Se desactivará el teléfono actual y te pediremos escanear un código QR nuevo.", accion: "Cambiar de teléfono", peligro: true }))) return;
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();
    for (const a of lista ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: a.id });
      if (error) { setOcupado(false); setError("No se pudo cambiar. Sal y vuelve a entrar con tu código, luego intenta de nuevo."); return; }
    }
    await supabase.auth.refreshSession();
    router.push("/login/dos-pasos");
  }

  return (
    <Card id="dos-pasos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Verificación en dos pasos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Además de la contraseña, se pide un código de 6 dígitos de la app autenticadora de tu teléfono. Entrar con
          huella no lo pide, y en un equipo de confianza se pide solo cada cierto tiempo.
          {obligatoria && " Es obligatoria para administradores y gerentes médicos."}
        </p>
        {lista === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : lista.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 font-medium text-primary">
              <ShieldCheck className="size-4" /> Activa desde el {fecha(lista[0].created_at)}
            </span>
            <Button variant="ghost" disabled={ocupado} onClick={cambiarTelefono}>
              {ocupado && <Loader2 className="animate-spin" />} Cambiar de teléfono
            </Button>
          </div>
        ) : (
          <Button onClick={() => router.push("/login/dos-pasos")}>Activar ahora</Button>
        )}
        {equipos.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="font-medium">Equipos de confianza (no piden el código)</p>
            <ul className="space-y-1 text-muted-foreground">
              {equipos.map((e) => <li key={e.id}>{e.nombre || "Equipo"} · hasta el {fecha(e.vence)}</li>)}
            </ul>
            <Button variant="outline" size="sm" disabled={ocupado} onClick={olvidarEquipos}>Olvidar todos</Button>
          </div>
        )}
        {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
