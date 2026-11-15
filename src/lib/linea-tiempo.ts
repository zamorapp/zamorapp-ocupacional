import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ETIQUETA_APTITUD, type Aptitud } from "@/lib/pacientes";
import { hoyCaracas } from "@/lib/fecha";

// Línea de tiempo del trabajador (ficha del paciente, Cesar 14-nov). Solo FECHA, TIPO y RESULTADO de cada cosa:
// nunca diagnósticos, CIE-10, descripción del accidente ni nada clínico, así sirve igual al médico y a RR. HH.
// Cada rol lee solo lo que su RLS le deja: el personal de salud sus consultas y reposos; RR. HH. la aptitud por la vista
// segura aptitud_trabajadores. Accidentes: el personal de la tabla eventos; RR. HH. (gerente_empresa) de la vista
// eventos_empresa, porque la regla eventos_sin_rrhh le cierra la tabla (igual que tabla() en lib/eventos.ts).

export type CarrilTiempo = "examen" | "consulta" | "reposo" | "accidente";
// nivel: ok (verde, círculo) · aviso (amarillo, rombo) · alerta (rojo, cuadro/triángulo): siempre con palabra en «resultado»
export type MarcaTiempo = {
  carril: CarrilTiempo;
  fecha: string; // aaaa-mm-dd
  hasta?: string; // reposos
  titulo: string;
  resultado: string;
  nivel: "ok" | "aviso" | "alerta";
  href?: string;
};

const NIVEL_APTITUD: Record<Aptitud, MarcaTiempo["nivel"]> = {
  elegible: "ok", elegible_con_restricciones: "aviso", no_elegible: "alerta", espera_resultados: "aviso", diferido: "aviso",
};
const CAUSA: Record<string, string> = {
  enfermedad_comun: "Enfermedad común", enfermedad_ocupacional: "Enfermedad ocupacional", accidente_comun: "Accidente común",
  accidente_laboral: "Accidente laboral", prenatal: "Prenatal", postnatal: "Postnatal", paternidad: "Paternidad", lactancia: "Lactancia",
};
const ENTE: Record<string, string> = { servicio_medico: "servicio médico", ivss: "IVSS", particular: "médico particular" };
const GRAVEDAD: Record<string, string> = { leve: "Leve", moderado: "Moderado", grave: "Grave", mortal: "Mortal" };

export type ConsultaParaTiempo = { id: string; fecha: string; motivo: string; tipo: string; aptitud: Aptitud | null; demo: boolean };

// Consultas: con aptitud cuentan como examen (preventivo); sin aptitud, como consulta
export function marcasDeConsultas(consultas: ConsultaParaTiempo[]): MarcaTiempo[] {
  return consultas.map((c) => c.aptitud
    ? { carril: "examen" as const, fecha: c.fecha, titulo: c.motivo || c.tipo, resultado: ETIQUETA_APTITUD[c.aptitud], nivel: NIVEL_APTITUD[c.aptitud], href: c.demo ? undefined : `/atencion/${c.id}` }
    : { carril: "consulta" as const, fecha: c.fecha, titulo: c.motivo || "Consulta", resultado: c.tipo, nivel: "ok" as const, href: c.demo ? undefined : `/atencion/${c.id}` });
}

export async function lineaDeTiempo(trabajadorId: string, clinico: boolean, rol: string | null, consultas: ConsultaParaTiempo[]): Promise<MarcaTiempo[]> {
  if (!supabaseConfigurado) return [];
  const supabase = await crearClienteServidor();
  const [reposos, aptitudes, eventos] = await Promise.all([
    clinico
      ? supabase.from("reposos").select("consulta_id, desde, hasta, dias, causa, ente_emisor").eq("trabajador_id", trabajadorId).order("desde").limit(200)
      : Promise.resolve({ data: [] as { consulta_id: string | null; desde: string; hasta: string; dias: number; causa: string; ente_emisor: string }[] }),
    // RR. HH. no lee consultas: ve la aptitud por la vista segura (sin diagnóstico)
    clinico
      ? Promise.resolve({ data: [] as { fecha: string; clasificacion: Aptitud }[] })
      : supabase.from("aptitud_trabajadores").select("fecha, clasificacion").eq("trabajador_id", trabajadorId).order("fecha").limit(200).returns<{ fecha: string; clasificacion: Aptitud }[]>(),
    supabase.from(rol === "gerente_empresa" ? "eventos_empresa" : "eventos").select("id, tipo, subtipo, fecha_hora, gravedad, dias_perdidos").eq("trabajador_id", trabajadorId).order("fecha_hora").limit(200)
      .returns<{ id: string; tipo: string; subtipo: string | null; fecha_hora: string; gravedad: string | null; dias_perdidos: number | null }[]>(),
  ]);
  const hoy = hoyCaracas();
  const marcas: MarcaTiempo[] = clinico ? marcasDeConsultas(consultas) : (aptitudes.data ?? []).map((a) => ({
    carril: "examen", fecha: a.fecha, titulo: "Evaluación médica", resultado: ETIQUETA_APTITUD[a.clasificacion] ?? a.clasificacion, nivel: NIVEL_APTITUD[a.clasificacion] ?? "aviso",
  }));
  for (const r of reposos.data ?? []) {
    marcas.push({
      carril: "reposo", fecha: r.desde, hasta: r.hasta, titulo: `Reposo de ${r.dias} ${r.dias === 1 ? "día" : "días"}`,
      resultado: `${CAUSA[r.causa] ?? "Reposo"} · emitido por ${ENTE[r.ente_emisor] ?? r.ente_emisor}${r.hasta >= hoy ? " · en curso" : ""}`,
      nivel: "aviso", href: r.consulta_id ? `/atencion/${r.consulta_id}` : undefined,
    });
  }
  for (const e of eventos.data ?? []) {
    const nombre = e.tipo === "accidente" ? (e.subtipo === "in_itinere" ? "Accidente en el trayecto" : "Accidente de trabajo") : e.tipo === "incidente" ? "Incidente" : "Enfermedad ocupacional";
    marcas.push({
      carril: "accidente", fecha: hoyCaracas(e.fecha_hora), titulo: nombre,
      resultado: [e.gravedad ? GRAVEDAD[e.gravedad] : null, e.dias_perdidos ? `${e.dias_perdidos} días perdidos` : null].filter(Boolean).join(" · ") || "Registrado",
      nivel: e.gravedad === "grave" || e.gravedad === "mortal" ? "alerta" : "aviso", href: `/accidentes/${e.id}`,
    });
  }
  return marcas.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Modo demo (sin base): reposos y accidentes de ejemplo para ver la franja completa
export const MARCAS_DEMO: Record<string, MarcaTiempo[]> = {
  t2: [
    { carril: "reposo", fecha: "2025-11-02", hasta: "2025-11-08", titulo: "Reposo de 7 días", resultado: "Accidente laboral · emitido por servicio médico", nivel: "aviso" },
    { carril: "accidente", fecha: "2025-11-02", titulo: "Accidente de trabajo", resultado: "Leve · 7 días perdidos", nivel: "aviso" },
    { carril: "reposo", fecha: "2024-08-05", hasta: "2024-08-19", titulo: "Reposo de 15 días", resultado: "Enfermedad común · emitido por IVSS", nivel: "aviso" },
  ],
};
