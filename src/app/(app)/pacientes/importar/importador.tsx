"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importarPacientes } from "../acciones";
import { COLUMNAS_PLANTILLA, type FilaImportada, leerCSV, validarFilas } from "@/lib/importar";
import { fecha } from "@/lib/pacientes";
import { cn } from "@/lib/utils";

const EJEMPLO = ["12345678", "MARIA", "PEREZ", "15/03/1990", "F", "Av. Principal", "", "", "04140000000", "correo@ejemplo.com", "Venezuela", "Maturin", "01/10/2026", "OPERADORA", "0", "001", "Empleado", "Diurno", "EMPRESA, C.A", "PRODUCCION", "Activo"];

function descargarPlantilla() {
  const csv = "﻿" + [COLUMNAS_PLANTILLA, EJEMPLO].map((f) => f.join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "plantilla-pacientes.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

type Props = { cedulasExistentes: string[]; empresas: { id: string; nombre: string }[]; empresaInicial: string };

export function Importador({ cedulasExistentes, empresas, empresaInicial }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [empresa, setEmpresa] = useState(empresaInicial);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaImportada[]>([]);
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [guardando, iniciar] = useTransition();

  async function procesar(f: File) {
    setLeyendo(true);
    setResultado(null);
    setArchivo(f.name);
    try {
      let celdas: unknown[][];
      if (/\.csv$/i.test(f.name)) {
        celdas = leerCSV(await f.text());
      } else {
        const { default: leerExcel } = await import("read-excel-file");
        celdas = await leerExcel(f);
      }
      const r = validarFilas(celdas, new Set(cedulasExistentes));
      setFilas(r.filas);
      setFaltantes(r.faltantes);
    } catch {
      setFilas([]);
      setFaltantes(["No se pudo leer el archivo. Usa .xlsx o .csv"]);
    }
    setLeyendo(false);
  }

  const validas = filas.filter((f) => f.errores.length === 0);
  const conError = filas.length - validas.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">1. Empresa</label>
              <Select value={empresa} onValueChange={setEmpresa}>
                <SelectTrigger className="h-11! w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Columnas</p>
              <p className="text-muted-foreground">
                Usa tu formato <b className="text-foreground">MATRIZ REGISTRO SISTEMA</b> tal cual. Obligatorias: CEDULA, NOMBRE, APELLIDO; el resto (cargo, dependencia, tipo de paciente, turno, teléfonos, STATUS…) se toma si viene.
              </p>
              <Button variant="link" className="h-auto p-0" onClick={descargarPlantilla}>
                <Download /> Descargar plantilla
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">2. Archivo</span>
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
                const f = e.dataTransfer.files[0];
                if (f) procesar(f);
              }}
              className={cn(
                "grid h-44 w-full place-items-center rounded-xl border-2 border-dashed text-center transition",
                arrastrando ? "border-primary bg-primary/5" : "hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <div className="space-y-2">
                {leyendo ? <Loader2 className="mx-auto size-8 animate-spin text-primary" /> : <Upload className="mx-auto size-8 text-primary" />}
                <p className="font-medium">{archivo ?? "Arrastra el archivo aquí o haz clic"}</p>
                <p className="text-sm text-muted-foreground">Excel (.xlsx) o CSV</p>
              </div>
            </button>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) procesar(f);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>

      {faltantes.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-alerta/30 bg-alerta/10 px-4 py-3 text-sm">
          <XCircle className="mt-0.5 size-5 shrink-0 text-alerta" />
          <div>
            <p className="font-medium">El archivo no tiene las columnas obligatorias</p>
            <p className="text-muted-foreground">Falta: {faltantes.join(", ")}.</p>
          </div>
        </div>
      )}

      {resultado && (
        <div className={cn("flex items-center gap-3 rounded-lg border px-4 py-3 text-sm", resultado.ok ? "border-ok/30 bg-ok/10" : "border-alerta/30 bg-alerta/10")}>
          {resultado.ok ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : <XCircle className="size-5 shrink-0 text-alerta" />}
          {resultado.mensaje}
          {resultado.ok && <Link href="/pacientes" className="ml-auto font-medium text-primary hover:underline">Ver pacientes</Link>}
        </div>
      )}

      {filas.length > 0 && (
        <Card className="overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
            <FileSpreadsheet className="size-5 text-primary" />
            <span className="font-medium">{filas.length} filas</span>
            <span className="rounded-full bg-ok/15 px-2.5 py-0.5 text-xs font-medium text-ok">{validas.length} válidas</span>
            {conError > 0 && <span className="rounded-full bg-alerta/15 px-2.5 py-0.5 text-xs font-medium text-alerta">{conError} con errores</span>}
            <Button
              className="ml-auto"
              disabled={validas.length === 0 || guardando || resultado?.ok}
              onClick={() => iniciar(async () => setResultado(await importarPacientes(empresa, validas)))}
            >
              {guardando && <Loader2 className="animate-spin" />}
              Importar {validas.length} válidas
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-14 pl-5">Fila</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden md:table-cell">Cargo</TableHead>
                <TableHead className="hidden lg:table-cell">Nacimiento</TableHead>
                <TableHead className="pr-5">Revisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.fila} className={f.errores.length ? "bg-alerta/5" : undefined}>
                  <TableCell className="pl-5 text-muted-foreground">{f.fila}</TableCell>
                  <TableCell className="font-mono text-sm">{f.cedula}</TableCell>
                  <TableCell>{f.nombres} {f.apellidos}</TableCell>
                  <TableCell className="hidden md:table-cell">{f.cargo || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{/^\d{4}-/.test(f.fechaNacimiento) ? fecha(f.fechaNacimiento) : f.fechaNacimiento || "—"}</TableCell>
                  <TableCell className="pr-5">
                    {f.errores.length ? (
                      <span className="text-sm text-alerta">{f.errores.join(" · ")}</span>
                    ) : (
                      <CheckCircle2 className="size-4 text-ok" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
