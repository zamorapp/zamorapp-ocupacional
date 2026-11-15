// Reloj anclado a la nube. Cesar cambia la fecha de Windows para abrir el SAME, así que Date.now() no sirve
// para fechas legales ni para contar plazos. Reglas (Analizar, 29-oct-2026):
// 1) Con internet, la hora es la de la nube (cabecera Date de cada respuesta) más lo que avanzó el reloj
//    monótono (performance.now(), que no cambia al mover la fecha de Windows).
// 2) La hora nunca retrocede: un «piso» guardado en el estado cifrado sube SOLO con horas ancladas (nunca con la
//    fecha de Windows: una PC arrancada sin internet con la fecha en 2030 dejaría el piso en 2030 para siempre).
// 3) Tras reiniciar sin internet no hay ancla: se usa max(fecha de Windows, piso) y queda la marca
//    «hora sin verificar» hasta que la nube responda.
// 4) Los plazos (7 días sin conexión) se cuentan con esta hora, y además hay un límite de arranques seguidos
//    sin conexión, porque sin ancla la fecha de Windows podría quedarse quieta.
export class Reloj {
  constructor(estado, registro = () => {}, fuentes = {}) {
    this.estado = estado;
    this.registro = registro;
    this.fecha = fuentes.fecha || (() => Date.now()); // fecha de Windows (en las pruebas se mueve)
    this.mono = fuentes.mono || (() => performance.now()); // reloj monótono
    this.ancla = null; // { nube: ms, mono: ms }
    this.guardadoEn = -1e9;
  }

  #d() { return (this.estado.d.reloj ??= { piso: 0, arranquesSinNube: 0 }); }

  // La hora de la nube llegó en una respuesta (cabecera Date): desde aquí la hora es la de la nube
  anclar(fechaCabecera) {
    const t = Date.parse(String(fechaCabecera || ""));
    if (!Number.isFinite(t)) return false;
    const primera = !this.ancla;
    this.ancla = { nube: t, mono: this.mono() };
    if (this.#d().piso > t + 60e3) { // un piso por encima de la nube es un error: manda la nube
      this.registro(`[reloj] el piso guardado (${new Date(this.#d().piso).toISOString()}) estaba por encima de la hora de la nube: se corrige`);
      this.#d().piso = t; this.estado.guardar();
    }
    if (primera) {
      const pc = this.fecha();
      const dif = Math.round((pc - t) / 1000);
      this.registro(`[reloj] hora anclada a la nube${Math.abs(dif) > 120 ? ` (la fecha de Windows está ${dif > 0 ? "adelantada" : "atrasada"} ${Math.abs(dif)} s)` : ""}`);
    }
    this.#subirPiso(t);
    return true;
  }

  get verificada() { return Boolean(this.ancla); }

  // Hora real en ms (época Unix). Nunca menor que el piso. Solo una hora anclada sube el piso.
  ahora() {
    if (this.ancla) {
      const t = Math.max(this.ancla.nube + (this.mono() - this.ancla.mono), this.#d().piso);
      this.#subirPiso(t);
      return Math.round(t);
    }
    return Math.round(Math.max(this.fecha(), this.#d().piso));
  }

  iso() { return new Date(this.ahora()).toISOString(); }
  segundos() { return Math.floor(this.ahora() / 1000); }

  #subirPiso(t) {
    const d = this.#d();
    if (t <= d.piso) return;
    d.piso = t;
    if (this.mono() - this.guardadoEn > 60e3) { this.guardadoEn = this.mono(); this.estado.guardar(); }
  }

  // Al arrancar: cuenta los arranques seguidos sin nube; con nube vuelve a cero
  arranque(enLinea) {
    const d = this.#d();
    d.arranquesSinNube = enLinea ? 0 : (d.arranquesSinNube || 0) + 1;
    this.estado.guardar();
  }
  conNube() { if (this.#d().arranquesSinNube) { this.#d().arranquesSinNube = 0; this.estado.guardar(); } }
  arranquesSinNube() { return this.#d().arranquesSinNube || 0; }

  // ¿Pasó más de «dias» sin contacto con la nube? También si hubo demasiados arranques seguidos sin internet
  // (sin ancla, una fecha de Windows detenida no cuenta los días).
  // Un último contacto más de un día POR DELANTE de la hora actual también vence: lo anotó una fecha de Windows
  // adelantada (versiones viejas) y, si no, el plazo nunca llegaría.
  sinConexionVencida(ultimoOnline, dias, maxArranques) {
    return !this.dentroDelPlazo(ultimoOnline, dias) || this.arranquesSinNube() > maxArranques;
  }

  // ¿«desde» (ms, hora anclada) está a menos de «dias» atrás? Si está más de un día en el futuro, no.
  dentroDelPlazo(desde, dias) {
    if (!desde || !(dias > 0)) return false;
    const dif = this.ahora() - desde;
    return dif >= -864e5 && dif <= dias * 864e5;
  }

  // Fecha de Windows en ms: SOLO para lo que la revisa con ese reloj (PostgREST local, el navegador). Ningún plazo
  // de zamorApp se mide con ella.
  windows() { return this.fecha(); }
}
