"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseConfigurado } from "@/lib/config";
import { COOKIE_EMPRESA } from "@/lib/empresa-activa";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function salir() {
  if (supabaseConfigurado) {
    const supabase = await crearClienteServidor();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function elegirEmpresa(id: string | null) {
  const almacen = await cookies();
  if (id) almacen.set(COOKIE_EMPRESA, id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  else almacen.delete(COOKIE_EMPRESA);
  revalidatePath("/", "layout");
}
