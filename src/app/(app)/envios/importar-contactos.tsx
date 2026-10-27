"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Aviso } from "@/components/app/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { leerCSV } from "@/lib/importar";
import { importarContactos, type FilaContacto, type Resultado } from "./acciones";

type Empresa = { nombre: string; rif: string; correo: string | null; telefono: string | null };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const COLUMNAS = {
  empresa: ["empresa", "rif", "razon social"],
  nombre: ["nombre", "contacto", "persona"],
  cargo: ["cargo", "puesto"],
  correo: ["correo", "email", "e-mail", "correo electronico"],
  telefono: ["telefono", "whatsapp", "celular", "movil"],
  salud: ["personal de salud", "salud", "recibe consulta"],
};
const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const celda = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;

// Plantilla con todas las empresas y el correo y teléfono de su ficha ya puestos: solo falta completar nombres y cargos
function descargarPlantilla(empresas: Empresa[]) {
  const filas = [
    "EMPRESA;RIF;NOMBRE;CARGO;CORREO;TELEFONO;PERSONAL DE SALUD",
    ...empresas.map((e) => [e.nombre, e.rif, "", "Recursos humanos", e.correo, e.telefono, "NO"].map(celda).join(";")),
  ];
  const url = URL.createObjectURL(new Blob(["﻿" + filas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: "contactos-empresas.csv" }).click();
  URL.revokeObjectURL(url);
}

export function ImportarContactos({ empresas }: { empresas: Empresa[] }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<FilaContacto[]>([]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [leyendo, iniciarLectura] = useTransition();
  const [guardando, iniciarGuardado] = useTransition();

  const procesar = (f: File) =>
    iniciarLectura(async () => {
      setResultado(null);
      try {
        const celdas: unknown[][] = /\.csv$/i.test(f.name) ? leerCSV(await f.text()) : await (await import("read-excel-file")).default(f);
        const cab = (celdas[0] ?? []).map((c) => sinAcentos(texto(c)));
        const idx = Object.fromEntries(Object.entries(COLUMNAS).map(([k, alias]) => [k, cab.findIndex((h) => alias.includes(h))])) as Record<keyof typeof COLUMNAS, number>;
        // Si viene la columna RIF además de EMPRESA, el RIF manda
        const rif = cab.indexOf("rif");
        if ((idx.empresa < 0 && rif < 0) || idx.nombre < 0) {
          setFilas([]);
          setResultado({ ok: false, mensaje: "El archivo necesita las columnas EMPRESA (o RIF) y NOMBRE." });
          return;
        }
        const leidas = celdas
          .slice(1)
          .map((r) => ({
            empresa: texto(r[rif >= 0 && texto(r[rif]) ? rif : idx.empresa]),
            nombre: texto(r[idx.nombre]),
            cargo: idx.cargo >= 0 ? texto(r[idx.cargo]) || null : null,
            correo: idx.correo >= 0 ? texto(r[idx.correo]) || null : null,
            telefono: idx.telefono >= 0 ? texto(r[idx.telefono]) || null : null,
            salud: idx.salud >= 0 && /^(si|sí|x|1|true)$/i.test(texto(r[idx.salud])),
          }))
          .filter((x) => x.nombre && (x.correo || x.telefono));
        setFilas(leidas);
        if (!leidas.length) setResultado({ ok: false, mensaje: "No hay filas con nombre y correo o teléfono." });
      } catch {
        setResultado({ ok: false, mensaje: "No se pudo leer el archivo. Usa .xlsx o .csv" });
      }
    });

  return (
    <Dialog onOpenChange={(abierto) => { if (!abierto) { setFilas([]); setResultado(null); } }}>
      <DialogTrigger asChild><Button variant="outline"><FileSpreadsheet /> Importar contactos</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar contactos de todas las empresas</DialogTitle>
          <DialogDescription>Baja la plantilla: trae cada empresa con el correo y teléfono de su ficha. Completa nombre y cargo, agrega filas si hay más personas y vuelve a subirla.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => descargarPlantilla(empresas)}><Download /> Plantilla con mis {empresas.length} empresas</Button>
          <Button onClick={() => entrada.current?.click()} disabled={leyendo}>{leyendo ? <Loader2 className="animate-spin" /> : <Upload />} Subir archivo</Button>
          <input ref={entrada} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ""; }} />
        </div>
        <p className="text-xs text-muted-foreground">PERSONAL DE SALUD = SÍ solo para el médico o la enfermera de la empresa: recibirán la consulta médica. Lo aplica el gerente médico o el administrador.</p>
        {filas.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Correo / teléfono</th><th className="px-3 py-2">Salud</th></tr></thead>
              <tbody>
                {filas.slice(0, 50).map((f, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="max-w-[180px] truncate px-3 py-1.5">{f.empresa}</td>
                    <td className="px-3 py-1.5">{f.nombre}{f.cargo && <span className="text-muted-foreground"> · {f.cargo}</span>}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{[f.correo, f.telefono].filter(Boolean).join(" · ")}</td>
                    <td className="px-3 py-1.5">{f.salud ? "Sí" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filas.length > 50 && <p className="px-3 py-2 text-xs text-muted-foreground">…y {filas.length - 50} más.</p>}
          </div>
        )}
        {filas.length > 0 && (
          <Button disabled={guardando} onClick={() => iniciarGuardado(async () => { const r = await importarContactos(filas); setResultado(r); if (r.ok) setFilas([]); })}>
            {guardando ? <Loader2 className="animate-spin" /> : <Upload />} Cargar {filas.length} contacto{filas.length === 1 ? "" : "s"}
          </Button>
        )}
        <Aviso resultado={resultado} />
      </DialogContent>
    </Dialog>
  );
}
