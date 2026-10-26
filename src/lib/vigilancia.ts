import "server-only";
import { supabaseConfigurado } from "@/lib/config";
import { listarEmpresas } from "@/lib/empresas";
import { opciones } from "@/lib/listas";
import { periodoDeConsulta, type ConsultaPeriodo } from "@/lib/periodos";
import {
  completarHorasHombre, indicadoresAusentismo, obtenerAccidentalidad, obtenerInforme, obtenerReporte, riesgosDeEmpresa, type Firmantes,
} from "@/lib/reportes";
import type { Sesion } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { textosSugeridos } from "@/lib/vigilancia-textos";

// Todo lo que necesitan la pantalla de Reportes y el informe impreso, calculado una sola vez
export async function cargarVigilancia(sesion: Sesion, empresaId: string | null, q: ConsultaPeriodo) {
  const empresas = await listarEmpresas();
  const empresa = empresas.find((e) => e.id === empresaId) ?? null;
  const periodo = periodoDeConsulta(q, empresa?.mesInicioGestion ?? 1);
  const listo = !sesion.demo && supabaseConfigurado;

  const [r, accBase, listas, informe, riesgos, perfil] = await Promise.all([
    listo ? obtenerReporte(empresaId, periodo) : null,
    listo ? obtenerAccidentalidad(empresaId, periodo) : null,
    opciones(sesion.orgId, ["causa_reposo", "ente_emisor_reposo", "clasificacion_aptitud"]),
    listo ? obtenerInforme(empresaId, periodo) : null,
    listo ? riesgosDeEmpresa(empresaId) : {},
    listo
      ? (async () => (await (await crearClienteServidor()).from("perfiles").select("nombre_completo, cedula").eq("id", sesion.usuarioId).maybeSingle()).data)()
      : null,
  ]);
  const nombre = (lista: string) => Object.fromEntries(listas[lista].map((i) => [i.codigo ?? i.nombre, i.nombre]));
  const causas = nombre("causa_reposo");
  const entes = nombre("ente_emisor_reposo");
  const aptitudes = nombre("clasificacion_aptitud");
  const acc = accBase && r ? completarHorasHombre(accBase, r.poblacion.total, periodo) : null;
  const ausentismo = r ? indicadoresAusentismo(r) : { pad: 0, pct: 0 };
  const sugeridos = r
    ? textosSugeridos({
        r,
        pct: ausentismo.pct,
        accidentes: acc?.accidentes ?? 0,
        conTiempoPerdido: acc?.con_tiempo_perdido ?? 0,
        enfermedades: acc?.enfermedades ?? 0,
        riesgos,
        causas,
        aptitudes,
      })
    : null;
  // El médico que redacta firma por defecto como médico ocupacional
  const firmantesBase: Firmantes = perfil?.nombre_completo ? { medico: { nombre: perfil.nombre_completo, cedula: perfil.cedula ?? "" } } : {};

  return { empresas, empresa, periodo, r, acc, causas, entes, aptitudes, ausentismo, informe, sugeridos, firmantesBase };
}
