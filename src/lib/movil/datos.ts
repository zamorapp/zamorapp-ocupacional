// Lecturas de la copia del teléfono para las pantallas de /movil (todo en memoria tras abrir con el PIN).
import type { Fila, Motor } from "./motor";

export type Paciente = { id: string; cedula: string; nombres: string; apellidos: string; numero: number | null; empresa: string; estado: string };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const s = (v: unknown) => (v == null ? "" : String(v));

export function empresas(m: Motor) {
  return [...m.tabla("public.empresas").values()]
    .filter((e) => e.activa !== false)
    .map((e) => ({ id: s(e.id), nombre: s(e.nombre_comercial || e.razon_social) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function nombreEmpresa(m: Motor, id: unknown) {
  const e = m.tabla("public.empresas").get(s(id));
  return e ? s(e.nombre_comercial || e.razon_social) : "";
}

export function paciente(m: Motor, id: string): (Paciente & { fila: Fila }) | null {
  const t = m.tabla("public.trabajadores").get(id);
  if (!t) return null;
  return { id, cedula: s(t.cedula), nombres: s(t.nombres), apellidos: s(t.apellidos), numero: (t.numero_historia as number) ?? null,
           empresa: nombreEmpresa(m, t.empresa_id), estado: s(t.estado), fila: t };
}

// Cédula (con o sin V-, puntos) o palabras del nombre en cualquier orden, sin acentos
export function buscarPacientes(m: Motor, texto: string, limite = 30): Paciente[] {
  const q = sinAcentos(texto.trim());
  if (!q) return [];
  const digitos = q.replace(/\D/g, "");
  const palabras = q.split(/\s+/).filter(Boolean);
  const salida: Paciente[] = [];
  for (const t of m.tabla("public.trabajadores").values()) {
    const ced = s(t.cedula).replace(/\D/g, "");
    const nombre = sinAcentos(`${s(t.nombres)} ${s(t.apellidos)}`);
    const ok = (digitos.length >= 3 && ced.includes(digitos)) || palabras.every((p) => nombre.includes(p));
    if (ok) salida.push(paciente(m, s(t.id))!);
    if (salida.length >= limite * 3) break;
  }
  // Primero la cédula exacta, luego por apellido
  return salida.sort((a, b) => Number(b.cedula.replace(/\D/g, "") === digitos) - Number(a.cedula.replace(/\D/g, "") === digitos)
    || a.apellidos.localeCompare(b.apellidos)).slice(0, limite);
}

export function consultasDe(m: Motor, trabajadorId: string) {
  const dx = diagnosticosPorConsulta(m);
  return [...m.tabla("clinico.consultas").values()]
    .filter((c) => c.trabajador_id === trabajadorId)
    .sort((a, b) => s(b.fecha).localeCompare(s(a.fecha)) || s(b.hora_inicio).localeCompare(s(a.hora_inicio)))
    .map((c) => ({ fila: c, diagnosticos: dx.get(s(c.id)) ?? [], motivo: nombreItem(m, c.motivo_id) }));
}

export function diagnosticosPorConsulta(m: Motor) {
  const mapa = new Map<string, Fila[]>();
  for (const d of m.tabla("clinico.diagnosticos").values()) {
    const k = s(d.consulta_id);
    mapa.set(k, [...(mapa.get(k) ?? []), d]);
  }
  for (const l of mapa.values()) l.sort((a, b) => Number(b.principal) - Number(a.principal));
  return mapa;
}

export const repososDe = (m: Motor, trabajadorId: string) =>
  [...m.tabla("clinico.reposos").values()].filter((r) => r.trabajador_id === trabajadorId).sort((a, b) => s(b.desde).localeCompare(s(a.desde)));

export const reposoDeConsulta = (m: Motor, consultaId: string) =>
  [...m.tabla("clinico.reposos").values()].find((r) => r.consulta_id === consultaId) ?? null;

export function items(m: Motor, lista: string) {
  const org = m.meta.equipo?.org_id;
  return [...m.tabla("public.lista_items").values()]
    .filter((i) => i.lista === lista && i.activo !== false && (i.org_id == null || i.org_id === org))
    .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0) || s(a.nombre).localeCompare(s(b.nombre)));
}

export function nombreItem(m: Motor, id: unknown) {
  return id ? s(m.tabla("public.lista_items").get(s(id))?.nombre) : "";
}

// Diagnósticos: primero los ya usados por el servicio (más frecuentes), luego el catálogo CIE-10; palabras en cualquier orden
export function buscarDiagnosticos(m: Motor, texto: string, limite = 15) {
  const palabras = sinAcentos(texto.trim()).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const usos = new Map<string, { cie10: string; descripcion: string; usos: number }>();
  for (const d of m.tabla("clinico.diagnosticos").values()) {
    const k = s(d.cie10);
    const u = usos.get(k);
    if (u) u.usos++; else usos.set(k, { cie10: k, descripcion: s(d.descripcion), usos: 1 });
  }
  const coincide = (t: string) => { const x = sinAcentos(t); return palabras.every((p) => x.includes(p)); };
  const usados = [...usos.values()].filter((u) => coincide(`${u.cie10} ${u.descripcion}`)).sort((a, b) => b.usos - a.usos);
  const vistos = new Set(usados.map((u) => u.cie10));
  const salida = usados.slice(0, limite);
  for (const c of m.tabla("public.cie10").values()) {
    if (salida.length >= limite) break;
    if (vistos.has(s(c.codigo))) continue;
    if (coincide(s(c.busqueda) || `${s(c.codigo)} ${s(c.descripcion)}`)) salida.push({ cie10: s(c.codigo), descripcion: s(c.descripcion), usos: 0 });
  }
  return salida;
}
