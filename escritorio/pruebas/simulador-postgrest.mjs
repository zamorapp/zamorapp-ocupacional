// Simulador mínimo de PostgREST para las pruebas en Linux (en Windows la prueba usa el PostgREST real).
// Verifica el token con el secreto de la configuración y consulta la base como "authenticated" con RLS.
// Soporta GET /tabla?select=*&col=eq.valor y POST /rpc/funcion.
import fs from "node:fs";
import http from "node:http";
import pg from "pg";
import { verificar } from "../puerta/jwt.mjs";

const conf = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean)
  .map((l) => l.split(" = ")).map(([k, v]) => [k.trim(), v.trim().replace(/^"|"$/g, "")]));
const pool = new pg.Pool({ connectionString: conf["db-uri"], max: 4 });

http.createServer(async (req, res) => {
  const datos = verificar((req.headers.authorization || "").replace(/^Bearer /, ""), conf["jwt-secret"]);
  if (req.url === "/") { res.writeHead(200); return res.end("{}"); }
  if (!datos) { res.writeHead(401); return res.end('{"message":"JWT inválido"}'); }
  const url = new URL(req.url, "http://x");
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(datos)]);
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
      filas = (await c.query(`select to_jsonb(t) as f from public.${tabla} t ${filtros.length ? "where " + filtros.map(([k], i) => `t.${k.replace(/[^a-z_0-9]/g, "")}::text = $${i + 1}`).join(" and ") : ""}`,
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
}).listen(Number(conf["server-port"]), conf["server-host"]);
