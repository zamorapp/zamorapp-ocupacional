// Primera pantalla de la PC: registrar este equipo (administrador) y esperar la primera copia.
// También sirve para reinstalar en una PC nueva: se registra otra vez y baja todo desde la nube.
export const PAGINA_INICIO = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>zamorApp · Preparar esta PC</title>
<style>
  :root { --bg:#f5f7f7; --panel:#fff; --fg:#17262b; --muted:#56686e; --accent:#0d6e74; --line:#d5dfe1; --no:#a23b3b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1719; --panel:#152124; --fg:#e3ecee; --muted:#93a7ac; --accent:#4fbcc2; --line:#2a3b40; --no:#e48585; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg); font:16px/1.5 "Segoe UI", system-ui, sans-serif; }
  main { width:min(420px, 92vw); background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:28px; }
  h1 { font-size:22px; margin:0 0 4px; } p { color:var(--muted); margin:0 0 18px; }
  label { display:block; font-size:14px; margin:12px 0 4px; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--fg); font:inherit; }
  button { margin-top:18px; width:100%; padding:11px; border:0; border-radius:8px; background:var(--accent); color:#fff; font:600 15px inherit; cursor:pointer; }
  button:disabled { opacity:.6; cursor:wait; } .error { color:var(--no); margin-top:12px; min-height:1.5em; }
  .barra { height:8px; margin:4px 0 6px; border-radius:99px; background:var(--line); overflow:hidden; }
  .barra > i { display:block; height:100%; width:0; border-radius:inherit; background:var(--accent); transition:width .4s ease; }
  .paso { display:flex; justify-content:space-between; gap:12px; font-size:13px; color:var(--muted); }
  .paso b { color:var(--fg); font-variant-numeric:tabular-nums; }
  [hidden] { display:none !important; }
  @media (prefers-reduced-motion: reduce) { .barra > i { transition:none; } }
</style></head>
<body><main>
  <h1 id="titulo">Abriendo zamorApp…</h1>
  <p id="texto">Un momento.</p>
  <form id="f" hidden>
    <label for="email">Correo</label><input id="email" type="email" autocomplete="username" required>
    <label for="clave">Clave</label><input id="clave" type="password" autocomplete="current-password" required>
    <label for="nombre">Nombre de esta PC</label><input id="nombre" value="PC consultorio" required>
    <div id="dos" hidden>
      <label for="codigo">Código de 6 dígitos de tu app autenticadora</label>
      <input id="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123 456">
    </div>
    <button id="b">Registrar y copiar los datos</button>
    <div class="error" id="e" role="alert"></div>
  </form>
  <div id="avance" hidden>
    <div class="barra" role="progressbar" aria-label="Copiando los datos" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
    <div class="paso" aria-live="polite"><span id="detalle">Empezando…</span><b id="pct">0 %</b></div>
  </div>
</main>
<script>
const app = "__ORIGEN__";
const $ = (id) => document.getElementById(id);
async function estado() { return (await fetch("/zamorapp/estado")).json(); }
// Avance de la copia (C13): grupos de datos hechos de los que hay; nunca retrocede
const miles = new Intl.NumberFormat("es-VE");
let pctMax = 0;
// fin: la copia terminó y la barra llega al 100 % (mientras copia se queda en 99)
function pintar(copia, fin = false) {
  if (!copia || !copia.total) { if (fin) $("avance").querySelector("i").style.width = "100%"; return; }
  $("avance").hidden = false;
  const pct = pctMax = fin ? 100 : Math.max(pctMax, Math.min(99, Math.round((copia.hechas / copia.total) * 100)));
  $("avance").querySelector("i").style.width = pct + "%";
  $("avance").querySelector(".barra").setAttribute("aria-valuenow", String(pct));
  $("pct").textContent = pct + " %";
  $("detalle").textContent = copia.hechas + " de " + copia.total + " grupos · " + miles.format(copia.filas) + " registros";
}
async function esperarCopia() {
  $("f").hidden = true;
  $("avance").hidden = false;
  document.querySelector("h1").textContent = "Preparando tu copia";
  for (;;) {
    const s = await estado().catch(() => ({}));
    if (s.copiaCompleta) {
      // La barra llega al 100 % y se deja ver un momento antes de abrir
      pintar(s.copia ? { ...s.copia, hechas: s.copia.total } : null, true);
      await new Promise((r) => setTimeout(r, 300));
      location.href = app;
      return;
    }
    pintar(s.copia);
    $("texto").textContent = s.error
      ? "La copia se detuvo un momento y vuelve a intentar sola. Revisa el internet; no cierres zamorApp."
      : "Copiando los datos desde la nube a esta PC. Se hace una sola vez; después zamorApp abre al instante.";
    await new Promise((r) => setTimeout(r, 1000));
  }
}
// El formulario sale solo si esta PC de verdad no está registrada. Antes se veía en cada apertura mientras llegaba
// el estado, parecía pedir el registro otra vez y Cesar entró con su clave ahí (29-oct): eso dejó la sesión de la
// nube sin el segundo paso y la app cayó con «No se pudo cargar esta pantalla».
function pedirRegistro(s) {
  $("titulo").textContent = "Preparar esta PC";
  $("texto").textContent = s && !s.enLinea ? "La primera vez hace falta internet para registrar esta PC y copiar los datos."
    : "Entra con tu cuenta de administrador para registrar esta PC. Luego zamorApp copia todos los datos desde la nube.";
  $("f").hidden = false;
}
estado().then((s) => {
  if (s.equipo && s.copiaCompleta) location.href = app;
  else if (s.equipo) esperarCopia();
  else pedirRegistro(s);
}).catch(() => pedirRegistro(null));
$("f").addEventListener("submit", async (ev) => {
  ev.preventDefault(); $("b").disabled = true; $("e").textContent = "";
  try {
    const r = await fetch("/auth/v1/token?grant_type=password", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("email").value, password: $("clave").value }) });
    const s = await r.json();
    if (!r.ok) throw new Error(s.msg || s.error_description || "No se pudo entrar");
    const q = await fetch("/zamorapp/equipo", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.access_token },
      body: JSON.stringify({ nombre: $("nombre").value, codigo: $("codigo").value || undefined }) });
    const k = await q.json();
    // Verificación en dos pasos: la nube pide el código antes de dar la copia de los datos a una PC nueva
    if (k.code === "dos_pasos") { $("dos").hidden = false; $("codigo").value = ""; $("codigo").focus(); }
    if (!q.ok) throw new Error(k.message || "No se pudo registrar la PC");
    esperarCopia();
  } catch (err) { $("e").textContent = err.message; $("b").disabled = false; }
});
</script></body></html>`;
