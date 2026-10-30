// Recupera los reposos que se borraron por la falla del 30-oct: desde la Tanda 4 (30-oct 02:53 UTC) la consulta leía
// el reposo por la vista public.reposos, que no tenía la columna «observacion» → lo mostraba «sin reposo» y un Guardar
// después lo borraba (guardar_consulta borra el reposo si llega vacío). Arreglo en 20261030590000_vistas_al_dia.sql.
// Toma de la bitácora cada reposo BORRADO desde esa hora y lo vuelve a poner tal cual (mismo id y datos) solo si:
//   la consulta existe, hoy no tiene reposo y nadie le creó otro después del borrado.
// Por defecto es un ENSAYO (todo se deshace al final). Para guardar: --guardar, con el sí de Cesar.
// Uso en la PC de Cesar: powershell -File scripts\reparar\recuperar-reposos.ps1 [-Guardar]
// Informe (número de historia, fecha de la consulta y fechas del reposo): %USERPROFILE%\.zamorapp\recuperar-reposos.md
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { configuracion } from "../conexion-segura.mjs";

const GUARDAR = process.argv.includes("--guardar");
const DESDE = "2026-10-30T02:50:00Z";
const cliente = new pg.Client(configuracion(process.env.DATABASE_URL));
await cliente.connect();
const q = (s, p) => cliente.query(s, p);
const informe = [`# Reposos borrados por la falla del 30-oct (${GUARDAR ? "RECUPERADOS" : "ensayo: no se guardó nada"})`, "",
  `Borrados desde ${DESDE} (Tanda 4). Generado el ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`, ""];

try {
  await q("begin");
  const { rows } = await q(
    `select distinct on (b.registro_id) b.registro_id, b.antes, b.en, c.fecha, t.numero_historia, t.cedula
       from public.bitacora b
       join clinico.consultas c on c.id = (b.antes ->> 'consulta_id')::uuid
       join public.trabajadores t on t.id = c.trabajador_id
      where b.tabla = 'clinico.reposos' and b.accion = 'DELETE' and b.en >= $1
        and not exists (select 1 from clinico.reposos r where r.consulta_id = c.id)
        and not exists (select 1 from public.bitacora x where x.tabla = 'clinico.reposos' and x.accion = 'INSERT'
                          and (x.despues ->> 'consulta_id') = (b.antes ->> 'consulta_id') and x.en > b.en)
      order by b.registro_id, b.en desc`, [DESDE]);
  // Varios borrados de la misma consulta: se recupera el último
  const porConsulta = new Map();
  for (const r of rows) {
    const k = r.antes.consulta_id;
    if (!porConsulta.has(k) || porConsulta.get(k).en < r.en) porConsulta.set(k, r);
  }
  // Columnas que se escriben (sin las calculadas, como «dias»); las que no vengan en la bitácora toman su valor por defecto
  const { rows: cols } = await q(`select column_name from information_schema.columns
     where table_schema = 'clinico' and table_name = 'reposos' and is_generated = 'NEVER' and is_identity = 'NO'`);
  let puestos = 0;
  for (const r of porConsulta.values()) {
    const lista = cols.map((c) => c.column_name).filter((c) => c in r.antes);
    const columnas = lista.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
    const { rowCount } = await q(
      `insert into clinico.reposos (${columnas}) select ${columnas} from jsonb_populate_record(null::clinico.reposos, $1::jsonb) on conflict (id) do nothing`, [r.antes]);
    puestos += rowCount;
    informe.push(`- Historia ${r.numero_historia ?? "?"} (C.I. ${r.cedula}) · consulta del ${r.fecha.toISOString?.().slice(0, 10) ?? r.fecha} · reposo del ${r.antes.desde} al ${r.antes.hasta}${rowCount ? "" : " (ya estaba)"}`);
  }
  informe.splice(4, 0, `- Reposos borrados que se pueden recuperar: ${porConsulta.size}. Puestos de nuevo: ${puestos}.`, "");
  await q(GUARDAR ? "commit" : "rollback");
} catch (e) {
  await q("rollback").catch(() => {});
  throw e;
} finally {
  await cliente.end();
}

const salida = path.join(os.homedir(), ".zamorapp");
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, "recuperar-reposos.md"), informe.join("\n"), "utf8");
console.log(informe.join("\n"));
