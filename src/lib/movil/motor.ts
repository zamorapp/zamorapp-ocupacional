// Motor del celular sin internet. NO es un motor de sincronía nuevo: el celular es un equipo más (public.equipos)
// y usa las mismas funciones de la nube que la PC (instantanea, cambios_desde, aplicar_cambios, reservar_bloque).
// Las reglas son las de la bandeja y la réplica de la PC (escritorio/puerta/bandeja.mjs, replica.mjs y
// escritorio/base/20_bandeja.sql), acordadas con el Arquitecto el 30-oct-2026:
// - un cambio por fila en cada envío; lo guardado mientras subía se funde y queda pendiente con id nuevo;
// - la base de cada cambio es la versión que la nube confirmó (versionNube), nunca la de la copia;
// - la bajada no pisa una fila con cambio pendiente ni una versión más nueva;
// - conflicto o rechazo: el cambio queda con su motivo y la fila vuelve a bajar; nada «último gana»;
// - hora_verificada solo con la hora anclada a la nube; plazos con el reloj anclado, nunca Date.now().
import type { Almacen } from "./almacen";
import type { RelojMovil } from "./reloj";

export type Fila = Record<string, unknown> & { id?: string };
export type Op = "I" | "U" | "D";
export type Cambio = {
  id: string; orden: number; tabla: string; fila_id: string; op: Op; version_base: number | null;
  datos: Record<string, unknown> | null; autor: string | null; creado: string;
  estado: "pendiente" | "conflicto" | "rechazado"; motivo: string | null; intentos: number; hora_verificada: boolean;
};
export type Equipo = { id: string; secreto: string; org_id: string; nombre: string; uid: string; serie?: string };
type Meta = {
  equipo: Equipo | null; cursor: number | null; bloques: { desde: number; hasta: number }[];
  ultimoContacto: number | null; arranquesSinNube: number; catalogosEn: number | null; orden: number; piso: number;
};

// Lo que pide el celular a la nube: la sesión del usuario (RLS y dos pasos los aplica la nube)
export interface Nube {
  enLinea(): boolean;
  uid(): Promise<string | null>;
  rpc<T = unknown>(nombre: string, args: Record<string, unknown>): Promise<T>;
  // Una fila tal como está en la nube, con la RLS del usuario (para reponerla tras un conflicto)
  fila(tabla: string, id: string): Promise<Fila | null>;
}

export class ErrorNube extends Error {
  constructor(mensaje: string, public code?: string, public status?: number) { super(mensaje); }
}

// Tablas que el celular copia. Referencia: select nombre, subible from sync.tablas (Arquitecto, 30-oct).
// Sin bitácora, accesos ni miembros. De adjuntos, las filas sí y los archivos no.
export const TABLAS = [
  "public.empresas", "public.sedes", "public.dependencias", "public.puestos", "public.lista_items", "public.trabajadores",
  "clinico.consultas", "clinico.diagnosticos", "clinico.reposos", "clinico.aptitudes", "clinico.historia_laboral", "clinico.adjuntos",
];
// Solo lectura y sin id (fuera de sync.tablas): se bajan enteras y se renuevan cada semana
export const CATALOGOS: { tabla: string; clave: string }[] = [{ tabla: "public.cie10", clave: "codigo" }];
const SUBEN_PRIMERO: Record<string, number> = {
  "public.empresas": 0, "public.sedes": 0, "public.dependencias": 0, "public.puestos": 0, "public.lista_items": 0,
  "public.trabajadores": 1, "clinico.consultas": 2,
};
const prioridad = (t: string) => SUBEN_PRIMERO[t] ?? 3;
const LOTE = 200;
const REINTENTOS = 5;
const DIA = 86_400_000;
export const DIAS_SIN_CONEXION = 7; // Analizar: mismo tope que la PC
export const ARRANQUES_SIN_NUBE = 30; // sin ancla la fecha del teléfono podría quedarse quieta
const NO_SUBEN = new Set(["version", "creado_en", "actualizado_en", "dias", "hora_equipo"]);

const cubeta = (id: string) => id.slice(0, 2).toLowerCase();
const uuid = () => crypto.randomUUID();
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type Estado = {
  registrado: boolean; pendientes: number; conflictos: number; rechazados: number;
  ultimaSincronia: number | null; diasSinConexion: number | null; bloqueadoPorTiempo: boolean;
  numerosLibres: number; error: string | null; sincronizando: boolean; progreso: string | null; horaVerificada: boolean;
};

export class Motor {
  tablas = new Map<string, Map<string, Fila>>();
  versionNube = new Map<string, number>();
  bandeja = new Map<string, Cambio>();
  meta: Meta = { equipo: null, cursor: null, bloques: [], ultimoContacto: null, arranquesSinNube: 0, catalogosEn: null, orden: 0, piso: 0 };
  error: string | null = null;
  sincronizando = false;
  progreso: string | null = null;
  private sucias = new Set<string>();
  private bandejaSucia = new Set<string>();
  private enCurso: Promise<void> | null = null;
  private oyentes = new Set<() => void>();

  constructor(private almacen: Almacen, private nube: Nube, public reloj: RelojMovil,
              private alRevocar: () => Promise<void> = async () => {}) {}

  // ─── Carga y guardado en el teléfono ───
  async cargar() {
    const todo = await this.almacen.todos();
    for (const [k, v] of todo) {
      if (k === "m") this.meta = { ...this.meta, ...(v as Meta) };
      else if (k.startsWith("b|")) this.bandeja.set(k.slice(2), v as Cambio);
      else if (k.startsWith("f|")) {
        const [, tabla] = k.split("|");
        const { f, v: versiones } = v as { f: Record<string, Fila>; v: Record<string, number> };
        const t = this.tabla(tabla);
        for (const [id, fila] of Object.entries(f)) t.set(id, fila);
        for (const [id, n] of Object.entries(versiones ?? {})) this.versionNube.set(`${tabla}|${id}`, n);
      }
    }
    this.reloj.piso = Math.max(this.reloj.piso, this.meta.piso || 0);
  }

  tabla(nombre: string) {
    let t = this.tablas.get(nombre);
    if (!t) { t = new Map(); this.tablas.set(nombre, t); }
    return t;
  }

  private ensuciar(tabla: string, id: string) {
    this.sucias.add(CATALOGOS.some((c) => c.tabla === tabla) ? `${tabla}|*` : `${tabla}|${cubeta(id)}`);
  }

  // Todo lo pendiente en una sola transacción (un corte de luz deja todo o nada)
  async persistir() {
    const cambios: [string, unknown][] = [];
    for (const s of this.sucias) {
      const [tabla, c] = s.split("|");
      const f: Record<string, Fila> = {}, v: Record<string, number> = {};
      for (const [id, fila] of this.tabla(tabla)) if (c === "*" || cubeta(id) === c) f[id] = fila;
      for (const id of Object.keys(f)) { const n = this.versionNube.get(`${tabla}|${id}`); if (n != null) v[id] = n; }
      cambios.push([`f|${tabla}|${c}`, Object.keys(f).length ? { f, v } : undefined]);
    }
    for (const id of this.bandejaSucia) cambios.push([`b|${id}`, this.bandeja.get(id)]);
    this.meta.piso = this.reloj.piso;
    cambios.push(["m", this.meta]);
    this.sucias.clear(); this.bandejaSucia.clear();
    await this.almacen.poner(cambios);
    this.avisar();
  }

  suscribir(fn: () => void) { this.oyentes.add(fn); return () => { this.oyentes.delete(fn); }; }
  private avisar() { for (const fn of this.oyentes) fn(); }

  private ponerCambio(c: Cambio) { this.bandeja.set(c.id, c); this.bandejaSucia.add(c.id); }
  private quitarCambio(id: string) { this.bandeja.delete(id); this.bandejaSucia.add(id); }
  private pendienteDe(tabla: string, id: string) {
    let p: Cambio | null = null;
    for (const c of this.bandeja.values()) if (c.estado === "pendiente" && c.tabla === tabla && c.fila_id === id && (!p || c.orden > p.orden)) p = c;
    return p;
  }

  // ─── Lo que guarda la pantalla (igual que local.encolar en la PC) ───
  insertar(tabla: string, datos: Fila, autor: string) {
    const id = String(datos.id ?? uuid());
    const org = this.meta.equipo?.org_id;
    const limpio = Object.fromEntries(Object.entries({ ...datos, id, org_id: datos.org_id ?? org }).filter(([k]) => !NO_SUBEN.has(k)));
    this.tabla(tabla).set(id, { ...limpio, version: null });
    this.ensuciar(tabla, id);
    this.ponerCambio(this.nuevoCambio(tabla, id, "I", null, limpio, autor));
    return id;
  }

  actualizar(tabla: string, id: string, campos: Fila, autor: string) {
    const actual = this.tabla(tabla).get(id);
    if (!actual) throw new Error("No existe esa fila en el teléfono");
    const datos: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(campos)) if (!NO_SUBEN.has(k) && k !== "id" && !igual(actual[k], v)) datos[k] = v;
    if (!Object.keys(datos).length) return false;
    this.tabla(tabla).set(id, { ...actual, ...datos });
    this.ensuciar(tabla, id);
    const pend = this.pendienteDe(tabla, id);
    if (pend && pend.op !== "D") {
      // Ya hay algo por subir de esta fila: se funde (una inserción pendiente sigue siendo inserción)
      this.ponerCambio({ ...pend, datos: { ...(pend.datos ?? {}), ...datos }, hora_verificada: pend.hora_verificada && this.reloj.verificada });
    } else {
      this.ponerCambio(this.nuevoCambio(tabla, id, "U", this.base(tabla, id, actual), datos, autor));
    }
    return true;
  }

  borrar(tabla: string, id: string, autor: string) {
    const actual = this.tabla(tabla).get(id);
    if (!actual) return;
    this.tabla(tabla).delete(id);
    this.ensuciar(tabla, id);
    const pend = this.pendienteDe(tabla, id);
    // Una fila creada en el teléfono y borrada antes de subir nunca existió para la nube
    for (const c of [...this.bandeja.values()]) if (c.estado === "pendiente" && c.tabla === tabla && c.fila_id === id) this.quitarCambio(c.id);
    if (pend?.op !== "I") this.ponerCambio(this.nuevoCambio(tabla, id, "D", this.base(tabla, id, actual), null, autor));
  }

  private base(tabla: string, id: string, actual: Fila) {
    return this.versionNube.get(`${tabla}|${id}`) ?? (actual.version as number | null) ?? null;
  }

  private nuevoCambio(tabla: string, fila_id: string, op: Op, version_base: number | null, datos: Record<string, unknown> | null, autor: string): Cambio {
    return { id: uuid(), orden: ++this.meta.orden, tabla, fila_id, op, version_base, datos, autor, creado: this.reloj.iso(),
             estado: "pendiente", motivo: null, intentos: 0, hora_verificada: this.reloj.verificada };
  }

  // ─── Números de historia: bloques reservados por este equipo (sin bloque, el alta pide internet) ───
  numerosLibres() {
    const usados = new Set<number>();
    for (const t of this.tabla("public.trabajadores").values()) if (typeof t.numero_historia === "number") usados.add(t.numero_historia);
    const libres: number[] = [];
    for (const b of this.meta.bloques) for (let n = b.desde; n <= b.hasta; n++) if (!usados.has(n)) libres.push(n);
    return libres;
  }

  // ─── Estado para la pantalla ───
  estado(): Estado {
    let pendientes = 0, conflictos = 0, rechazados = 0;
    for (const c of this.bandeja.values()) {
      if (c.estado === "pendiente") pendientes++; else if (c.estado === "conflicto") conflictos++; else rechazados++;
    }
    const dias = this.meta.ultimoContacto == null ? null : Math.floor((this.reloj.ahora() - this.meta.ultimoContacto) / DIA);
    return {
      registrado: Boolean(this.meta.equipo), pendientes, conflictos, rechazados, ultimaSincronia: this.meta.ultimoContacto,
      diasSinConexion: dias, bloqueadoPorTiempo: this.bloqueadoPorTiempo(), numerosLibres: this.numerosLibres().length,
      error: this.error, sincronizando: this.sincronizando, progreso: this.progreso, horaVerificada: this.reloj.verificada,
    };
  }

  // 7 días sin conectarse (o 30 aperturas sin poder anclar la hora): se piden datos de la nube antes de mostrar
  // los del teléfono. Lo pendiente por subir no se toca.
  bloqueadoPorTiempo() {
    if (!this.meta.equipo || this.meta.ultimoContacto == null) return false;
    return this.reloj.ahora() - this.meta.ultimoContacto > DIAS_SIN_CONEXION * DIA || this.meta.arranquesSinNube > ARRANQUES_SIN_NUBE;
  }

  async contarApertura() {
    if (this.reloj.verificada) return;
    this.meta.arranquesSinNube += 1;
    await this.persistir();
  }

  // ─── Sincronía: subir y luego bajar. Una a la vez; si ya hay una, se espera esa ───
  sincronizar(): Promise<void> {
    this.enCurso ??= this.ciclo().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  private async ciclo() {
    if (!this.meta.equipo || !this.nube.enLinea()) return;
    this.sincronizando = true; this.error = null; this.avisar();
    try {
      const uid = await this.nube.uid();
      if (!uid) { this.error = "Entra con tu usuario (con internet) para sincronizar"; return; }
      if (uid !== this.meta.equipo.uid) { this.error = "Este teléfono está registrado con otro usuario"; return; }
      await this.subir(uid);
      await this.bajar();
      await this.reservarSiHaceFalta();
      this.meta.ultimoContacto = this.reloj.ahora();
      this.meta.arranquesSinNube = 0;
      await this.persistir();
    } catch (e) {
      const err = e as ErrorNube;
      if (/Equipo no autorizado|desactivado/i.test(err.message)) {
        // Desactivado desde Configuración › Equipos: borrado remoto
        this.error = "Este teléfono fue desactivado: se borró su copia";
        await this.alRevocar();
        return;
      }
      this.error = /dos pasos/i.test(err.message)
        ? "Falta la verificación en dos pasos: abre la app con internet y escribe tu código"
        : err.status || err.code ? `No se pudo sincronizar (${err.status ? `HTTP ${err.status}` : err.code})` : "No se pudo sincronizar (sin señal)";
      await this.persistir().catch(() => {});
    } finally {
      this.sincronizando = false; this.progreso = null; this.avisar();
    }
  }

  async subir(uid: string) {
    const eq = this.meta.equipo!;
    // Cambios sin autor (no deberían existir): quedan rechazados a la vista, nunca suben con otra sesión
    for (const c of this.bandeja.values()) if (c.estado === "pendiente" && !c.autor) this.ponerCambio({ ...c, estado: "rechazado", motivo: "Cambio sin autor" });
    const reponer: Cambio[] = [];
    for (;;) {
      const todos = [...this.bandeja.values()].filter((c) => c.estado === "pendiente" && c.autor === uid)
        .sort((a, b) => prioridad(a.tabla) - prioridad(b.tabla) || a.orden - b.orden).slice(0, LOTE);
      if (!todos.length) break;
      // Un solo cambio por fila en cada envío: el siguiente sale en el próximo, sobre la versión que deje este
      const vistas = new Set<string>();
      const lote = todos.filter((c) => { const k = `${c.tabla}|${c.fila_id}`; if (vistas.has(k)) return false; vistas.add(k); return true; });
      const enviado = new Map(lote.map((c) => [c.id, JSON.stringify(c.datos ?? null)]));
      this.progreso = `Subiendo ${lote.length} cambios…`; this.avisar();
      const r = await this.nube.rpc<{ id: string; estado: string; version?: number | null; motivo?: string; fusionado_en?: string }[]>("aplicar_cambios", {
        p_equipo: eq.id, p_secreto: eq.secreto,
        p_lote: lote.map((c) => ({ id: c.id, tabla: c.tabla, fila_id: c.fila_id, op: c.op, version_base: c.version_base, datos: c.datos, hora_verificada: c.hora_verificada })),
      });
      const resultados = new Map((Array.isArray(r) ? r : []).map((x) => [x.id, x]));
      let quedaron = 0;
      for (const enviadoC of lote) {
        const x = resultados.get(enviadoC.id);
        const c = this.bandeja.get(enviadoC.id) ?? enviadoC; // lo guardado mientras subía ya se fundió aquí
        if (!x) {
          const intentos = c.intentos + 1;
          this.ponerCambio({ ...c, intentos, ...(intentos >= REINTENTOS ? { estado: "rechazado" as const, motivo: "La nube no respondió por este cambio" } : {}) });
          continue;
        }
        if (x.estado === "aplicado" || x.estado === "duplicado") {
          const propia = x.estado === "aplicado" && x.version != null &&
            (c.op === "I" ? Number(x.version) === 1 : c.version_base != null && Number(x.version) === Number(c.version_base) + 1);
          const clave = `${c.tabla}|${c.fila_id}`;
          if (c.op === "D") this.versionNube.delete(clave);
          else if (propia) this.versionNube.set(clave, Math.max(this.versionNube.get(clave) ?? 0, Number(x.version)));
          this.ensuciar(c.tabla, c.fila_id);
          if (propia) {
            // Otro cambio de la misma fila hecho mientras viajaba (p. ej. un borrado) va sobre la versión que dejó este
            for (const o of this.bandeja.values()) {
              if (o.id !== c.id && o.estado === "pendiente" && o.tabla === c.tabla && o.fila_id === c.fila_id && o.version_base === c.version_base) {
                this.ponerCambio({ ...o, version_base: Number(x.version) });
              }
            }
          }
          if (!this.bandeja.has(c.id)) {
            // Se borró en el teléfono mientras subía la inserción: la nube ya la tiene, así que ahora sube el borrado
            if (c.op === "I" && x.estado === "aplicado" && !this.tabla(c.tabla).has(c.fila_id)) {
              this.ponerCambio(this.nuevoCambio(c.tabla, c.fila_id, "D", x.version ?? null, null, c.autor ?? uid));
            }
          } else if (JSON.stringify(c.datos ?? null) === enviado.get(c.id)) this.quitarCambio(c.id);
          else {
            // Se guardó otra vez mientras subía: queda pendiente con id nuevo (la nube ya anotó este como aplicado)
            quedaron++;
            this.quitarCambio(c.id);
            this.ponerCambio({ ...c, id: uuid(), op: c.op === "I" ? "U" : c.op, version_base: propia ? Number(x.version) : c.version_base, intentos: 0 });
          }
          if (x.fusionado_en && x.fusionado_en !== c.fila_id) this.cambiarId(c.tabla, c.fila_id, x.fusionado_en, x.version ?? null, reponer);
        } else {
          this.ponerCambio({ ...c, estado: x.estado === "conflicto" ? "conflicto" : "rechazado", motivo: x.motivo ?? null });
          reponer.push(c);
        }
      }
      await this.persistir();
      if (todos.length < LOTE && lote.length === todos.length && !quedaron) break;
    }
    // La copia vuelve a mostrar lo que hay en la nube; lo escrito aquí queda en la bandeja con su motivo
    for (const c of reponer) {
      const fila = await this.nube.fila(c.tabla, c.fila_id).catch(() => null);
      if (fila) this.ponerFila(c.tabla, fila, true);
    }
    if (reponer.length) await this.persistir();
  }

  // La nube fundió la fila en otra con la misma clave natural: la copia pasa a ese id
  private cambiarId(tabla: string, viejo: string, nuevo: string, version: number | null, reponer: Cambio[]) {
    const t = this.tabla(tabla);
    const fila = t.get(viejo);
    t.delete(viejo); this.ensuciar(tabla, viejo);
    if (fila) { t.set(nuevo, { ...fila, id: nuevo }); this.ensuciar(tabla, nuevo); }
    this.versionNube.delete(`${tabla}|${viejo}`);
    for (const c of [...this.bandeja.values()]) {
      if (c.tabla !== tabla || c.fila_id !== viejo) continue;
      const datos = c.datos && "id" in c.datos ? { ...c.datos, id: nuevo } : c.datos;
      this.ponerCambio({ ...c, fila_id: nuevo, datos, version_base: c.estado === "pendiente" && version != null ? version : c.version_base });
    }
    reponer.push({ tabla, fila_id: nuevo } as Cambio);
  }

  // ¿La bajada puede escribir esta fila? No si hay un cambio pendiente ni si el teléfono ya subió una versión más nueva
  private puede(tabla: string, id: string, version: number | null) {
    if (this.pendienteDe(tabla, id)) return false;
    const v = this.versionNube.get(`${tabla}|${id}`);
    return v == null || version == null || v <= version;
  }

  private ponerFila(tabla: string, fila: Fila, forzar = false) {
    const id = String(fila.id);
    const version = (fila.version as number | null) ?? null;
    if (!forzar && !this.puede(tabla, id, version)) return;
    this.tabla(tabla).set(id, fila);
    if (version != null) this.versionNube.set(`${tabla}|${id}`, version);
    this.ensuciar(tabla, id);
  }

  async bajar() {
    const eq = this.meta.equipo!;
    const auth = { p_equipo: eq.id, p_secreto: eq.secreto };
    if (this.meta.cursor === null) {
      let seq: number | null = null;
      for (const tabla of TABLAS) {
        let despues: string | null = null, n = 0;
        for (;;) {
          const r: { seq: number; filas: Fila[]; ultimo: string | null } = await this.nube.rpc("instantanea", { ...auth, p_tabla: tabla, p_despues: despues, p_limite: 1000 });
          seq = seq == null ? Number(r.seq) : Math.min(seq, Number(r.seq));
          for (const f of r.filas) this.ponerFila(tabla, f);
          n += r.filas.length;
          this.progreso = `Copiando ${tabla.split(".")[1].replace(/_/g, " ")}: ${n}`; this.avisar();
          if (r.filas.length < 1000 || !r.ultimo) break;
          despues = r.ultimo;
        }
        await this.persistir(); // por tabla: un corte a mitad no obliga a empezar de cero lo ya guardado
      }
      this.meta.cursor = seq ?? 0;
      await this.persistir();
    }
    if (this.meta.catalogosEn == null || this.reloj.ahora() - this.meta.catalogosEn > 7 * DIA) {
      for (const { tabla, clave } of CATALOGOS) {
        this.progreso = `Copiando ${tabla.split(".")[1]}…`; this.avisar();
        const r: { filas: Fila[] } = await this.nube.rpc("instantanea", { ...auth, p_tabla: tabla, p_despues: null, p_limite: 5000 });
        const t = this.tabla(tabla);
        t.clear();
        for (const f of r.filas) t.set(String(f[clave]), f);
        this.ensuciar(tabla, "*");
      }
      this.meta.catalogosEn = this.reloj.ahora();
      await this.persistir();
    }
    const nuestras = new Set(TABLAS);
    for (;;) {
      const desde = this.meta.cursor!;
      const r: { hasta: number; cambios: { tabla: string; fila_id: string; op: Op; version: number | null; fila: Fila | null }[] } =
        await this.nube.rpc("cambios_desde", { ...auth, p_desde: desde, p_limite: 500 });
      for (const g of r.cambios) {
        if (!nuestras.has(g.tabla)) continue;
        if (g.op === "D") {
          if (this.pendienteDe(g.tabla, g.fila_id)) continue;
          this.tabla(g.tabla).delete(g.fila_id);
          this.versionNube.delete(`${g.tabla}|${g.fila_id}`);
          this.ensuciar(g.tabla, g.fila_id);
        } else if (g.fila) this.ponerFila(g.tabla, g.fila);
      }
      this.meta.cursor = Number(r.hasta);
      await this.persistir();
      if (!r.cambios.length || Number(r.hasta) <= desde) break;
    }
  }

  private async reservarSiHaceFalta() {
    if (this.numerosLibres().length >= 20) return;
    const eq = this.meta.equipo!;
    try {
      const b = await this.nube.rpc<{ desde: number; hasta: number }>("reservar_bloque", { p_equipo: eq.id, p_secreto: eq.secreto, p_tamano: 50 });
      this.meta.bloques.push({ desde: Number(b.desde), hasta: Number(b.hasta) });
    } catch (e) {
      if (!/2 bloques/.test((e as Error).message)) throw e;
    }
  }

  // Alta del teléfono como equipo (la nube pide administrador y dos pasos). La serie es la primera libre.
  async registrar(nube: Nube, org: string, uid: string, nombre: string) {
    let r: { id: string; secreto: string } | null = null, serieUsada = "";
    for (const serie of "ABCDEFGHIJKLMNOPQRSTUVXYZ") {
      try { r = await nube.rpc("registrar_equipo", { p_org: org, p_nombre: nombre, p_serie: serie }); serieUsada = serie; break; }
      catch (e) { if (!/duplicate|unique|duplicad/i.test((e as Error).message)) throw e; }
    }
    if (!r) throw new Error("No quedan series libres para este equipo");
    this.meta = { ...this.meta, equipo: { id: r.id, secreto: r.secreto, org_id: org, nombre, uid, serie: serieUsada }, cursor: null };
    await this.persistir();
  }

  // Lo que no subió por conflicto o rechazo: el médico lo descarta (la nube manda) o lo reintenta sobre la versión actual
  async resolver(id: string, accion: "descartar" | "reintentar") {
    const c = this.bandeja.get(id);
    if (!c || c.estado === "pendiente") return;
    if (accion === "descartar") this.quitarCambio(id);
    else {
      // Con id nuevo: la nube guardó el resultado del id viejo (conflicto) y a un reenvío le contestaría «duplicado»;
      // el cambio se daría por subido y se perdería
      this.quitarCambio(id);
      this.ponerCambio({ ...c, id: uuid(), estado: "pendiente", motivo: null, intentos: 0, version_base: this.versionNube.get(`${c.tabla}|${c.fila_id}`) ?? c.version_base });
    }
    await this.persistir();
  }
}
