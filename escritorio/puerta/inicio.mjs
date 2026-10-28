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
</style></head>
<body><main>
  <h1>Preparar esta PC</h1>
  <p id="texto">Entra con tu cuenta de administrador para registrar esta PC. Luego zamorApp copia todos los datos desde la nube.</p>
  <form id="f">
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
</main>
<script>
const app = "__ORIGEN__";
const $ = (id) => document.getElementById(id);
async function estado() { return (await fetch("/zamorapp/estado")).json(); }
async function esperarCopia() {
  $("f").hidden = true;
  for (;;) {
    const s = await estado();
    if (s.copiaCompleta) { location.href = app; return; }
    $("texto").textContent = s.error ? "Copiando datos… (" + s.error + ")" : "Copiando los datos desde la nube. Puede tardar unos minutos la primera vez.";
    await new Promise((r) => setTimeout(r, 2000));
  }
}
estado().then((s) => {
  if (s.equipo && s.copiaCompleta) location.href = app;
  else if (s.equipo) esperarCopia();
  else if (!s.enLinea) $("texto").textContent = "La primera vez hace falta internet para registrar esta PC y copiar los datos.";
});
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
