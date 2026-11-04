import "server-only";
import { claveCargo } from "@/lib/cargos";
import type { crearClienteServidor } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof crearClienteServidor>>;

// Busca por nombre o crea la dependencia y el puesto dentro de la empresa; devuelve sus ids. El nombre se compara
// sin mayúsculas, acentos, signos ni «de/del/la…» (claveCargo, igual que la base): «ADMINISTRACION CONTRATO» usa
// «Administración de contrato». Un cargo unido a otro (alias, Configuración › Unir cargos) lleva al que quedó.
export async function resolverCatalogos(supabase: Supabase, orgId: string, empresaId: string, dependencias: string[], cargos: string[]) {
  const deps = new Map<string, string>();
  const puestos = new Map<string, string>();
  const clave = claveCargo;

  if (dependencias.length) {
    const { data } = await supabase.from("dependencias").select("id, nombre").eq("empresa_id", empresaId).eq("activa", true);
    for (const d of data ?? []) if (!deps.has(clave(d.nombre))) deps.set(clave(d.nombre), d.id);
    const nuevas = [...new Map(dependencias.map((d) => [clave(d), d.trim()])).values()].filter((d) => !deps.has(clave(d)));
    if (nuevas.length) {
      const { data: creadas, error } = await supabase
        .from("dependencias")
        .insert(nuevas.map((nombre) => ({ org_id: orgId, empresa_id: empresaId, nombre })))
        .select("id, nombre");
      if (error) throw new Error("No se pudieron crear las dependencias: " + error.message);
      for (const d of creadas ?? []) deps.set(clave(d.nombre), d.id);
    }
  }

  if (cargos.length) {
    const { data } = await supabase.from("puestos").select("id, nombre, activo, unido_a").eq("empresa_id", empresaId);
    const activos = new Set<string>();
    for (const p of data ?? []) if (p.activo && !puestos.has(clave(p.nombre))) { puestos.set(clave(p.nombre), p.id); activos.add(p.id); }
    for (const p of data ?? []) if (!p.activo && p.unido_a && activos.has(p.unido_a) && !puestos.has(clave(p.nombre))) puestos.set(clave(p.nombre), p.unido_a);
    const nuevos = [...new Map(cargos.map((c) => [clave(c), c.trim()])).values()].filter((c) => !puestos.has(clave(c)));
    if (nuevos.length) {
      const { data: creados, error } = await supabase
        .from("puestos")
        .insert(nuevos.map((nombre) => ({ org_id: orgId, empresa_id: empresaId, nombre })))
        .select("id, nombre");
      if (error) throw new Error("No se pudieron crear los cargos: " + error.message);
      for (const p of creados ?? []) puestos.set(clave(p.nombre), p.id);
    }
  }

  return {
    dependencia: (n: string | null) => (n ? deps.get(clave(n)) ?? null : null),
    puesto: (n: string | null) => (n ? puestos.get(clave(n)) ?? null : null),
  };
}

// Tipo de paciente por nombre ("Empleado", "Obrero"…); si no existe en la lista se agrega
export async function resolverTiposPaciente(supabase: Supabase, orgId: string, nombres: string[]) {
  const clave = (s: string) => s.trim().toLowerCase();
  const mapa = new Map<string, string>();
  const { data } = await supabase.from("lista_items").select("id, nombre").eq("org_id", orgId).eq("lista", "tipo_paciente");
  for (const t of data ?? []) mapa.set(clave(t.nombre), t.id);
  const nuevos = [...new Set(nombres.map((n) => n.trim()))].filter((n) => !mapa.has(clave(n)));
  if (nuevos.length) {
    const { data: creados } = await supabase
      .from("lista_items")
      .insert(nuevos.map((nombre, i) => ({ lista: "tipo_paciente", org_id: orgId, nombre, orden: 100 + i })))
      .select("id, nombre");
    for (const t of creados ?? []) mapa.set(clave(t.nombre), t.id);
  }
  return (n: string) => (n ? mapa.get(clave(n)) ?? null : null);
}

