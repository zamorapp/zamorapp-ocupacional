// tar.mjs (fase C.2): paquete ustar de la carpeta de adjuntos. Sin base ni nube: corre en cualquier PC.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { desempaquetar, empaquetar, listar, nombreValidoWindows } from "../puerta/tar.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tar-"));

test("empaqueta y desempaqueta sin pisar lo que ya existe; es tar estándar", async () => {
  const origen = tmp(), destino = tmp();
  fs.mkdirSync(path.join(origen, "org", "trab"), { recursive: true });
  fs.writeFileSync(path.join(origen, "org", "trab", "a.pdf"), "A".repeat(1000));
  fs.writeFileSync(path.join(origen, "org", "trab", "b.jpg"), "B".repeat(513));
  fs.writeFileSync(path.join(origen, "org", "trab", "x.tmp"), "no va");
  const paquete = path.join(destino, "p.tar");
  const r = await empaquetar(origen, paquete);
  assert.deepEqual(r, { archivos: 2, bytes: 1513 });
  assert.equal(fs.statSync(paquete).size % 512, 0);
  assert.equal(fs.readFileSync(paquete).toString("latin1", 257, 262), "ustar");
  const salida = tmp();
  fs.mkdirSync(path.join(salida, "org", "trab"), { recursive: true });
  fs.writeFileSync(path.join(salida, "org", "trab", "a.pdf"), "ya estaba");
  assert.deepEqual(desempaquetar(paquete, salida), { restaurados: 1, existentes: 1, omitidos: 0 });
  assert.equal(fs.readFileSync(path.join(salida, "org", "trab", "a.pdf"), "utf8"), "ya estaba");
  assert.equal(fs.readFileSync(path.join(salida, "org", "trab", "b.jpg"), "utf8"), "B".repeat(513));
  assert.equal(listar(salida).length, 2);
});

test("nombres que Windows no acepta se saltan y se cuentan; «..» no sale de la carpeta; tamaño no octal corta", async () => {
  assert.equal(nombreValidoWindows("examen.pdf"), true);
  for (const malo of ["con", "CON.pdf", "lpt1", "a:b.pdf", "a<b>.pdf", "raro?.pdf", "final.", "final ", "x|y.pdf"]) assert.equal(nombreValidoWindows(malo), false, malo);
  // Un paquete armado a mano con un nombre reservado, uno con «..» y uno bueno
  const cab = (nombre, tam) => {
    const b = Buffer.alloc(512);
    b.write(nombre, 0, "utf8"); b.write("0000644\0", 100); b.write("0000000\0", 108); b.write("0000000\0", 116);
    b.write(tam.toString(8).padStart(11, "0") + "\0", 124); b.write("00000000000\0", 136); b.write("        ", 148); b.write("0", 156); b.write("ustar\0", 257); b.write("00", 263);
    let s = 0; for (const x of b) s += x; b.write(s.toString(8).padStart(6, "0") + "\0 ", 148);
    return b;
  };
  const cuerpo = Buffer.alloc(512, "z");
  const paquete = path.join(tmp(), "p.tar");
  fs.writeFileSync(paquete, Buffer.concat([cab("o/t/CON.pdf", 512), cuerpo, cab("o/../../fuera.pdf", 512), cuerpo, cab("o/t/bueno.pdf", 512), cuerpo, Buffer.alloc(1024)]));
  const salida = tmp();
  assert.deepEqual(desempaquetar(paquete, salida), { restaurados: 1, existentes: 0, omitidos: 2 });
  assert.equal(fs.existsSync(path.join(salida, "o", "t", "bueno.pdf")), true);
  assert.equal(fs.existsSync(path.join(path.dirname(salida), "fuera.pdf")), false);
  // Tamaño con basura: no se adivina, se corta con error
  const malo = cab("o/t/malo.pdf", 512); malo.write("12x45", 124);
  const paquete2 = path.join(tmp(), "p2.tar");
  fs.writeFileSync(paquete2, Buffer.concat([malo, cuerpo, Buffer.alloc(1024)]));
  assert.throws(() => desempaquetar(paquete2, tmp()), /tamaño no válido/);
});
