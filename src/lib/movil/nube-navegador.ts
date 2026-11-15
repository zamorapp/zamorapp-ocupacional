// La nube vista desde el celular: el cliente de Supabase del navegador (sesión del usuario, token de equipo de
// confianza) más la hora de la nube. Solo se usa con señal; sin ella, enLinea() es falso y el motor no llama nada.
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { ErrorNube, type Fila, type Nube } from "./motor";
import type { RelojMovil } from "./reloj";

export class NubeNavegador implements Nube {
  private sb: SupabaseClient = crearClienteNavegador();
  constructor(private reloj: RelojMovil) {}

  enLinea() { return typeof navigator === "undefined" || navigator.onLine; }

  // La cabecera Date de nuestro propio dominio (Vercel) ancla el reloj. Si falla, no hay señal útil.
  async anclar() {
    try {
      const r = await fetch("/api/hora", { cache: "no-store" });
      return r.ok && this.reloj.anclar(r.headers.get("date"));
    } catch { return false; }
  }

  async uid() {
    const { data } = await this.sb.auth.getUser();
    return data.user?.id ?? null;
  }

  async rpc<T = unknown>(nombre: string, args: Record<string, unknown>): Promise<T> {
    if (!this.reloj.verificada) await this.anclar();
    const { data, error, status } = await this.sb.rpc(nombre, args);
    if (error) throw new ErrorNube(error.message, error.code, status);
    return data as T;
  }

  // La fila de la nube por la vista pública del mismo nombre (security_invoker: la RLS es la del usuario)
  async fila(tabla: string, id: string): Promise<Fila | null> {
    const { data, error } = await this.sb.from(tabla.split(".")[1]).select("*").eq("id", id).maybeSingle();
    if (error) throw new ErrorNube(error.message, error.code);
    return (data as Fila | null) ?? null;
  }

  // Para registrar el teléfono: la organización donde el usuario es administrador y si cumple los dos pasos
  async orgAdministrador(uid: string) {
    const { data } = await this.sb.from("miembros").select("org_id").eq("usuario_id", uid).eq("rol", "administrador").eq("activo", true).limit(1).maybeSingle();
    return (data?.org_id as string | undefined) ?? null;
  }

  async rol(uid: string) {
    const { data } = await this.sb.from("miembros").select("rol").eq("usuario_id", uid).eq("activo", true).limit(1).maybeSingle();
    return (data?.rol as string | undefined) ?? null;
  }
}
