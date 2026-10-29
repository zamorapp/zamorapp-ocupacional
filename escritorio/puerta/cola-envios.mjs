// Cola de envíos: el correo nunca sale de la PC (la clave de Gmail vive solo en Vercel). La app registra el correo
// «en_cola» con su PDF; la puerta le pide a la web (/api/envios/correo) que lo envíe con la sesión de nube de quien lo
// registró. Se llama al guardar (/zamorapp/enviar-cola) y tras cada sincronía mientras la copia tenga correos en cola.
// Las esperas usan performance.now(): Cesar cambia la fecha de Windows para abrir el SAME.
import { performance } from "node:perf_hooks";
import pg from "pg";

const ESPERA_MS = 2 * 60 * 1000; // entre barridos del mismo usuario, si lo anterior no avanzó

export class ColaEnvios {
  constructor({ nube, motor, web, registro = () => {} }) {
    Object.assign(this, { nube, motor, web, registro });
    this.ultimo = new Map();
  }

  // Envía ya los correos en cola de un usuario (todos, o los ids dados). Sin internet o sin sesión de nube no hace nada:
  // quedan en cola y salen en una sincronía posterior.
  async despachar(uid, ids) {
    if (!(await this.nube.confirmar())) return { enLinea: false, resultados: [] };
    let token = null;
    try {
      token = await this.nube.token(uid);
    } catch (e) {
      this.nube.marcarCaida(`cola de envíos: ${e.message}`);
      return { enLinea: false, resultados: [] };
    }
    if (!token) return { enLinea: true, sinSesion: true, resultados: [] };
    try {
      const r = await fetch(`${this.web}/api/envios/correo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(Array.isArray(ids) ? { ids: ids.filter((x) => typeof x === "string").slice(0, 50) } : {}),
        signal: AbortSignal.timeout(120_000),
      });
      const j = await r.json().catch(() => null);
      const resultados = Array.isArray(j?.resultados) ? j.resultados : [];
      const cuenta = (e) => resultados.filter((x) => x.estado === e).length;
      this.registro(`[envíos] cola: ${r.status} · ${cuenta("enviado")} enviado(s), ${cuenta("fallido")} fallido(s), ${cuenta("en_cola")} esperando el PDF`);
      return { enLinea: true, resultados, error: r.ok ? undefined : j?.mensaje || `La web respondió ${r.status}` };
    } catch (e) {
      this.registro(`[envíos] cola: la web no respondió (${e.message})`);
      return { enLinea: true, resultados: [], error: e.message };
    }
  }

  // Tras cada sincronía: usuarios con correos en cola en la copia local (subidos por la bandeja o que la web aún no tomó)
  async barrer() {
    if (!this.nube.enLinea || this.ocupada) return;
    this.ocupada = true;
    const c = new pg.Client({ connectionString: this.motor.url() });
    try {
      await c.connect();
      const { rows } = await c.query("select distinct enviado_por::text as uid from public.envios where estado = 'en_cola' and canal = 'correo'");
      for (const { uid } of rows) {
        if (performance.now() - (this.ultimo.get(uid) ?? -Infinity) < ESPERA_MS) continue;
        this.ultimo.set(uid, performance.now());
        await this.despachar(uid);
      }
    } catch (e) {
      // Copia de una versión anterior sin la tabla de envíos: nada que barrer
      if (e.code !== "42P01") this.registro(`[envíos] barrido: ${e.message}`);
    } finally {
      this.ocupada = false;
      await c.end().catch(() => {});
    }
  }
}
