// Regla del guardián (04-nov): una migración nueva no llama a copiar_listas_base() ni siembra lista_items sin
// la guarda es_base_local(). Uso: node --test scripts/pruebas/guardian-siembra.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const guardian = fileURLToPath(new URL("../guardian-seguridad.mjs", import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-siembra-"));
const revisar = (sql) => {
  const f = path.join(dir, `m${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  const r = spawnSync(process.execPath, [guardian, "siembra", f], { encoding: "utf8" });
  return { ok: r.status === 0, salida: r.stdout + r.stderr };
};

test("copiar_listas_base en una migración nueva no pasa (#222, riesgos)", () => {
  const r = revisar("do $$ begin if public.es_base_local() then return; end if;\n  perform public.copiar_listas_base(id) from public.organizaciones;\nend $$;");
  assert.ok(!r.ok);
  assert.match(r.salida, /copiar_listas_base/);
  assert.ok(!revisar("select public.copiar_listas_base(id) from public.organizaciones;").ok);
});

test("sembrar lista_items sin es_base_local() no pasa", () => {
  const r = revisar("insert into public.lista_items (lista, codigo, nombre) values ('x', 'y', 'z');");
  assert.ok(!r.ok);
  assert.match(r.salida, /es_base_local/);
  assert.ok(!revisar("update public.lista_items set texto = 'a' where codigo = 'b';").ok);
});

test("siembra con la guarda y copia solo de lo nuevo pasa (patrón sembrar_vademecum_2026)", () => {
  assert.ok(revisar(`do $$ begin
  if public.es_base_local() then return; end if;
  insert into public.lista_items (lista, codigo, nombre) values ('x', 'y', 'z');
end $$;
-- antes se usaba copiar_listas_base(id): ya no (comentario, no cuenta)
create or replace function public.sembrar_x(p_org uuid) returns int language plpgsql as $f$ begin
  if public.es_base_local() then return 0; end if;
  insert into public.lista_items (lista, org_id, codigo, nombre, base_id) select b.lista, p_org, b.codigo, b.nombre, b.id
    from public.lista_items b where b.org_id is null and b.lista = 'x' and b.codigo = 'y';
  return 1; end $f$;`).ok);
});

test("redefinir la función copiar_listas_base no cuenta como llamada", () => {
  assert.ok(revisar("create or replace function public.copiar_listas_base(p_org uuid) returns int language sql as $f$ select 1 $f$;").ok);
});

test("excepción explícita para disparadores que escriben en lista_items al usarse", () => {
  assert.ok(revisar("-- guardián: no es siembra\ncreate function public.t() returns trigger language plpgsql as $f$ begin insert into public.lista_items (lista) values ('a'); return new; end $f$;").ok);
});
