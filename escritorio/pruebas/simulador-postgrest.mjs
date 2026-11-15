// Simulador mínimo de PostgREST para las pruebas en Linux (en Windows la prueba usa el PostgREST real).
// Verifica el token con el secreto de la configuración y consulta la base como "authenticated" con RLS.
// Soporta GET /tabla?select=*|a,b&col=eq.valor y POST /rpc/funcion.
import fs from "node:fs";
import http from "node:http";
import pg from "pg";
import { verificar } from "../puerta/jwt.mjs";

// Igual que el PostgREST real, toma la configuración de las variables PGRST_* (los secretos no van a disco).
const e = process.env;
const conf = { "db-uri": e.PGRST_DB_URI, "jwt-secret": e.PGRST_JWT_SECRET, "server-port": e.PGRST_SERVER_PORT, "server-host": e.PGRST_SERVER_HOST };
const pool = new pg.Pool({ connectionString: conf["db-uri"], max: 4 });

http.createServer(async (req, res) => {
  const datos = verificar((req.headers.authorization || "").replace(/^Bearer /, ""), conf["jwt-secret"], Date.now());
  if (req.url === "/") { res.writeHead(200); return res.end("{}"); }
  if (!datos) { res.writeHead(401); return res.end('{"message":"JWT inválido"}'); }
  const url = new URL(req.url, "http://x");
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(datos)]);
    // Como el PostgREST real: las cabeceras del pedido en request.headers (así llega la hora anclada, X-Zamorapp-Ahora,
    // y ahora() de la base local la usa; sin esto el banco de Linux no veía la diferencia con now())
    await c.query("select set_config('request.headers', $1, true)", [JSON.stringify(req.headers)]);
    await c.query(`set local role ${datos.role === "authenticated" ? "authenticated" : "anon"}`);
    let filas;
    if (url.pathname.startsWith("/rpc/")) {
      let cuerpo = ""; for await (const p of req) cuerpo += p;
      const fn = url.pathname.slice(5).replace(/[^a-z_0-9]/g, "");
      filas = (await c.query(`select to_jsonb(r) as f from public.${fn}(${Object.keys(JSON.parse(cuerpo || "{}")).map((k, i) => `${k} => $${i + 1}`).join(", ")}) r`,
        Object.values(JSON.parse(cuerpo || "{}")))).rows.map((r) => r.f);
    } else {
      const tabla = url.pathname.slice(1).replace(/[^a-z_0-9]/g, "");
      const filtros = [...url.searchParams].filter(([k, v]) => k !== "select" && v.startsWith("eq."));
      // select=a,b pide solo esas columnas (como PostgREST: con privilegios por columna, * puede no estar permitido)
      const cols = (url.searchParams.get("select") ?? "*").split(",").map((x) => x.trim().replace(/[^a-z_0-9*]/g, "")).filter(Boolean);
      const fila = cols.includes("*") ? "to_jsonb(t)" : `jsonb_build_object(${cols.map((x) => `'${x}', t.${x}`).join(", ")})`;
      filas = (await c.query(`select ${fila} as f from public.${tabla} t ${filtros.length ? "where " + filtros.map(([k], i) => `t.${k.replace(/[^a-z_0-9]/g, "")}::text = $${i + 1}`).join(" and ") : ""}`,
        filtros.map(([, v]) => v.slice(3)))).rows.map((r) => r.f);
    }
    await c.query("commit");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(filas));
  } catch (e) {
    await c.query("rollback").catch(() => {});
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: e.message }));
  } finally { c.release(); }
}).listen(Number(conf["server-port"]), conf["server-host"], async () => {
  console.log(`Listening on port ${conf["server-port"]}`);
  // Prueba de la caída al arrancar que se vio en Windows (código 3): si existe el archivo marcado, se borra y sale
  const caida = e.SIMULAR_CAIDA_POSTGREST;
  if (caida && fs.existsSync(caida)) {
    const n = Number(fs.readFileSync(caida, "utf8")) - 1;
    if (n > 0) fs.writeFileSync(caida, String(n)); else fs.rmSync(caida);
    process.exit(3);
  }
  await pool.query("select 1");
  console.log("Schema cache loaded 0 Relations");
});
